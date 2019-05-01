const ut = require('../lib/utils.js');
const cons = require('../lib/constants.js');

cons.MONTHS = ['Archuary', 'Fooshuary', 'Keplembler', 'Wael', 'Skarl', 'Nicholaseptember', 'Squishuary'];
cons.MATERIALS = ["wood", "metals", "fibre", "edibles"];
cons.DAYS_IN_YEAR = 360; // default 360
cons.TICKS_PER_HOUR = 10; // default 10
cons.TICKS_IN_DAY = cons.TICKS_PER_HOUR * 24; // default 240
cons.DEBUG_LEVEL = 0; // 0 = all messages, 1 = level 1+ (warning), 2 = level 2+ (critical)...
cons.DEBUG_LEVEL_STRINGS = ["INFO:", " !!! WARNING:", "   ***** CRITICAL WARNING! ***** :"];

cons.WIZARD_MOB_LIMIT = 1;

const dBug = function(str, level) {
	
	if (typeof level === "undefined") { level = 0; }
	
	if (typeof str === "object") {
		str = JSON.stringify(str);
	}
	
	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};

const resourceGather = function(rData) {
	// gathers a single resource
	// expects a resource type from rooms[pLoc].data.resources
	// like rooms."forest-gatherspot".data.resources.trees
	
	// example return:
	/* {
		"ordinary whatever": {
			"wood": {
				c: 6,
				u: 4
			},
			"metals":  {
				c: 5,
				u: 3
			}
		}
	}
	*/
	let totalChance = 0;
	let buckets = [];
	for (let res in rData) {
		totalChance += rData[res].chance;
		buckets.push({"name": res, "limit": totalChance});
	}

	let chance = Math.floor(Math.random() * totalChance);
	let buckNum = 0;
	let match = false;
	while (buckNum < buckets.length - 1 && !match) {
		if (chance < buckets[buckNum].limit) {
			match = true;
		} else {
			buckNum++;
		}
	}
	
	let chosenResource = rData[buckets[buckNum].name];
	let table = chosenResource.table;
	let dStr = '';
	let results = {};
	results[buckets[buckNum].name] = {};
	
	for (let material in table) {
		for (let rarity in table[material]) {
			dStr = table[material][rarity];
			
			if (!results[buckets[buckNum].name].hasOwnProperty(material)) {
				results[buckets[buckNum].name][material] = {};
			}
			
			if (!results[buckets[buckNum].name][material].hasOwnProperty(rarity)) {
				results[buckets[buckNum].name][material][rarity] = 0;
			}
			
			results[buckets[buckNum].name][material][rarity] += ut.rollDice(dStr);
		}
	}
	return results;
};
const gatherMany = function(howMany, rData) {
	// pass in room resource data object (rData)
	// calls resourceGather(rData) howMany times
	// return a nifty table
	// does not remove from ripes!
	
	let materialTable = {};
	let rollResult;
	let resultTable = {};
	
	for (let rollNum = 0; rollNum < howMany; rollNum++) {
		rollResult = resourceGather(rData);

		for (let res in rollResult) {
			if (!resultTable.hasOwnProperty(res)) {
				cons.MATERIALS.forEach(function(m) {
					materialTable[m] = new MaterialRecord();
				});

				resultTable[res] = {
					count: 0,
					materials: {}
				};
				
				// deep copy
				for (let m in materialTable) {
					resultTable[res].materials[m] = materialTable[m];
				}
				
			} 
			resultTable[res].count++;
			for (let m in rollResult[res]) {
				// 	return {"fynegras": {"fibre": {"c": 14, "u": 10}}};
				resultTable[res].materials[m].add(rollResult[res][m]); // {"c": 14, "u": 10}
			}
		}
	}
	return resultTable;
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
	
	// now handle mobs
	where = 'mob';
	pickList[where] = [];

	// note: later, probably want to keep mobs unique/NOT flatten them
	for (var mobId in itemList[where]) {
		let theMob = mobs[mobId]; // get the actual Mob!
		let shortNames = theMob.data.shortNames || [];

		var matchFound = false;
		var matchNum = 0;
		var match = -1;
		
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
	var pickNum = 0;
	var choiceList = [];
	for (where in choices) {
		for (var num = 0; num < choices[where].length; num++) {
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

var world = require('../' + cons.DATA_DIR + cons.MUD.worldFile);
var players = require('../' + cons.DATA_DIR + cons.MUD.playerFile);
var rooms = require('../' + cons.DATA_DIR + cons.MUD.roomFile);
var items = {};
var mobs = {};
var itemTypes = require('../' + cons.DATA_DIR + cons.MUD.itemFile);
var zoneList = require('../' + cons.DATA_DIR + cons.MUD.zoneFile);
var mobTypes = require('../' + cons.DATA_DIR + cons.MUD.mobFile);
const MUDnews = require('../' + cons.DATA_DIR + cons.MUD.newsFile);
const resources = require('../' + cons.DATA_DIR + cons.MUD.resourceFile);
const minigames = {
	trollChef: require('../lib/minigames/trollchef.js')
};

var noWiz = false;
const timers = {};

var titleList = ["", "the Noob", "the Explorer", "the Adventurer", "the Experienced", "the Creative", "the Wizardly", "the Brave", "the Cowardly", "the Quester", "the Immortal", "the Janitor", "the Exterminator"];
var dreamStrings = {
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
const postureStr = {
	'standing': 'is standing',
	'sitting': 'is sitting',
	'resting': 'is resting',
	'asleep': 'is sleeping'
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
	if (typeof data.minAccess !== 'undefined') {
		if (typeof data.minAccess === 'string') {
			if (!player.isAtLeast(data.minAccess)) {
				return "Try as you might, that's beyond your power.";
			}
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
		case 'yell': 
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
		case 'wizmob':
			if (player.timers.wizmob > 0) {
				outStr = `Hey you can only wizard up items every ${cons.WIZARD_MOB_LIMIT} ticks!`;
				outStr += `You have to wait ${player.timers.wizmob} ticks yet.`;
				return outStr;
			}
			
			if (!player.isZoneAuthor()) {
				outStr = "Sorry Wizard, you can only `wizmob` in a zone you author.";
				return outStr;
			}
			
			break;
		case 'edroom': 
			if (!player.isZoneAuthor()) {	
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
const MaterialRecord = function() {				
	this.c = 0;
	this.u = 0;
	this.r = 0;
};
MaterialRecord.prototype.add = function(counts) {
	this.c += counts.c || 0;
	this.u += counts.u || 0;
	this.r += counts.r || 0;
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
	outP += item.description;
	return outP;
};
var defaultFoodUse = function(who, loc, client) {
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
	
	// fire off event even if item is hidden for now
	eMaster('roomDrop', where, who, this.id, client);
	
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
	description += `\n\n**KILL COUNTS**:\n`;
	
	for (let victim in this.stats.kills) {
		description += `  _${victim}:_ ${this.stats.kills[victim]}`;
	}
	
	return description;	
};
var defaultAttack = function(target) {};
var defaultRoomDescribe = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	// currently refactoring to put that stuff into .describeAs(viewAs) methods!
	//		I think I'm pretty much there now ^
	
	var id = this.data.id;

	var outStr = `-=-=  SP: ${viewAs.stats.stamina}/${viewAs.stats.maxStamina}`;
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
		dBug('SpongeMUD: Room `${id}` missing exits!', 1);
	}
	
	// Build items text
	if (this.data.hasOwnProperty('items')) {	
		let count = 0;
		let itemStr = '';
		for (var itemId in this.data.items) {
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
var defaultRoomShortDesc = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	// currently refactoring to put that stuff into .describeAs(viewAs) methods!
	//		I think I'm pretty much there now ^
	
	var id = this.data.id;

	var outStr = `-=-=  SP: ${viewAs.stats.stamina}/${viewAs.stats.maxStamina}`;
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
		dBug('SpongeMUD: Room `${id}` missing exits!', 1);
	}
	
	// Build items text
	if (this.data.hasOwnProperty('items')) {	
		let count = 0;
		let itemStr = '';
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

		} else if (eventName === 'roomDrop') {
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
	'zoneSay': [],
	'worldTick': {},
	'gameEvent': {}
};
var defaultRoomEventKiller = function(eventName, id) {
	
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
			dBug('No eMaster.listens.worldTick.players!', 1);
			return false;
		}
		
		if (typeof eMaster.listens[eventName].players[id] === 'undefined') {
			dBug(`Tried to kill nonexistent ${eventName} event with id ${id}`, 1);
			return false;
		}
		delete eMaster.listens[eventName].players[id];
	} else {

		let roomId = this.location;
		
		if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
			dBug(`Tried to kill a ${eventName} in ${roomId} that did not have those.`, 1);
			return false;
		}
		
		if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
			dBug(`Tried to kill nonexistent ${eventName} event with id ${id} in ${roomId}`, 1);
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
		dBug(`Unknown event ${eventName} triggered on ${id}`, 1);
	}
};
var defaultItemEventKiller = function(eventName) {

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
	this.data.family = data.family || 'junk';
	
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
		dBug('(WARNING) That should not have happened!', 2);
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

var Mob = function(mobTemplate, data) {
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
				for (var exit in exits) {
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
	var mob = this;
	var tickCount = 0;
	
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
	var mobgen = this;
	var tickCount = 0;
	
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
	this.data.mobs = data.mobs || {};
	this.data.id = data.id || data.title;
	this.data.zone = data.zone || false;
	
	if (this.data.onRoomSay) {
	
		let triggers = this.data.onRoomSay;
	
		for (let phrase in triggers) {
			
			if (phrase !== 'ELSE') {
				this.on('roomSay', function(whoSaid, whatSaid, client) {
					if (whatSaid.toLowerCase() === phrase.toLowerCase()) {
						let outP = '';
						let action = triggers[phrase].split(' ')[0];
						let rest = triggers[phrase].replace(action, '');
						rest = rest.slice(1); // snip leading space
						
						switch (action) {
							case 'grant': 
								let whatToGrant = rest.split(' ')[0];
								let who = whoSaid;
								let fail = cantDo(who, 'grant');
								if (fail) {
									// ut.chSend(message, fail); // no message here
									return;
								}
								let player = players[who];
								if (whatToGrant === 'title') {
									let titleNum = parseInt(rest.replace('title ', ''), 10);
									let success = players[whoSaid].unlockTitle(titleNum);
									if (success) {
										outP += `** TITLE UNLOCKED! ** You have unlocked title: "${titleList[titleNum]}!"`;
										outP += `\n  (to change titles or view avaiable titles, use the \`title\` command)`;
										player.sendMsg(outP, client);
									}
								}
							break;
							case 'tele': {
								let target = rest;
								let who = whoSaid;
								let fail = cantDo(who, 'tele', {"location": target, "by": "room"});
								if (fail) {
									// ut.chSend(message, fail); // no message here
									return;
								}
								let player = players[who];
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
							}
							default:
						}
					}
				});
			} else {
				// this is for ELSE
			}
		}
	}
	
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
	this.server = data.server;
	this.isRepping = data.isRepping;
	this.stats.maxStamina = this.stats.maxStamina || cons.DEFAULTS.stamina.max;
	this.stats.stamina = this.stats.stamina || this.stats.maxStamina;
	this.stats.staminaPerTick = this.stats.staminaPerTick || cons.DEFAULTS.stamina.perTick;
	this.stats.moveCost = this.stats.moveCost || cons.DEFAULTS.stamina.moveCost;
	this.stats.gatherPoints = this.stats.gatherPoints || cons.DEFAULTS.gather.maxPts;
	this.traits = data.traits || {
		lightSleeper: false
	};
	this.stats.unlockedTitles = this.stats.unlockedTitles || [1];
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
Player.prototype.zoneOf = function() {
	return rooms[this.location].data.zone;
};
Player.prototype.isZoneAuthor = function() {
	// returns true if the player is an author of the zone they are standing in
	// returns false otherwise
	// for testing against other zones, can can make ".isAuthorOf(location)"
	let zone = this.zoneOf();
	if (zone) {
		if (zoneList[zone]) {
			if (zoneList[zone].authors.indexOf(this.id) !== -1) {
				return true;
			} else {
				return false;
			}
		} else {
			dBug(`room ${this.location} has non-existent zone ${zone}!`, 1);
		}
	}
};
Player.prototype.isAuthorOf = function(target) {
	// assumes target is a valid roomId!
	// (though it may not have a .zone property)
	
	let zone = this.zoneOf();
	if (zone) {
		if (zoneList[zone]) {
			if (zoneList[zone].authors.indexOf(this.id) !== -1) {
				return true;
			} else {
				return false;
			}
		} else {
			dBug(`room ${this.location} has non-existent zone ${zone}!`, 1);
			return false;
		}
	}
};
Player.prototype.unlockTitle = function(titleNum) {
	if (this.stats.unlockedTitles.indexOf(titleNum) !== -1) {
		dBug(`${this.id}.unlockTitle(${titleNum}): Already had it.`);
		return false;
	} else {
		this.stats.unlockedTitles.push(titleNum);
		dBug(`${this.id}.stats.unlockedTitles is now: ${this.stats.unlockedTitles}`);
		return true;
	}
};
Player.prototype.award = function(amt, stat) {
	if (typeof this.stats[stat] === 'undefined') {
		this.stats[stat] = 0;
	}
	
	this.stats[stat] += amt;
	dBug(`AWARDED:  ${amt} ${stat} to ${this.charName}`);
};
Player.prototype.weighMe = function() {
	let totalWeight = 0;
	for (var itemId in this.inventory) {
		totalWeight += items[itemId].data.weight || 2;
	}
	return totalWeight;
};
Player.prototype.sendMsg = function(msg, client) {
	let player = this;
	let who = player.id;
	let server = client.guilds.get(players[who].server); // their server
	let user = server.members.get(who); // their GuildMember object
	
	if (!user) {
		dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
		player.sleep();
		return false;
	}
	user.send(msg);
};
Player.prototype.sendFile = function(fname, client, Discord) {
	// NO CHECKING AT ALL BE CAREFUL
	// PREPENDS + cons.DATA_DIR
	let player = this;
	let who = player.id;
	let server = client.guilds.get(players[who].server); // their server
	let user = server.members.get(who); // their User object
	
	if (!user) {
		dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
		player.sleep();
		return false;
	}
	//let now = new Date().valueOf();
	let attach = new Discord.Attachment(cons.DATA_DIR + fname, fname);
	user.send('Your file, as requested:', attach);
};
Player.prototype.sendJSON = function(obj, fname, client, Discord) {
	// obj needs to be safe to JSON.stringify
	// fname is just a string for what we call the file given to user
	let player = this;
	let who = player.id;
	let server = client.guilds.get(players[who].server); // their server
	let user = server.members.get(who); // their User object
	let buff = Buffer.from(JSON.stringify(obj));
	let attach = new Discord.Attachment(buff, fname);
	user.send('Your file, as requested:', attach);
};
Player.prototype.isWearing = function(iType) {
	// check the player to see if they've equipped an item of iType
	// currently, there is no equipping of items, so just check inv
	
	for (var item in this.inventory) {
		if (this.inventory[item] === iType) {return true;}
	}
	return false;
};
Player.prototype.resPlant = function() {
	if (!resources[this.id]) {
		dBug(`${this.id}.resPlant(): No resources.${this.id}!`, 1);
	} else {
		// create unripes from claims, delete the claims, and give gather pts back
		resources[this.id].unripes = Object.assign({}, resources[this.id].claims);
		delete resources[this.id].claims;
		this.stats.gatherPoints = this.stats.maxGather;
	}
};
Player.prototype.resRipen = function() {
	if (!resources[this.id]) {
		dBug(`${this.id}.resRipen(): No resources.${this.id}!`, 1);
	} else {
		let unripes = resources[this.id].unripes;
		
		for (let room in unripes) {
			// for each room where they have unripes...
			for (let rType in unripes[room]) {
				dBug(`ripening ${rType} in ${room} for ${this.id}`);
				// for each rType, add it to ripes
				resources[this.id].ripes = resources[this.id].ripes || {};
				resources[this.id].ripes[room] = resources[this.id].ripes[room] || {};
				resources[this.id].ripes[room][rType] = resources[this.id].ripes[room][rType] || 0;
				resources[this.id].ripes[room][rType] += unripes[room][rType];
				
				// and remove from unripes
				delete unripes[room][rType];
			}
		}
	}
};
Player.prototype.resGather = function() {
	// gather all ripe resources in current room if possible
	// will modify resources global as appropriate and save to disk
	// returns a string with the results
	
	let outP = '';
	if (!resources[this.id]) {
		dBug(`${this.id}.resHarvest(): No resources.${this.id}!`, 1);
		outP += ' You have nothing here to gather.';
	} else {
		let ripes = resources[this.id].ripes || {};
		let resData = rooms[this.location].data.resources; // is check necessary?
		let roomId = this.location;

		outP += `**GATHERING FROM ROOM ${rooms[roomId].data.title}**\n`;
		
		// for each room where they have ripes...
		for (let rType in ripes[roomId]) {
			// for each rType, run gatherMany(n), add to .stored and remove from ripes
			let count = ripes[roomId][rType];
			let resultTable = gatherMany(count, resData[rType]);
			dBug(`gatherMany(${count}, ${resData[rType]}):`);
			dBug(resultTable);
			
			outP += `Results from gathering ${count} ripe ${rType}:`;
			outP += '```';
			outP += '| RESOURCE     | MATERIAL |  COMMON  | UNCOMMON |   RARE   |\n';
			outP += '|______________|__________|__________|__________|__________|\n';

			for (let res in resultTable) {
				outP += resultTable[res].count + 'x ';
				outP += res + '\n';
				
				for (let m in resultTable[res].materials) {
					outP += '                 ' + m + '           ';
					for (let rarity in resultTable[res].materials[m]) {
						if (resultTable[res].materials[m].hasOwnProperty(rarity)) {
							outP += resultTable[res].materials[m][rarity] + '         ';
							
							resources[this.id].stored = resources[this.id].stored  || {};
							resources[this.id].stored[m] = resources[this.id].stored[m] || {};
							resources[this.id].stored[m][rarity] = resources[this.id].stored[m][rarity] || 0;
							resources[this.id].stored[m][rarity] += resultTable[res].materials[m][rarity];
						}
					}
					outP += '\n';
				}
				outP += '\n';
			}
			outP += '```\n';
			delete resources[this.id].ripes[rType];
		}
		delete ripes[roomId];
	}
	return outP;
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
		
		if (!player.stats.dayTicks) {
			player.stats.dayTicks = 0;
		}		
		player.stats.dayTicks++;
		
		// temporary? bootstrap the xp stat
		if (!player.stats.xp) {
			player.stats.xp = 1;
		}
		
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
		
		var multiplier = player.posture === "sitting" ? 2.5 : 1;
		var staminaRestored = player.stats.staminaPerTick;
		
		player.stats.stamina = Math.min(player.stats.stamina + staminaRestored * multiplier, player.stats.maxStamina);
		player.idle.ticks++;
		
		// yell timer
		if (!player.timers) {
			player.timers = {};
		}
		player.timers.yell = 0; // let 'em holla again
		
		// wizmob timer
		if (player.timers.wizmob) {
			player.timers.wizmob--;
		}
		
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
	// also registers for "gameEvent" events, which we don't use yet
	
	var player = this;
	this.on('gameEvent', function(whoSaid, data, client) {
		// UNTESTED!
		// whoSaid: possibly unused?
		// data: 
		//		whatSaid
		let who = player.id; // this is who registered
		let server = client.guilds.get(players[who].server); // their server
		let user = server.members.get(who); // their User object
		
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		user.send(data.whatSaid);
	});	
	this.on('roomSay', function(whoSaid, whatSaid, client) {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
		
		let who = player.id; // this is who registered
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
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
		
		let who = player.id;
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = items[itemId].data.type;
		user.send(`**${whoStr}** picked up ${itemName}.`);
	});
	
	this.on('roomDrop', function(whoSaid, itemId, client) {
		let who = player.id;
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
	
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = items[itemId].data.type;
		user.send(`**${whoStr}** dropped ${itemName}.`);
	});
	this.on('roomCrush', function(whoSaid, itemId, client) {
		let who = player.id;
		let server = client.guilds.get(players[who].server);
		let user = server.members.get(who);
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
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
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}		
		if (typeof whoSaid === 'object') {
			// new style roomExit, whoSaid can be things other than players
			user.send(`**${whoSaid.sayFrom}** leaves towards ${roomStr}.`);
		} else {
			//let whoStr;
			
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
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
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
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
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
	this.off('gameEvent');
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
var saveMUD = function() {
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	ut.saveObj(world, cons.MUD.worldFile);
	ut.saveObj(itemTypes, cons.MUD.itemFile);
	ut.saveObj(resources, cons.MUD.resourceFile);
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
		
		// wipe out any existing chars, they'll get replaced by buildPlayers()
		// buildItems() and buildMobs() will delete old ones and reassign ids
		// so we don't do them
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
var buildMobs = function() {
	
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
var worldTick = function(client) {
	
	let dayTicks;
	let maxXpTicks;
	let xp;
	let serverFameGenerated;
	let totalServerFame = 0;
	let totalTotalPlayerXp = 0;
	let player;
	let spam = '';
	
	world.time.tickCount++;
	
	let now = ut.mudTime(world.time.tickCount);
	
	if (now.remain === 0) {
		// Here we could fire off a 'worldHour' event or do other hourly things
		// Currently, this is now the only time we write world.json back to disk
		
		if (now.hour === 6) {
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
		} else if (now.hour === 18) {
			// sunset -- reset their dayTicks and grant XP

			
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
				//	for each player that gained xp that is "representing" a server
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
	buildMobs: buildMobs,
	idleReset: function(message) {
		var who = message.author.id;
		var player = players[who];
		
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
			var who = message.author.id;
			var fail = cantDo(who, 'age');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let age;
			if (!args) {
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
				//ut.longChSend(message, rooms[parms].describeAs(player));
				ut.chSend(message, 'Hey no peeking!');
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
			
			outP += (playerArr.length > 0) ? "`=-=-=- TOP PLAYERS (by XP) -=-=-=`\n```" : "```I have no data yet.";
			let tempStr;
			let charStr;
			let pl;
			for (let position = 0; (position < playerArr.length) && (position < 20); position++) {
				tempStr = '';
				pl = players[playerArr[position].id];
				outP += `#${position + 1}`.padEnd(3, " ");
				charStr = pl.charName;
				if (pl.title) {
					charStr += ' ' + titleList[pl.title];
				}
				tempStr += ` ${charStr}`.padEnd(32, ".");
				tempStr += `${Math.floor(playerArr[position].xp).toLocaleString('en')}`.padStart(10);				
				tempStr += ' XP\n';
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
				var charName = parms[0];

				if (charName.length < 3 || charName.length > 15) {
					outP += message.author.username + ', use `' + cons.PREFIX + 'joinmud <character name>`.' +
					  ' Your character name must be a single word between 3 and 15 chars.';
					failed = true;
				} else {
					for (var p in players) {
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
				
				player = new Player({charName: charName, id: who, posture: "standing", server: server.id});
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
				time = ut.mudTime(world.time.tickCount);
				outP += 'It is now ';
			} else {
				time = ut.mudTime(parseInt(args), 10);
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

			for (var roomId in rooms) {
				// Fire off some events -- notify eMaster
				whatSaid = args;
				eMaster('roomGeneric', roomId, who, {
					normal: [`You broadcast to the world, ${whatSaid}`,
					`says from everywhere at once, "${whatSaid}"`]
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
				for (var roomId in rooms) {
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
			if (!args || args.length < 2) {
				ut.chSend(message, 'Do `list` followed by at least two letters to list obvious matching objects.');
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
				"exit": rooms[loc].data.exits,
				"mob": rooms[loc].data.mobs
			}, target);
			outP += `\`\`\`            =-=-= MATCHES FOR ${target}: =-=-=`; // `
			
			var numStr = '';
			for (var num = 0; num < choices.length; num++) {
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
			var choiceList;
			var who = message.author.id;
			var fail = cantDo(who, 'exam'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args || args.length < 2) {
				ut.chSend(message, 'Try examining a specific thing (at least 2 letters).');
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
			var player = players[who];
			var loc = player.location;
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
						player.zoneOf();
						rooms[val] = new Room({"title": val, "id": val, "zone": player.zoneOf()});
						ut.chSend(message, ' Since no room "' + val + '" existed, I made one. Make sure ' +
						  'you do any necessary editing to it! Also created an exit called `door` leading back here.');
						rooms[val].data.exits.door.goesto = loc;
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
			mType = parms[1];
		
			var mType = parms[1];
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
			let cmd = 'profile';
			let who = message.author.id;
			let minAccess = 0;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
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
			let cmd = 'title';
			let who = message.author.id;
			let minAccess = 0;
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
			let cmd = 'approve';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
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
			let minAccess = 0;
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
			let minAccess = 0;
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
			let cmd = 'sit';
			let who = message.author.id;
			let minAccess = 0;
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
				outP = 'Use `setmacro <#> <command>`. Valid macro numbers are 0 through 9.';
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
			macroLocation = (isMenu ? room.data.menus : player.stats.macros)
			args = parseInt(args, 10);
			if (Array.isArray(macroLocation)) {
				if (typeof macroLocation[args] !== 'undefined') {
					return macroLocation[args];
				} else {
					outP = 'That is not a valid menu choice.';
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