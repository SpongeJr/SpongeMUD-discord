const ut = require('../lib/utils.js');
const cons = require('../lib/constants.js');
const playerModule = require('../lib/player.js');
const players = playerModule.players;
const Player = playerModule.Player;
const eMasterModule = require('../lib/events.js');
const eMaster = eMasterModule.eMaster;

const CONFIG = require('../../../' + cons.CFGFILE);

// TODO: refactor into constant.js , move a level deeper into cons.time.*

cons.DEBUG_LEVEL = 0; // 0 = all messages, 1 = level 1+ (warning), 2 = level 2+ (critical)...
cons.DEBUG_LEVEL_STRINGS = ["INFO:", " !!! WARNING:", "   ***** CRITICAL WARNING! ***** :"];

cons.WIZARD_MOB_LIMIT = 1;
cons.RECALL_RESET_TICKS = cons.TICKS_IN_DAY;
cons.TICKS_IN_DAY =cons.TICKS_PER_HOUR * cons.HOURS_IN_DAY; // default 240
const dBug = function(str, level) {
	
	if (typeof level === "undefined") { level = 0; }
	
	if (typeof str === "object") {
		str = JSON.stringify(str);
	}
	
	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};


const buildPicklist = function(itemList, matchStr) {
	// theItems = bunch of objects of type Item, Mob, Exit, Character, etc., I guess
	// matchStr = string to match against
	let pickList = {};
	let where;
	
	// handle these 2, then exits and characters
	// later, might be able to send up containers
	let wheres = ["inv", "floor"];
	wheres.forEach(function(where) {
		pickList[where] = [];
		for (let itemId in itemList[where]) {

			let theItem = items[itemId]; // get the actual Item!
			let shortNames = theItem.data.shortNames || [];
			
			let matchFound = false;
			let matchNum = 0;
			let match = -1;
			
			// reordered logic in order to short-circuit safely
			while (!matchFound && shortNames && matchNum < shortNames.length) {
				
				if (shortNames[matchNum].toLowerCase().startsWith(matchStr.toLowerCase())) {
					matchFound = true;
					match = pickList[where].findIndex(function(el) {
						return (el.type === itemList[where][itemId]);
					});
					
					if (match === -1) {
						// no match in pickList so far...
						pickList[where].push({
							type: itemList[where][itemId],
							ids: [itemId],
							short: shortNames[matchNum]
						});
					} else {
						pickList[where][match].ids.push(itemId);
					}
				}
				if (!matchFound) {
					matchNum++;
				}
			}
		}
	});

	// now handle exits
	where = 'exit';
	pickList[where] = [];
	if (itemList[where]) {
		//dBug(itemList[where]);

		// we get an object, not array
		for (let exit in itemList[where]) {
			if (exit.startsWith(matchStr)) {
				pickList[where].push({
					type: exit,
					ids: [exit]
				});				
			}
		}
	}

	// now handle characters
	// we're taking discord IDs for now apparently
	// I think we need to take Player objects very soon
	where = 'char';
	let thePlayer;
	pickList[where] = [];
	if (itemList[where]) {
		for (let chNum = 0; chNum < itemList[where].length; chNum++) {
			let pId = itemList[where][chNum];
			if (!players[pId]) {
				dBug(`buildPickList(): Non-existent player ${pId}!`, 1);
			} else {
				thePlayer = players[pId];
				if (thePlayer.charName.startsWith(matchStr)) {
					pickList[where].push({
						type: players[pId].charName,
						ids: [pId]
					});
				}
			}
		}
	}
	
	// now handle mobs
	where = 'mob';
	pickList[where] = [];

	// note: later, probably want to keep mobs unique/NOT flatten them
	for (let mobId in itemList[where]) {
		let theMob = mobs[mobId]; // get the actual Mob!
		let shortNames = theMob.data.shortNames || [];

		let matchFound = false;
		let matchNum = 0;
		let match = -1;
		
		// reordered logic in order to short-circuit safely
		while (!matchFound && shortNames && matchNum < shortNames.length) {
			if (shortNames[matchNum].startsWith(matchStr)) {		
				matchFound = true;
				match = pickList[where].findIndex(function(el) {
					return (el.type === itemList[where][mobId]);
				});
				
				if (match === -1) {
					// no match in pickList so far...
					pickList[where].push({
						type: itemList[where][mobId],
						ids: [mobId]
					});
				} else {
					pickList[where][match].ids.push(mobId);
				}
			}
			if (!matchFound) {
				matchNum++;
			}
		}
	}
	
	// now to "flatten" choices...
	let choices = pickList;
	let pickNum = 0;
	let choiceList = [];
	for (where in choices) {
		for (let num = 0; num < choices[where].length; num++) {
			choiceList.push({
				"what": choices[where][num].type,
				"where": where,
				"ids": choices[where][num].ids,
				"short": choices[where][num].short
			});
			pickNum++;
		}
	}
	return choiceList;
};

let world = require('../' + cons.DATA_DIR + cons.MUD.worldFile);

let rooms = require('../' + cons.DATA_DIR + cons.MUD.roomFile);
let items = {};
let mobs = {};
let itemTypes = require('../' + cons.DATA_DIR + cons.MUD.itemFile);
let zoneList = require('../' + cons.DATA_DIR + cons.MUD.zoneFile);
let mobTypes = require('../' + cons.DATA_DIR + cons.MUD.mobFile);
const MUDnews = require('../' + cons.DATA_DIR + cons.MUD.newsFile);
const resources = require('../' + cons.DATA_DIR + cons.MUD.resourceFile);
const minigames = {
	trollChef: require('../lib/minigames/trollchef.js')
};

let noWiz = false;
const timers = {};

const titleList = cons.TITLE_LIST;
let dreamStrings = {
	'inv': 'You dream about the things you own...\n',
	'go': 'You toss and turn in your sleep.\n',
	'get': 'You dream of acquiring new things...\n',
	'drop': 'Your hand twitches in your sleep.\n',
	'say': 'You mumble incomprehensibly in your sleep.\n',
	'attack': 'You dream of glorious battle!\n',
	'edroom': 'You dream of having godlike powers of creation!\n',
	'profile': 'You dream about morphing into other forms!\n',
	'tele': 'You float high above the world in your dreams...\n'
};
const findChar = function(nick, room) {
	// returns the id that matches with a nick, if it is in the room provided
	// leave room null to allow it to pass anywhere
	
	// check players (this sucks, will have to store in room data later)
	for (let plId in players) {
		if (players[plId].charName === nick) {
			if (players[plId].location === room || !room) {
				return plId;
			}
			break;
		}
	}
	return false;
};
const isPlayer = function(who) {
	return typeof players[who] !== 'undefined';
};

const cantDo = function(who, action, data, client) {
	let outStr;
	if (typeof data === 'undefined') {
		data = {};
	}
	
	if (!isPlayer(who)) {
		return 'You need to `joinmud` first.';
	}
	if (players[who].posture === 'asleep') {
		return (dreamStrings[action] || 'Visions of sugarplums dance through your head.') +
		' (You are asleep. You need to `joinmud` to wake up first!)';
	}

	let player = players[who]; // later, can easily refactor with player = this
	
	// "accessLevel" check
	if (typeof data.minAccess !== 'undefined') {
		if (typeof data.minAccess === 'string') {
			if (!player.isAtLeast(data.minAccess)) {
				return "Try as you might, that's beyond your power.";
			}
		}
	}
	
	// moderator flag check
	if (typeof data.modFlags !== 'undefined') {
		if ((data.modFlags & player.modFlags) !== data.modFlags) {
			return `Nothing seems to happen. (${data.modFlags} & ${player.modFlags} = ${data.modFlags & player.modFlags})`;
		}
	}

	// do timed command check
	// later, refactor some of the timers inside the switch block below into here
	if (player.timers[action]) {
		if (player.timers[action] > 0) {
			let next = ut.mudTime(player.timers[action]);
			let doAgain = ut.timeDiffStr(next);
			return `You can't do that for another ${doAgain}.`;
		}
	}

	switch (action) {
		case 'setaccess': 
			if (!player.isAtLeast('sponge')) {
				return "You can't even begin to imagine how to go about doing something like that.";
			}
			break;
		case 'go':
			if (player.posture === 'sitting') {
				return 'You need to `stand` up before moving.';
			}
			let moveCost = player.stats.moveCost + player.weighMe();
			if (player.stats.stamina < moveCost) {
				return "You need more stamina to move. Try sitting to restore it more quickly.";
			}
			break;
		case 'attack':
			if (player.posture === 'sitting') {
				return "You can't attack from a sitting position!";
			}
			break;
		case 'me':
			if (player.isMuted) {
				return "You find yourself without a voice.";
			}
			break;
		case 'say':
			if (player.isMuted) {
				return "You find yourself without a voice.";
			}
			break;
		case 'yell': 
			if (player.isMuted) {
				return "You find yourself without a voice.";
			}

			// if they've yelled in the past 1 tick, nowai
			if (player.timers.yell > 0) {
				return "Your throat is sore from yelling, maybe wait a tick?";
			}
			break;
		case 'tele':			
			if (data.by === 'room') {
				// they've been tele'd by a room -- skip a lot of checks

			} else {
				let target = data.location;
				if (typeof rooms[target] === 'undefined') {
					return `You try to teleport to ${target} but go nowhere. It's not a valid target.`;
				}
				
				if (!player.isWearing('The Omniring')) {
					// if they're wearing The Omniring, skip these checks
					if (!player.isZoneAuthor(rooms)) {
						return "Sorry, you can't tele unless you're in a zone you author.";
					}
					let zone = rooms[target].data.zone;
					let roomId = rooms[target].data.id;
					if (!player.isAuthorOf(target)) {
						return `Sorry, Wizard. You can't wizard-teleport to ${roomId} because` +
						  ` that zone (${zone}) is not one you author. ` +
						  ` \nYou'll need to walk or use another form of teleportation!`;
					}
				}
			}
			break;
		case 'profile':
		
			break;
		case 'wizmob':
			if (player.timers.wizmob > 0) {
				outStr = `Hey you can only wizard up items every ${cons.WIZARD_MOB_LIMIT} ticks!`;
				outStr += `You have to wait ${player.timers.wizmob} ticks yet.`;
				return outStr;
			}
			
			if (!player.isZoneAuthor(rooms)) {
				outStr = "Sorry Wizard, you can only `wizmob` in a zone you author.";
				return outStr;
			}
			
			break;
		case 'edroom': 
			if (!player.isZoneAuthor(rooms)) {	
				if (!player.isWearing('The Omniring')) {
					outStr = "Your Wizardship, you need to `edroom` while standing in a zone you author.\n";
					outStr += "If you want to edit a room of another zone or a shared/unzoned area, please consult ";
					outStr += "one of this World's 'immortals' for more information.";
					return outStr;
				} else {
					outStr = "Apologies, Your Wizardship, but I must inform you: \n";
					outStr += "You _usually_ need to `edroom` while standing in a zone you author.\n";
					outStr += "Your edit will go through though, since you are wearing The Omniring.\n";
					outStr += "It is important that you know that you have just edited a zone you are not the author of, though!\n";
					outStr += "If you need to take ownership of this room and just did `edroom zone <yourzone>`, great, you should be good to go.\n";
					outStr += "If you don't know why you're seeing this message, please contact an Immortal. There may be a zoning issue!\n";
					player.sendMsg(outStr, client); // don't return, this is a pass!
				}
			}
			break;
		default:
			// do nothing, continue on to return false 
	}
	
	return false; // all checks passed, they can do this thing
};
//-----------------------------------------------------------------------------
let defaultDecay = function(client) {
	
	this.data.decay.endurance -= this.data.decay.amount;
	
	if (this.data.decay.endurance <= 0) {
		
		// Fire off some events -- notify eMaster
		eMaster('roomGeneric', this.data.location, {"sayFrom": this.data.type}, 'crumbles away!', client);
		
		// remove from items global
		// remove from wherever it is (see .location)
		// figure out where it belongs (room or player) and update that object, too
		let loc = this.data.location;
		if (isNaN(loc.charAt(0))) {
			// first letter not a number, so it's in a room
			delete rooms[this.data.location].data.items[this.id];
		} else {
			// it's on a player
			delete players[this.data.location].inventory[this.id];
		}
		this.unregisterForWorldTicks();
		delete items[this.id]; // rip
	}
};
let defaultFreshen = function() {
	this.data.decay.endurance = this.data.decay.maxEndurance;
};
let defaultAge = function(item) {

};
let defaultLook = function(item) {
	let outP = '';
	outP += item.description;
	return outP;
};
let defaultFoodUse = function(who, loc, client) {
	let player = players[who];
	let phrase = `consumes ${this.data.type}`;
	
	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase, client);	
	}
	delete players[who].inventory[this.id];
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
};
let defaultGet = function(who, client) {
	this.unregisterForWorldTicks();
	this.freshen(); // reset endurance
	players[who].inventory[this.id] = this.data.type;
	delete rooms[players[who].location].data.items[this.id];
	this.data.location = who;
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	eMaster('roomGet', players[who].location, who, this.id, client);
};
let defaultDrop = function(who, where, client) {
	rooms[where].data.items[this.id] = this.data.type;
	this.data.location = where;
	delete players[who].inventory[this.id];
	
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	
	// fire off event even if item is hidden for now
	eMaster('roomDrop', where, who, this.id, client);
	
	// register for worldTick events
	this.registerForWorldTicks();
};
let defaultCrush = function(who, where, client) {
	delete players[who].inventory[this.id];
	
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	
	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomCrush', where, who, this.id, client);
	}
};

let defaultRoomDescribe = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	let id = this.data.id;

	let outStr = `-=-=  **SP:** ${viewAs.stats.stamina}/${viewAs.stats.maxStamina}`;
	outStr += `  **HP:** ${viewAs.stats.hp}/${viewAs.stats.maxHp}`;
	outStr += `  **XP:** ${viewAs.stats.xp} `;
	if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
		outStr += `  \`dayTicks: ${viewAs.stats.dayTicks}\``;
	}
	outStr += '  =-=-\n';
	outStr += '**' + this.data.title + '**';
	
	if (viewAs.isAtLeast('wizard')) {
		// wizards see IDs also
		outStr += ' "`' + id + '`"';
	}
	
	if (this.data.menus) {
		outStr += ' (_menu available_ - type `menu` to see)';
	}
	
	outStr += '\n\n' + this.data.description;
	
	// Build exits text
	if (this.data.hasOwnProperty('exits')) {
		outStr += '\n-=-=-=-\nObvious exits: ';
		for (let exName in this.data.exits) {
			if (this.data.exits[exName].hidden) {
				// hidden exits are visible if:
				// they are a wizard AND wearing hat
				
				if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
					outStr += '`' + exName + '`(h)  ';	
				}
				
			} else {
				outStr += '`' + exName + '`  ';
			}
		}
	} else {
		dBug('SpongeMUD: Room `${id}` missing exits!', 1);
	}
	
	// Build items text
	if (this.data.hasOwnProperty('items')) {	
		let count = 0;
		let itemStr = '';
		for (let itemId in this.data.items) {
			let theItem = items[itemId];
			
			if (!theItem.describeAs) {
				dBug(`${itemId} had no describeAs()`, 1);
			} else {				
				itemStr += theItem.describeAs(viewAs, {"short": true}); //refactored!
				if (itemStr !== '') {
					// if the return value is '' do not increment count
					count++;
				}
			}
		}
		
		if (count === 0) {
			outStr += '\n_No obvious items here_';
		} else {
			outStr += '\n_Obvious items here_: ' + itemStr;
		}
	}
	
	// Build mobs text
	let mobStr = '\n';	
	let roomMobs = this.data.mobs;
	for (let mobId in roomMobs) {
		outStr += `\n**${mobs[mobId].data.type}** is here`;
		
		if (viewAs.isAtLeast('wizard')) {
			outStr += `(source: ${mobs[mobId].data.source})`;
		}
		
		let opponent = mobs[mobId].data.fighting;
		if (opponent) {
			outStr += `, fighting ${opponent}!`;
		} else {
			outStr += `.`;
		}
	}
	outStr += mobStr;

	// See who else is here. Later, let's store this in Rooms also.
	// This seems terribly expensive.
	let numHere = 0;
	let playersHereStr = '';
	for (let player in players) {
		if (players[player].location === id) {
			playersHereStr += players[player].describeAs(viewAs);
			numHere++;
		}
	}
	if (numHere > 0) {
		outStr += '\nWho is here: ' + playersHereStr;
	}
	return outStr;
};
let defaultRoomShortDesc = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	// currently refactoring to put that stuff into .describeAs(viewAs) methods!
	//		I think I'm pretty much there now ^
	
	let id = this.data.id;

	let outStr = `-=-=  SP: ${viewAs.stats.stamina}/${viewAs.stats.maxStamina}`;
	outStr += `   XP: ${viewAs.stats.xp} `;
	if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
		outStr += `  \`dayTicks: ${viewAs.stats.dayTicks}\``;
	}
	outStr += '  =-=-\n';
	outStr += '**' + this.data.title + '**';
	
	if (viewAs.isAtLeast('wizard')) {
		// wizards see IDs also
		outStr += ' "`' + id + '`"\n';
	}
	outStr += '\n' + this.data.description;
	
	// Build exits text
	if (this.data.hasOwnProperty('exits')) {
		outStr += '\n-=-=-=-\nObvious exits: ';
		for (let exName in this.data.exits) {
			if (this.data.exits[exName].hidden) {
				// hidden exits are visible if:
				// they are a wizard AND wearing hat
				
				if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
					outStr += '`' + exName + '`(h)  ';	
				}
				
			} else {
				outStr += '`' + exName + '`  ';
			}
		}
	} else {
		dBug('SpongeMUD: Room `${id}` missing exits!', 1);
	}
	
	// Build items text
	if (this.data.hasOwnProperty('items')) {	
		let count = 0;
		let itemStr = '';
		for (let itemId in this.data.items) {
			let theItem = items[itemId];
			itemStr += theItem.describeAs(viewAs, {"short": true}); //refactored!
			if (itemStr !== '') {
				// if the return value is '' do not increment count
				count++;
			}
		}
		
		if (count === 0) {
			outStr += '\n_No obvious items here_';
		} else {
			outStr += '\n_Obvious items here_: ' + itemStr;
		}
	}
	
	// Build mobs text
	let mobStr = '\n';	
	let roomMobs = this.data.mobs;
	for (let mobId in roomMobs) {
		outStr += `\n**${mobs[mobId].data.type}** is here`;
		let opponent = mobs[mobId].data.fighting;
		if (opponent) {
			outStr += `, fighting ${opponent}!`;
		} else {
			outStr += `.`;
		}
	}
	outStr += mobStr;

	// See who else is here. Later, let's store this in Rooms also.
	// This seems terribly expensive.
	let numHere = 0;
	let playersHereStr = '';
	for (let player in players) {
		if (players[player].location === id) {
			playersHereStr += players[player].describeAs(viewAs);
			numHere++;
		}
	}
	if (numHere > 0) {
		outStr += '\nWho is here: ' + playersHereStr;
	}
	return outStr;
};
//-----------------------------------------------------------------------------

