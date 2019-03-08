var ut = require('../lib/utils.js');
const cons = require('../lib/constants.js');

cons.MONTHS = ['Archuary', 'Fooshuary', 'Kepler', 'Wael', 'Skarl', 'Nicholaseptember', 'Squishuary'];
cons.DAYS_IN_YEAR = 360; // default 360
cons.TICKS_PER_HOUR = 10; // default 10
cons.TICKS_IN_DAY = cons.TICKS_PER_HOUR * 24; // default 240
cons.DEBUG_LEVEL = 2; // 0 = no messages, 1 = level 0 (info), 2 = level 1 (warning)...
cons.DEBUG_LEVEL_STRINGS = ["INFO:", " !!! WARNING:", "   ***** CRITICAL WARNING! ***** :"];

const dBug = function(str, level) {
	
	if (typeof level === "undefined") { level = 0;}
	
	if (typeof str === "object") {
		str = JSON.stringify(str);
	}
	
	if (level < cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};

const mudTime = function(inp) {
	let daysPerMonth = Math.floor(cons.DAYS_IN_YEAR / cons.MONTHS.length);
	//let extraDays = cons.DAYS_IN_YEAR - (cons.MONTHS.length * daysPerMonth);

	let year = 0;
	let month = 0;
	let day = 0;
	let left = 0;
	let hour = 0;

	year = Math.floor(inp / (cons.TICKS_IN_DAY * cons.DAYS_IN_YEAR));
	left = inp - (year * cons.TICKS_IN_DAY * cons.DAYS_IN_YEAR);
	month = Math.floor(left / (cons.TICKS_IN_DAY  * daysPerMonth));
	left = left - (month * cons.TICKS_IN_DAY  * daysPerMonth);
	day = Math.floor(left / cons.TICKS_IN_DAY);
	left = left - (cons.TICKS_IN_DAY * day);
	hour = Math.floor(left / (cons.TICKS_PER_HOUR));
	left = left - (cons.TICKS_PER_HOUR * hour);
	
	return ({
		year: year,
		month: month,
		day: day,
		hour: hour,
		remain: left
	});
};

const buildPicklist = function(itemList, matchStr) {
	// theItems = bunch of objects of type Item, Mob, Exit, Character, etc., I guess
	// matchStr = string to match against
	let pickList = {};
	var where;
	
	// handle these 2, then exits and characters
	// later, might be able to send up containers
	let wheres = ["inv", "floor"];
	wheres.forEach(function(where) {
		pickList[where] = [];
		for (var itemId in itemList[where]) {

			let theItem = items[itemId]; // get the actual Item!
			let shortNames = theItem.data.shortNames || [];
			
			var matchFound = false;
			var matchNum = 0;
			var match = -1;
			
			// reordered logic in order to short-circuit safely
			while (!matchFound && shortNames && matchNum < shortNames.length) {
				if (shortNames[matchNum].startsWith(matchStr)) {		
					matchFound = true;
					match = pickList[where].findIndex(function(el) {
						return (el.type === itemList[where][itemId]);
					});
					
					if (match === -1) {
						// no match in pickList so far...
						pickList[where].push({
							type: itemList[where][itemId],
							ids: [itemId]
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
		for (var exit in itemList[where]) {
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
	var thePlayer;
	pickList[where] = [];
	if (itemList[where]) {
		for (var chNum = 0; chNum < itemList[where].length; chNum++) {
			var pId = itemList[where][chNum];
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
	
	// now to "flatten" choices...
	let choices = pickList;
	var pickNum = 0;
	var choiceList = [];
	for (where in choices) {
		for (var num = 0; num < choices[where].length; num++) {
			choiceList.push({
				"what": choices[where][num].type,
				"where": where,
				"ids": choices[where][num].ids
			});
			pickNum++;
		}
	}
	//dBug(choiceList);
	return choiceList;
};

var world = require('../' + cons.DATA_DIR + cons.MUD.worldFile);
var players = require('../' + cons.DATA_DIR + cons.MUD.playerFile);
var rooms = require('../' + cons.DATA_DIR + cons.MUD.roomFile);
var items = {};
var itemTypes = require('../' + cons.DATA_DIR + cons.MUD.itemFile);
var zoneList = require('../' + cons.DATA_DIR + cons.MUD.zoneFile);

var dungeonBuilt = false;
var noWiz = false;
const timers = {};

var titleList = ["", "the Noob", "the Explorer", "the Adventurer", "the Experienced", "the Creative", "the Wizardly", "the Brave", "the Cowardly", "the Quester", "the Immortal"];
var dreamStrings = {
	'inv': 'You dream about the things you own...\n',
	'go': 'You toss and turn in your sleep.\n',
	'get': 'You dream of acquiring new things...\n',
	'drop': 'Your hand twitches in your sleep.\n',
	'say': 'You mumble incomprehensibly in your sleep.\n',
	'attack': 'You dream of glorious battle!',
	'edroom': 'You dream of having godlike powers of creation!',
	'profile': 'You dream about morphing into other forms!',
	'tele': 'You float high above the world in your dreams...'
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
const postureStr = {
	'standing': 'is standing',
	'sitting': 'is sitting',
	'resting': 'is resting',
	'asleep': 'is sleeping'
};
const isPlayer = function(who) {
	return typeof players[who] !== 'undefined';
};
const cantDo = function(who, action, data) {
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
			break;
		case 'attack':
			if (player.posture === 'sitting') {
				return "You can't attack from a sitting position!";
			}
			break;
		case 'yell': 
			// if they've yelled in the past 1 tick, nowai
			if (player.timers.yell > 0) {
				return "Your throat is sore from yelling, maybe wait a tick?"
			}
			break;
		case 'tele':
			if (!player.isAtLeast('wizard')) {
				return "You're not wizardly enough to do that!";
			} else {
				let target = data.location;
				if (typeof rooms[target] === 'undefined') {
					return `You try to teleport to ${target} but go nowhere. It's not a valid target.`;
				}
				
				if (!player.isWearing('The Omniring')) {
					// if they're wearing The Omniring, skip these checks
					if (!player.isZoneAuthor()) {
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
		default:
			// do nothing, continue on to return false
	}
	
	return false;
};
//-----------------------------------------------------------------------------
var defaultDecay = function(client) {
	
	this.data.decay.endurance -= this.data.decay.amount;
	
	if (this.data.decay.endurance <= 0) {
		
		// Fire off some events -- notify eMaster
		eMaster('roomGeneric', this.data.location, {"sayFrom": this.data.type}, 'crumbles away!', client);
		
		// remove from items global
		// remove from wherever it is (see .location)
		// figure out where it belongs (room or player) and update that object, too
		var loc = this.data.location;
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
var defaultFreshen = function() {
	this.data.decay.endurance = this.data.decay.maxEndurance;
};
var defaultAge = function(item) {
	
};

var defaultLook = function(item) {
	var outP = '';
	/*
	if (!item.data.hidden) {
		
	}
	*/
	outP += item.description;
	return outP;
};
var defaultFoodUse = function(who, loc, client) {
	player = players[who];
	phrase = `consumes ${this.data.type}`;
	
	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase, client);	
	}
	delete players[who].inventory[this.id];
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
};
var defaultGet = function(who, client) {
	this.unregisterForWorldTicks();
	this.freshen(); // reset endurance
	players[who].inventory[this.id] = this.data.type;
	delete rooms[players[who].location].data.items[this.id];
	this.data.location = who;
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	eMaster('roomGet', players[who].location, who, this.id, client);
};
var defaultDrop = function(who, where, client) {
	rooms[where].data.items[this.id] = this.data.type;
	this.data.location = where;
	delete players[who].inventory[this.id];
	
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	
	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomDrop', where, who, this.id, client);
	}
	
	// register for worldTick events
	this.registerForWorldTicks();
};
var defaultCrush = function(who, where, client) {
	delete players[who].inventory[this.id];
	
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	
	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomCrush', where, who, this.id, client);
	}
};
var defaultPlayerAccessCheck = function(permLevel) {
	return (this.stats.accessLevel >= cons.PERM_LEVELS[permLevel]);
};
var defaultPlayerDescribeAs = function(viewAs) {
	let description = '';
	
	description += '\n**' + this.charName;
	
	if (this.title) {
		description += ' _' + titleList[this.title] + '_';
		// unless viewAs player has turned off "view other players titles"?
	}

	// if they're in their zone, glow them
	if (this.isZoneAuthor()) {
		description += ' (glowing)';	
	}

	description += '** ' + (postureStr[this.posture] || 'is') + ' here.';		 
	return description;
};
var defaultPlayerLongDescribeAs = function(permLevel) {
	let description = '';
	
	description += '\n**' + this.charName;
	
	if (this.title) {
		description += ' _' + titleList[this.title] + '_';
	}

	// if they're in their zone, glow them
	if (this.isZoneAuthor()) {
		description += ' (glowing)';	
	}

	description += '** ' + (postureStr[this.posture] || 'is') + ' here.\n';
	description += this.description;
	description += `\n\n**AGE**: ${this.age} ticks    **PRONOUNS**: ${this.pronouns}`;
	description += `\n**CLASS**: ${this.stats.class}`;
	description += `\n**STATUS**: ${this.stats.status}`;
	description += `\n**WIZARDLY**: ${this.isAtLeast('wizard')}`;
	description += `\n ${this.charName} has been idle for at least ${this.idle.ticks} ticks.`;
	
	return description;	
};

var defaultAttack = function(target) {
	let hitChance = 0.4;
	let maxDmg = 3;
	let damage; 
	let outStr = '';
	let result; 
	let targetId;
	
	// todo: allow no target -- use last target by default

	if (!target) {
		return {fail: true, outStr: 'You need to specify a target to attack!'};
	}
	
	targetId = findChar(target, this.location);
	if (!targetId) {
		return {fail: true, outStr: 'That\'s not a target I can see!'};
	}
	
	if (players[targetId].posture === 'asleep') {
		return {fail: true, outStr: target + ' is asleep and may not be attacked.'};
	}
	
	var now = new Date().valueOf();
	if (now < this.timers.nextAttack) {
		
		if (this.stats.attackSpamWarns > 2) {
			this.stats.attackSpamWarns = 2; // reset them... partially
			this.timers.nextAttack += this.stats.attackDelay * 1.5;
			return {fail: true, outStr: ' ** SLOW DOWN, YOU THREW YOUR RHYTHM OFF! ** ' +
			  ' You\'re off balance and will now have to wait an extra ' +
			  parseFloat(this.stats.attackDelay * 1.5 / 1000, 2) + ' sec. ' +
			' before attacking again!'};
		}
		this.stats.attackSpamWarns++;
		return {fail: true, outStr: ' ** SLOW DOWN! ** You\'re attacking too fast! You\'ll' +
		' throw your rhythm off and wind up off-balance!'};
	}
	
	this.timers.nextAttack = now + this.stats.attackDelay;
	this.stats.attackSpamWarns--;
	if (this.stats.attackSpamWarns < 0) {this.stats.attackSpamWarns = 0;}
	
	if (Math.random() < hitChance) {
		damage = Math.floor(Math.random() * maxDmg) + 1;
		outStr += this.charName + ' hits ' + target + ' for ' + damage + ' damage !';
		players[targetId].stats.hp += -damage;
	} else {
		outStr += this.charName + ' swings at ' + target + ' and misses!';
	}
	
	if (!this.stats.timesAttacked) {
		this.stats.timesAttacked = 1;
	} else {
		this.stats.timesAttacked++;
	}
	ut.saveObj(players, cons.MUD.playerFile); // save to disk
	return {fail: false, outStr};
};
var defaultRoomDescribe = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	// currently refactoring to put that stuff into .describeAs(viewAs) methods!
	//		I think I'm pretty much there now ^
	
	var id = this.data.id;

	var outStr = '-=-=-=-\n';
	outStr += '**' + this.data.title + '**';

	if (viewAs.isAtLeast('wizard')) {
		// wizards see IDs also
		outStr += ' "`' + id + '`"\n';
	}
	outStr += '\n' + this.data.description;
	
	// Build exits text
	if (this.data.hasOwnProperty('exits')) {
		outStr += '\n-=-=-=-\nObvious exits: ';
		for (var exName in this.data.exits) {
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
		dBug('SpongeMUD: WARNING! Room `${id}` missing exits!');
	}
	
	// Build items text
	if (this.data.hasOwnProperty('items')) {	
		let count = 0;
		let itemStr = '';
		let mobStr = '\n';
		for (var itemId in this.data.items) {
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
		
		outStr += mobStr;
	}
	
	// See who else is here. Later, let's store this in Rooms also.
	// This seems terribly expensive.
	var numHere = 0;
	var playersHereStr = '';
	for (var player in players) {
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
var defaultRoomShortDesc = function(id, player) {
	// builds a standard "short room description string" and returns it
	var outStr = '';
	outStr += `**${this.data.title}** "\`${id}\`"\n`;
	
	// Build exits text
	if (this.data.hasOwnProperty('exits')) {
		outStr += 'Exits: ';
		for (var exName in this.data.exits) {			
			if (this.data.exits[exName].hidden) {
				// hidden exits remain hidden for now!
				/*
				if (!noWiz) {
					outStr += '`' + exName + '`  ';	
				}
				*/
			} else {
				outStr += '`' + exName + '`  ';
			}
		}
	} else {
		dBug(`SpongeMUD: WARNING! Room ${id} missing exits!`);
	}
	
	// Build items text
	// Currently identical to regular room desc here (NO, needs copied again or something)
	if (this.data.hasOwnProperty('items')) {	
		var count = 0;
		var itemStr = '';
		var mobStr = '\n';
		for (let itemId in this.data.items) {
			let theItem = items[itemId];
			if (!theItem.data.hidden) {
				itemStr += theItem.data.type;
				itemStr += `(${theItem.data.shortName})`;
				if (!noWiz) {
					// show item IDs to wizards, unless we're in "noWiz" mode
					if (player.stats.accessLevel > cons.PERM_LEVELS.wizard) {
						itemStr += `(\`${this.id}\`)`;
					}
				itemStr += '   ';
				count++;
				}
			} else {
				// not hidden
				if (theItem.data.family === 'mobile') {
					mobStr += `${theItem.data.type} is here.`;
					if (!noWiz) {
						// show mob IDs to wizards, unless we're in "noWiz" mode
						if (player.accessLevel > cons.PERM_LEVELS.wizard) {
							mobStr += `(\`${itemId}\`)`;
						}
						mobStr += '   ';
					}
				}
			}
		}
		
		if (count === 0) {
			//outStr += '\n_No obvious items here_'; / short desc
		} else {
			outStr += '\n_Items here_: ' + itemStr;
		}
		
		outStr += mobStr;
	}	
	// See who else is here
	var numHere = 0;
	var playersHereStr = '';
	for (var pl in players) {
		if (players[pl].location === id) {
			playersHereStr += '`' + players[pl].charName + '` ';
			numHere++;
		}
	}
	if (numHere > 0) {
		outStr += '\nWho is here: ' + playersHereStr;
	}
	return outStr;
};
//-----------------------------------------------------------------------------
var eMaster = function(eventName, where, sender, data, client) {
	
	if (eMaster.listens[eventName]) {
		// legit event type, so...
		// (yeah, these are identical... refactor/fix soon)
		if (eventName === 'roomSay') {
			if (!eMaster.listens.roomSay[where]) {
				// no listeners in this room.
				return;
			}
			// hit up everyone listed for this event in this room...
			for (let evId in eMaster.listens.roomSay[where]) {
				eMaster.listens.roomSay[where][evId].callback(sender, data, client);
			}

		} else if (eventName === 'roomLoud') {
			if (!eMaster.listens.roomLoud[where]) {
				// no listeners in this room.
				return;
			}
			// hit up everyone listed for this event in this room...
			for (let evId in eMaster.listens.roomLoud[where]) {
				eMaster.listens.roomLoud[where][evId].callback(sender, data, client);
			}

		}else if (eventName === 'roomDrop') {
			if (!eMaster.listens.roomDrop[where]) {
				// no listeners in this room.
				return;
			}
			for (let evId in eMaster.listens.roomDrop[where]) {
				eMaster.listens.roomDrop[where][evId].callback(sender, data, client);
			}
		} else if (eventName === 'roomCrush') {
			if (!eMaster.listens.roomCrush[where]) {
				// no listeners in this room.
				return;
			}
			for (let evId in eMaster.listens.roomCrush[where]) {
				eMaster.listens.roomCrush[where][evId].callback(sender, data, client);
			}
		} else if (eventName === 'roomGet') {
			if (!eMaster.listens.roomGet[where]) {
				return;
			}
			for (let evId in eMaster.listens.roomGet[where]) {
				eMaster.listens.roomGet[where][evId].callback(sender, data, client);
			}
			
		} else if (eventName === 'roomExit') {
			if (!eMaster.listens.roomExit[where]) {
				return;
			}
			for (let evId in eMaster.listens.roomExit[where]) {
				eMaster.listens.roomExit[where][evId].callback(sender, data, client);
			}
			
		} else if (eventName === 'roomEnter') {
			if (!eMaster.listens.roomEnter[where]) {
				return;
			}
			for (let evId in eMaster.listens.roomEnter[where]) {
				eMaster.listens.roomEnter[where][evId].callback(sender, data, client);
			}			
		} else if (eventName === 'roomGeneric') {
			if (!eMaster.listens.roomGeneric[where]) {
				return;
			}
			for (let evId in eMaster.listens.roomGeneric[where]) {
				eMaster.listens.roomGeneric[where][evId].callback(sender, data, client);
			}			
		} else if (eventName === 'worldTick') {
			
			// send to players:
			if (!eMaster.listens.worldTick.players) {
				dBug('No players listening for worldTick?');
				return;
			}
			for (let evId in eMaster.listens.worldTick.players) {
				//dBug(evId + ' is listening for worldTick.');
				eMaster.listens.worldTick.players[evId].callback(sender, data, client);
			}
			
			// send to all items on floors:
			// skip props/scenery? or just let them exclude themselves by being invalid?
			// nvm, let them register themselves
			if (!eMaster.listens.worldTick.items) {
				dBug('No items{} listener worldTick?');
				return;
			}
			
			for (let evId in eMaster.listens.worldTick.items) {
				//dBug(evId + ' is listening for worldTick.');
				eMaster.listens.worldTick.items[evId].callback(sender, data, client);
			}
			
			// send to ...?
			// TODO
		}
	}
};
eMaster.listens = {
	'roomSay': {},
	'roomLoud': {},
	'roomDrop': {},
	'roomCrush': {},
	'roomGet': {},
	'roomEnter': {},
	'roomExit': {},
	'roomGeneric': {},
	'areaSay': [],
	'worldTick': {}
};
var defaultRoomEventKiller = function(eventName, id) {
	
	let roomId = this.data.id;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		dBug('WARNING: Tried to kill a ' + eventName +
		  ' in ' + roomId + ' that did not have those.');
		return false;
	}
	
	if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
		dBug('WARNING: Tried to kill nonexistent ' + eventName +
		' event with id ' + id + ' in ' + roomId);
		return false;
	}
	delete eMaster.listens[eventName][roomId][id];
};
var defaultRoomEventHandler = function(eventName, callback) {

	let roomId = this.data.id;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		eMaster.listens[eventName][roomId] = {};
	}
	
	eMaster.listens[eventName][roomId][roomId] = {
		"callback": callback
	};
};
var defaultPlayerEventKiller = function(eventName) {

	let id = this.id;

	if (eventName === 'worldTick') {
		if (typeof eMaster.listens[eventName].players === 'undefined') {
			dBug('WARNING: No eMaster.listens.worldTick.players!');
			return false;
		}
		
		if (typeof eMaster.listens[eventName].players[id] === 'undefined') {
			dBug(`WARNING: Tried to kill nonexistent ${eventName} event with id ${id}`);
			return false;
		}
		delete eMaster.listens[eventName].players[id];
	} else {

		let roomId = this.location;
		
		if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
			dBug(`WARNING: Tried to kill a ${eventName} in ${roomId} that did not have those.`);
			return false;
		}
		
		if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
			dBug(`WARNING: Tried to kill nonexistent ${eventName} event with id ${id} in ${roomId}`);
			return false;
		}
		delete eMaster.listens[eventName][roomId][id];
	}
	
};
var defaultPlayerEventHandler = function(eventName, callback) {
	
	let pId = this.id;

	if (eventName === 'worldTick') {
		dBug(pId + ' registered for worldTick');
		if (typeof eMaster.listens[eventName].players === 'undefined') {
			eMaster.listens[eventName].players = {};
		}
		
		eMaster.listens[eventName].players[pId] = {
			"callback": callback
		};
	} else {
		let roomId = this.location;
		
		if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
			eMaster.listens[eventName][roomId] = {};
		}
		
		eMaster.listens[eventName][roomId][pId] = {
			"callback": callback
		};
	}
};
var defaultItemEventHandler = function(eventName, callback) {

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
		dBug(`WARNING: Unknown event ${eventName} triggered on ${id}`);
	}
};
var defaultItemEventKiller = function(eventName) {

	let id = this.id;

	if (eventName === 'worldTick') {
		if (typeof eMaster.listens[eventName].items === 'undefined') {
			dBug('WARNING: No eMaster.listens.worldTick.items!');
			return false;
		}
			
		if (typeof eMaster.listens[eventName].items[id] === 'undefined') {
				dBug(`WARNING: Tried to kill nonexistent ${eventName} event with id ${id}`);
				return false;
		}
		dBug(id + ' unregistered for worldTick');
		delete eMaster.listens[eventName].items[id];
	} else {
		dBug(`WARNING: Tried to kill unknown event ${eventName} on ${id}`);
	}
};
var nextId = {};
//-----------------------------------------------------------------------------
// ITEM, SCENERYITEM, MOB, ETC.
//-----------------------------------------------------------------------------
var Item = function(itemType, data) {
	
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

	// Decay setup:
	// Default decay: Have 100 endurance points, decay 10 points off every 3 ticks	
	// (or use the decay we were sent -- break references first)
	// If only one decay property is set, use defaults for the others
	
	
	if (!data.decay) {
		data.decay = {};
	}
	for (var prop in cons.DEFAULTS.itemDecay) {
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
		dBug('(WARNING) That should not have happened!');
	}
	this.data.family = itemTypes[itemType].data.family;
	
	dBug(`Item ${this.data.shortName} created with id: ${this.id}` +
	  `(family: ${this.data.family}). Placing in: ${this.data.location}`);
	
	nextId[itemType]++;
	
	// figure out where it belongs (room or player) and update that object, too
	var loc = this.data.location;
	if (isNaN(loc.charAt(0))) {
		// first letter not a number, so it's in a room
		rooms[this.data.location].data.items[this.id] = this.data.type;
	} else {
		// it's on a player
		players[this.data.location].inventory[this.id] = this.data.type;
	}
	
	// add it to the items global
	items[this.id] = this;
};
Item.prototype.describeAs = function(viewAs, options) {
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
Item.prototype.decay = defaultDecay;
Item.prototype.freshen = defaultFreshen;
Item.prototype.look = defaultLook;
Item.prototype.get = defaultGet;
Item.prototype.drop = defaultDrop;
Item.prototype.crush = defaultCrush;
Item.prototype.age = defaultAge;
Item.prototype.registerForWorldTicks = function() {
	var item = this;
	var tickCount = 0;
	
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

var SceneryItem = function(itemType, data) {
	
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
	var loc = this.data.location;
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

var Mob = function(itemType, data) {
	this.data = Object.assign({}, data); // break first level of references
	
	if (typeof data !== 'object') {
		data = {};
	}
	
	this.data.hidden = data.hidden || true; // mobs are usually "hidden" for now
	this.data.description = data.description || "It wanders about";
	this.data.shortName = data.shortName || 'mob';
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || itemType;
	
	// Decay setup:
	// Default decay: Have 100 endurance points, decay 10 points off every 3 ticks	
	// (or use the decay we were sent -- break references first)
	if (!this.data.decay) {
		this.data.decay = {
			rate: 0,
			amount: 0,
			maxEndurance: 100
		};
	}
	
	// stamp it with an instance # and increment the instance counter
	if (!nextId[itemType]) {
		nextId[itemType] = 1;
	}
	this.id = itemType + '##' + nextId[itemType];
	
	// this shouldn't happen, I think
	if (typeof itemTypes[itemType] === 'undefined') {
		itemTypes[itemType] = {family: "junk"};
		dBug('(WARNING) That should not have happened!');
	}
	
	dBug(`Mobile ${this.data.shortName} created with id: ${this.id}` +
	  `(family: ${itemTypes[itemType].data.family}). Placing in: ${this.data.location}`);
	
	nextId[itemType]++;
	
	// figure out where it belongs (room or player) and update that object, too
	var loc = this.data.location;
	if (isNaN(loc.charAt(0))) {
		// first letter not a number, so it's in a room
		rooms[this.data.location].data.items[this.id] = this.data.type;
	} else {
		// it's on a player
		players[this.data.location].inventory[this.id] = this.data.type;
	}
	
	// add it to the items global
	items[this.id] = this;
};
Mob.prototype = Object.create(Item.prototype); // Mob extends Item
Mob.prototype.get = {}; // can't pick up mobs!
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
				
				for (var exit in exits) {
					if (exits[exit].goesto) {
						choices.push(exits[exit].goesto);
					}
				}
				
				let choice = ut.listPick(choices);
				//eMaster('roomGeneric', this.data.location, {"sayFrom": sayFrom}, ` looks towards ${choice}`, client);
				eMaster('roomExit', this.data.location, {"sayFrom": sayFrom}, choice, client);
				eMaster('roomEnter', choice, {"sayFrom": sayFrom}, this.data.location, client);
				delete rooms[this.data.location].data.items[this.id];
				this.data.location = choice;
				rooms[choice].data.items[this.id] = this.data.type;
			}
		}
	}
};
Mob.prototype.registerForWorldTicks = function() {
	var mob = this;
	var tickCount = 0;
	
	this.on('worldTick', function({}, client) {
		tickCount++;
		mob.timedActions(tickCount, client);
	});
};
var ItemGenerator = function(itemType, data) {
	this.data = data || {};
	this.data.shortName = data.shortName || "scenery";
	this.data.description = data.description || "A part of the scenery.";
	this.location = data.location || "nowhere really";
	this.data.hidden = true;
	this.data.type = itemType || itemType;
	
	if (!nextId[itemType]) {
		nextId[itemType] = 1;
	}
	
	// stamp it with an instance # and increment the instance counter
	this.id = itemType + '##' + nextId[itemType];
	dBug('Item(scenery) "' + this.data.shortName + '" created with id: ' + this.id +
	  ' (family: ' + itemTypes[itemType].family + '). Placing in: ' + this.data.location);
	nextId[itemType]++;
	
	// figure out where it belongs (room or player) and update that object, too
	var loc = this.data.location;
	if (isNaN(loc.charAt(0))) {
		// first letter not a number, so it's in a room
		rooms[this.data.location].data.items[this.id] = this.id;
	} else {
		// it's on a player
		players[this.data.location].inventory[this.id] = this.id;
	}
	
	// add it to the items file...
	items[this.id] = this;
};
ItemGenerator.prototype.look = defaultLook;
ItemGenerator.prototype.make = function(itemType, data) {
	var theItem;
	if (typeof itemTypes[itemType] === undefined) {
		return false;
	}
	theItem = new Item(itemType, data);

	return theItem;
};
ItemGenerator.prototype.on = defaultItemEventHandler;
ItemGenerator.prototype.off = defaultItemEventKiller;
//-----------------------------------------------------------------------------
// ITEMTYPE  (ITEM TEMPLATES)
//-----------------------------------------------------------------------------
var ItemType = function(data) {
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
var Room = function(data) {
	// data is an object. any necessary properties not given
	// will receive default values
	
	// not sure what's up with .contents vs. .items
	// .contents isn't used in code (except in nuke command to nuke it)
	
	this.data = data || {};
	
	this.data.exits = data.exits || {
		"door": {
			"goesto": null,
			"description": "A very plain, very default-looking door."
		},
	};
	this.data.description = data.description || "An absurdly empty space.";
	this.data.contents = data.contents || {};
	this.data.title = data.title || "A new Room";
	this.data.items = data.items || {};
	this.data.id = data.id || data.title;
};
Room.prototype.on = defaultRoomEventHandler;
Room.prototype.off = defaultRoomEventKiller;
Room.prototype.describeAs = defaultRoomDescribe;
Room.prototype.shortDesc = defaultRoomShortDesc;
//-----------------------------------------------------------------------------
// PLAYER
//-----------------------------------------------------------------------------
var Player = function(data) {
	this.location = data.location || "airport";

	this.inventory = data.inventory || {};
	
	this.charName = data.charName || 'Anonymous';
	this.stats = data.stats || {
		"shtyle": "mundane",
		"speed": 120,
		"status": "normal",
		"hp": 40,
		"accessLevel": 10,
		"unlockedTitles": [1]
	};
	this.traits = data.traits || {
		lightSleeper: false
	};
	this.stats.unlockedTitles = this.stats.unlockedTitles || [1];
	this.stats.attackDelay = 2400;
	this.stats.attackSpamWarns = this.stats.attackSpamWarns || 0;
	this.posture = data.posture || "asleep";
	this.id = data.id;
	this.title = data.title;
	this.age = data.age || 0;
	this.idle = data.idle || {
		ticks: 0,
		threshhold: 45,
		autolog: true,
		warn: true
		};
	this.description = data.description || "a brave MUD tester";
	
	this.timers = {
		"nextAttack": 0,
		"nextMove": 0
	};
};
Player.prototype.isZoneAuthor = function() {
	// returns true if the player is an author of the zone they are standing in
	// returns false otherwise
	// for testing against other zones, can can make ".isAuthorOf(location)"
	let zone = rooms[this.location].data.zone;
	if (zone) {
		if (zoneList[zone]) {
			if (zoneList[zone].authors.indexOf(this.id) !== -1) {
				return true;
			} else {
				return false;
			}
		} else {
			dBug(`WARNING: room ${this.location} has non-existent zone ${zone}!`);
		}
	}
};
Player.prototype.isAuthorOf = function(target) {
	// assumes target is a valid roomId!
	// (though it may not have a .zone property)
	
	let zone = rooms[target].data.zone;
	if (zone) {
		if (zoneList[zone]) {
			if (zoneList[zone].authors.indexOf(this.id) !== -1) {
				return true;
			} else {
				return false;
			}
		} else {
			dBug(`WARNING: room ${this.location} has non-existent zone ${zone}!`);
			return false;
		}
	}
};
Player.prototype.unlockTitle = function(titleNum) {
	if (this.stats.unlockedTitles.indexOf(titleNum) !== -1) {
		dBug('INFO: ${this.id}.unlockTitle(${titleNum): Already had it.');
		return;
	} else {
		this.stats.unlockedTitles.push(titleNum);
		dBug('INFO: ${this.id}.stats.unlockedTitles is now: ${${this.stats.unlockedTitles}');
	}
};
Player.prototype.isWearing = function(iType) {
	// check the player to see if they've equipped an item of iType
	// currently, there is no equipping of items, so just check inv
	
	for (var item in this.inventory) {
		if (this.inventory[item] === iType) {return true;}
	}
	return false;
};
Player.prototype.isAtLeast = defaultPlayerAccessCheck;
Player.prototype.describeAs = defaultPlayerDescribeAs;
Player.prototype.longDescribeAs = defaultPlayerLongDescribeAs;
Player.prototype.attack = defaultAttack;
Player.prototype.on = defaultPlayerEventHandler;
Player.prototype.off = defaultPlayerEventKiller;
Player.prototype.registerForWorldTicks = function(client) {
	var player = this;
	this.on('worldTick', function() {
		player.age++;
		
		// idle timeout stuff
		if (!player.idle) {
			player.idle = {
				ticks: 0,
				threshhold: 45,
				autolog: true,
				warn: true
				};
			dBug(`INFO: created .idle for players.${player.id}.`);
		}
		player.idle.ticks++;
		
		// yell timer
		if (!player.timers) {
			player.timers = {}
		}
		player.timers.yell = 0; // let 'em holla again
		
		if (player.idle.ticks > player.idle.threshhold) {
			// TODO: "warning" them a couple ticks early		
			if (player.idle.autolog) {
				player.sleep(); // Zzz
				// we can fire off a "X snores" because they should be unregistered now
				let phrase = ut.listPick(["drifts off to sleep", "closes their eyes and immediately starts snoring",
					"falls asleep", "nods off to sleep", "falls into a deep slumber"]);
				eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase, client);	
				dBug(`[ IDLE TIMEOUT ] Just forced ${player.charName} to .sleep() (>${player.idle.threshhold} ticks)`);
			}
		}
	});
};
Player.prototype.registerForAreaTicks = function() {
	// TODO
};
Player.prototype.registerForRoomEvents = function() {
	var player = this;
	this.on('roomSay', function(whoSaid, whatSaid, client) {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
		
		let who = player.id; // this is who registered
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}		
		if (typeof whoSaid === 'object') {
			// new style roomSay, whoSaid can be things other than players
			user.send(`**${whoSaid.sayFrom}** says, "${whatSaid}"`);
		} else {
			let whoStr;
			
			if (typeof whatSaid === 'string') {
				// Not sure if String is still useful?	(It is in roomSay!)			
				whoStr = (whoSaid === who) ? '**You** say,' : `**${players[whoSaid].charName}** says,`; 
				user.send(`${whoStr} "${whatSaid}"`);
			} else {
				whoStr = (whoSaid === who) ? whatSaid.normal[0] : `**${players[whoSaid].charName}** "${whatSaid.normal[1]}"`;
				user.send(whoStr);
			}
		}
	});
	this.on('roomGet', function(whoSaid, itemId, client) {
		
		let server = client.guilds.get(players[whoSaid].server);
		let who = player.id;
		let user = server.members.get(who);
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = items[itemId].data.type;
		user.send(`**${whoStr}** picked up ${itemName}.`);
	});
	
	this.on('roomDrop', function(whoSaid, itemId, client) {
		let server = client.guilds.get(players[whoSaid].server);
		let who = player.id;
		let user = server.members.get(who);
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}	
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = items[itemId].data.type;
		user.send(`**${whoStr}** dropped ${itemName}.`);
	});
	this.on('roomCrush', function(whoSaid, itemId, client) {
		let server = client.guilds.get(players[whoSaid].server);
		let who = player.id;
		let user = server.members.get(who);
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}	
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You hold' : players[whoSaid].charName + ' holds';
		let itemName = items[itemId].data.type;
		user.send(`**${whoStr}** ${itemName} in their hand and crushes it to dust!`);
	});
	this.on('roomExit', function(whoSaid, newRoom, client) {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
		
		let who = player.id; // this is who registered
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		let roomStr = rooms[newRoom].data.title;
		
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}		
		if (typeof whoSaid === 'object') {
			// new style roomExit, whoSaid can be things other than players
			user.send(`**${whoSaid.sayFrom}** leaves towards ${roomStr}.`);
		} else {
			let whoStr;
			
			if (typeof newRoom === 'string') {
				// Not sure if String is still useful?	YES it is here
				// We don't let the users "watch themselves leave", so...
				if (whoSaid !== who) {
					user.send(`**${players[whoSaid].charName}** leaves towards ${roomStr}`);
				}
			} else {
				/*
				whoStr = (whoSaid === who) ? whatSaid.normal[0] : `**${players[whoSaid].charName}** "${whatSaid.normal[1]}"`;
				user.send(whoStr);
				*/
			}
		}
	});
	this.on('roomEnter', function(whoSaid, lastRoom, client) {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
		
		let who = player.id; // this is who registered
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		let roomStr = rooms[lastRoom].data.title;
		
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}		
		if (typeof whoSaid === 'object') {
			// new style roomEnter, whoSaid can be things other than players
			user.send(`**${whoSaid.sayFrom}** enters from ${roomStr}.`);
		} else {
			let whoStr;
			
			if (typeof lastRoom === 'string') {
				// Not sure if String is still useful?	YES it is here
				whoStr = (whoSaid === who) ? 'You arrive' : `**${players[whoSaid].charName}** arrives`;
				user.send(`${whoStr} from ${roomStr}.`);
			} else {
				/*
				whoStr = (whoSaid === who) ? whatSaid.normal[0] : `**${players[whoSaid].charName}** "${whatSaid.normal[1]}"`;
				user.send(whoStr);
				*/
			}
		}
	});
	this.on('roomGeneric', function(whoSaid, whatSaid, client) {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
	
	
		
		let who = player.id; // this is who registered
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		
		if (!user) {
			dBug(`WARNING! server.members.get(${who}) is undefined!`);
			return false;
		}		
		if (typeof whoSaid === 'object') {
			// new style roomGeneric, whoSaid can be things other than players
			if (!whoSaid.sayFrom) {
				whoSaid.sayFrom = "";
			}
			user.send(`${whoSaid.sayFrom} ${whatSaid}`);
		} else {
			let whoStr;
		
			if (typeof whatSaid === 'string') {
				// Not sure if String is still useful?
				whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
				user.send(`**${whoStr}** ${whatSaid}`);
			} else {
				whoStr = (whoSaid === who) ? whatSaid.normal[0] : `${players[whoSaid].charName} ${whatSaid.normal[1]}`;
				user.send(whoStr);
			}
		}
	});
};
Player.prototype.registerForLoudRoomEvents = function() {
	
	var pl = this;
	
	// loud room events just wake people up for now
	this.on('roomLoud', function(whoSaid, whatSaid, client) {
		pl.posture = 'sitting';
		
		pl.registerForRoomEvents();
		pl.registerForWorldTicks(client);
		eMaster('roomGeneric', pl.location, {"sayFrom": pl.charName}, 'is disturbed and wakes up!', client);
		pl.unregisterForLoudRoomEvents();
		pl.idle.ticks = 0; // they're "not idle" again starting now, someone disturbed them
	});
};
Player.prototype.unregisterForLoudRoomEvents = function() {
	this.off('roomLoud');
};
Player.prototype.unregisterForRoomEvents = function() {
	this.off('roomSay');
	this.off('roomLoud');
	this.off('roomDrop');
	this.off('roomCrush');
	this.off('roomGet');
	this.off('roomEnter');
	this.off('roomExit');
	this.off('roomGeneric');
};
Player.prototype.unregisterForWorldTicks = function() {
	this.off('worldTick');
};
Player.prototype.sleep = function() {
	this.unregisterForRoomEvents();
	this.unregisterForWorldTicks();
	this.posture = 'asleep';	
	
	// light sleepers only
	if (this.traits.lightSleeper) {	this.registerForLoudRoomEvents(); }
};

var fixBadItems = function() {
	// iterate over all inventories. if there are any objects that have no corresponding item ID,
	// then do something about it
	let itemId;
	for (var player in players) {
		dBug(`(INFO) fixBadItems(): iterating over ${player}...`);
		
		if (!players[player].inventory) {
			dBug(`  -> No .inventory on ${player}!`);
		} else {
			let pl = players[player];
			for (var item in pl.inventory) {
				itemId = pl.intenvory[item];
				if (!items[pl.inventory[itemId]]) {
					// we have a legacy item that needs recreated!						
				}
			}
		}
	}
};
var saveMUD = function() {
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	ut.saveObj(world, cons.MUD.worldFile);
	ut.saveObj(itemTypes, cons.MUD.itemFile);
};
var backupMUD = function() {
	let now = new Date().valueOf();
	ut.saveObj(rooms, cons.MUD.backups.roomFile + now + '.bak');
	ut.saveObj(players, cons.MUD.backups.playerFile + now + '.bak');
	ut.saveObj(world, cons.MUD.backups.worldFile + now + '.bak');
	ut.saveObj(itemTypes, cons.MUD.backups.itemFile + now + '.bak');
};
var buildDungeon = function() {
	// iterates over the rooms object, reads all the .data
	// and puts it back using the Room constructor, so that
	// the rooms are all Room objects, with the appropriate
	// methods, etc.
	
	for (var room in rooms) {
		
		// fix for .id = .title blunder
		if (rooms[room].data.id === rooms[room].data.title) {
			rooms[room].data.id = room;
		}
		
		var theRoom = new Room(rooms[room].data);
		
		// wipe out any existing chars and (not) items (anymore)
		// they'll get replaced by buildPlayers() and buildItems() calling new Item
		// theRoom.data.items = {};
		theRoom.data.chars = [];
		
		rooms[room] = theRoom;
	}

	dBug('Dungeon built.');
};
var buildPlayers = function(client) {
	// iterates over the players object, reads all the .data
	// and puts it back using the Player constructor, so that
	// the players are all Player objects, with the appropriate
	// methods, etc.
	for (var player in players) {
		if (typeof players[player].id === 'undefined') {
			players[player].id = player;
		}
	
		var thePlayer = new Player(players[player]);
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
var buildItems = function() {
	
	// iterate over players, then rooms
	// along the way, we'll build our items global
	
	// players
	var theItem;
	for (let player in players) {
		if (!players[player].inventory) {
			dBug(`WARNING! ${player} had no inventory, creating!`);
			players[player].inventory = {};
		}
		
		for (let itemId in players[player].inventory) {
			let iType = players[player].inventory[itemId];
			
			if (!itemTypes[iType]) {
				dBug(`WARNING! ${player} was carrying an item of non-existent type ${iType} - ignoring!`);
			} else {
				
				// delete the old item, we're re-building here, assigning a new id
				delete players[player].inventory[itemId];
				
				// calling new Item will place it on the player
				
				let idata =  itemTypes[iType].data; // inherit 
				
				if (idata.family === "mobile") {
					theItem = new Mob(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"description": idata.description,
						"location": player,
						"speak": idata.speak,
						"genericaction": idata.genericaction,
						"move": idata.move,
						"decay": idata.decay,
						"family": idata.family
					});
				} else if (idata.family === "prop") {
					theItem = new SceneryItem(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
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
						"location": player
					});
				}
				if (idata.family === "food") {
					theItem.use = defaultFoodUse;
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
				dBug(`WARNING! Room ${room} contained an item of non-existent type ${iType} - ignoring!`);
			} else {
				
				// delete the old item, we're re-building here, assigning a new id
				delete rooms[room].data.items[itemId];
				
				// calling new Item will place it back in the room
				let idata = itemTypes[iType].data; // inherit
				
				if (idata.family === "mobile") {
					theItem = new Mob(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"description": idata.description,
						"location": room,
						"speak": idata.speak,
						"genericaction": idata.genericaction,
						"move": idata.move,
						"decay": idata.decay,
						"family": idata.family
					});
				} else if (idata.family === "prop") {
					theItem = new SceneryItem(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
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
			}
				
			// since it's in a room, it should be listening for worldTicks...
			theItem.registerForWorldTicks();
			items[theItem.id] = theItem;
		}
	}
	/*
	//----- hardcoded test "generator"-----
	var drinkMachine = new ItemGenerator('soda machine', {
		description: "This machine dispenses drinks from time to time",
		shortName: "machine",
		location: "tarmac"
	});

	/*
	drinkMachine.on('roomSay', () => {
		dBug(this);
		this.make('empty soda can', this.location);
	});
	*/
	
	/*
	drinkMachine.on('roomSay', function() {
		dBug(this);
		drinkMachine.make('empty soda can', {
			shortName: "can",
			location: drinkMachine.location,
			description: "An empty aluminum soda can is here."
		});
		ut.saveObj(items, cons.MUD.itemFile);
	});	
	dBug(drinkMachine.id);
	rooms.tarmac.data.items[drinkMachine.id] = drinkMachine.id;
	*/
};
//-----------------------------------------------------------------------------
var worldTick = function(client) {
	
	world.time.tickCount++;
	
	let now = mudTime(world.time.tickCount);
	
	if (now.remain === 0) {
		
		// Here we could fire off a 'worldHour' event or do other hourly things
		dBug(`    o   The hour hand advances to ${now.hour.toString().padStart(2, ' ')}`);
		
		if (now.hour === 6) {
			// sunrise
			
			// Spammy advert stuff
			if (Math.random() < 0.15) {
				client.channels.get(cons.SPAMCHAN_ID).send(' A new day has dawned for the brave explorers of SpongeMUD.  Do you have a character?');
			}			
		} else if (now.hour === 18) {
			// sunset
		}
	}
	
	ut.saveObj(world, cons.MUD.worldFile);
	
	eMaster('worldTick',{},{},client);
	timers.worldTick.main = setTimeout(() => {worldTick(client);}, cons.WORLDTICKLENGTH);
};
var initTimers = function(client) {
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
	idleReset: function(message) {
		var who = message.author.id;
		var player = players[who];
		
		if (!player) {
			dBug(`INFO: idle timeout checker found no players.${who}.`);
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
	autolog: {
		do: function(message, args) {
			let player = players[message.author.id];
			let outP = '';
			
			args = parseInt(args);
			
			if (!args) {
				player.idle.autolog = !player.idle.autolog;
			} else if (args < 2) {
				outP += "No one falls asleep that fast. Try at least 2 ticks?\n"
			} else if (args > 16383) {
				outP += "If you want it to be that long, just turn autolog off by doing `autolog` by itself.\n"
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
			ut.saveObj(players, cons.MUD.playerFile);
			ut.chSend(message, outP);
		}
	},
	age: {
		do: function(message, args) {
			let age;
			
			if (!args) {
				// needs valid player check
				age = players[message.author.id].age;
			} else {
				let match = findChar(args);
				if (match) {
					age = players[match].age;
				} else {
					ut.chSend(message, "I don't recognize them.");
					return;
				}
			}
			ut.chSend(message, `That character is ${age} ticks old.`);
		}
	},
	terse: {
		do: function(message) {
			var who = message.author.id;
			players[who].terseTravel = !players[who].terseTravel;
			ut.chSend(message, 'Short room descriptions when travelling is now: ' +
			  players[who].terseTravel);
		}
	},
	peek: {
		do: function(message, parms) {
			if (rooms.hasOwnProperty(parms)) {
				ut.longChSend(message, rooms[parms].describeAs(player));
			} else {
				ut.chSend(message, `You want to see ${parms}, eh? I don't know that place.`);
			}
		}
	},
	go: {
		do: function(message, args, client) {
			var who = message.author.id;
			var fail = cantDo(who, 'go');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			var player = players[who];
			args = args.split(' ');
			var where = args[0];
			var pLoc = player.location;	
			var chanStr = '';
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
						chanStr += rooms[newLoc].shortDesc(player);
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
	joinmud: {
		do: function(message, parms, client) {
			var who = message.author.id;
			var server = message.guild;
			var player = players[who];
			let outP = '';
			// temporary! need to come up with something for this situation (DM joinmud)
			if (!server) {
				server = {"name": 'The Planet', "id": cons.SERVER_ID};
			}

			if (typeof players[who] === 'undefined') {
				parms = parms.split(' ');
				var charName = parms[0];
				if (charName.length < 3 || charName.length > 15) {
					ut.chSend(message, message.author + ', use `joinmud <character name>`.' +
					  ' Your character name must be a single word between 3 and 15 chars.');
					return;
				} else {
					for (var p in players) {
						if (players[p].charName.toLowerCase() === charName.toLowerCase()) {
							ut.chSend(message, `${message.author.username}, that sounds too close to another character's name. Can you try something else?`);
							return;
						}
					}
				}
				player = new Player({charName: charName, id: who, posture: "standing"});
				players[who] = player;
				ut.saveObj(players, cons.MUD.playerFile);
				outP +=  ` Welcome to SpongeMUD-Alpha, ${charName}! (${message.author.id}).`;
				outP +=  ' Generally, you\'ll be using DM with me to experience the MUD world.';
				outP +=  ' \nTry `look` (in a DM with me) to get started. Also you might check <#549180949439447040>.';
				outP +=  ' \nThere is some info there, particularly in the pinned posts and linked Google docs. Thanks for joining us!';
				ut.chSend(message, outP);
				ut.saveObj(players, cons.MUD.playerFile);
			} else {
				ut.chSend(message, ' You\'re already a SpongeMUD player. Awesome!');
			}
			if (typeof player.server === 'undefined') {
				ut.chSend(message, ` You are now logged in via ${server.name} (${server.id})`);
				player.server = server.id;
				player.posture = 'standing';
				ut.saveObj(players, cons.MUD.playerFile);
			} else {
				ut.chSend(message, ' You are now logged in via ' + server.name +
				  ' (' + server.id + ') (last: ' + player.server + ')');
				player.server = server.id;
				player.posture = 'standing';
				ut.saveObj(players, cons.MUD.playerFile);
			}
			player.registerForRoomEvents();
			player.registerForWorldTicks(client);
			player.unregisterForLoudRoomEvents();
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

				// player.server = null; // TODO: remember why this is here -- possibly ghost players?
				player.sleep(); // Zzz
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
			
			let outP = '';
			let time;
			
			let daysPerMonth = Math.floor(cons.DAYS_IN_YEAR / cons.MONTHS.length);
			let extraDays = cons.DAYS_IN_YEAR - (cons.MONTHS.length * daysPerMonth);
			
			if (!args) {
				time = mudTime(world.time.tickCount);
				outP += 'It is now ';
			} else {
				time = mudTime(parseInt(args), 10);
				outP += 'That would be on ';
			}
			
			outP += `hour ${time.hour} on day ${time.day + 1} of the month of ${cons.MONTHS[time.month]}, year ${time.year}.`;
			outP += `\n\nThere are ${cons.DAYS_IN_YEAR} days in a year. There are ${daysPerMonth} days`;
			outP += `  in each of the ${cons.MONTHS.length} months`;
			if (extraDays) { outP += `, except for ${cons.MONTHS[cons.MONTHS.length - 1]}, which has ${extraDays} extra.`; }
			outP += `\nA worldtick happens every ${cons.WORLDTICKLENGTH / 1000} seconds, `;
			outP += `and there are ${cons.TICKS_IN_DAY} ticks in a day, or ~${parseFloat(cons.TICKS_IN_DAY / 24, 2)} per MUD hour.`;
			
			ut.chSend(message, outP);
		}
	},
	yell: {
		do: function(message, args, client) {
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
				for (var roomId in rooms) {
					where = rooms[roomId];
					if (where.data.zone === zone) {
						// Fire off some events -- notify eMaster
						whatSaid = args.toUpperCase();
						players[who].timers.yell = 1; // 1 tick to wait
						eMaster('roomGeneric', roomId, who, {
							normal: [`You yell, ${whatSaid}!`,
							`yells from ${where.data.title}, ${whatSaid}!`]
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
			
			var pLoc = players[who].location;
			
			// Fire off some events -- notify eMaster
			eMaster('roomSay', pLoc, who, whatSaid, client);
		}
	},
	listens: {
		do: function(message) {
			var who = players[message.author.id];
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
		do: function(message, parms) {
			var who = message.author.id;
			var fail = cantDo(who, 'attack');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			parms = parms.split(' ');
			let target = parms[0];

			let result = players[message.author.id].attack(target);
			
			if (result.fail) {
				ut.chSend(message, result.outStr);
			} else {
				ut.chSend(message, result.outStr);
			}
		}
	},
	look: {
		do: function(message) {
			
			var who = message.author.id;
			var fail = cantDo(who, 'look');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			var player = players[who];
			var pLoc = players[who].location;
			
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
			var fail = cantDo(who, 'exam'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			// no args check
			if (!args) {
				module.exports.look.do(message, args);
				return;
			}
			
			// setup
			var pl = players[who];
			var loc = pl.location;
			args = args.split(' ');
			var target = args[0];
			var outP = '';
			var choices = [];
			
			choices = buildPicklist({
				"inv": pl.inventory,
				"floor": rooms[loc].data.items,
				"exit": rooms[loc].data.exits
			}, target);
			outP += `\`\`\`            =-=-= MATCHES FOR ${target}: =-=-=`; // `
			
			var numStr = '';
			for (var num = 0; num < choices.length; num++) {
				numStr = (num === 0) ? '' : (num + 1) + '.';
				outP += `\n${numStr.padStart(16, " ")}${target}: (${choices[num].where}): ${choices[num].what}`;
				
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
			var choiceList;
			var who = message.author.id;
			var fail = cantDo(who, 'exam'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				module.exports.look.do(message, args);
				return;
			}
			
			var pl = players[who];
			var loc = players[who].location;
			
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
			var outP = '';

			choiceList = buildPicklist({
				"inv": pl.inventory,
				"floor": rooms[loc].data.items,
				"exit": rooms[loc].data.exits,
				"char": rooms[loc].data.chars,
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
					let exitDesc = rooms[loc].data.exits[exitId].description;
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
							let exitDesc = rooms[loc].data.exits[exitId].description;
							let goesto = rooms[loc].data.exits[exitId].goesto;
							outP = `\`${exitId}\`: ${exitDesc} -> ${goesto}`;
						}
					}
				
				} else {
					outP = items[choiceList[choiceNum].ids[0]].describeAs(pl); // ids[0] = just use first one
				}
			}
			ut.chSend(message, outP);
		}
	},
	get: {
		do: function(message, args, client) {
			var choiceList;
			// for get, we only allow picking from floor
			var who = message.author.id;
			var fail = cantDo(who, 'get');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, 'Get _what_, though?');
				return;
			}
			
			var pl = players[who];
			var loc = players[who].location;
			
			
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

			var outP = '';
			
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
				
				var theItem = items[choiceList[choiceNum].ids[0]];
				
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
			var choiceList;
			// for drop, we only allow picking from inv
			var who = message.author.id;
			var fail = cantDo(who, 'drop');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, 'Drop _what_, though?');
				return;
			}
			
			var pl = players[who];
			var loc = players[who].location;
			
			
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

			var outP = '';
			
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
				
				var theItem = items[choiceList[choiceNum].ids[0]];
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
			var choiceList;
			// for crush, we only allow picking from inv
			var who = message.author.id;
			var fail = cantDo(who, 'drop');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			var pl = players[who];
			var loc = players[who].location;
			
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

			var outP = '';
			
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
				
				var theItem = items[choiceList[choiceNum].ids[0]];
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
			var choiceList;

			var who = message.author.id;
			var fail = cantDo(who, 'use');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			var pl = players[who];
			var loc = players[who].location;
			
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

			var outP = '';
			
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
				
				var theItem = items[choiceList[choiceNum].ids[0]];
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
			var who = message.author.id;
			var fail = cantDo(who, 'inv'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			var pl = players[who];
			var outP = '';
			if (pl.inventory === {}) {
				outP = 'absolutely nothing!';
			} else {
				for (var itemId in pl.inventory) {
					
					if (!items[itemId]) {
						dBug(`(WARNING) no such item ID: ${itemId} in items! (Player inventory: ${who})`);
						outP += ' -- some buggy items, please notify admin! --';
					} else if (!items[itemId].data) {
						dBug(`(WARNING) no .data property on item ID: ${itemId}!`);
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
			let outP = '\n';
			
			let who = message.author.id;
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
		do: function(message, parms) {
			// title, description: String
			// items: leave it out, can wizitem them
			// exits: use wizex ?
			
			let who = message.author.id;
			let fail = cantDo(who, 'edroom');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			// this should already be covered by cantDo(), but not removing it yet:
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				ut.chSend(message, message.author + ' Not only that, but you hit a part of the code you need to tell Sponge about!');
				return;
			}
			var loc = players[who].location;
			parms = parms.split(' ');
			var prop = parms[0];
			parms.shift();
			parms = parms.join(' ');
			var val = parms;
			var target;
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
				var exProp = parms[1]; // what property of the exit they want to change
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
							delete 
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
						rooms[val] = new Room({"title": val, "id": val});
						ut.chSend(message, ' Since no room "' + val + '" existed, I made one. Make sure ' +
						  'you do any necessary editing to it! Also created an exit called `door` leading back here.');
						rooms[val].data.exits.door.goesto = loc;
						ut.saveObj(rooms, cons.MUD.roomFile);
					}
				} else {
				ut.chSend(message, 'Can only edit `title`, `description` or `exits` properties. ' +
				  ' or use `delexit` to delete an exit.');
				}
			}
		}
	},
	wizroom: {
		do: function(message, parms) {
			var who = message.author.id;
			var player;
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			} else {
				ut.chSend(message, "Don't use `wizroom`, use `edroom exits` to create new rooms via new exits.");
				return;
			}
			
			player = players[who];
			parms = parms.split(' ');
			var roomId = parms[0];
			parms.shift();
			parms = parms.join(' ');
			var title = parms;
			
		
		
			if (typeof rooms[roomId] !== 'undefined') {
				ut.chSend(message, `${player.charName}, ${roomId} is already a room!`);
				return;
			}
			
			rooms[roomId] = new Room({"title": title, "id": roomId});
			ut.chSend(message, message.author + ', ' + roomId + ' created!');
			ut.saveObj(rooms, cons.MUD.roomFile);
		}
	},
	wizcopy: {
		do: function(message, parms) {
			var who = message.author.id;		
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			} 			
		}
	},
	wizprop: {
		do: function(message, parms) {
			ut.chSend(message, 'wizprop is no longer. set your template .family to prop instead');
		}
	},
	edtemp: {
		do: function(message, args) {
			let who = message.author.id;
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
				var prop = args[0];
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
							template.data[prop[0]] = {};
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
			let who = message.author.id;
			let player = players[who];
			let outP = '';
			let id;
			let shortName;
			let description;
			
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			}
			
			// this stuff really needs to go in cantDo()
			if (who !== cons.SPONGE_ID && noWiz) {
				ut.chSend(message, ' magicking up items is temporarily disabled, sorry. ');
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
					outP += `\n    Hidden:  ${currentTemps[0].data.hidden}`;
					
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
						outP += '\n  * If you want this to be a prop: `edtemp family prop`';
						outP += '\n    You will also probably want to change the decay property,';
						outP += '\n    And you may also want to `edtemp hidden TRUE`.';
						outP += '\n  * If you want this to be a mob:  < idk yet >';
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
			let who = message.author.id;
			let fail = cantDo(who, 'publish');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';
			var templates = player.carriedTemplates;
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
			let who = message.author.id;
					
			// now covered by cantDo
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			}
			
			if (who !== cons.SPONGE_ID && noWiz) {
				ut.chSend(message, ' magicking up items is temporarily disabled, sorry. ');
				return;
			}

			let outP = '';
			
			parms = parms.split('"');
			iType = parms[1];
		
			var iType = parms[1];
			if (!iType) {
				ut.chSend(message, ' You need to specify an item template (in quotes) as first argument! See documentation for valid tempates.');
				return;
			}
			
			if (!itemTypes.hasOwnProperty(iType)) {
				ut.chSend(message, `${iType} is not a valid template. Consult the documentation.`);
				return;
			}

			let idata = itemTypes[iType].data; // inherit stuff from itemTypes	
			
			var theItem;
			if (idata.family === "mobile") {
				theItem = new Mob(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"description": idata.description,
						"location": who,
						"speak": idata.speak,
						"genericaction": idata.genericaction,
						"move": idata.move,
						"family": idata.family,
						"decay": idata.decay,
				});
			} else if (idata.family === "prop") {
					theItem = new SceneryItem(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
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
					"location": who
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
	killitem: {
		do: function(message, parms) {
			let who = message.author.id;
			
			// should be in cantDo()
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			}
			who = message.author.id;
			var pl = players[who];
			var loc = pl.location;
			parms = parms.split(' ');
			var target = parms[0]; // what we're deleting
			parms.shift();
			parms = parms.join(' ');
			
			var outP = '';
			var found = 0;
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
		do: function(message, args) {
			let who = message.author.id;
			let fail = cantDo(who, 'profile');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let outP = '';
			
			if (!args) {
				outP += `**${players[who].charName}**: ${players[who].description}`;
			} else {
				players[who].pendingDescription = args;
				outP += `${players[who].charName}, your new character description is now pending approval.`;
			}
			
			ut.chSend(message, outP);
		}
	},
	title: {
		do: function(message, args) {
			let who = message.author.id;
			let fail = cantDo(who, 'title');
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
				for (var i = 0; i < titles.length; i++) {
					i = parseInt(i, 10);
					outP += `\`${i + 1}\` ... ${titleList[titles[i]]}\n`;
				}
			}
			
			ut.chSend(message, outP);
		}
	},
	approve: {
		do: function(message, args) {
			let who = message.author.id;
			// temporarily set to check cantDo on profile
			let fail = cantDo(who, 'profile');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player;
			let outP = '';
			
			
			if (!args) {
				outP += 'Specify a discord ID.';
			} else {
				if (!players.hasOwnProperty(args)) {
					outP += `No players.${args} was found!`;
				} else {
					player = players[args];
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
	tele: {
		do: function(message, args, client) {
			let target = args;
			let who = message.author.id;
			let fail = cantDo(who, 'tele', {"location": target});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let pLoc = player.location;
			let chanStr = '';

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
				if (players[who].terseTravel) {
					chanStr += rooms[newLoc].shortDesc(player);
				} else {
					chanStr += rooms[newLoc].describeAs(player);
				}

		}
	},
	sit: {
		do: function(message, parms, client) {	
			var who = message.author.id;
			let fail = cantDo(who, 'sit'); 
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
			var who = message.author.id;
			let fail = cantDo(who, 'stand'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			
			var player = players[who];
			var pLoc = player.location;

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
			let who = message.author.id;
			let fail = cantDo(who, 'me');
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
			var player;
			var pFind = function() {
				for (var pl in players) {
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
					for (var pl in players) {
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
			for (var roomId in rooms) {
				rooms[roomId].data.contents = {};
				rooms[roomId].data.items = {};
			}
			ut.chSend(message, 'All room contents nuked. :bomb: :open_mouth:');
			for (var pId in players) {
				players[pId].inventory = {};
			}
			ut.chSend(message, 'All player inventories nuked. :bomb: :open_mouth:');
		}
	}
};