let ut = require('./utils.js');
let cons = require('./constants.js');
let zoneList = require('../../data/spongemud/zones.json');
let players = require('../' + cons.DATA_DIR + cons.MUD.playerFile);
let titleList = cons.TITLE_LIST;
let postureStr = cons.POSTURE_STRINGS;
const eMasterModule = require('./events.js');
const eMaster = eMasterModule.eMaster;

let defaultPlayerEventKiller = function(eventName) {

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
			//dBug(`Tried to kill a ${eventName} in ${roomId} that did not have those.`, 1);
			return false;
		}
		
		if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
			dBug(`Tried to kill nonexistent ${eventName} event with id ${id} in ${roomId}`, 1);
			return false;
		}
		delete eMaster.listens[eventName][roomId][id];
	}
};
let defaultPlayerEventHandler = function(eventName, callback) {
	
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
let defaultPlayerAccessCheck = function(permLevel) {
	return (this.stats.accessLevel >= cons.PERM_LEVELS[permLevel]);
};
let defaultPlayerDescribeAs = function(viewAs) {
	let description = '';
	
	description += '\n**' + this.charName;
	
	if (this.title) {
		description += ` _${titleList[this.title]}_`;
		// unless viewAs player has turned off "view other players titles"?
	}

	// if they're in their zone, glow them
	if (this.isZoneAuthor(this.allRooms)) {
		description += ' (glowing)';	
	}

	description += '** ' + (postureStr[this.posture] || 'is') + ' here.';		 
	return description;
};
let defaultPlayerLongDescribeAs = function(permLevel) {
	let description = '';
	
	description += '\n**' + this.charName;
	
	if (this.title) {
		description += ' _' + titleList[this.title] + '_';
	}

	// if they're in their zone, glow them
	if (this.isZoneAuthor(this.allRooms)) {
		description += ' (glowing)';	
	}

	description += '** ' + (postureStr[this.posture] || 'is') + ' here.\n';
	description += this.description;
	
	description += '\n\n';
	if (!this.privacyFlag("noShowAge")) {
		description += `**AGE**: ${this.age} ticks    `;
	}
	description += `**PRONOUNS**: ${this.pronouns}`;
	description += `\n**CLASS**: ${this.stats.class}`;
	description += `\n**STATUS**: ${this.stats.status}`;
	description += `\n**WIZARDLY**: ${this.isAtLeast('wizard')}`;
	if (!this.privacyFlag("noShowIdleTicks")) {
		description += `\n ${this.charName} has been idle for at least ${this.idle.ticks} ticks.`;
	}
	description += `\n\n**KILL COUNTS**:\n`;
	for (let victim in this.stats.kills) {
		description += `  _${victim}:_ ${this.stats.kills[victim]}`;
	}
	
	return description;	
};
let defaultAttack = function(target) {};
const dBug = function(str, level) {
	
	if (typeof level === "undefined") { level = 0; }
	
	if (typeof str === "object") {
		str = JSON.stringify(str);
	}

	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};

const Player = function(data, allRooms, allItems, allResources) {
	this.allItems = allItems;
	this.allRooms = allRooms;
	this.allResources = allResources;
	this.location = data.location || "airport";

	this.inventory = data.inventory || {};
	
	this.charName = data.charName || 'Anonymous';
	this.stats = data.stats || {
		"shtyle": "mundane",
		"speed": 120,
		"status": "normal",
		"accessLevel": 10,
		"unlockedTitles": [1]
	};

	this.server = data.server;
	this.isRepping = data.isRepping;
	//this.stats.maxStamina = this.stats.maxStamina || cons.DEFAULTS.stamina.max;

	this.stats.stamina = this.stats.stamina || {
		current: cons.DEFAULTS.stamina.max,
		max: cons.DEFAULTS.stamina.max
	};
	this.stats.staminaPerTick = this.stats.staminaPerTick || cons.DEFAULTS.stamina.perTick;
	//this.stats.maxHp = this.stats.maxHp || cons.DEFAULTS.hp.max;
	//this.stats.baseMaxHp = this.stats.maxHp || cons.DEFAULTS.hp.max;
	
	this.stats.hp = this.stats.hp || {
		current: cons.DEFAULTS.hp.max,
		max: cons.DEFAULTS.hp.max
	};

	this.stats.hpPerTick = this.stats.hpPerTick || cons.DEFAULTS.hp.perTick;
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
	this.recallPoint = data.recallPoint;
	this.privacyFlags = data.privacyFlags;
	this.modFlags = data.modFlags;
	this.isMuted = data.isMuted;
};
Player.prototype.getData = function() {
    var result = Object.assign({}, this);
    delete result.allRooms;
    delete result.allItems;
    delete result.allResources;
    return result;
};
Player.prototype.getBadges = function() {
	
	let badges = [];
	let committees = this.stats.committees;
	
	if (!Array.isArray(committees)) {
		return;
	}
	
	committees.forEach(function(committee) {
		if (cons.COMMITTEES.hasOwnProperty(committee)) {
			badges.push(cons.COMMITTEES[committee].emoji);
		}
	});
	return badges;
};
Player.prototype.privacyFlag = function(flagName) {
	let flag = cons.PRIVACY_FLAGS[flagName];
	
	if (typeof flag === 'undefined') {
		dBug(`${this.charName}.privacyFlag(): Tried to check invalid flag "${flagName}", 2`);
		return;
	}

	let flagIsSet = ((this.privacyFlags & cons.PRIVACY_FLAGS[flagName]) === cons.PRIVACY_FLAGS[flagName]);
	return flagIsSet;
};
Player.prototype.getServerRepped = function(client) {
	let theServer;
	//let pFlags = this.privacyFlags;
	let noShowServer = this.privacyFlag("noShowServer");
	if (this.isRepping && !noShowServer) {
		let serverId = this.server;
		let server = client.guilds.get(serverId) || {name: "UNKNOWN SERVER"};
		theServer = server.name;
	}
	return theServer || false;
};
Player.prototype.mute = function() {
	this.isMuted = true;
	// TODO: write to moderation log
};
Player.prototype.unmute = function() {
	this.isMuted = false;
	// TODO: write to moderation log
};
Player.prototype.zoneOf = function() {
	return this.allRooms[this.location].data.zone;
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
	for (let itemId in this.inventory) {
		totalWeight += this.allItems[itemId].data.weight || 2;
	}
	return totalWeight;
};
Player.prototype.sendMsg = function(msg, client) {
	let player = this;
	let who = player.id;
	//let server = client.guilds.get(players[who].server); // their server
	let server = this.getServer(client);
		if (!server) {
			return false;
		}
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
	//let server = client.guilds.get(players[who].server); // their server
	let server = this.getServer(client);
		if (!server) {
			return false;
		}
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
	//let server = client.guilds.get(players[who].server); // their server
	let server = this.getServer(client);
		if (!server) {
			return false;
		}
	let user = server.members.get(who); // their User object
	let buff = Buffer.from(JSON.stringify(obj));
	let attach = new Discord.Attachment(buff, fname);
	user.send('Your file, as requested:', attach);
};
Player.prototype.isWearing = function(iType) {
	// check the player to see if they've equipped an item of iType
	// currently, there is no equipping of items, so just check inv
	
	for (let item in this.inventory) {
		if (this.inventory[item] === iType) {return true;}
	}
	return false;
};
Player.prototype.resPlant = function() {
	if (!this.allResources[this.id]) {
		//dBug(`${this.id}.resPlant(): No resources.${this.id}!`, 1);
	} else {
		// create unripes from claims, delete the claims, and give gather pts back
		this.allResources[this.id].unripes = Object.assign({}, this.allResources[this.id].claims);
		delete this.allResources[this.id].claims;
		this.stats.gatherPoints = this.stats.maxGather;
	}
};
Player.prototype.resRipen = function() {
	if (!this.allResources[this.id]) {
		dBug(`${this.id}.resRipen(): No resources.${this.id}!`, 1);
	} else {
		let unripes = this.allResources[this.id].unripes;
		
		for (let room in unripes) {
			// for each room where they have unripes...
			for (let rType in unripes[room]) {
				dBug(`ripening ${rType} in ${room} for ${this.id}`);
				// for each rType, add it to ripes
				this.allResources[this.id].ripes = this.allResources[this.id].ripes || {};
				this.allResources[this.id].ripes[room] = this.allResources[this.id].ripes[room] || {};
				this.allResources[this.id].ripes[room][rType] = this.allResources[this.id].ripes[room][rType] || 0;
				this.allResources[this.id].ripes[room][rType] += unripes[room][rType];
				
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
	if (!this.allResources[this.id]) {
		dBug(`${this.id}.resHarvest(): No resources.${this.id}!`, 1);
		outP += ' You have nothing here to gather.';
	} else {
		let ripes = this.allResources[this.id].ripes || {};
		let resData = this.allRooms[this.location].data.resources; // is check necessary?
		let roomId = this.location;

		outP += `**GATHERING FROM ROOM ${this.allRooms[roomId].data.title}**\n`;
		
		// for each room where they have ripes...
		for (let rType in ripes[roomId]) {
			// for each rType, run gatherMany(n), add to .stored and remove from ripes
			let count = ripes[roomId][rType];
			let resultTable = ut.gatherMany(count, resData[rType]);
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
							
							this.allResources[this.id].stored = this.allResources[this.id].stored  || {};
							this.allResources[this.id].stored[m] = this.allResources[this.id].stored[m] || {};
							this.allResources[this.id].stored[m][rarity] = this.allResources[this.id].stored[m][rarity] || 0;
							this.allResources[this.id].stored[m][rarity] += resultTable[res].materials[m][rarity];
						}
					}
					outP += '\n';
				}
				outP += '\n';
			}
			outP += '```\n';
			delete this.allResources[this.id].ripes[rType];
		}
		delete ripes[roomId];
	}
	return outP;
};
Player.prototype.go = function(exitTaken, client) {
	let player = this;
	let pLoc = player.location;
	let who = player.id;
	let outP = '';
	let newLoc = exitTaken.goesto;

	let moveCost = player.stats.moveCost + player.weighMe();
	if (player.stats.stamina.current < moveCost) {
		return "You need more stamina to move. Try sitting to restore it more quickly.";
	}

	player.unregisterForRoomEvents(); // first, unregister for events in this room
	eMaster('roomExit', pLoc, who, { "newRoom": newLoc, "exitTaken": exitTaken }, client); // fire off roomExit, notify everyone but us
	let oldLoc = '' + pLoc; // hang onto old location
	
	// handle stamina
	player.stats.stamina.current -= moveCost;
	player.location = newLoc; // actually move us

	// remove from old room chars[], add to new
	let ind = player.allRooms[oldLoc].data.chars.indexOf(who);
	player.allRooms[oldLoc].data.chars.splice(ind, 1);
	if (!player.allRooms[newLoc].data.chars) {
		dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
		player.allRooms[newLoc].data.chars = [];
	}
	player.allRooms[newLoc].data.chars.push(who);
	
	player.registerForRoomEvents();// now register for room events in new room
	eMaster('roomEnter', newLoc, who, { "lastRoom": oldLoc, "exitTaken": exitTaken }, client); // fire off roomEnter, notify everyone + us
	ut.saveObj(players, cons.MUD.playerFile, {getData: true}); // save to disk
	if (players[who].terseTravel) {
		outP += player.allRooms[newLoc].describeAs(player);
	} else {
		outP += player.allRooms[newLoc].describeAs(player);
	}
	return outP;
};
Player.prototype.isAtLeast = defaultPlayerAccessCheck;
Player.prototype.describeAs = defaultPlayerDescribeAs;
Player.prototype.longDescribeAs = defaultPlayerLongDescribeAs;
Player.prototype.attack = defaultAttack;
Player.prototype.on = defaultPlayerEventHandler;
Player.prototype.off = defaultPlayerEventKiller;
Player.prototype.getServer = function(client) {
	let who = this.id;
	let server = client.guilds.get(players[who].server);
	
	if (!server) {
		dBug(`Player.getServer() just failed for ${who}! SLJing them!`);
		this.sleep();
		return false;
	} else {
		return server;
	}
};
Player.prototype.registerForWorldTicks = function(client) {
	let player = this;
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
		
		// stamina restoration
		let staminaMultiplier = player.posture === "sitting" ? 2.5 : 1;
		let staminaRestored = player.stats.staminaPerTick * staminaMultiplier;
		player.stats.stamina.current = Math.min(player.stats.stamina.current + staminaRestored, player.stats.stamina.max);
		
		// hp restoration
		let hpMultiplier = player.posture === "sitting" ? 1.5 : 1;
		let hpRestored = player.stats.hpPerTick * hpMultiplier;
		player.stats.hp.current = Math.min(player.stats.hp.current + hpRestored, player.stats.hp.max);
		
		player.idle.ticks++;

		// --- TIMERS ---
		// later, probably want to not do all this extra work decrementing, etc.
		// and instead save last used tick and only calculate when they do command
		if (!player.timers) {
			player.timers = {};
		}
		
		// yell timer
		player.timers.yell = 0; // let 'em holla again
		
		// wizmob timer
		if (player.timers.wizmob) {
			player.timers.wizmob--;
		}
		
		// recall timer
		if (player.timers.recall) {
			player.timers.recall--;
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
	
	let player = this;
	this.on('gameEvent', (whoSaid, data, client) => {
		// UNTESTED!
		// whoSaid: possibly unused?
		// data: 
		//		whatSaid
		let who = player.id; // this is who registered
		//let server = client.guilds.get(players[who].server); // their server
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		let user = server.members.get(who); // their User object
		
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		user.send(data.whatSaid);
	});	
	this.on('roomSay', (whoSaid, whatSaid, client) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
		
		let who = player.id; // this is who registered
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		
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
	this.on('roomGet', (whoSaid, itemId, client) => {
		
		let who = player.id;
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		let user = server.members.get(who);
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = this.allItems[itemId].data.type;
		user.send(`**${whoStr}** picked up ${itemName}.`);
	});
	
	this.on('roomDrop', (whoSaid, itemId, client) => {
		let who = player.id;
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		let user = server.members.get(who);
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = this.allItems[itemId].data.type;
		user.send(`**${whoStr}** dropped ${itemName}.`);
	});
	this.on('roomCrush', (whoSaid, itemId, client) => {
		let who = player.id;
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		let user = server.members.get(who);
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		let whoStr;
		whoStr = (whoSaid === who) ? 'You hold' : players[whoSaid].charName + ' holds';
		let itemName = this.allItems[itemId].data.type;
		user.send(`**${whoStr}** ${itemName} in their hand and crushes it to dust!`);
	});
	this.on('roomExit', (whoSaid, data, client) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.

		let newRoom = data.newRoom;
		
		// TODO: 15
		let exitTaken = data.exitTaken || { "exitFlags": 15 };

		let who = player.id;
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		let user = server.members.get(who);
		let roomStr = this.allRooms[newRoom].data.title;
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		if (typeof whoSaid === 'string') {
			dBug(`Converted a string sent to ${who}.roomExit to object -- refactor the sender!`, 2);
			let senderPlayerId = whoSaid;
			whoSaid = {
				"sayFrom": players[senderPlayerId].charName,
			};
		}
		
		// new style roomExit, whoSaid can be things other than players
		let currentRoom = this.location;
		
		if (exitTaken) {
			//let exitFlags = this.allRooms[currentRoom][exitTaken].exitFlags;
			let exitFlags = exitTaken.exitFlags || 0;
			if (!(exitFlags & cons.EXIT_FLAGS.hideExit)) {
				// we are showing the exiting...
				if (exitFlags & cons.EXIT_FLAGS.hideDestination) {
					roomStr = 'somewhere';
				}	
				user.send(`**${whoSaid.sayFrom}** leaves towards ${roomStr}.`);
			}
		} else {
			user.send(`**${whoSaid.sayFrom}** leaves.`);
		}

	});
	this.on('roomEnter', (whoSaid, data, client) => {	
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
		
		let who = player.id; // this is who registered
		let lastRoom = data.lastRoom;
		let exitTaken = data.exitTaken || { "exitFlags": 15 };
		
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
		
		let user = server.members.get(who);
		let roomStr = this.allRooms[lastRoom].data.title;
		
		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}
		
		if (typeof whoSaid === 'string') {
			dBug(`Converted a string sent to ${who}.roomEnter to object -- refactor the sender!`, 2);
			let senderPlayerId = whoSaid;
			whoSaid = {
				"sayFrom": players[senderPlayerId].charName,
			};
		}

		// new style roomEnter, whoSaid can be things other than players
		//let exitFlags = this.allRooms[lastRoom].exitFlags;
		let exitFlags = exitTaken.exitFlags || 0;
		dBug(exitFlags);
		if (!(exitFlags & cons.EXIT_FLAGS.hideEnter)) {
			// we are showing the entering...
			if (exitFlags & cons.EXIT_FLAGS.hideOrigin) {
				roomStr = 'somewhere';
			}	
			user.send(`**${whoSaid.sayFrom}** enters from ${roomStr}.`);
		}
	});
	this.on('roomGeneric', (whoSaid, whatSaid, client) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.
			
		let who = player.id; // this is who registered
		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}
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
				let whoFrom = "";
				if (!whatSaid.noName) {
					whoFrom = players[whoSaid].charName + " ";
				}
				whoStr = (whoSaid === who) ? whatSaid.normal[0] : `${whoFrom}${whatSaid.normal[1]}`;
				user.send(whoStr);
			}
		}
	});
};
Player.prototype.registerForLoudRoomEvents = function() {	
	let pl = this;
	
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

module.exports = {
	Player: Player,
	players: players
};