const parseScript = function(script, data, client) {
	
	let who = data.who;
	let outP = '';
	
	if (typeof script === 'string') {
		dBug('parseScript: [DEPRECATED] Parsing legacy MEHScript string -- pass an array of script lines (strings) instead!');
		script = [].push(script);
	}
	for (let lineNum = 0; lineNum < script.length; lineNum++) {
		let scriptLine = script[lineNum];
		let action = scriptLine.split(' ')[0];
		let rest = scriptLine.replace(action, '');
		rest = rest.slice(1); // snip leading space
		
		let fail;
		let player;
		switch (action) {
			case 'grant': 
				let whatToGrant = rest.split(' ')[0];
				fail = cantDo(who, 'grant');
				if (fail) {
					// ut.chSend(message, fail); // no message here
					return;
				}
				player = players[who];
				if (whatToGrant === 'title') {
					let titleNum = parseInt(rest.replace('title ', ''), 10);
					let success = players[who].unlockTitle(titleNum);
					if (success) {
						outP += `** TITLE UNLOCKED! ** You have unlocked title: "${titleList[titleNum]}!"`;
						outP += `\n  (to change titles or view avaiable titles, use the \`title\` command)`;
						player.sendMsg(outP, client);
					}
				} else if (whatToGrant === 'stat') {
					rest = rest.replace('stat ', '');
					let statName = rest.split(' ')[0];
					let amt = parseInt(rest.split(' ')[1], 10) || 0;
					
					if (!player.stats.hasOwnProperty(statName)) {
						dBug(`MEHScript error on line ${lineNum}): Invalid player stat "${statName}!"\n${scriptLine}`);
					} else {
						player.stats[statName] += amt;
						dBug(`parseScript(): Changed ${player.charName}'s ${statName} by ${amt} to ${player.stats[statName]}`);
					}
				}
			break;
			case 'tele': 
				let target = rest;
				fail = cantDo(who, 'tele', {"location": target, "by": "room"});
				if (fail) {
					// ut.chSend(message, fail); // no message here
					return;
				}
				player = players[who];
				let pLoc = player.location;
				outP += 'Your surroundings fade away and you find yourself elsewhere!';

				player.sendMsg(outP, client);
				
				player.unregisterForRoomEvents(); // first, unregister for events in this room
				let newLoc = target; // set our target room

				eMaster('roomExit', pLoc, who, newLoc, client); // fire off roomExit, notify everyone but us
				let oldLoc = '' + pLoc; // hang onto old location
				player.location = newLoc; // actually move us
				
				// remove from old room chars[], add to new
				let ind = rooms[oldLoc].data.chars.indexOf(who);
				rooms[oldLoc].data.chars.splice(ind, 1);
				if (!rooms[newLoc].data.chars) {
					dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
					rooms[newLoc].data.chars = [];
				}
				rooms[newLoc].data.chars.push(who);
				
				player.registerForRoomEvents();// now register for room events in new room
				eMaster('roomEnter', newLoc, who, oldLoc, client); // fire off roomEnter, notify everyone + us
				ut.saveObj(players, cons.MUD.playerFile); // save to disk
			break;
			case 'message':
				let msg = rest;
				player = players[who];
				
				if (!player) {
					dBug(`parseScript(): Tried to message undefined player!`, 2);
				} else {
					player.sendMsg(msg, client);
				}
			break;
			default: {
				dBug(`MEHScript parse error on line ${lineNum}: ${scriptLine}, 2`);
			}
		}
	}
};

const defaultRoomEventMaker = function(eventType) {
	/*
	// we only handle roomSay right now
	if (eventType !== 'roomSay') {
		dBug(`defaultRoomEventMaker: Tried to make an event handler for unknown event type ${eventType}!`, 1);
		return false;
	}
	*/
	
	let handlers = {
		roomSay: () => {
			let triggers = this.data.on.roomSay;
			for (let phrase in triggers) {
				if (phrase !== 'ELSE') {
					this.on('roomSay', function(whoSaid, whatSaid, client) {
						if (whatSaid.toLowerCase() === phrase.toLowerCase()) {			
							parseScript(triggers[phrase], {"who": whoSaid}, client);
						}
					});
				} else {
					// this is for ELSE
				}
			}			
		},
		roomEnter: () => {
			let script = this.data.on.roomEnter;
			this.on('roomEnter', (who, lastRoom, client) => {
				if (typeof who !== "string") {
					dBug(`Not handling roomEnter event for non-player in ${this.data.id}.`);
				} else {
					parseScript(script, {"who": who}, client);
				}
			});
		}
	};
	
	if (handlers.hasOwnProperty(eventType)) {
		handlers[eventType]();
	} else {
		dBug(`defaultRoomEventMaker: Tried to make an event handler for unknown event type ${eventType}!`, 1);
	}
	
};
let defaultRoomEventKiller = function(eventName, id) {
	
	let roomId = this.data.id;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		dBug('Tried to kill a ' + eventName +
		  ' in ' + roomId + ' that did not have those.', 1);
		return false;
	}
	
	if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
		dBug('Tried to kill nonexistent ' + eventName +
		' event with id ' + id + ' in ' + roomId, 1);
		return false;
	}
	delete eMaster.listens[eventName][roomId][id];
};
let defaultRoomEventHandler = function(eventName, callback) {

	let roomId = this.data.id;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		eMaster.listens[eventName][roomId] = {};
	}
	
	eMaster.listens[eventName][roomId][roomId] = {
		"callback": callback
	};
};

let defaultItemEventHandler = function(eventName, callback) {

	let id = this.id;

	if (eventName === 'worldTick') {
		dBug(id + ' registered for worldTick');
		if (typeof eMaster.listens[eventName].items === 'undefined') {
			eMaster.listens[eventName].items = {};
		}
		eMaster.listens[eventName].items[id] = {
			"callback": callback
		};
	} else {
		dBug(`Unknown event ${eventName} triggered on ${id}`, 1);
	}
};
let defaultItemEventKiller = function(eventName) {

	let id = this.id;

	if (eventName === 'worldTick') {
		if (typeof eMaster.listens[eventName].items === 'undefined') {
			dBug('No eMaster.listens.worldTick.items!', 1);
			return false;
		}
			
		if (typeof eMaster.listens[eventName].items[id] === 'undefined') {
				dBug(`Tried to kill nonexistent ${eventName} event with id ${id}`, 1);
				return false;
		}
		dBug(id + ' unregistered for worldTick');
		delete eMaster.listens[eventName].items[id];
	} else {
		dBug(`Tried to kill unknown event ${eventName} on ${id}`, 1);
	}
};
let nextId = {};
//-----------------------------------------------------------------------------
// ITEM, SCENERYITEM, MOB, ETC.
//-----------------------------------------------------------------------------
let Item = function(itemType, data) {
	
	this.data = Object.assign({}, data); // break first level of references
	
	if (typeof data !== 'object') {
		data = {};
	}
	
	this.data.hidden = data.hidden || false;
	this.data.description = data.description || "Some object you spotted.";
	this.data.shortName = data.shortName || 'item';
	this.data.shortNames = data.shortNames || [this.data.shortName];
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || itemType;
	this.data.family = data.family || 'junk';
	
	// Decay setup:
	// Default decay: Have 100 endurance points, decay 10 points off every 3 ticks	
	// (or use the decay we were sent -- break references first)
	// If only one decay property is set, use defaults for the others
	if (!data.decay) {
		data.decay = {};
	}
	for (let prop in cons.DEFAULTS.itemDecay) {
		// reference here? TEST THIS
		data.decay[prop] = data.decay[prop] || cons.DEFAULTS.itemDecay[prop];
	}
	
	this.data.decay = Object.assign({}, data.decay);

	this.data.decay.endurance = this.data.decay.maxEndurance; // make it fresh
	
	// stamp it with an instance # and increment the instance counter
	if (!nextId[itemType]) {
		nextId[itemType] = 1;
	}
	this.id = itemType + '##' + nextId[itemType];
	
	// this shouldn't happen, I think
	if (typeof itemTypes[itemType] === 'undefined') {
		itemTypes[itemType] = {family: "junk"};
		dBug('(WARNING) That should not have happened!', 2);
	}
	this.data.family = itemTypes[itemType].data.family;
	
	dBug(`Item ${this.data.shortName} created with id: ${this.id}` +
	  `(family: ${this.data.family}). Placing in: ${this.data.location}`);
	
	nextId[itemType]++;
	
	// figure out where it belongs (room or player) and update that object, too
	let loc = this.data.location;
	if (isNaN(loc.charAt(0))) {
		// first letter not a number, so it's in a room
		rooms[this.data.location].data.items[this.id] = this.data.type;
	} else {
		// it's on a player
		players[this.data.location].inventory[this.id] = this.data.type;
	}
	
	if (this.data.family === "food") {
		this.use = defaultFoodUse;
	}
	
	// add it to the items global
	items[this.id] = this;
};
Item.prototype.describeAs = function(viewAs, options) {
	options = options || {};
	let outP = '';
	let theItem = this;
	let itemStr = '';
	
	if (!theItem.data.hidden) {
		itemStr += theItem.data.type;
		itemStr += `(${theItem.data.shortName})`;
		if (!noWiz) {
			// show item IDs to wizards, unless we're in "noWiz" mode
			if (viewAs.isAtLeast('wizard')) {
				itemStr += `(\`${this.id}\`)`;
				// wizards wearing their hats also see endurance
				if (viewAs.isWearing("wizard hat")) {
					itemStr += `(${theItem.data.decay.endurance}/${theItem.data.decay.maxEndurance})`;
				}
			}
		itemStr += '   ';
		}
	} else {
		// hidden -- nothing special right now
	}	
	outP += itemStr;
	
	if (!options.short) {	
		if (theItem.data.family === 'prop') {
			outP += `(${theItem.data.shortName}): `;
		}
		outP += this.data.description;
	}
	
	return outP;
};
Item.prototype.decay = defaultDecay;
Item.prototype.freshen = defaultFreshen;
Item.prototype.look = defaultLook;
Item.prototype.get = defaultGet;
Item.prototype.drop = defaultDrop;
Item.prototype.crush = defaultCrush;
Item.prototype.age = defaultAge;
Item.prototype.registerForWorldTicks = function() {
	let item = this;
	let tickCount = 0;
	
	this.on('worldTick', function({}, client) {
		
		// some items only decay every nth tick.
		// increment our rollover counter thing and check that.
		tickCount++;
		tickCount = tickCount % item.data.decay.rate;

		if (tickCount === 0) {
			item.decay(client);
		}
	});
};
Item.prototype.unregisterForWorldTicks = function() {
	this.off('worldTick');
};
Item.prototype.on = defaultItemEventHandler;
Item.prototype.off = defaultItemEventKiller;

let SceneryItem = function(itemType, data) {
	
	this.data = Object.assign({}, data); // break first level of references
	
	if (typeof data !== 'object') {
		data = {};
	}
	this.data.hidden = data.hidden || true; // props are usually hidden
	this.data.description = data.description || "A part of the scenery.";
	this.data.shortName = data.shortName || 'item';
	this.data.shortNames = data.shortNames || [this.data.shortName];
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || itemType;
	this.data.family = data.family || 'prop';
	// Decay setup:
	// Default decay: Have 100 endurance points, decay 10 points off every 3 ticks	
	// (or use the decay we were sent -- break references first)
	if (!this.data.decay) {
		this.data.decay = {
			rate: 3,
			amount: 10,
			maxEndurance: 100
		};
	} else {
		this.data.decay = Object.assign({}, this.data.decay);
	}
	this.data.decay.endurance = this.data.decay.maxEndurance; // make it fresh
	
	// stamp it with ID
	if (!nextId[itemType]) {
		nextId[itemType] = 1;
	}
	
	this.id = itemType + '##' + nextId[itemType];
	dBug(`Prop ${this.data.shortName} created with id: ${this.id}. Placing in: ${this.data.location}`);
	// figure out where it belongs (room or player) and update that object, too
	let loc = this.data.location;
	if (isNaN(loc.charAt(0))) {
		// first letter not a number, so it's in a room
		rooms[this.data.location].data.items[this.id] = this.data.type;
	} else {
		// it's on a player
		players[this.data.location].inventory[this.id] = this.data.type;
	}
	items[this.id] = this; // add it to the Items
	nextId[itemType]++;
};
SceneryItem.prototype = Object.create(Item.prototype); // SceneryItem extends Item
SceneryItem.prototype.get = {}; // Can't pick up props!

let Mob = function(mobTemplate, data) {
	this.data = Object.assign({}, data); // break first level of references
	
	if (typeof data !== 'object') {
		data = {};
	}
	
	this.data.hidden = data.hidden || true; // mobs are usually "hidden" for now
	this.data.description = data.description || "It wanders about";
	this.data.shortName = data.shortName || 'mob';
	this.data.shortNames = data.shortNames || this.data.shortName;
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || mobTemplate;
	this.data.xp = data.xp || 0;

	// Default decay for mobs: rate: 0 to give them no decay
	// Can be overridden if people want to do something unusual
	if (!this.data.decay) {
		this.data.decay = {
			rate: 0
		};
	}

	// stamp it with an instance # and increment the instance counter
	if (!nextId[mobTemplate]) {
		nextId[mobTemplate] = 1;
	}
	this.id = mobTemplate + '##' + nextId[mobTemplate];
	dBug(`Mobile ${this.data.shortName} created with id: ${this.id}` +
	  `(family: ${mobTypes[mobTemplate].data.family}). Placing in: ${this.data.location}`);
	  
	rooms[this.data.location].data.mobs[this.id] = this.data.type;
	
	nextId[mobTemplate]++;
	mobs[this.id] = this; // add to mobs global
};
Mob.prototype.timedActions = function(tickCount, client) {
	
	let speak = this.data.speak;
	let move = this.data.move;
	let generic = this.data.genericaction;
	let sayFrom = this.data.type;
	let phrases;
	
	// .speak
	if (speak && tickCount % speak.frequency === 0) {
		if (speak.behavior === "random") {
			if (Math.random() < speak.chance) {
				phrases = JSON.parse(JSON.stringify(speak.phrases));
				let phrase = ut.listPick(phrases);
				eMaster('roomSay', this.data.location, {"sayFrom": sayFrom}, phrase, client);
			}
		}
	}
	
	// .generic
	if (generic && tickCount % generic.frequency === 0) {
		if (generic.behavior === "random") {
			if (Math.random() < generic.chance) {
				phrases = JSON.parse(JSON.stringify(generic.phrases));
				let phrase = ut.listPick(phrases);
				eMaster('roomGeneric', this.data.location, {"sayFrom": sayFrom}, phrase, client);
			}
		}
	}
	
	// .move
	if (move && tickCount % move.frequency === 0) {
	
		if (move.behavior === "random") {
			if (Math.random() < move.chance) {
				// find all valid exits
				// pick one at random, set new location, firing off roomEnter/roomExit as appropriate
				
				let exits = rooms[this.data.location].data.exits;
				let choices = [];
				
				let mobZone = rooms[this.data.location].data.zone;
				let exitZone;
				for (let exit in exits) {
					if (exits[exit].goesto) {
						exitZone = rooms[exits[exit].goesto].data.zone;
						if (mobZone === exitZone) {
							if (!exits[exit].hidden || this.data.allowHiddenExits) {
								choices.push(exits[exit].goesto);
							}
						}
					}
				}
				
				if (choices.length > 0) {		
					let choice = ut.listPick(choices);
					//eMaster('roomGeneric', this.data.location, {"sayFrom": sayFrom}, ` looks towards ${choice}`, client);

					eMaster('roomExit', this.data.location, {"sayFrom": sayFrom}, choice, client);
					eMaster('roomEnter', choice, {"sayFrom": sayFrom}, this.data.location, client);
					delete rooms[this.data.location].data.mobs[this.id];
					this.data.location = choice;
					rooms[choice].data.mobs[this.id] = this.data.type;				
				} else {
					
				}
			}
		}
	}
};
Mob.prototype.registerForWorldTicks = function() {
	let mob = this;
	let tickCount = 0;
	
	this.on('worldTick', function({}, client) {
		tickCount++;
		mob.timedActions(tickCount, client);
	});
};
Mob.prototype.unregisterForWorldTicks = function() {
	this.off('worldTick');
};
Mob.prototype.describeAs = function(viewAs, options) {
	options = options || {};
	let outP = '';
	let theItem = this;
	let itemStr = '';
	let mobStr = '';
	
	if (!theItem.data.hidden) {
		itemStr += theItem.data.type;
		itemStr += `(${theItem.data.shortName})`;
		if (!noWiz) {
			// show item IDs to wizards, unless we're in "noWiz" mode
			if (viewAs.isAtLeast('wizard')) {
				itemStr += `(\`${this.id}\`)`;
				// wizards wearing their hats also see endurance
				if (viewAs.isWearing("wizard hat")) {
					itemStr += `(${theItem.data.decay.endurance}/${theItem.data.decay.maxEndurance})`;
				}
			}
		itemStr += '   ';
		}
	} else {
		// hidden
		if (theItem.data.family === 'mobile') {
			mobStr += `${theItem.data.type} is here.`;
			if (!noWiz) {
				// show mob IDs to wizards, unless we're in "noWiz" mode
				if (viewAs.isAtLeast('wizard')) {
					mobStr += `(\`${this.id}\`)`;
				}
				mobStr += '   ';
			}
		}
	}
	outP += itemStr;
	if (!options.short) {outP += this.data.description;}
	
	return outP;
};
Mob.prototype.dieStrings = [
	"screams out one last time and falls to the ground, dead!",
	"has exhausted their life force.",
	"collapses, having being defeated.",
	"lives no longer."
];
Mob.prototype.die = function(cause, client) {
	// cause should be either a String, or a Player object
	
	let deathString = '';
	let causeString = '';
	let outP = '';
	let victim = this.data.type;
	
	if (typeof cause === 'string') {
		causeString = cause;
	} else {
		// assume it's a Player object
		let player = cause;
		let xpAmt = this.data.xp || 0;
		causeString += player.charName;
		player.award(xpAmt, 'xp');
		player.stats.kills = player.stats.kills || {};		
		player.stats.kills[victim] = player.stats.kills[victim] || 0;
		player.stats.kills[victim]++;
		
		outP += `** YOU RECEIVED ${xpAmt} XP FOR DEFEATING ${victim}!**\n`;
		player.sendMsg(outP, client);
	}
	
	// for now, no corpses, no drops, just a message about who's responsible, and an xp award if possible
	deathString += this.dieStrings[Math.floor(Math.random() * this.dieStrings.length)];
	deathString += ` ${this.data.type} has been defeated by ${causeString}!`;
	
	// make it dramatic, let everyone in the room know:
	eMaster('roomGeneric', this.data.location, {"sayFrom": this.data.type}, deathString, client);
	
	// check and see if we need to do anything like let the source (if any) know
	// for now, just checks if it came from a generator and takes care of that
	let sourceId = this.data.source;
	if (sourceId) {
		if (!items[sourceId]) {
			dBug(`${this.data.id} had a non-existent source of ${sourceId}!`, 1);
		} else {
			dBug(`Calling items.${sourceId}.handleDeathOf(${this.id}). . .`);
			items[sourceId].handleDeathOf(this.id);
		}
	}

	// do the actual removal
	this.unregisterForWorldTicks();
	delete rooms[this.data.location].data.mobs[this.id]; // rip
	delete mobs[this.id]; // rip
};
Mob.prototype.decay = defaultDecay;
Mob.prototype.freshen = defaultFreshen;
Mob.prototype.look = defaultLook;
Mob.prototype.age = defaultAge;
Mob.prototype.on = defaultItemEventHandler;
Mob.prototype.off = defaultItemEventKiller;

const MobGenerator = function(mobTemplate, data) {
	this.data = Object.assign({}, data); // break first level of references
	
	if (typeof data !== 'object') {
		data = {};
	}
	this.data.hidden = data.hidden || true; // mobgens are usually hidden
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || mobTemplate;
	
	// Decay setup:
	// Default decay: Have 100 endurance points, decay 10 points off every 3 ticks	
	// (or use the decay we were sent -- break references first)
	if (!this.data.decay) {
		this.data.decay = {
			rate: 3,
			amount: 10,
			maxEndurance: 100
		};
	} else {
		this.data.decay = Object.assign({}, this.data.decay);
	}
	this.data.decay.endurance = this.data.decay.maxEndurance; // make it fresh
	
	// MobGen setup (defaults in case we weren't given this):
	if (!this.data.generator) {
		this.data.generator = {
			frequency: 20,
			chance: 1,
			max: 1
		};
	} else {
		this.data.generator = Object.assign({}, this.data.generator);
	}
	
	// stamp it with ID
	if (!nextId[mobTemplate]) {
		nextId[mobTemplate] = 1;
	}
	
	this.id = mobTemplate + '##' + nextId[mobTemplate];
	dBug(`Mob Generator ${this.id}. Placing in: ${this.data.location}`);
	// players can't carry mobgens, so it must be in a room:
	rooms[this.data.location].data.items[this.id] = this.data.type;

	items[this.id] = this; // add it to the Items
	nextId[mobTemplate]++;
};
MobGenerator.prototype.decay = defaultDecay; 
MobGenerator.prototype.handleDeathOf = function(whatDied) {
	delete this.data.generator.mobList[whatDied];
	dBug(`${this.id}: I've handled the death of ${whatDied} and I have ${Object.keys(this.data.generator.mobList).length} out there.`);
};
MobGenerator.prototype.generate = function() {
	let chance = this.data.generator.chance;
	let max = this.data.generator.max;
	if (!this.data.generator.mobList) {
		this.data.generator.mobList = {};
	}
	let mobList = this.data.generator.mobList;
	let mType = this.data.generator.mob;
	
	// are we at the max? if so get out
	// else, roll for chance
	// if pass, do new Mob();
	// add a .source property
	
	let mobCount = Object.keys(mobList).length;
	
	if (mobCount >= max) {
		dBug(`Generator ${this.id} didn't generate (at the limit of ${max} ${mType}s).`);
	} else if (Math.random() < chance) {
		let mdata = mobTypes[mType].data;
		let theMob= new Mob(mType, {
			"hidden": mdata.hidden,
			"shortName": mdata.shortName,
			"shortNames": mdata.shortNames,
			"description": mdata.description,
			"location": this.data.generator.pops,
			"speak": mdata.speak,
			"genericaction": mdata.genericaction,
			"move": mdata.move,
			"decay": mdata.decay,
			"family": mdata.family,
			"xp": mdata.xp,
			"source": this.id
		});
		theMob.registerForWorldTicks();
		theMob.data.source = this.id;
		this.data.generator.mobList[theMob.id] = theMob.id;
		mobs[theMob.id] = theMob;
		dBug(`Generator ${this.id} added a mob ${theMob.id}!`);
	}
};
MobGenerator.prototype.registerForWorldTicks = function() {
	let mobgen = this;
	let tickCount = 0;
	
	this.on('worldTick', function({}, client) {
		// some items only decay every nth tick.
		// increment our rollover counter thing and check that.
		tickCount++;
		
		let decayTick = tickCount % mobgen.data.decay.rate;
		let genTick = tickCount % mobgen.data.generator.frequency;
		
		if (decayTick === 0) {
			mobgen.decay(client);
		}
		
		if (genTick === 0) {
			mobgen.generate();
		}
	});
};
MobGenerator.prototype.unregisterForWorldTicks = function() {
	this.off('worldTick');
};
MobGenerator.prototype.on = defaultItemEventHandler;
MobGenerator.prototype.off = defaultItemEventKiller;
//-----------------------------------------------------------------------------
// ITEMTYPE  (ITEM TEMPLATES)
//-----------------------------------------------------------------------------
let ItemType = function(data) {
	// data is an object. any necessary properties not given
	// will receive default values

	// expects you to send up a legit ID!
	// later, it should check this here in the constructor
	
	// for now, also expects a valid shortname and description

	// we're not setting default delays or anything like that --
	// let that be in hardcode to save space and repetion
	// same with most other properties.
	// we just need to make sure hidden gets set, and set a family	
	// type is unused but reserved, set it to id for now
	this.data = data || {};
	this.data.hidden = data.hidden || false;
	this.data.type = data.type || data.id;
	this.data.family = data.family ||  "junk";
};
//-----------------------------------------------------------------------------
// ROOM
//-----------------------------------------------------------------------------
let Room = function(data) {
	// data is an object. any necessary properties not given
	// will receive default values
	
	// not sure what's up with .contents vs. .items
	// .contents isn't used in code (except in nuke command to nuke it)
	
	this.data = data || {};
	
	this.data.exits = data.exits || {
		"back": {
			"goesto": null,
			"description": "The way back."
		},
	};
	this.data.description = data.description || "An absurdly empty space.";
	this.data.contents = data.contents || {};
	this.data.title = data.title || "A new Room";
	this.data.items = data.items || {};
	this.data.mobs = data.mobs || {};
	this.data.id = data.id || data.title;
	this.data.zone = data.zone || false;
	
	for (let event in this.data.on) {
		this.setEvent(event);
	}
};
Room.prototype.setEvent = defaultRoomEventMaker;
Room.prototype.on = defaultRoomEventHandler;
Room.prototype.off = defaultRoomEventKiller;
Room.prototype.describeAs = defaultRoomDescribe;
Room.prototype.shortDesc = defaultRoomShortDesc;

let saveMUD = function() {
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	ut.saveObj(world, cons.MUD.worldFile);
	ut.saveObj(itemTypes, cons.MUD.itemFile);
	ut.saveObj(resources, cons.MUD.resourceFile);
};
let backupMUD = function() {
	let now = new Date().valueOf();
	ut.saveObj(rooms, cons.MUD.backups.roomFile + now + '.bak');
	ut.saveObj(players, cons.MUD.backups.playerFile + now + '.bak');
	ut.saveObj(world, cons.MUD.backups.worldFile + now + '.bak');
	ut.saveObj(itemTypes, cons.MUD.backups.itemFile + now + '.bak');
};
let buildDungeon = function() {
	// iterates over the rooms object, reads all the .data
	// and puts it back using the Room constructor, so that
	// the rooms are all Room objects, with the appropriate
	// methods, etc.
	
	for (let room in rooms) {
		
		// fix for .id = .title blunder
		if (rooms[room].data.id === rooms[room].data.title) {
			rooms[room].data.id = room;
		}
		
		let theRoom = new Room(rooms[room].data);
		
		// wipe out any existing chars, they'll get replaced by buildPlayers()
		// buildItems() and buildMobs() will delete old ones and reassign ids
		// so we don't do them
		theRoom.data.chars = [];		
			
		rooms[room] = theRoom;
	}
	dBug('Dungeon built.');
};
let buildPlayers = function(client) {
	// iterates over the players object, reads all the .data
	// and puts it back using the Player constructor, so that
	// the players are all Player objects, with the appropriate
	// methods, etc.
	for (let player in players) {
		
		if (typeof players[player].id === 'undefined') {
			players[player].id = player;
		}
	
		let thePlayer = new Player(players[player], rooms, items, resources);
		if (players[player].posture !== 'asleep') {
			thePlayer.registerForRoomEvents();
			thePlayer.registerForWorldTicks(client); // sleeping players don't get worldticks
		}
		
		// if they're missing the server property use The Planet for now
		if (!thePlayer.server) {
			thePlayer.server = cons.SERVER_ID;
		}

		players[player] = thePlayer;
		
		// put them in their room:
		if (!rooms[thePlayer.location].data.chars) {
			rooms[thePlayer.location].data.chars = [];
		}
		//dBug(' Putting ' + player + ' in ' + thePlayer.location);
		rooms[thePlayer.location].data.chars.push(player);
	}
	dBug('Players database built.');
};
let buildItems = function() {
	
	// iterate over players, then rooms
	// along the way, we'll build our items global
	
	// players
	let theItem;
	for (let player in players) {
		if (!players[player].inventory) {
			dBug(`${player} had no inventory, creating!`, 1);
			players[player].inventory = {};
		}
		
		for (let itemId in players[player].inventory) {
			let iType = players[player].inventory[itemId];
			
			if (!itemTypes[iType]) {
				dBug(`${player} was carrying an item of non-existent type ${iType} - ignoring!`, 1);
			} else {
				
				// delete the old item, we're re-building here, assigning a new id
				delete players[player].inventory[itemId];
				
				// calling new Item will place it on the player
				
				let idata =  itemTypes[iType].data; // inherit 
				
				if (idata.family === "prop") {
					theItem = new SceneryItem(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"location": player
					});
				} else {
					theItem = new Item(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"weight": parseInt(idata.weight, 10),
						"location": player
					});
				}
				items[theItem.id] = theItem;
			}
		}
	}
	
	// rooms
	for (let room in rooms) {
		for (let itemId in rooms[room].data.items) {
			let iType = rooms[room].data.items[itemId];
			
			if (!itemTypes[iType]) {
				dBug(`Room ${room} contained an item of non-existent type ${iType} - ignoring!`, 1);
			} else {
				
				// delete the old item, we're re-building here, assigning a new id
				delete rooms[room].data.items[itemId];
				
				// calling new Item will place it back in the room
				let idata = itemTypes[iType].data; // inherit
				
				if (idata.family === "mobgen") {
					theItem = new MobGenerator(iType, {
						"hidden": idata.hidden,
						"decay": idata.decay,
						"generator": idata.generator,
						"location": room,
					});
				} else if (idata.family === "prop") {
					theItem = new SceneryItem(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"location": room
					});
				} else {
					theItem = new Item(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"location": room
					});
				}
				// since it's in a room, it should be listening for worldTicks...
				theItem.registerForWorldTicks();
				items[theItem.id] = theItem;
			}
		}
	}
};
let buildMobs = function() {
	
	for (let roomId in rooms) {
		for (let mobId in rooms[roomId].data.mobs) {
			let mobTemplate = rooms[roomId].data.mobs[mobId];
			
			if (!mobTypes[mobTemplate]) {
				dBug(`Room ${roomId} contained a mob of non-existent type ${mobId} - ignoring!`, 1);
			} else {
				
				// delete the old mob, we're re-building here, assigning a new id
				delete rooms[roomId].data.mobs[mobId];
				
				let mdata = mobTypes[mobTemplate].data;
				// calling new Mob will give it an id and place it in room
				let theMob= new Mob(mobTemplate, {
					"hidden": mdata.hidden,
					"shortName": mdata.shortName,
					"shortNames": mdata.shortNames,
					"description": mdata.description,
					"location": roomId,
					"speak": mdata.speak,
					"genericaction": mdata.genericaction,
					"move": mdata.move,
					"decay": mdata.decay,
					"family": mdata.family,
					"xp": mdata.xp
				});
				theMob.registerForWorldTicks();
				mobs[theMob.id] = theMob;
			}
		}
	}
};
//-----------------------------------------------------------------------------
let worldTick = function(client) {
	
	let dayTicks;
	let maxXpTicks;
	let xp;
	let serverFameGenerated;
	let serverFameDecay = 0;
	let totalServerFame = 0;
	let totalTotalPlayerXp = 0;
	let player;
	let spam = '';
	
	world.time.tickCount++;
	
	let now = ut.mudTime(world.time.tickCount);
	
	if (now.remain === 0) {
		// Here we could fire off a 'worldHour' event or do other hourly things
		// Currently, this is now the only time we write world.json back to disk
		
		if (now.hour === cons.SUNRISE) {
			// sunrise
			
			// "planting"
			for (let playerId in players) {
				players[playerId].resPlant();
			}
			
			// Spammy advert stuff
			if (Math.random() < 0.05) {
				spam += ' A new day has dawned for the brave explorers of SpongeMUD.  Do you have a character?';
				client.channels.get(cons.SPAMCHAN_ID).send(spam);
			}			
		} else if (now.hour === cons.SUNSET) {
			// sunset -- decay server fame reset player dayTicks and grant XP and server fame
			
			// decay 1% (currently) of serverFame per server
			for (let serverId in world.serverFame) {
				let server = client.guilds.get(serverId) || {name: "UNKNOWN SERVER"};
				let serverName = server.name;
				serverFameDecay = Math.floor(world.serverFame[serverId] * cons.DEFAULTS.serverFameDecayRate);
				dBug(` Decaying ${serverFameDecay} fame from ${serverName}`);
				world.serverFame[serverId] -= serverFameDecay;
				totalServerFame -= serverFameDecay;
			}

			for (let playerId in players) {
				player = players[playerId];
				
				// "ripening"
				player.resRipen();

				//player.resHarvest(); // now done manually
				
				if (typeof player.stats.dayTicks === 'undefined') {
					player.stats.dayTicks = 0;
				}
				dayTicks = player.stats.dayTicks;
				maxXpTicks =  cons.DEFAULTS.maxXpTicks;
				xp = Math.min(dayTicks, maxXpTicks) * cons.DEFAULTS.xpPerTick;
				if (!player.stats.xp) { player.stats.xp = 0; }
				player.stats.xp += xp;
				totalTotalPlayerXp += xp;
				player.stats.dayTicks = 0;
				// distribute server fame
				// for each player that gained xp that is "representing" a server
				//	grant 1 "server fame" for each 10 xp they gained
				//		(probably make that a tweakable config constant later)

				serverFameGenerated = 0;

				if (player.isRepping) {				
					serverFameGenerated = Math.floor(xp / 10);
					if (typeof world.serverFame[player.server] === 'undefined') {
						world.serverFame[player.server] = 0;
					}
					world.serverFame[player.server] += serverFameGenerated;
					totalServerFame += serverFameGenerated;
					//dBug(`${player.charName} generated ${serverFameGenerated} fame points!`);
				}
			}

			dBug(` The sun has set! Awarded ${totalTotalPlayerXp} player XP and ${totalServerFame} server fame total!`);
			
			// More spammy advert stuff!
			if (Math.random() < 0.09) {
				spam += ` ...and so, the sun falls over the SpongeMUD world.\n`;
				spam += `Characters who were logged in for up to ${cons.DEFAULTS.maxXpTicks} ticks today `;
				spam += `will receive ${cons.DEFAULTS.xpPerTick} XP for each of those ticks.`;
				spam += `\n**${totalTotalPlayerXp} player XP** and **${totalServerFame} server fame** total were awarded!`;
				client.channels.get(cons.SPAMCHAN_ID).send(spam);
			}
		}
		dBug(`     *  The time is now hour ${now.hour.toString().padStart(2, ' ')}`);
		ut.saveObj(world, cons.MUD.worldFile);
	}
	eMaster('worldTick',{},{},client);
	timers.worldTick.main = setTimeout(() => {worldTick(client);}, cons.WORLDTICKLENGTH);
};
let initTimers = function(client) {
	timers.worldTick = {};
	timers.worldTick.main = setTimeout(() => {worldTick(client);}, cons.WORLDTICKLENGTH);
};
//-----------------------------------------------------------------------------
// COMMANDS
//-----------------------------------------------------------------------------
module.exports = {
	initTimers: initTimers,
	buildDungeon: buildDungeon,
	buildPlayers: buildPlayers,
	buildItems: buildItems,
	buildMobs: buildMobs,
	idleReset: function(message) {
		let who = message.author.id;
		let player = players[who];
		
		if (!player) {
			dBug(`idle timeout checker found no players.${who}.`, 1);
		} else {
			if (!player.idle) {
				player.idle = {
					ticks: 0,
					threshhold: 45,
					autolog: true,
					warn: true
				};
				dBug(`INFO: created .idle for players.${who}.`);
			}
			player.idle.ticks = 0; // reset, they're active
		}
		
	},
	savemud: {
		do: function(message, args) {
			saveMUD();
		}
	},
	backup: {
		do: function(message, args) {
			backupMUD();
		}
	},
	privacy: {
		do: function(message, args) {
			let cmd = 'privacy';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];	
			let outP = '';
			let pFlags = player.privacyFlags || 0;
			if (!args) {
				outP += `${player.charName}'s privacy flags.\n`;
				outP += "To change, use:\n ";
				outP += " `privacy <optionName>` to toggle, or\n ` privacy <optionName> <on | off>` to set.";
				outP += "\n```";
				for (let flag in cons.PRIVACY_FLAGS) {
					outP += flag.padStart(24, " ");
					outP += ": ";
					let isSet = (pFlags & cons.PRIVACY_FLAGS[flag]) === cons.PRIVACY_FLAGS[flag];
					outP += (isSet) ? " ON" : "off";
					if (cons.PRIVACY_FLAG_DESC[flag]) {
						outP += `  (${cons.PRIVACY_FLAG_DESC[flag]})`;
					}
					outP += "\n";
				}
				outP += "\n```";
			} else {
				args = args.split(' ');
				let flag = args[0];
				if (!cons.PRIVACY_FLAGS.hasOwnProperty(flag)) {
					outP += "That's not a valid privacy option. Try `privacy` by itself to see them.";
				} else {
					let isSet = (pFlags & cons.PRIVACY_FLAGS[flag]) === cons.PRIVACY_FLAGS[flag];
					let newSet;
					outP += `Privacy option ${flag} `;
					if (!args[1]) {
						newSet = !isSet;
						console.log(`new: ${newSet}   old: ${isSet}`);
					} else {
						args[1] = args[1].toLowerCase();
						if (args[1] === "on" || args[1] === "true") {
							newSet = true;
						} else if (args[1] === "off" || args[1] === "false") {
							newSet = false;
						} else {
							newSet = isSet;
							outP += `was unchanged. Use \`privacy ${flag} on\` or \`privacy ${flag} off\`.\n The option `;
						}
					}
					let newStr = (newSet) ? "ON" : "OFF";
					
					if (newSet === isSet) {
						outP += `remains set to **${newStr}**.`;
					} else {
						player.privacyFlags = player.privacyFlags ^ cons.PRIVACY_FLAGS[flag];
						outP += `changed to **${newStr}**.`;
						ut.saveObj(players, cons.MUD.playerFile);
					}
				}
			}
			ut.chSend(message, outP);
		}
	},
	autolog: {
		do: function(message, args) {
			let player = players[message.author.id];
			let outP = '';
			
			if (args === 'light') {
				player.traits.lightSleeper = !player.traits.lightSleeper;
				outP += `I've set the "light sleeper" trait for ${player.charName} `;
				outP += `to **${player.traits.lightSleeper}**.\nIf you are a light sleeper, `;
				outP += `you may be woken up by loud noises and other disruptive events `;
				outP += `in the game world. This means you would receive MUD DMs again since `;
				outP += `you would be awake. \nIf you have \`autolog\` turned on, you will then `;
				outP += `fall back asleep if you stay inactive, but may be disturbed again.`;
			} else {		
				args = parseInt(args);
				
				if (!args) {
					player.idle.autolog = !player.idle.autolog;
				} else if (args < 2) {
					outP += "No one falls asleep that fast. Try at least 2 ticks?\n";
				} else if (args > 16383) {
					outP += "If you want it to be that long, just turn autolog off by doing `autolog` by itself.\n";
				} else {
					player.idle.threshhold = args;
					player.idle.autolog = true;
				}
				
				if (player.idle.autolog) {
					outP += `${player.charName} will be logged out ` +
					`after ${player.idle.threshhold} ticks of no MUD activity.`;
				} else {
					outP += `${player.charName} will not be automatically logged out when idle.`;
				}
			}
			ut.saveObj(players, cons.MUD.playerFile);
			ut.chSend(message, outP);
		}
	},
	age: {
		do: function(message, args) {
			let who = message.author.id;
			let fail = cantDo(who, 'age');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let age;
			if (!args) {
				age = players[message.author.id].age;
			} else {
				let match = findChar(args);
				if (match && !players[match].privacyFlag("noShowAge")) {
					console.log(players[match].privacyFlag("noShowAge"));
					age = players[match].age;
				} else {
					ut.chSend(message, "I don't recognize them, or they are keeping their character's age private.");
					return;
				}
			}
			ut.chSend(message, `That character is ${age} ticks old.`);
		}
	},
	terse: {
		do: function(message) {
			let who = message.author.id;
			players[who].terseTravel = !players[who].terseTravel;
			ut.chSend(message, 'Short room descriptions when travelling is now: ' +
			  players[who].terseTravel);
		}
	},
	peek: {
		do: function(message, parms) {
			if (rooms.hasOwnProperty(parms)) {
				//ut.longChSend(message, rooms[parms].describeAs(player));
				ut.chSend(message, 'Hey no peeking!');
			} else {
				ut.chSend(message, `You want to see ${parms}, eh? I don't know that place.`);
			}
		}
	},
	go: {
		do: function(message, args, client) {
			let who = message.author.id;
			let fail = cantDo(who, 'go');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			args = args.split(' ');
			let where = args[0];
			let pLoc = player.location;	
			let chanStr = '';

			if (args[0] === '') {
				ut.chSend(message, 'Try `go` followed by an exit or direction.');
				return;
			}

			if (typeof rooms[pLoc].data.exits[where] !== 'undefined') {
				if (!rooms[pLoc].data.exits[where].goesto) {
					ut.chSend(message, 'You tried to leave via ' + where + 
					  ' but you were unable to get anywhere!');
					return;
				} else {
					let newLoc;
					player.unregisterForRoomEvents(); // first, unregister for events in this room
					newLoc = rooms[pLoc].data.exits[where].goesto; // find our target room
					eMaster('roomExit', pLoc, who, newLoc, client); // fire off roomExit, notify everyone but us
					let oldLoc = '' + pLoc; // hang onto old location
					
					// handle stamina
					let moveCost = player.stats.moveCost + player.weighMe();
					player.stats.stamina -= moveCost;
					player.location = newLoc; // actually move us

					// remove from old room chars[], add to new
					let ind = rooms[oldLoc].data.chars.indexOf(who);
					rooms[oldLoc].data.chars.splice(ind, 1);
					if (!rooms[newLoc].data.chars) {
						dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
						rooms[newLoc].data.chars = [];
					}
					rooms[newLoc].data.chars.push(who);
					
					player.registerForRoomEvents();// now register for room events in new room
					eMaster('roomEnter', newLoc, who, oldLoc, client); // fire off roomEnter, notify everyone + us
					ut.saveObj(players, cons.MUD.playerFile); // save to disk
					if (players[who].terseTravel) {
						chanStr += rooms[newLoc].describeAs(player);
					} else {
						chanStr += rooms[newLoc].describeAs(player);
					}
				}
			} else {
				chanStr = `You tried to leave via ${where} but that's not an exit!`;
			}
			ut.longChSend(message, chanStr);
		}
	},
	topxp: {
		do: function(message, args, client) {
			let playerArr = [];
			let outP = '';
			
			for (let playerId in players) {
				playerArr.push({"id": playerId, "xp": players[playerId].stats.xp});
			}
			playerArr.sort(ut.objSort("xp", -1));
			
			outP += (playerArr.length > 0) ? "`=-=-=- TOP CHARACTERS (by XP) -=-=-=`\n```" : "```I have no data yet.";
			let tempStr;
			let charStr;
			let pl;
			for (let position = 0; (position < playerArr.length) && (position < 20); position++) {
				tempStr = '';
				pl = players[playerArr[position].id];
				outP += `#${position + 1}`.padEnd(3, " ");
				
				if (!pl.privacyFlag("noListScoreTables")) {
					charStr = pl.charName;
					if (pl.title) {
						charStr += ' ' + titleList[pl.title];
					}
				} else {
					charStr = "UNKNOWN CHARACTER";
				}
				
				tempStr += ` ${charStr}`.padEnd(32, ".");
				tempStr += `${Math.floor(playerArr[position].xp).toLocaleString('en')}`.padStart(10);				
				tempStr += ' XP';
				
				let serverRepped = pl.getServerRepped(client);
				if (serverRepped) {
					tempStr += `   [ ${serverRepped.padEnd(32, " ")} ]`;
				}
				tempStr += '\n';
				outP += tempStr;
			}
			outP += '```';
			ut.chSend(message, outP);
		}
	},
	topfame: {
		do: function(message, args, client) {
			let fames = [];
			let server;
			let outP = '';
			for (let serverId in world.serverFame) {
				server = client.guilds.get(serverId) || {name: "UNKNOWN SERVER"};
				fames.push({"server": server.name, "fame": world.serverFame[serverId]});
			}
			fames.sort(ut.objSort("fame", -1));
			
			outP += (fames.length > 0) ? "`=-=-=- TOP SERVERS (by fame) -=-=-=`\n```" : "```I have no data yet.";
			let tempStr;
			for (let position = 0; (position < fames.length) && (position < 10); position++) {
				tempStr = '';
				outP += `#${position + 1}`.padEnd(3, " ");
				tempStr += ` ${fames[position].server}`.padEnd(32, ".");
				tempStr += `${fames[position].fame.toLocaleString('en')}`.padStart(8);
				tempStr += ' fame\n';
				outP += tempStr;
			}
			outP += '```';
			ut.chSend(message, outP);
		}
	},
	represent: {
		do: function(message, args, client) {
			
			let who = message.author.id;
			let fail = cantDo(who, 'represent', {}, client);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let player = players[who];
			let lastServerId = player.server;
			let server = client.guilds.get(lastServerId);
			let outP = '';
			
			// check for servers that have opted out of representation
			if (!player.isRepping) {
				if (CONFIG.noRepServers.hasOwnProperty(lastServerId)) {
					outP += 'Sorry, the server admin for your current server does not have representation enabled.\n';
					outP += 'You can do `m.joinmud` and `represent` a different server, or simply not generate fame for any server.';
					ut.chSend(message, outP);
					return;
				}
			}
			
			player.isRepping = !player.isRepping;
			
			if (player.isRepping) {
				outP = `${player.charName} will now generate fame for **${server.name}**!`;
			} else {
				outP = `${player.charName} will no longer generate server fame.`;
			}
			ut.chSend(message, outP);
		}
	},
	joinmud: {
		do: function(message, parms, client) {
			let who = message.author.id;
			let server = message.guild;
			let player = players[who];
			let lastServer;
			let lastId;
			let outP = '';
			let dmOut = '';
			
			let failed = false;
			
			if (typeof player === 'undefined') {
				parms = parms.split(' ');
				let charName = parms[0];

				if (charName.length < 3 || charName.length > 15) {
					outP += message.author.username + ', use `' + cons.PREFIX + 'joinmud <character name>`.' +
					  ' Your character name must be a single word between 3 and 15 chars.';
					failed = true;
				} else {
					for (let p in players) {
						if (players[p].charName.toLowerCase() === charName.toLowerCase()) {
							outP += `${message.author.username}, that sounds too close to another character's name. Can you try something else?`;
							failed = true;
						}
					}					
				}
				
				// Didn't have a character, and this is DM
				if (!server) {
					outP += '\nSince this is your first time playing, you will ' +
					  'have to do `' + cons.PREFIX + 'joinmud` in a channel rather than DMing. After that, ' +
					  'you should use DM to experience the world. We just need to set your "home server".';
					failed = true;
				}

				// kick out if things aren't Kosher so far
				if (failed) {
					ut.chSend(message, outP);
					return;
				}
				
				player = new Player({charName: charName, id: who, posture: "standing", server: server.id}, rooms, items, resources);
				players[who] = player;
				ut.saveObj(players, cons.MUD.playerFile);
				outP += ` Welcome to SpongeMUD-Alpha, ${charName}! (${message.author.username}).`;
				outP += `\n\nNow that you've created a character, you'll usually be experiencing `;
				outP += `the SpongeMUD world through direct message (DM) with me! I'll send you one `;
				outP += `now to get you started.`;
				
				dmOut += ` Welcome ${charName}! **You will probably receive many DMs while your character is "logged in" to the game world.**`;
				dmOut += ` `;
				dmOut += '\n When you are through playing for now, send a direct message saying `exitmud` if you want to stop receiving game DMs.';
				dmOut += `\nYour character, ${charName}, will then be "asleep" and will receive no more game DMs `;
				dmOut += 'until you DM `joinmud` again to "wake up". If you do not log out with `exitmud`, you will be logged';
				dmOut += 'out after a period of no game activity from you. You can toggle or change this behavior with `autolog`.';
				dmOut += '\n\nTry `look` (in a DM with me) to get started.';
				ut.chSend(message, outP);
				player.sendMsg(dmOut, client);
				
				ut.saveObj(players, cons.MUD.playerFile);
			} else {
				ut.chSend(message, ' You\'re already a SpongeMUD player. Awesome!');
				if (!server) {
					// This was a DM joinmud, and we have a character
					// check last server, see if it's valid and if they're on there
					lastId = player.server;	
					lastServer = client.guilds.get(lastId);
					
					dBug(`lastServer is ${lastServer}`);
					
					if (!lastServer) {
						outP += `${message.author}, I don't have you listed as having joined SpongeMUD ` +
						  'before. Can you do `m.joinmud` on a server you share with me to join first?';
						ut.chSend(message, outP);
						return;					
					} else {
						let user = lastServer.members.get(who);
						if (!user) {						
							outP += `${message.author}, I could not find you on ${lastServer.name}, `;
							outP += 'where you last logged in from. You need to do `m.joinmud` on ';
							outP += 'a server you share with me.';
							ut.chSend(message, outP);
							return;
						} else {
							// Okay, we have valid last server, we have valid character, can login
							dBug(`Logging in ${player.charName} via DM. Last: ${lastServer.name} / ${lastServer.id}`);
							server = {"name": lastServer.name, "id": lastServer.id};
						}
					}
				}
			}
			
			// if we're here, we should have passed these checks:
			// 1. Player exists
			// 2. If joinmud was DM'd, we have a valid lastServer
			// 		Or, this was not a DM, so we can use the server from message
		
			if (typeof player.server === 'undefined') {
				dBug(`joinmud: ${player.charName} had undefined .server just now. Setting to ${server.id}`);
				player.server = server.id; // will be message.guild.id or else from lastServer
				player.posture = 'standing';
				ut.saveObj(players, cons.MUD.playerFile);
				ut.chSend(message, ` You are now logged in via **${server.name}** (${server.id}). No previous login found.`);
			} else {
				lastId = player.server;
				lastServer = client.guilds.get(lastId);
				player.server = server.id;
				player.posture = 'standing';
				ut.saveObj(players, cons.MUD.playerFile);
				dBug(`lastServer: ${lastServer}.`);

				dmOut = `You are now logged in via **${server.name}**   Last: **${lastServer.name}**\n`;
				
				dmOut += MUDnews.welcome;
				dmOut += '\n**LATEST NEWS:**\n';
				dmOut += MUDnews.new;

				let topFame = {server: 0, fame: 0};
				let topServer;
				for (let serverId in world.serverFame) {
					if (world.serverFame[serverId] > topFame.fame) {
						topFame = {server: serverId, fame: world.serverFame[serverId]};
					}
				}
				if (topFame.server) {
					dmOut += '\n\n';
					dmOut += ' ** HIGHEST RANKED SERVER (by fame) **:  ';
					topServer = client.guilds.get(topFame.server);
					dmOut += `**${topServer.name}** with **${topFame.fame}** fame!`;
				}

				dmOut += '\n Generate fame for your home server with `represent`!';
				player.sendMsg(dmOut, client);
			}		
			player.registerForRoomEvents();
			player.registerForWorldTicks(client);
			player.unregisterForLoudRoomEvents();
			ut.saveObj(players, cons.MUD.playerFile);			
		}
	},
	exitmud: {
		do: function(message, parms, client) {
			let who = message.author.id;
			let player = players[who];
			
			if (typeof players[who] === 'undefined') {
				ut.chSend(message, message.author + ', you don\'t have a SpongeMUD ' +
				  ' character that you can logout! Use `joinmud` to join the fun!');
			} else if (!players[who].server) {
				ut.chSend(message, message.author + ', ' + players[who].charName +
				  ' wasn\'t logged in. Use `joinmud` to login if you want though.');
			} else {
				ut.chSend(message, players[who].charName + ' is being logged out ' +
				  ' from server id ' + players[who].server);
				  
				player.sleep(rooms); // Zzz
				// we can fire off a "X snores" because they should be unregistered now
				let phrase = ut.listPick(["drifts off to sleep", "closes their eyes and immediately starts snoring",
					"falls asleep", "nods off to sleep", "falls into a deep slumber"]);

				eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase, client);			
				ut.saveObj(players, cons.MUD.playerFile);
			}
		}
	},
	time: {
		do: function(message, args, client) {
			let who = message.author.id;
			let fail = cantDo(who, 'time');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';
			let time;
			
			let daysPerMonth = Math.floor(cons.DAYS_IN_YEAR / cons.MONTHS.length);
			let extraDays = cons.DAYS_IN_YEAR - (cons.MONTHS.length * daysPerMonth);
			
			if (!args) {
				time = ut.mudTime(world.time.tickCount);
			} else {
				time = ut.mudTime(parseInt(args), 10);
				outP += 'That would be on ';
			}
			
			let found = false;
			let strBucket = 0;
			for (let strNum = 0; strNum < cons.TIME_OF_DAY_STRINGS.length && !found; strNum++) {
				if (time.hour < cons.TIME_OF_DAY_STRINGS[strNum].endHour) {
					found = true;
					strBucket = strNum;
				}
			}
			let timeStr;
			let timeStrArr;
			let flavorNum;
			// timeStr = `hour ${time.hour}`;
			timeStrArr = cons.TIME_OF_DAY_STRINGS[strBucket].str;
			flavorNum = (player.id + time.day) % timeStrArr.length;
			timeStr = timeStrArr[flavorNum];
			
			outP += `${timeStr} on day ${time.day + 1} of the month of ${cons.MONTHS[time.month]}, year ${time.year}.`;
			outP += `\n\nThere are ${cons.DAYS_IN_YEAR} days in a year. There are ${daysPerMonth} days`;
			outP += `  in each of the ${cons.MONTHS.length} months`;
			if (extraDays) { outP += `, except for ${cons.MONTHS[cons.MONTHS.length - 1]}, which has ${extraDays} extra.`; }
			outP += `\nA worldtick happens every ${cons.WORLDTICKLENGTH / 1000} seconds, `;
			outP += `and there are ${cons.TICKS_IN_DAY} ticks in a day, or ~${parseFloat(cons.TICKS_IN_DAY / 24, 2)} per MUD hour.`;
			
			ut.chSend(message, outP);
		}
	},
	worldsay: {
		do: function(message, args, client, Discord) {

			let cmd = 'worldsay';
			let minAccess = 'immortal';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let whatSaid = args;
				
			if (!whatSaid) {
				ut.chSend(message, 'Cat got your tongue? Nervous speaking in front of the whole world?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only say up to 511 characters.');
				return;
			}

			for (let roomId in rooms) {
				// Fire off some events -- notify eMaster
				whatSaid = args;
				eMaster('roomGeneric', roomId, who, {
					normal: [`You broadcast to the world, ${whatSaid}`,
					`says from everywhere at once, "${whatSaid}"`]
				}, client);
			}
		}
	},
	worldcast: {
		do: function(message, args, client, Discord) {

			let cmd = 'worldcast';
			let minAccess = 'immortal';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let whatSaid = args;
				
			if (!whatSaid) {
				ut.chSend(message, 'Cat got your tongue? Nervous speaking in front of the whole world?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only say up to 511 characters.');
				return;
			}

			for (let roomId in rooms) {
				// Fire off some events -- notify eMaster
				whatSaid = args;
				eMaster('roomGeneric', roomId, who, {
					noName: true,
					normal: [whatSaid, whatSaid]
				}, client);
			}
		}
	},
	yell: {
		do: function(message, args, client, Discord) {
			let who = message.author.id;
			let fail = cantDo(who, 'yell');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let whatSaid = args;
				
			if (!whatSaid) {
				ut.chSend(message, 'Cat got your tongue?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only say up to 511 characters.');
				return;
			} 

			let pLoc = players[who].location;
			let zone = rooms[pLoc].data.zone;
			let where;
			if (typeof zone === 'undefined') {
				// not in a zone, so only yell to this room
				where = rooms[pLoc];
				whatSaid = args.toUpperCase();
				players[who].timers.yell = 1;
				eMaster('roomGeneric', pLoc, who, {
					normal: [`You yell, ${whatSaid}!`,
						`yells, ${whatSaid}!`]
					}, client);
					// Fire off roomLoud to wake light sleepers
					eMaster('roomLoud', pLoc, who, {}, client);
			} else {
				for (let roomId in rooms) {
					where = rooms[roomId];
					if (where.data.zone === zone) {
						// Fire off some events -- notify eMaster
						whatSaid = args.toUpperCase();
						players[who].timers.yell = 1; // 1 tick to wait
						eMaster('roomGeneric', roomId, who, {
							normal: [`You yell, ${whatSaid}!`,
							`yells from ${pLoc}, ${whatSaid}!`]
						}, client);
						// Fire off roomLoud to wake light sleepers
						eMaster('roomLoud', roomId, who, {}, client);
					}
				}
			}
		}
	},
	say: {
		do: function(message, args, client) {
			let who = message.author.id;
			let fail = cantDo(who, 'say');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let whatSaid = args;
			
			if (!whatSaid) {
				ut.chSend(message, 'Cat got your tongue?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only say up to 511 characters.');
				return;
			} 
			
			let pLoc = players[who].location;
			
			// Fire off some events -- notify eMaster
			eMaster('roomSay', pLoc, who, whatSaid, client);
		}
	},
	listens: {
		do: function(message) {
			let who = players[message.author.id];
			ut.chSend(message, ' Dumping global and local events object to console.');
			dBug(eMaster.listens);
			dBug(' roomSay In this area (' + who.location + '): ');
			dBug(eMaster.listens.roomSay[who.location]);
		}
	},
	getid: {
		do: function(message, parms) {
			// getid <nick> to search globally
			// getid <roomId> to search a particular room
			// getid <here> to search current location
			
			parms = parms.split(' ');
			let nick = parms[0];
			let match;
			
			if (parms[1] === 'here') {
				match = findChar(nick, players[message.author.id].location);
			} else if (parms[1]) {
				match = findChar(nick, parms[1]);
			} else {
				match = findChar(nick);
			}
			dBug(players[message.author.id].location);
			
			if (match) {
				ut.chSend(message, '```' + match + ' : ' + nick + '```');
			} else {
				ut.chSend(message, nick + ' couldn\'t be found.');
			}
		}
	},
	attack: {
		do: function(message, args, client) {
			let choiceList;
			let who = message.author.id;

			let fail = cantDo(who, 'attack');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, "Specify what you want to attack.");
				return;
			}
			
			let pl = players[who];
			let loc = pl.location;
			let outP = '';
			let theMob;
		
			// BEGIN IDENTICAL PART !!!
			
			// split args into choiceNum and target:
			let choiceNum = 0; // setting this to 0 is important
			let target;
			args = args.split(' ');
			args = args[0];  // we just need the first word, ignore rest
			
			let splitStr = args.split('.');
			let firstPart = parseInt(splitStr[0], 10);
			if (isNaN(firstPart)) {
				// first part was not a number, so they either did NaN.bar
				// or else they just did foo
				target = splitStr[0];
				// choiceNum = 0; // we would set this but don't need to now
			} else {
				// first part parsed to a number
				target = splitStr[1]; // everything after the dot
				choiceNum = firstPart;
			}
			
			// END IDENTICAL PART
			
			// only chars and mobs, and really only mobs
			choiceList = buildPicklist({
				"char": rooms[loc].data.chars,
				"mob": rooms[loc].data.mobs
			}, target);

			// BEGIN IDENTICAL PART 2 !!!
			
			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
				if (firstPart < 0) {outP += 'And you should feel bad for trying.';}
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target so far, see if we can attack it
				
				if (choiceList[choiceNum].where === 'char') {
					outP += `That is a character. `;
					outP += `You may not (currently) attack other characters, only mobs.`;
				} else {
					theMob = mobs[choiceList[choiceNum].ids[0]];
					theMob.die(pl, client);
				}
			}
			if (outP !== '') { ut.chSend(message, outP); }
		}
	},
	look: {
		do: function(message) {
			
			let who = message.author.id;
			let fail = cantDo(who, 'look');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let player = players[who];
			let pLoc = players[who].location;
			
			if (player.posture === 'asleep') {
				ut.chSend(message, 'Visions of sugarplums dance through your head. ' +
				'(You are asleep. You need to `!joinmud` to wake up and be able to see!');
				return;
			}
			ut.longChSend(message, rooms[pLoc].describeAs(player));
		}
	},
	list: {
		do: function(message, args) {
			// cantDo check
			
			let who = message.author.id;
			let fail = cantDo(who, 'exam'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			// no args check
			if (!args || args.length < 2) {
				ut.chSend(message, 'Do `list` followed by at least two letters to list obvious matching objects.');
				return;
			}
			
			// setup
			let pl = players[who];
			let loc = pl.location;
			args = args.split(' ');
			let target = args[0];
			let outP = '';
			let choices = [];
			
			choices = buildPicklist({
				"inv": pl.inventory,
				"floor": rooms[loc].data.items,
				"exit": rooms[loc].data.exits,
				"mob": rooms[loc].data.mobs
			}, target);
			outP += `\`\`\`            =-=-= MATCHES FOR ${target}: =-=-=`; // `
			
			let numStr = '';
			for (let num = 0; num < choices.length; num++) {
				numStr = (num === 0) ? '' : (num + 1) + '.';
				outP += `\n${numStr.padStart(16, " ")}${target} (${choices[num].short || ""}): (${choices[num].where}): ${choices[num].what}`;
				
				if (choices[num].ids.length > 1) {
					outP += ` (x${choices[num].ids.length})`;
				}
			}

			outP += '```';
			ut.chSend(message, outP);
		}
	},
	exam: {
		do: function(message, args) {
			/*
				We'd like them to be able to:
					exam <Item in Room>
					exam <Item in Inv>
					exam <Exit>
					exam <Player>
					exam <SceneryItem>
			*/
			let choiceList;
			let who = message.author.id;
			let fail = cantDo(who, 'exam'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args || args.length < 2) {
				ut.chSend(message, 'Try examining a specific thing (at least 2 letters).');
				return;
			}
			
			let pl = players[who];
			let loc = players[who].location;
			
			// split args into choiceNum and target:
			let choiceNum = 0; // setting this to 0 is important
			let target;
			args = args.split(' ');
			args = args[0];  // we just need the first word, ignore rest
			
			let splitStr = args.split('.');
			let firstPart = parseInt(splitStr[0], 10);
			if (isNaN(firstPart)) {
				// first part was not a number, so they either did NaN.bar
				// or else they just did foo
				target = splitStr[0];
				// choiceNum = 0; // we would set this but don't need to now
			} else {
				// first part parsed to a number
				target = splitStr[1]; // everything after the dot
				choiceNum = firstPart;
			}		
			let outP = '';

			choiceList = buildPicklist({
				"inv": pl.inventory,
				"floor": rooms[loc].data.items,
				"exit": rooms[loc].data.exits,
				"char": rooms[loc].data.chars,
				"mob": rooms[loc].data.mobs
			}, target);
		
			// probably move this later because of hidden items
			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
				if (firstPart < 0) {outP += 'And you should feel bad for trying.';}
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}

				if (choiceList[choiceNum].where === 'char') {
					outP = players[choiceList[choiceNum].ids[0]].longDescribeAs(pl);
				} else if (choiceList[choiceNum].where === 'exit') {
					let exitId = choiceList[choiceNum].ids[0];
					let exitDesc = rooms[loc].data.exits[exitId].description || exitId;
					let viewAs = pl;
					if (rooms[loc].data.exits[exitId].hidden) {
						if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
							outP = `(hidden) \`${exitId}\`: ${exitDesc}`;
						} else {
							// hidden, do not show
						}
					} else {
						outP = `\`${exitId}\`: ${exitDesc}`;
						if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
							// wizards wearing hat also see goesto
							let exitId = choiceList[choiceNum].ids[0];
							let exitDesc = rooms[loc].data.exits[exitId].description || exitId;
							let goesto = rooms[loc].data.exits[exitId].goesto;
							outP = `\`${exitId}\`: ${exitDesc} -> ${goesto}`;
						}
					}
				} else if (choiceList[choiceNum].where === 'mob') {
					outP = mobs[choiceList[choiceNum].ids[0]].describeAs(pl);
				} else {
					// must be an item
					outP = items[choiceList[choiceNum].ids[0]].describeAs(pl); // ids[0] = just use first one
				}
			}
			ut.chSend(message, outP);
		}
	},
	nukemyzone: {
		do: function(message, args, client, Discord) {
			// args should be the name of one of the constants in constants.js
			let who = message.author.id;
			let fail = cantDo(who, 'nukemyzone', {minAccess: "wizard"});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let outP = '';
			let player = players[who];
			let zoneRequest = args;
			let theirData = {};
			
			if (!zoneList.hasOwnProperty(zoneRequest)) {
				outP += `${zoneRequest} isn't a zone anyone has told me about, ${player.charName}.`;
			} else {
				if (zoneList[zoneRequest].authors.indexOf(player.id) === -1) {
					outP += `${player.charName} is not an author of ${zoneRequest}.`;
				} else {
					let roomCount = 0;
					for (let room in rooms) {
						if (rooms[room].data.zone === zoneRequest) {
							roomCount++;
							theirData[room] = rooms[room];
							delete rooms[room]; //rip
						}
					}
					if (roomCount) {
						let now = new Date().valueOf();
						let fn = zoneRequest + now + '.json';
						player.sendJSON(theirData, fn, client, Discord);
						outP += `:warning: You should already have backed stuff up probably.:warning:\n`;
						outP += `\nThis operation happened only in memory -- no changes were written to disk (yet)`;
						outP += `\nZone **${zoneRequest}** had ${roomCount} rooms. I sent a file of them to you.`;
					} else {
						outP += `Your zone ${zoneRequest} has no rooms associated with it yet.`;
					}
				}
			}
		ut.chSend(message, outP);
		}
	},	
	get: {
		do: function(message, args, client) {
			let choiceList;
			// for get, we only allow picking from floor
			let who = message.author.id;
			let fail = cantDo(who, 'get');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, 'Get _what_, though?');
				return;
			}
			
			let loc = players[who].location;
						
			// BEGIN IDENTICAL PART !!!
			
			// split args into choiceNum and target:
			let choiceNum = 0; // setting this to 0 is important
			let target;
			args = args.split(' ');
			args = args[0];  // we just need the first word, ignore rest
			
			let splitStr = args.split('.');
			let firstPart = parseInt(splitStr[0], 10);
			if (isNaN(firstPart)) {
				// first part was not a number, so they either did NaN.bar
				// or else they just did foo
				target = splitStr[0];
				// choiceNum = 0; // we would set this but don't need to now
			} else {
				// first part parsed to a number
				target = splitStr[1]; // everything after the dot
				choiceNum = firstPart;
			}		

			let outP = '';
			
			// END IDENTICAL PART
			
			// leave the inventory out of this!
			choiceList = buildPicklist({
				floor: rooms[loc].data.items
			}, target);
					
			// BEGIN IDENTICAL PART 2 !!!
			
			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
				if (firstPart < 0) {outP += 'And you should feel bad for trying.';}
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target, see if it has a .get() method, though
				
				let theItem = items[choiceList[choiceNum].ids[0]];
				
				if (typeof theItem.get !== 'function') {
					ut.chSend(message, 'You can\'t pick **that** up!');
					return false;
				}
			
				// ok, we can let them pick it up
				theItem.get(who, client);
			}	
			ut.chSend(message, outP);
		}
	},
	drop: {
		do: function(message, args, client) {
			let choiceList;
			// for drop, we only allow picking from inv
			let who = message.author.id;
			let fail = cantDo(who, 'drop');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, 'Drop _what_, though?');
				return;
			}
			
			let pl = players[who];
			let loc = players[who].location;
			
			
			// BEGIN IDENTICAL PART !!!
			
			// split args into choiceNum and target:
			let choiceNum = 0; // setting this to 0 is important
			let target;
			args = args.split(' ');
			args = args[0];  // we just need the first word, ignore rest
			
			let splitStr = args.split('.');
			let firstPart = parseInt(splitStr[0], 10);
			if (isNaN(firstPart)) {
				// first part was not a number, so they either did NaN.bar
				// or else they just did foo
				target = splitStr[0];
				// choiceNum = 0; // we would set this but don't need to now
			} else {
				// first part parsed to a number
				target = splitStr[1]; // everything after the dot
				choiceNum = firstPart;
			}		

			let outP = '';
			
			// END IDENTICAL PART
			
			
			// leave the floor out of this!
			choiceList = buildPicklist({
				inv: pl.inventory
			}, target);
	
			// BEGIN IDENTICAL PART 2 !!!
			
			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
				if (firstPart < 0) {outP += 'And you should feel bad for trying.';}
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target, see if it has a .drop() method, though
				
				let theItem = items[choiceList[choiceNum].ids[0]];
				if (typeof theItem.drop === 'undefined') {
					ut.chSend(message, 'It seems to be stuck to you!');
					return false;
				}
			
				// ok, we can let them drop it
				theItem.drop(who, loc, client);
			}	
			ut.chSend(message, outP);
		}
	},
	crush:{
		do: function(message, args, client) {
			let choiceList;
			// for crush, we only allow picking from inv
			let who = message.author.id;
			let fail = cantDo(who, 'drop');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let pl = players[who];
			let loc = players[who].location;
			
			if (!args) {
				ut.chSend(message, `${pl.charName} **SMASH**!`);
				return;
			}
			
			// BEGIN IDENTICAL PART !!!
			
			// split args into choiceNum and target:
			let choiceNum = 0; // setting this to 0 is important
			let target;
			args = args.split(' ');
			args = args[0];  // we just need the first word, ignore rest
			
			let splitStr = args.split('.');
			let firstPart = parseInt(splitStr[0], 10);
			if (isNaN(firstPart)) {
				// first part was not a number, so they either did NaN.bar
				// or else they just did foo
				target = splitStr[0];
				// choiceNum = 0; // we would set this but don't need to now
			} else {
				// first part parsed to a number
				target = splitStr[1]; // everything after the dot
				choiceNum = firstPart;
			}		

			let outP = '';
			
			// END IDENTICAL PART
			
			// leave the inventory out of this!
			choiceList = buildPicklist({
				inv: pl.inventory
			}, target);
						
			// BEGIN IDENTICAL PART 2 !!!
			
			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
				if (firstPart < 0) {outP += 'And you should feel bad for trying.';}
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target, see if it has a .drop() method, though
				
				let theItem = items[choiceList[choiceNum].ids[0]];
				if (typeof theItem.crush === 'undefined') {
					ut.chSend(message, 'It seems to be stuck to you!');
					return false;
				}
			
				// ok, we can let them crush it
				theItem.crush(who, loc, client);
			}	
			ut.chSend(message, outP);
		}
	},
	use: {
			do: function(message, args, client) {
			let choiceList;

			let who = message.author.id;
			let fail = cantDo(who, 'use');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let pl = players[who];
			let loc = players[who].location;
			
			if (!args) {
				ut.chSend(message, `What are you trying to use?`);
				return;
			}
			
			// BEGIN IDENTICAL PART !!!
			
			// split args into choiceNum and target:
			let choiceNum = 0; // setting this to 0 is important
			let target;
			args = args.split(' ');
			args = args[0];  // we just need the first word, ignore rest
			
			let splitStr = args.split('.');
			let firstPart = parseInt(splitStr[0], 10);
			if (isNaN(firstPart)) {
				// first part was not a number, so they either did NaN.bar
				// or else they just did foo
				target = splitStr[0];
				// choiceNum = 0; // we would set this but don't need to now
			} else {
				// first part parsed to a number
				target = splitStr[1]; // everything after the dot
				choiceNum = firstPart;
			}		

			let outP = '';
			
			// END IDENTICAL PART
			
			// leave the inventory out of this!
			choiceList = buildPicklist({
				inv: pl.inventory,
				floor: rooms[loc].data.items
			}, target);
						
			// BEGIN IDENTICAL PART 2 !!!
			
			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
				if (firstPart < 0) {outP += 'And you should feel bad for trying.';}
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target, see if it has a .use() method, though
				
				let theItem = items[choiceList[choiceNum].ids[0]];
				if (typeof theItem.use === 'undefined') {
					ut.chSend(message, 'Nothing interesting happens.');
					return false;
				}

				// ok, we can let them try to use it
				theItem.use(who, loc, client);
			}	
			ut.chSend(message, outP);
		}
	},
	inv: {
		do: function(message, parms) {
			let who = message.author.id;
			let fail = cantDo(who, 'inv'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let pl = players[who];
			let outP = '';
			if (pl.inventory === {}) {
				outP = 'absolutely nothing!';
			} else {
				for (let itemId in pl.inventory) {
					
					if (!items[itemId]) {
						dBug(`No such item ID: ${itemId} in items! (Player inventory: ${who})`, 1);
						outP += ' -- some buggy items, please notify admin! --';
					} else if (!items[itemId].data) {
						dBug(`No .data property on item ID: ${itemId}!`, 1);
						outP += ' -- some buggy items, please notify admin! --';
					} else if (!items[itemId].data.shortName) {
						outP += '!UNKNOWN!(';
					} else {
						outP += `${items[itemId].data.type} (${items[itemId].data.shortName}) \`(${itemId})\`   `;
					}
				}
			}
			ut.chSend(message, pl.charName + '\'s inventory: ' + outP);
		}
	},
//-----------------------------------------------------------------------------
	zone: {
		do: function(message, parms) {
			let who = message.author.id;
			let fail = cantDo(who, 'zone');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '\n';
			let room = rooms[players[who].location];
			
			if (!room.data.zone) {
				outP += `You are not currently in any particular zone.`;
			} else {
				outP += '```\n';
				
				if (!zoneList[room.data.zone]) {
					outP += ` UNKNOWN ZONE "${room.data.zone}"`;
				} else {
					let title = zoneList[room.data.zone].title || room.data.zone;
					let authors = zoneList[room.data.zone].authors || [];
					let desc = zoneList[room.data.zone].description || '\n';
					outP += `=-=-=-=-=   ${title}   =-=-=-=-=\n`;
					outP += '```';
					outP += `${desc}\n`;
					outP += `-----------------------\n`;
					outP += `Author(s): `;

					authors.forEach(function(pId){
						if (players[pId]) {
							outP += `${players[pId].charName}  `;
						} else {
							outP += `${pId}  `;
						}
					});
					
					outP += `\n-----------------------\n`;
					outP += `These charaters are known to be in **${title}** and awake:\n`;
					
					// TODO: probably start pushing players onto an array for each zone when they enter
					// and removing them when they leave
					// probably add that along with a "zoneEnter/zoneExit" event type someday
					// This method iterates over all players. Oof.
					for (let pl in players) {
						if (!rooms[players[pl].location]) {
							dBug(`zone: player.${pl} is in invalid room ${players[pl].location}!`, 2);
						} else {
							if (players[pl].posture !== 'asleep') {
								if (rooms[players[pl].location].data.zone === room.data.zone) {
									let pFlags = players[pl].privacyFlags;
									let noList = false;
									if (pFlags) {
										noList = pFlags & cons.PRIVACY_FLAGS.noListZone;
									}
									if (!noList) {
										outP += `\`${players[pl].charName}\` `;
									}
								}
							}
						}
					}
				}
			}
			ut.chSend(message, outP);
		}
	},
	zones: {
		do: function(message, parms) {
			let start = new Date().valueOf();
			let stop = 0;
			let outP = '\n';
			let zones = {};
			let nozone = 0;
			
			for (let room in rooms) {
				if (!rooms[room].data.zone) {
					nozone++;
				} else {
					if (zones.hasOwnProperty(rooms[room].data.zone)) {
						zones[rooms[room].data.zone]++;
					} else {
						zones[rooms[room].data.zone] = 1;
					}
				}
			}

			for (let zone in zones) {
				outP += `\nZone \`${zone}\` has ${zones[zone]} rooms`;
			}
			outP += `\nAlso found ${nozone} rooms not associated with any zone.\n`;
			stop = new Date().valueOf();
			outP += `... Completed in ${stop - start} ms`;
			
			ut.chSend(message, outP);
		}
	},
	edroom: {
		do: function(message, parms, client) {
			// title, description: String
			// items: leave it out, can wizitem them
			// exits: use wizex ?
			let cmd = 'edroom';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess}, client);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let loc = player.location;
			parms = parms.split(' ');
			let prop = parms[0];
			parms.shift();
			parms = parms.join(' ');
			let val = parms;
			let target;
			if (prop === 'title' || prop === 'description' || prop === 'zone') {
				rooms[loc].data[prop] = val;
				ut.chSend(message, prop + ' of ' + loc + ' now:\n ' + val);
				ut.saveObj(rooms, cons.MUD.roomFile);
			} else if (prop === 'delexit') {
				parms = parms.split(' ');
				target = parms[0];
				if (typeof rooms[loc].data.exits[target] !== 'undefined') {
					delete rooms[loc].data.exits[target];
					ut.chSend(message, 'Exit "' + target + '" deleted! :open_mouth:');
				} else {
					ut.chSend(message, target + ' is not a valid exit, can\'t delete!');
					return;
				}
			} else if (prop === 'exits') {
				parms = parms.split(' ');
				target = parms[0]; // which exit they're editing
				let exProp = parms[1]; // what property of the exit they want to change
				parms.shift(); 
				parms.shift();
				val = parms.join(' '); // anything left is the value they want to change to
				
				if (!target || !exProp) {
					// command wasn't long enough
					ut.chSend(message, ' Use `edroom exits <exitId> <property> <value>`');
					return;
				}
				
				if (typeof rooms[loc].data.exits[target] !== 'undefined') {
					// exit exists. update whatever property.
					
					// if they left it blank, delete the old property if possible
					if (val === '') {
						if (typeof rooms[loc].data.exits[target][exProp] === 'undefined') {
							ut.chSend(message, 'Property .' + exProp + ' does not exist on exit "' + target +
							  '". No value specified. Nothing has been added, removed, or altered.');
						} else {
							ut.chSend(message, 'Deleting property .' + exProp + ' from "' + target + '". ' +
							  'Previously, it had value: ' + rooms[loc].data.exits[target][exProp]);
							delete rooms[loc].data.exits[target][exProp];
							ut.saveObj(rooms, cons.MUD.roomFile);
						}
					} else {
						if (val === 'TRUE') {val = true;}
						if (val === 'FALSE') {val = false;}
						rooms[loc].data.exits[target][exProp] = val;
						ut.chSend(message, 'Set exit "' + target + '".' + exProp + ' = ' + val);
						ut.saveObj(rooms, cons.MUD.roomFile);
					}
				} else {
					// exit didn't exist. create, and create property
					rooms[loc].data.exits[target] = {};
					rooms[loc].data.exits[target][exProp] = val;
					ut.chSend(message, 'Created exit "' + target + '", then set .' + exProp + ' = ' + val);
					ut.saveObj(rooms, cons.MUD.roomFile);
				}
				
				// exit exists for sure now, make sure a room exists IF they edited/created goesto
				if (exProp.toLowerCase() === 'goesto') {
					if (typeof rooms[val] === 'undefined') {
						player.zoneOf(rooms);
						rooms[val] = new Room({"title": val, "id": val, "zone": player.zoneOf(rooms)});
						ut.chSend(message, ' Since no room "' + val + '" existed, I made one. Make sure ' +
						  'you do any necessary editing to it! Also created an exit called `back` leading back here.');
						rooms[val].data.exits.back.goesto = loc;
						ut.saveObj(rooms, cons.MUD.roomFile);
					}
				}
			} else {
				ut.chSend(message, 'Can only edit `title`, `description` or `exits` properties. ' +
				  ' or use `delexit` to delete an exit.');
			} 
		}
	},
	makeprop: {
		do: function(message, args) {
			let cmd = 'makeprop';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';		
			let template;

			if (!player.carriedTemplates) {
				  player.carriedTemplates = [];
			}
			template = player.carriedTemplates[0];
			if (!template) {
				outP += 'You can only `makeprop` when you are carrying a template. You cannot `makeprop` ' +
				  ' on a published template. You are not carrying a template. Try `wiztemp` first.';
			} else	{
				outP += '```Setting properties of template ' + template.data.id + ':\n\n';
				
				let propProps = {
					"family": "prop",
					"decay": {
					   "rate": 0
					}
				};
				for (let propProp in propProps) {
					template.data[propProp] = propProps[propProp];
					outP += `${propProp}: ${JSON.stringify(propProps[propProp])}\n`;
				}
				
				outP += '  Successfully turned into a prop!```\n';
				outP += ' Use `edtemp` to edit further, ';
				outP += ' Use `wiztemp` to view, or';
				outP += ' Use `publish` to publish (save permanently)';	
			}
			ut.chSend(message, outP);
		}
	},
	edtemp: {	
		do: function(message, args) {
			let cmd = 'edtemp';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';		
			let template;

			if (!player.carriedTemplates) {
				  player.carriedTemplates = [];
			}
			template = player.carriedTemplates[0];
			if (!template) {
				outP += 'You can only `edtemp` when you are carrying a template. You cannot `edtemp` ' +
				  ' on a published template. You are not carrying a template. Try `wiztemp` first.';
			} else {
				args = args.split(' ');
				let prop = args[0];
				args.shift(); // ditch the prop
				let val = args.join(' ');
								
				if (!prop) {
					outP += 'No property! Usage: `edtemp <property> <value>`';
				} else if (!val) {
					//outP += 'prop was: ' + prop;
					outP += '\nNo value! Usage: `edtemp <property> <value>`';
				} else {
						
					if (val === 'TRUE') {
						val = true;
					} else if (val === 'FALSE') {
						val = false;
					}

					prop = prop.split('.');
					// 'foo 3'  ['foo 3']
					// 'foo.bar 3' ['foo', 'bar'] // 3 would have already been split off
					//  foo.bar.baz ['foo', 'bar', 'baz'] // if they do this, they can fix themselves
					
					if (prop[1]) {
						// did a subproperty
						
						if (!template.data[prop[0]]) {
							outP = `There was no property ${prop[0]}, ` +
							  `on your ${template.data.id} so I made one.`;
							template.data[prop[0]] = {};
						}
						outP = `I've set "${template.data.id}".${prop[0]}.${prop[1]} to: ${val}`;
						template.data[prop[0]][prop[1]] = val;
					} else if (prop[0].toLowerCase() === 'shortnames') {
						// handle this special case of editing shortNames
						// if startsWith + / -
									
						let firstChar = val.substring(0, 1);
						val = val.slice(1);
	
						if (firstChar === '+') {
							let match = template.data.shortNames.indexOf(val);
							if (match !== -1) {
								outP += `${template.data.id} already had a ${val} in shortNames[]`;
							} else {
								template.data.shortNames.push(val);
								outP += `OK, I've added ${val} to the shortNames of ${template.data.id}.`;							
							}
						} else if (firstChar === '-') {
							let match = template.data.shortNames.indexOf(val);
							if (match === -1) {
								outP += `I didn't see a shortName called ${val}, sorry.`;
							} else {
								template.data.shortNames.splice(match, 1);
								outP += `shortnames is now: ${template.data.shortNames}`;
							}
						} else {
								outP += 'Not sure what you want me to do with that shortname. Try adding + or - to the start. \n';
								outP += 'Examples:\n  `edtemp shortNames +coffee` to add "coffee" to the template\'s shortNames';
								outP += '\n  `edtemp shortNames -cup` to remove "cup" to the template\'s shortNames';
							}
					} else if (!template.data[prop[0]]) {
							outP = `There was no property ${prop[0]}, ` +
							  `on your ${template.data.id} so I made one.`;
							template.data[prop[0]] = val;
							outP += `nI've also set "${template.data.id}".${prop[0]} to: ${val}`;
					} else {
						template.data[prop[0]] = val;
						outP += `I've set "${template.data.id}".${prop[0]} to: ${val}`;
					}
				}
			}
			ut.chSend(message, outP);
		}
	},
	wiztemp: {
		do: function(message, args) {
			let cmd = 'wiztemp';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';
			let id;
			let shortName;
			let description;
			
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			}
					
			if (!args) {
				// With no arguments, show the current template the character is "carrying"
				let currentTemps = player.carriedTemplates;
				if (!currentTemps) {
					currentTemps = [];
				}
				if (!currentTemps[0]) {				
					outP += 'Your Wizardliness, you have no currently saved item template.\n';
					outP += 'You can make one with `wiztemp <"unique id name"> <shortName> <long description>`';
				} else {
					outP += ` \`"${currentTemps[0].data.id}"\`\n`;
					outP += '\n ``` STORED TEMPLATE DATA  --  USE PUBLISH TO SAVE PERMANENTLY```\n```';
					outP += `RAW DATA: ${JSON.stringify(currentTemps[0])}\n`;
					
					outP += `\n Unique ID:  "${currentTemps[0].data.id}"`;
					outP += `\n    Family:  ${currentTemps[0].data.family}  (if you are making a prop or mob, this should say prop or mob!)`;
					
					outP += '```\n';
				}
			} else {
				// args were supplied...
				args = args.split('"');
				id = args[1];
				if (!id) {
					outP += 'Missing an "id in quotes"!';
				} else {
					args.shift();
					args.shift();
					args = args.join(' ');
					args = args.slice(1); // leading space
					args = args.split(' ');
					shortName = args[0];
					args.shift(); // lop off shortName
					description = args.join(' ');
					if (!shortName || !description) {
						outP += 'Missing a shortName or description!';
					} else {
						
						let template = new ItemType({
							"id": id,
							"shortName": shortName,
							"shortNames": [shortName],
							"description": description
						});
						
						player.carriedTemplates = [template];
						outP += ` :thumbsup: saved "${id}" template to your profile! `;
						outP += ' Use `wiztemp` to view or `publish` to save permanently! ';
						outP += '\n  * If you want this to be a prop, do: `makeprop` next.';
						outP += '\n  * To change your template before publishing, use `edtemp`.';
						outP += '\n  * To view your template, do `wiztemp`.';
						outP += '\n  * To publish it for permanence, do `publish`';
						outP += '\n\n Decay Information:';
						outP += '\n This item will be set to DEFAULT DECAY SETTINGS:\n';
						for (let prop in cons.DEFAULTS.itemDecay) {
							outP += `   **${prop}**: ${cons.DEFAULTS.itemDecay[prop]}`;
						}
						
					}
				}
			}
			
			ut.chSend(message, outP);
		}
	},
	publish: {
		do: function(message, args) {
			let cmd = 'publish';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';
			let templates = player.carriedTemplates;
			let totalTemps;
			
			// short circuiting OR so safe
			if (!templates || !templates[0]) {
				outP += `:question: ${player.charName} has no templates pending publication.`;
				outP += 'Create a new one with `wiztemp` and set it up, then you can `publish`.';
			} else {
				let now = new Date().valueOf();
				ut.saveObj(itemTypes, cons.MUD.backups.itemFile + now + '.bak'); // backup beforehand
				outP += `Published: `;
				totalTemps = templates.length;
				for (let n = 0; n < totalTemps; n++) {
					itemTypes[templates[n].data.id] = templates[n];
					outP += `\`"${templates[n].data.id}"\`,  `;
				ut.saveObj(itemTypes, cons.MUD.itemFile); // save to disk (main live file)
				outP += `\n${totalTemps} pending template(s) published. You can now \`wizitem\` from them!`;
				player.carriedTemplates = [];
				dBug(` (( PUBLISH ))   ${player.charName} just published ${totalTemps} pending template(s)`);
				}
				ut.chSend(message, outP);
			}
		}
	},
	wizitem: {
		do: function(message, parms) {
			// "itemType", shortname, description
			let cmd = 'wizitem';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}	

			let outP = '';
			
			parms = parms.split('"');
		
			let iType = parms[1];
			if (!iType) {
				ut.chSend(message, ' You need to specify an item template (in quotes) as first argument! See documentation for valid tempates.');
				return;
			}
			
			if (!itemTypes.hasOwnProperty(iType)) {
				ut.chSend(message, `${iType} is not a valid template. Consult the documentation.`);
				return;
			}

			let idata = itemTypes[iType].data; // inherit stuff from itemTypes	
			
			let theItem;
			if (idata.family === "prop") {
				theItem = new SceneryItem(iType, {
					"hidden": idata.hidden,
					"shortName": idata.shortName,
					"shortNames": idata.shortNames,
					"description": idata.description,
					"decay": idata.decay,
					"location": who
				});
				outP += ` Gave you a ${theItem.data.type}(${theItem.data.shortName}) prop with id ${theItem.id} .\n :warning:  When you drop it, you won't` + 
				` be able to pick it back up, so make sure you drop it in the room where you want to make it part of the scenery!`;
			} else {
				theItem = new Item(iType, {
					"hidden": idata.hidden,
					"shortName": idata.shortName,
					"shortNames": idata.shortNames,
					"description": idata.description,
					"decay": idata.decay,
					"location": who,
					"family": idata.family
				});
				outP += `New ${theItem.data.type}(${theItem.data.shortName}) created for you, wizard.`;
				outP += `\nIt has the ID \`${theItem.id}\` and has been placed in your inventory.`;

			}
			items[theItem.id] = theItem;

			ut.chSend(message, outP);
			ut.saveObj(rooms, cons.MUD.roomFile);
			ut.saveObj(players, cons.MUD.playerFile);
		}
	},
	wizmob: {
		do: function(message, parms) {
			// "itemType", shortname, description
			let cmd = 'wizmob';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let outP = '';
			parms = parms.split('"');
		
			let mType = parms[1];
			if (!mType) {
				ut.chSend(message, ' You need to specify a mob template (in quotes) as first argument! See documentation for valid tempates.');
				return;
			}
			
			if (!mobTypes.hasOwnProperty(mType)) {
				ut.chSend(message, `${mType} is not a valid template. Consult the documentation.`);
				return;
			}

			let mdata = mobTypes[mType].data; // inherit stuff
			
			// calling new Mob will give it an id and place it in room
			let theMob= new Mob(mType, {
				"hidden": mdata.hidden,
				"shortName": mdata.shortName,
				"shortNames": mdata.shortNames,
				"description": mdata.description,
				"location": players[who].location,
				"speak": mdata.speak,
				"genericaction": mdata.genericaction,
				"move": mdata.move,
				"decay": mdata.decay,
				"family": mdata.family,
				"xp": mdata.xp
			});
			theMob.registerForWorldTicks();
			outP += `A ${theMob.data.type}(${theMob.data.shortName}) appears on the ground in front of you!`;
			players[who].timers.wizmob = cons.WIZARD_MOB_LIMIT;
			ut.chSend(message, outP);
			ut.saveObj(rooms, cons.MUD.roomFile);
			ut.saveObj(players, cons.MUD.playerFile);
		}
	},
	killitem: {	
		do: function(message, parms) {
			// has not been used/tested in a long time
			let cmd = 'killitem';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let pl = players[who];
			let loc = pl.location;
			parms = parms.split(' ');
			let target = parms[0]; // what we're deleting
			parms.shift();
			parms = parms.join(' ');
			
			let outP = '';
			let found = 0;
			if (typeof pl.inventory[target] !== 'undefined') {
				outP += '(inv.) `' + target + '`: ' + pl.inventory[target].data.description;
				if (parms === 'inv') {
					delete pl.inventory[target];
					outP += ' was deleted! :open_mouth: \n';
				} else {
					outP += ' was left alone.\n';
				}
				found++;
			}
			if (typeof rooms[loc].data.items[target] !== 'undefined') {
				outP += '(here) `' + target + '`: ' + rooms[loc].data.items[target].data.description;
				if (parms === 'here') {
					delete rooms[loc].data.items[target];
					outP += ' was deleted!\n';
				} else {
					outP += ' was left alone.\n';
				}				
				found++;
			}
			
			if (!found) {
				outP += 'I see no ' + target + ' here.';
			}
			ut.chSend(message, outP);
		}
	},	
//-----------------------------------------------------------------------------
	profile: {
		do: function(message, args, client) {
			let cmd = 'profile';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];	
			let outP = '';
			
			
			
			// TODO: REFACTOR! (your own vs. others)
			if (!args) {
				//args = args || player.charName;
				outP += 'No profile specified.';
				if (player.description) {
					outP += ' Here is your own profile:';
					outP += `\n** ${player.charName}`;
					if (player.title) {
						outP += ` _${titleList[player.title]}_\n`;
					}
					outP += '**\n';
					outP += player.description;
					let serverRepped = player.getServerRepped(client);
					if (serverRepped) {
						outP += `\n${player.charName} is representing **${serverRepped}**.`;
					}
					
					// badges
					outP += `\n${player.charName}'s profile badges: `;
					let badges = player.getBadges();
					if (Array.isArray(badges)) {
						badges.forEach(function(badge) {
							outP += badge; // mushroom mushroom
						});
					}
				}
			} else {
				let match = findChar(args);
				if (match) {
					if (players[match].description) {
						outP += '\n**' + args;
						outP += ` _${titleList[players[match].title]}_**\n`;
						outP += players[match].description;
						let serverRepped = players[match].getServerRepped(client);
						if (serverRepped) {
							outP += `\n${players[match].charName} is representing **${serverRepped}**.`;
						}

						// badges
						outP += `\n${players[match].charName}'s profile badges: `;
						let badges = players[match].getBadges();
						if (Array.isArray(badges)) {
							badges.forEach(function(badge) {
								outP += badge; // mushroom mushroom
							});
						}
						
					} else {
						outP += `${args} has not yet set a profile. Why not suggest it to them?`;
					}
				} else {
					outP += 'Could not find a character with that name, sorry!';
				}
			}
			ut.chSend(message, outP);
		}
	},
	setprofile: {
		do: function(message, args) {
			let cmd = 'setprofile';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';
			
			if (!args) {
				outP += `Your current character description:\n` +
				  `**${players[who].charName}**: ${players[who].description}`;
			} else {
				players[who].pendingDescription = args;
				outP += `${players[who].charName}, your new character description is now pending approval.`;
			}
			
			ut.chSend(message, outP);
		}
	},
	title: {
		do: function(message, args) {
			let cmd = 'title';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];		
			let outP = '';
			let titleStr = '';
			if (args) {
				// did title #
				let pick = parseInt(args, 10);
				
				if (pick > player.stats.unlockedTitles.length || pick < 0) {
					outP += `That's not an option, ${player.charName}. See your choices with \`title\`.`;
				} else {
					let newName;
					if (!pick) {
						newName = `known only as ${player.charName}`;
						player.title = 0;
					} else {
						player.title = player.stats.unlockedTitles[pick - 1];
						newName = player.charName + ' ' + titleList[player.title];
					}
					outP += `You are now ${newName}!`;
				}
			} else {
				// did title with no number, so output current title and choices
				if (!player.title) {
					outP += `You have no title set, ${player.charName}.\n`;
				} else {
					titleStr += titleList[player.title];
					outP += `Your current title is: "${titleStr}".\n`;
				}			
				outP += 'Here are your unlocked titles. You can set a new title with the command `title <#>`.';
				outP += ' For example, `title 2`. You can clear your title and have none with `title 0`.\n';
				let titles = player.stats.unlockedTitles;
				for (let i = 0; i < titles.length; i++) {
					i = parseInt(i, 10);
					outP += `\`${i + 1}\` ... ${titleList[titles[i]]}\n`;
				}
			}
			
			ut.chSend(message, outP);
		}
	},
	approve: {
		do: function(message, args) {
			let cmd = 'approve';
			let minAccess = 'player';
			let modFlags = cons.MOD_FLAGS.isMod + cons.MOD_FLAGS.canApproveProfiles;
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess, "modFlags": modFlags});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player;
			let outP = '';
			let match;
			if (!args) {
				outP += 'Specify an exact character name.';
			} else {
				
				let match = findChar(args);
				if (!match) {
					outP += `No character named ${args} was found!`;
				} else {
					player = players[match];
					if (!player.pendingDescription) {
						outP += `${player.charName} did not have a .pendingDescription!`;
					} else {
						outP += `Changing ${player.charName}'s description from:\n ${player.description}`;
						outP += `to:\n ${player.pendingDescription}`;
						player.description = player.pendingDescription;
						delete player.pendingDescription;
						outP += '\n Also unlocking "the Explorer" title for them if necessary.';
						player.unlockTitle(2);
					}
				}
			}
			ut.chSend(message, outP);
		}
	},
	build: {
		do: function(message, parms) {
			buildDungeon();
			buildPlayers();
			ut.chSend(message, `SpongeMUD ${cons.VERSION_STRING}: Dungeon may have been built.`);
		}
	},
	players: {
		do: function(message) {
			let outP = '';
			let asleep = 0;
			let awake = 0;
			let servers = {};
			
			for (let pl in players) {
				if (servers.hasOwnProperty(players[pl].server)) {
					servers[players[pl].server]++;
				} else {
					servers[players[pl].server] = 1;
				}
				
				if (players[pl].posture === 'asleep') {
					asleep++;
				} else {
					awake++;
				}
			}
					
			outP += ` I have ${awake} awake and ${asleep} sleeping players.\n`;
			
			for (let serv in servers) {
				outP += `Server ID ${serv}: ${servers[serv]} player(s)\n`;
			}
			
			ut.chSend(message, outP);
		}
	},
	getfile: {
		do: function(message, args, client, Discord) {
			// args should be the name of one of the constants in constants.js
			let who = message.author.id;
			let fail = cantDo(who, 'getfile', {minAccess: "developer"});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let outP = '';
			
			if (cons.MUD.hasOwnProperty(args)) {
				let fname = cons.MUD[args];
				let player = players[who];
				player.sendFile(fname, client, Discord);
			} else {
				outP += 'That is not a legit file that you can have, sorry.';
			}
			ut.chSend(message, outP);
		}	
	},
	icanhaz: {
		do: function(message, args, client, Discord) {
			// args should be the name of one of the constants in constants.js
			let who = message.author.id;
			let fail = cantDo(who, 'icanhaz', {minAccess: "wizard"});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let outP = '';
			let player = players[who];
			let zoneRequest = args;
			let theirData = {};
			
			if (!zoneList.hasOwnProperty(zoneRequest)) {
				outP += `${zoneRequest} isn't a zone anyone has told me about, ${player.charName}.`;
			} else {
				if (zoneList[zoneRequest].authors.indexOf(player.id) === -1) {
					outP += `${player.charName} is not an author of ${zoneRequest}.`;
				} else {
					let roomCount = 0;
					for (let room in rooms) {
						if (rooms[room].data.zone === zoneRequest) {
							roomCount++;
							theirData[room] = rooms[room];
						}
					}
					
					if (roomCount) {
						let now = new Date().valueOf();
						let fn = zoneRequest + now + '.json';
						player.sendJSON(theirData, fn, client, Discord);
						outP += `Zone **${zoneRequest}** has ${roomCount} rooms. File sent.`;
						
					} else {
						outP += `Your zone ${zoneRequest} has no rooms associated with it yet.`;
					}
				}
			}
		ut.chSend(message, outP);
		}
	},
	mute: {
		do: function(message, args) {
			let cmd = 'mute';
			let minAccess = 'player';
			let modFlags = cons.MOD_FLAGS.isMod + cons.MOD_FLAGS.canMute;
			let who = message.author.id;
			let fail = cantDo(who, cmd, { "minAccess": minAccess, "modFlags": modFlags});

			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let outP = '';
			if (!args) {
				outP += 'Specify an exact character name.';
			} else {
				let target;
				let match = findChar(args);
				if (!match) {
					outP += `No character named ${args} was found!`;
				} else {
					target = players[match];
					target.mute();
					outP += `${args} is now unable to use \`say\` \`yell\` or \`me\` commands` +
					  ' until a moderator `unmute`s them.';
				}
			}
			ut.chSend(message, outP);
		}
	},
	unmute: {
		do: function(message, args) {
			let cmd = 'unmute';
			let minAccess = 'player';
			let modFlags = cons.MOD_FLAGS.isMod + cons.MOD_FLAGS.canMute;
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess, "modFlags": modFlags});

			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let outP = '';
			if (!args) {
				outP += 'Specify an exact character name.';
			} else {
				let target;
				let match = findChar(args);
				if (!match) {
					outP += `No character named ${args} was found!`;
				} else {
					target = players[match];
					target.unmute();
					outP += `${args} is now able to use \`say\` \`yell\` or \`me\` commands again.`;
				}
			}
			ut.chSend(message, outP);
		}
	},
	setaccess: {
		do: function(message, args) {
			let who = message.author.id;
			let fail = cantDo(who, 'setaccess');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			args = args.split(' ');
			let outP = '';
			let target = args[0];
			let level = parseInt(args[1], 10);
			
			if (!players.hasOwnProperty(target)) {
					outP += `setaccess: No players.${target} was found!`;
			} else {
				if (!players[target].stats.accessLevel) {
					dBug(`INFO: players.${target} did not have a .stats.accessLevel until now.`);
				}
				outP += `Changing ${players[target].charName}'s access from:\n ${players[target].stats.accessLevel}`;
				outP += ` to: ${level}`;
				players[target].stats.accessLevel = level;
			}
			ut.chSend(message, outP);
		}
	},
	recall: {
		do: function(message, args, client) {
			let cmd = 'recall';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;
			let outP = '';
			let recallPoint = player.recallPoint;
			
			if (!recallPoint) {
				outP = "You don't have a recall point set! Use `setrecall` to set one.";
				player.sendMsg(outP, client);
			} else {
				player.timers.recall = cons.RECALL_RESET_TICKS;
				outP += 'You use your recall power! Your surroundings fade away and you find yourself elsewhere!';
				player.sendMsg(outP, client);
				
				player.unregisterForRoomEvents(); // first, unregister for events in this room
				let newLoc = recallPoint; // set our target room

				eMaster('roomExit', pLoc, who, newLoc, client); // fire off roomExit, notify everyone but us
				let oldLoc = '' + pLoc; // hang onto old location
				player.location = newLoc; // actually move us
				
				// remove from old room chars[], add to new
				let ind = rooms[oldLoc].data.chars.indexOf(who);
				rooms[oldLoc].data.chars.splice(ind, 1);
				if (!rooms[newLoc].data.chars) {
					dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
					rooms[newLoc].data.chars = [];
				}
				rooms[newLoc].data.chars.push(who);
				
				player.registerForRoomEvents();// now register for room events in new room
				eMaster('roomEnter', newLoc, who, oldLoc, client); // fire off roomEnter, notify everyone + us
				ut.saveObj(players, cons.MUD.playerFile); // save to disk				
			}
		}
	},
	setrecall: {
		do: function(message, args, client) {
			let target = args;
			let cmd = 'setrecall';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = "You have set your recall point to " + rooms[player.location].data.title;
			player.recallPoint = player.location;
			ut.saveObj(players, cons.MUD.playerFile); // save to disk
			player.sendMsg(outP, client);
		}
	},
	wiztele: {
		do: function(message, args, client) {
			let target = args;
			let cmd = 'tele';
			let who = message.author.id;
			let minAccess = 'wizard';
			let fail = cantDo(who, cmd, {"location": target, "minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;

			ut.saveObj(players, cons.MUD.playerFile);
			ut.chSend(message, ' You teleport!');

			player.unregisterForRoomEvents(); // first, unregister for events in this room
			let newLoc = target; // set our target room

			eMaster('roomExit', pLoc, who, newLoc, client); // fire off roomExit, notify everyone but us
			let oldLoc = '' + pLoc; // hang onto old location
			player.location = newLoc; // actually move us

			// remove from old room chars[], add to new
			let ind = rooms[oldLoc].data.chars.indexOf(who);
			rooms[oldLoc].data.chars.splice(ind, 1);
			if (!rooms[newLoc].data.chars) {
				dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
				rooms[newLoc].data.chars = [];
			}
			rooms[newLoc].data.chars.push(who);

			player.registerForRoomEvents();// now register for room events in new room
			eMaster('roomEnter', newLoc, who, oldLoc, client); // fire off roomEnter, notify everyone + us
			ut.saveObj(players, cons.MUD.playerFile); // save to disk
		}
	},
	sit: {
		do: function(message, parms, client) {	
			let cmd = 'sit';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;

			if (player.posture === 'sitting') {
				player.posture = 'standing';
				eMaster('roomGeneric', pLoc, who, {
					normal: ['You stand up.','stands up.']
				}, client);

			} else {
				player.posture = 'sitting';
				eMaster('roomGeneric', pLoc, who, {
					normal: ['You sit down and get comfortable.','sits down and gets comfortable.']
				}, client);
			}
		}
	},
	stand: {
		do: function(message, parms, client) {
			let cmd = 'sit';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;

			if (player.posture === 'standing') {
				ut.chSend(message, 'You are already standing up.');
			} else {
				player.posture = 'standing';
				eMaster('roomGeneric', pLoc, who, {
					normal: ['You stand up.','stands up.']
				}, client);
			}
		}
	},
	me: {
		do: function(message, args, client) {
			let cmd = 'me';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let whatSaid = args;
			if (!whatSaid) {
				ut.chSend(message, 'It\'s always about you, isn\'t it?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only use actions up to 511 characters.');
				return;
			}
	
			let pLoc = players[who].location;
			// Fire off some events -- notify eMaster
			eMaster('roomGeneric', pLoc, who, {
				normal: [
					`_${players[who].charName} ${whatSaid}_`,
					`_${whatSaid}_`
				]
			}, client);
		}
	},
	who: {
		do: function(message, parms) {
			// accepts either an id or a charName
			let player;
			let pFind = function() {
				for (let pl in players) {
					if (players[pl].charName === parms) {
						return players[pl];
					}
				}
			};
			// dangerous:
			if (players[parms]) {
				player = players[parms];
			} else {					
				player = function() {
					for (let pl in players) {
						if (players[pl].charName === parms) {
							return players[pl];
						}
					}
				}();
			}
			
			if (player) {
				dBug(player);
			} else {
				ut.chSend(message, 'Sorry, I couldn\'t find ' + parms);
			}
		}
	},
	nuke: {
		do: function(message, parms) {
			for (let roomId in rooms) {
				rooms[roomId].data.contents = {};
				rooms[roomId].data.items = {};
			}
			ut.chSend(message, 'All room contents nuked. :bomb: :open_mouth:');
			for (let pId in players) {
				players[pId].inventory = {};
			}
			ut.chSend(message, 'All player inventories nuked. :bomb: :open_mouth:');
		}
	},
	pcalc: {
		do: function(message, args) {
			let charLev = parseInt(args, 10) || 0;
			let pStats;
			let outP = '';
			
			let powerStats = function(cLev) {
				let lev = Math.pow(2, cLev / 10);
				let pts = lev * 50;
				return {lev: lev, pts: pts};
			};
			
			if (args === 'table') {
				outP += '```';
				for (let i = 0; i < 20; i++) {
					pStats = powerStats(i);
					outP += `Lvl ${i}:  x${pStats.lev.toFixed(4)}   ${pStats.pts.toFixed()} PP/day\n`;
				}
				outP += '```';
			} else {			
				pStats = powerStats(charLev);	
				outP += `A level ${charLev} character or mob would have:\n`;
				outP += `a power level mulitpler of x${pStats.lev}\n`;
				outP += `and receive ${pStats.pts} power points per MUD day.`;
			}
			ut.chSend(message, outP);
		}
	},
	survey: {
		do: function(message, args) {
			let cmd = 'survey';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let rarityStrings = {
				"c": "common",
				"u": "uncommon",
				"r": "rare"
			};
			
			let player = players[who];
			let pLoc = player.location;
			let resData = rooms[pLoc].data.resources;
			let outP = '';
			let dStr;
			
			outP += `You begin surveying for resources here (${rooms[pLoc].data.title})...`;
			outP += '\nYou found:';
			for (let resType in resData) {
				outP += `\n**${resType}** that may yield one of: `;
				for (let res in resData[resType]) {
					outP += `\n   _${res}_, which gives:  `;
					
					for (let material in resData[resType][res].table) {
						for (let rarity in resData[resType][res].table[material]) {
							dStr = resData[resType][res].table[material][rarity];
							outP += ut.diceToRangeStr(dStr);
							outP += ' ' + rarityStrings[rarity] + ' ' + material + '   ';
						}	
					}
				}
			}
		ut.chSend(message, outP);
		}
	},
	gather: {
		/* 
			Find out:
			- What their allocations/claims are, if any, in this room
			- If they've "ripened" yet, and if so...
			- Call resourceGather() n times for each resource as needed
		*/
		do: function(message, args) {
			let cmd = 'gather';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			let player = players[who];
			let outP = '';

			outP += player.resGather();
			ut.chSend(message, outP);
		}
	},
	claim: {
		do: function(message, args) {
				
			args = args.split(" ");
			let target = args[0];
			let amt = parseInt(args[1], 10);
			let cmd = 'claim';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;
			let outP = '';
			
			if (!resources[who]) {
				resources[who] = {};
			}
			
			let claims = resources[who].claims || {};
			let gPoints = player.stats.gatherPoints || 0;
			let updateData = function() {
				
				if (!claims[pLoc]) {
					claims[pLoc] = {};
				}
				
				claims[pLoc][target] = amt; // allocate
				resources[who].claims = claims;
				player.stats.gatherPoints = gPoints; // update Player
				ut.saveObj(resources, cons.MUD.resourceFile); 
				ut.saveObj(players, cons.MUD.playerFile);
			};
			
			if (!target) {
				if (!claims) {
					outP = `It looks like you haven't claimed any resources, ${player.charName}.`;
				} else {
					outP += `${player.charName}'s resource claims:`;
					let roomName;
					for (let room in claims) {
						roomName = rooms[room].data.title;
						outP += `\n**${roomName}:**\n`;
						
						for (let rType in claims[room]) {
							outP += `${rType} x${claims[room][rType]}\n`;
						}
					}
				}
			} else {
				if (!rooms[pLoc].data.resources) {
					outP += `There don't seem to be any resources here for you to claim.`;
				} else {
					if (!rooms[pLoc].data.resources[target]) {
						outP += `That's not a resource type that's here. Try doing \`survey\`.`;
					} else {
						if (!claims[pLoc]) {
							if (gPoints <= 0) {
								outP += `You are out of gathering points, so cannot claim the ${target} here.`;
							} else {
								if (!amt || amt < 0)  {
									outP += "You need to supply a positive number for how many gathering points you want to invest.";
								} else if (gPoints < amt) {
									outP += `You only have ${gPoints} available, so you can't allocate ${amt} to ${target}.`;
								} else {
									gPoints -= amt;
									updateData();
									outP += `You've now allocated ${amt} points to ${target}.\n`;
									outP += `You have ${gPoints} gathering points left that you can allocate.`;
								}
							}
						} else {
							// have claims in room
							let ptsAllocated = claims[pLoc][target] || 0;
							let diff = Math.abs(ptsAllocated - amt);
			
							if (!amt || amt < 0) {
								outP += `You have allocated ${ptsAllocated} points to ${target}.\n`;
							} else {
								if (amt < ptsAllocated) {								
									gPoints += diff;
									updateData();
									outP += `Since you've now allocated ${diff} fewer points to ${target},\n`;
									outP += `you now have ${gPoints} free gathering points to allocate.`;
								} else if (amt === ptsAllocated) {
									outP += `You already had exactly ${amt} points allocated to ${target},\n`;
									outP += `so no changes were made. You have ${gPoints} free gathering points to allocate.`;
								} else {
									if (diff > gPoints) {
										outP += `You can't allocate ${amt} points to ${target} because you only have `;
										outP += `${gPoints} gathering points to allocate. You would need ${diff - gPoints} more.`;
									} else if (diff === gPoints) {
										gPoints = 0;
										updateData();
										outP += `You have now allocated ${amt} points to ${target} here,\n`;
										outP += `and have allocated all of your ${diff} remaining gather points.`;
									} else {
										gPoints -= diff;
										updateData();
										outP += `You've now allocated ${amt} points to ${target}.\n`;
										outP += `You have ${gPoints} gathering points left that you can allocate.`;
									}
								}
							}
						}
					}
				}
			}
			ut.chSend(message, outP);
		}
	},
	craft: {
		do: function(message, args) {
			let cmd = 'craft';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let ouP = '';
			let player = players[who];
		}
	},
	setmacro: {
		do: function(message, args) {
			let cmd = 'setmacro';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;
			let outP = '';
			
			args = args.split(' ');
			let macroNum = parseInt(args[0], 10);
			args.shift();
			args = args.join(' ');
			
			if (isNaN(macroNum) || macroNum < 0 || macroNum > 9) {				
				outP += 'Use `setmacro <#> <command>`. Valid macro numbers are 0 through 9.';
				
				if (!player.stats.macros) {
					outP += 'You have not yet set any personal macros.';
				} else {
					outP += '\n**YOUR CURRENT MACRO SETUP**';
					for (let macNum = 0; macNum < player.stats.macros.length; macNum++) {
						if (player.stats.macros[macNum]) {
							outP += `\n\`${macNum}:\` \`${player.stats.macros[macNum]}\``;
						}
					}
				}
			} else {				
				let macroCmd = args;
				if (!player.stats.macros) {
					player.stats.macros = [];
				}
				player.stats.macros[macroNum] = macroCmd;
				outP = `Okay! Use \`${cons.PLAYER_MACRO_LETTER} ${macroNum}\` to invoke anytime.`;
				ut.saveObj(players, cons.MUD.playerFile);
			}
			ut.chSend(message, outP);
		}
	},
	menu: {
		do: function(message, args) {
			let cmd = 'macro';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let room = rooms[player.location];
			let outP = '';
			
			if (!Array.isArray(room.data.menus)) {
				outP += 'There is no menu interface here. Look for "menu available" in a room.';
			} else {
				outP += '**MENU INTERFACE**';
				
				for (let i = 0; i < room.data.menus.length; i++) {
					if (room.data.menus[i]) {
						outP += `\n\`${i}:\` \`${room.data.menus[i]}\``;
					}
				}
			}
			ut.chSend(message, outP);
			
		}
	},
	macro: {
		do: function(message, args, isMenu) {
			let cmd = 'macro';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let room = rooms[player.location];
			let outP = '';
			let macroLocation = (isMenu ? room.data.menus : player.stats.macros);
			args = parseInt(args, 10);
			if (Array.isArray(macroLocation)) {
				if (typeof macroLocation[args] !== 'undefined') {
					return macroLocation[args];
				} else {
					outP += 'That is not a valid ';
					outP += (isMenu) ? 'menu choice.' : 'macro.';
					ut.chSend(message, outP);
					return;
				}
			} else {
				outP = 'That did nothing. _(You are not in a menu interface.)_';
				ut.chSend(message, outP);
				return;
			}
		}
	},
	game: {
		do: function(message, args) {
			let cmd = 'game';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			let game = args.split(' ')[0];
			let gameCmdStr = args.replace(game, '');
			gameCmdStr = gameCmdStr.slice(1); // snip leading space

			let validGame = false;
			for (let minigame in minigames) {
				if (minigames[minigame].trigger === game) {
					validGame = minigame;
				}
			}
			if (validGame) {
				let gameCmd = gameCmdStr.split(' ')[0];

				if (minigames[validGame].commands.hasOwnProperty(gameCmd)) {
					let cmdArgs = gameCmdStr.replace(gameCmd, '');
					cmdArgs = cmdArgs.slice(1);
					
					let validRooms = minigames[validGame].commands[gameCmd].rooms;

					if (Array.isArray(validRooms)) {
						if (!validRooms.includes(player.location)) {
							ut.chSend(message, `You aren't standing in a place where you can do that minigame command!`);
							return;
						}
					}

					let readyStatus = minigames[validGame].commands[gameCmd].timerCheck(player, world, gameCmd);

					if (readyStatus.isReady) {
						dBug(`Running minigames.${validGame} command: ${gameCmd}(${cmdArgs})!`);
						let result;
						result = minigames[validGame].commands[gameCmd].do(player, world, cmdArgs);
						outP = result.message;
						if (result.success) {
							//outP += '\n(MINIGAME COMMAND COMPLETE)';
						} else {
							//outP += '\n(MINIGAME COMMAND FAIL)';
						}
					} else {
						outP += `\`${gameCmd}\` is not available for you yet.\n`;
						outP += readyStatus.message;
						//outP += '\n(MINIGAME COMMAND FAIL)';
					}

				} else {
					if (gameCmd === '') {
						outP += minigames[validGame].helpText;
					} else {	
						outP = `${gameCmd} is not a valid command for minigame ${validGame}, sorry!`;
					}
				} 
			} else {
				outP = `${game} is not a valid minigame. See \`help game\`.`;
			}
			ut.chSend(message, outP);
		}
	}
};