const ut = require('./utils.js');
const cons = require('./constants.js');
//const craft = require('./craft.js');
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

	description += `\n**DEATH COUNTS:**\n`;
	for (let cause in this.stats.deaths) {
		description += `  _${cause}:_ ${this.stats.deaths[cause]}`;
	}

	return description;
};
const defaultAttack = function(target) {};
const defaultCraft = function(recipeData, itemTypes) {
	// recipeData should be an entire recipe record from recipes.json
	let result = { "success": false };
	let outP = "";

	let rarityStrings = cons.STRINGS.rarity;
	let recipe = recipeData.recipe;
	let quantity = recipeData.quantity || 1;
	let itemIdCreated = recipeData.id;
	let stored = this.allResources[this.id].stored;

	let notEnough;

	if (!stored) {
		outP += "You have no stored resources. Use `survey` to look for them, `claim` to claim some, and `gather` to gather them, after waiting a while.\n";
		notEnough = true;
	} else {
		outP += `Crafting: ${quantity} x **${itemIdCreated}**\n`;
		for (let resource in recipe) {
			for (let rarity in recipe[resource]) {
				let amountNeeded = recipe[resource][rarity];
				
				if (!stored[resource]) {
					stored[resource] = {};
				}
				
				let available = stored[resource][rarity] || 0;
				if (amountNeeded > available) {
					outP += `:warning: You need ${amountNeeded} x ${rarityStrings[rarity]} ${resource} to craft this.`;
					outP += ` You only have ${available} units stored.\n`;
					notEnough = true;
				} else {
					outP += `:white_check_mark: You have the ${amountNeeded} x ${rarityStrings[rarity]} ${resource} needed.`;
					outP += ` (${available} stored)\n`;
				}
			}
		}
	}

	if (notEnough) {
		outP += "_YOU DO NOT HAVE ENOUGH RESOURCES FOR THIS RECIPE_";
	} else {
		// craft it!

		// first do zone checks, etc.
		let iType = itemIdCreated;
		let idata = itemTypes[iType].data; // inherit stuff from itemTypes

		let currentZone = this.allRooms[this.location].data.zone;
		let itemZone = idata.zone;

		if ((itemZone !== currentZone) && (!idata.global)) {
			outP += `\nSorry, that item is a themed item from **${itemZone}.** `;
			outP += `You can only craft items for the current zone (**${currentZone}**), `;
			outP += ` or global items.`;
			result.outP = outP;
			return result;
		}

		// then, spend resources, if we're good:
		for (let resource in recipe) {
			for (let rarity in recipe[resource]) {
				let amountUsed = recipe[resource][rarity];
				stored[resource][rarity] -= amountUsed;
			}
		}

		// finally, we return the success
		result.success = true;
		result.quantity = quantity;
		result.itemIdCreated = itemIdCreated;
	}
	result.outP = outP;
	return result;
};
const dBug = function(str, level) {

	if (typeof level === "undefined") { level = 0; }

	if (typeof str === "object") {
		str = JSON.stringify(str);
	}

	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};
const defaultFlee = function(attacker, exitTaken, battles, client) {

	// exitTaken should be the exit object from a Room object

	let who = this.id;
	let player = this;

	let theMob = attacker;

	let fleeSuccessChance;
	if (theMob.data.easyFlee) {
		fleeSuccessChance = 1;
	} else {
		let fleeSkill = player.stats.fleeSkill || cons.COMBAT.defaultFleeSkill;
		let difficulty = theMob.data.fleeDifficulty;
		fleeSuccessChance = ut.calcFleeChance(fleeSkill, difficulty);
	}

	dBug(`fleeSuccessChance: ${fleeSuccessChance}`);

	if (Math.random() < fleeSuccessChance) {
		player.inBattle = false;
		theMob.inBattle = false;
		clearTimeout(battles[who].timer);
		delete battles[who];

		if (exitTaken) {
			let outP = player.go(exitTaken, client); // actually move the character
			player.sendMsg(outP, client);
			return true;
		} else {
			// no exit taken (disengaged in place, or undefined)
			return true;
		}
	} else {
		return false;
	}
};

const Player = function(data, allRooms, allItems, allResources, client) {
	this.allItems = allItems;
	this.allRooms = allRooms;
	this.client = client;
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
	this.stats.gather = this.stats.gather || {
		current: cons.DEFAULTS.gather.maxPts,
		max: cons.DEFAULTS.gather.maxPts
	};
	this.traits = data.traits || {
		lightSleeper: false
	};
	this.stats.unlockedTitles = this.stats.unlockedTitles || [1];
	this.stats.deaths = this.stats.deaths || {};
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
	this.inBattle = data.inBattle || false;
	this.weapon = data.weapon;

};
Player.prototype.getData = function() {
    let result = Object.assign({}, this);
    delete result.allRooms;
    delete result.allItems;
    delete result.allResources;
	delete result.client;
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
Player.prototype.zoneChange = function(oldZone, newZone, client) {

	items = this.allItems;

	let affectedItems = [];
	let affectedItemsStr = "";
	let affectedItemTypes = {};

	for (let itemId in this.inventory) {
		if (typeof items[itemId].zoneChange === "function") {
			affectedItems.push(itemId);
			affectedItemTypes[items[itemId].data.type] = affectedItemTypes[items[itemId].data.type] || 0;
			affectedItemTypes[items[itemId].data.type]++;
			affectedItemsStr += items[itemId].data.type + ", ";
			items[itemId].zoneChange(oldZone, newZone, client);
		}
	}

	if (affectedItems.length) {
		let affectedItemTypeArr = [];
		for (let itemId in affectedItemTypes) {
			if (affectedItemTypes[itemId] === 1) {
				affectedItemTypeArr.push(itemId);
			} else {
				affectedItemTypeArr.push(`${itemId} x${affectedItemTypes[itemId]}`);
			}
		}
		this.sendMsg(`The following ${affectedItems.length} item(s) ` +
		  `were affected by your zone change: ${affectedItemTypeArr.join(", ")}`, client);
	}

};
Player.prototype.zoneOf = function() {
	return this.allRooms[this.location].data.zone;
};
Player.prototype.isZoneAuthor = function() {
	// returns true if the player is an author of the zone they are standing in
	// returns false otherwise

	let zone = this.zoneOf();
	return this.isAuthorOf(zone);
};
Player.prototype.isAuthorOf = function(target) {
	// assumes target is a valid roomId!
	// (though it may not have a .zone property)

	let zone = target;
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

	if (!client) {
		client = this.client;
	}

	//let server = client.guilds.get(players[who].server); // their server

	if (player.posture === "asleep") {
		dBug(`Player.${who}.sendMsg(): Aborting! Player is logged out!`, 2);
		return false;
	}

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
		this.stats.gather.current = this.stats.gather.max;
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
Player.prototype.resShow = function() {
	let outP = "";

	// unripes & ripes
	let resTypes = ["unripes", "ripes"];
	resTypes.forEach((resType) => {

		if (!this.allResources[this.id]) {
			this.allResources[this.id] = {};
		}

		let resources = this.allResources[this.id][resType] || {};

		if (resType === "unripes") {
			outP += "**YOUR RESOURCES AND CLAIMS**";
			if (Object.keys(resources).length !== 0) {
				outP += "\nThe following resource claims are not yet ready to be `gather`ed from:";
			}
		} else {
			if (Object.keys(resources).length !== 0) {
				outP += "---\nYou can `gather` from the resources at these locations:";
			}
		}

		let roomCount = 0;
		for (let room in resources) {
			if (Object.keys(resources[room]).length !== 0) {
				roomCount++;
				outP += `\nAt **${room}**:\n`;
				for (let rType in resources[room]) {
					outP += `${rType} x${resources[room][rType]}\n`;
				}
			}
		}

		if (!roomCount) {
			outP += `\n(_nothing_)\n`;
		}

	});

	// stored
	outP += "---";
	outP += "\nThese are your stored resources:";
	let rarityStrings = cons.STRINGS.rarity;
	let stored = this.allResources[this.id].stored;
	for (let resource in stored) {
		outP += `\n **${resource}**:\n`
		for (let rarity in stored[resource]) {
			let amount = stored[resource][rarity];
			outP += `\`${amount} ${rarityStrings[rarity]}\`  `;
		}
	}

	return outP;

}
Player.prototype.resGather = function() {
	// gather all ripe resources in current room if possible
	// will modify resources global as appropriate and save to disk
	// returns a string with the results

	let outP = "";
	if (!this.allResources[this.id]) {
		dBug(`${this.id}.resHarvest(): No resources.${this.id}!`, 1);
		outP += " You have nothing here to gather.";
		return outP;
	}

	let ripes = this.allResources[this.id].ripes || {};
	let resData = this.allRooms[this.location].data.resources; // is check necessary?
	let roomId = this.location;

	if (!ripes[roomId]) {
		outP += " You have nothing here to gather.";
		return outP;
	}

	outP += `**GATHERING FROM ROOM ${this.allRooms[roomId].data.title}**\n`;

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
				outP += "             " + m.padStart(10, " ") + "       ";
				for (let rarity in resultTable[res].materials[m]) {
					if (resultTable[res].materials[m].hasOwnProperty(rarity)) {
						outP += `${resultTable[res].materials[m][rarity]}       `.padStart(11, " ");

						this.allResources[this.id].stored = this.allResources[this.id].stored  || {};
						this.allResources[this.id].stored[m] = this.allResources[this.id].stored[m] || {};
						this.allResources[this.id].stored[m][rarity] = this.allResources[this.id].stored[m][rarity] || 0;

						this.grantMaterial(m, rarity, resultTable[res].materials[m][rarity]);

						//this.allResources[this.id].stored[m][rarity] += resultTable[res].materials[m][rarity];
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

	// save the updated objects
	ut.saveObj(this.allResources, cons.MUD.resourceFile);
	ut.saveObj(players, cons.MUD.playerFile, {getData: true});

	return outP;
};
Player.prototype.grantMaterial = function(material, rarity, amount) {
	this.allResources = this.allResources || {};
	this.allResources[this.id] = this.allResources[this.id] || {};
	this.allResources[this.id].stored = this.allResources[this.id].stored  || {};
	this.allResources[this.id].stored[material] = this.allResources[this.id].stored[material] || {};
	this.allResources[this.id].stored[material][rarity] = this.allResources[this.id].stored[material][rarity] || 0;

	this.allResources[this.id].stored[material][rarity] += amount;
};
Player.prototype.go = function(exitTaken, client) {

	// needs to be refactored and call player.moveTo()
	// currently, where player.unregisterForRoomEvents() is called makes this annoying

	// exitTaken is an .exit object from a Room object

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

	// actually move us
	player.location = newLoc;
	// remove from old room chars[], add to new
	let ind = player.allRooms[oldLoc].data.chars.indexOf(who);
	player.allRooms[oldLoc].data.chars.splice(ind, 1);
	if (!player.allRooms[newLoc].data.chars) {
		dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
		player.allRooms[newLoc].data.chars = [];
	}
	player.allRooms[newLoc].data.chars.push(who);

	// handle possible zoneChange
	let oldZone = player.allRooms[oldLoc].data.zone;
	let newZone = player.allRooms[newLoc].data.zone;

	if (oldZone !== newZone) {
		player.zoneChange(oldZone, newZone, client);
	}

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
Player.prototype.moveTo = function(destination, callback, client) {

	// first, unregister for events in this room
	// ... TODO: Send off roomExit message, so that player.go() can use .moveTo()
	// remove from old room chars[], add to new
	// handle possible zoneChange
	// run callback? (TODO)
	// set .location
	// register for events

	let player = this;
	let who = player.id;

	let oldLoc = '' + player.location; // hang onto old location
	let newLoc = destination;

	if (!this.allRooms[destination]) {
		dBug(`Player.${this.id}.moveTo(${destination}): Nonexistent room!`);
		return false;
	}
	this.unregisterForRoomEvents();

	// remove from old room chars[], add to new
	let ind = player.allRooms[oldLoc].data.chars.indexOf(who);
	player.allRooms[oldLoc].data.chars.splice(ind, 1);
	if (!player.allRooms[newLoc].data.chars) {
		dBug('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
		player.allRooms[newLoc].data.chars = [];
	}
	player.allRooms[newLoc].data.chars.push(who);


	// handle possible zoneChange
	let oldZone = player.allRooms[oldLoc].data.zone;
	let newZone = player.allRooms[newLoc].data.zone;

	if (oldZone !== newZone) {
		dBug(`ZONE CHANGE: ${player.charName}: ${oldZone} -> ${newZone}`);

		player.zoneChange(oldZone, newZone, client);
	}

	this.location = destination;
	this.registerForRoomEvents();
};
Player.prototype.die = function(cause, battles, client) {
	// TODO: Handle cause as a Mob object
	// X set player location to respawn room (airport hotel)
	// X let them know what happened
	// X disengage the mob(s) from battle / destroy battle object thing
	// X penalize them
		// 10% of XP penalty
		// if we had gold, have them lose it (?)
		// eventually, have them drop all their items where they died
	// X Start them off with: 1 HP, 1 Stamina
	// X Increment player death stat

	let outP = "";

	dBug(`${this.id} just died from: ${cause} in ${this.location}!`);

	this.moveTo("airport hotel", null, client);
	let xpPenalty = Math.floor(this.stats.xp * cons.DEATH_XP_PENALTY);

	outP += `** YOU HAVE DIED ** as a result of **${cause}**!\n\n`;
	outP += `** ${cons.DEATH_XP_PENALTY * 100}% of your XP has been lost (lost ${xpPenalty} XP)**`;

	this.stats.xp -= xpPenalty;
	this.stats.hp.current = 1;
	this.stats.stamina.current = 1;

	this.stats.deaths = this.stats.deaths || {};
	this.stats.deaths[cause] = this.stats.deaths[cause] || 0;
	this.stats.deaths[cause]++;

	let floor = Math.floor(Math.random() * 700) + 300;

	let respawnString = ut.listPick([
		`The elevator whirrls as it comes down from the ${floor} floor. ${this.charName} pops out of the elevator!`,
		`The elevator makes a deafening roar from the ${floor} floor, ${this.charName} walks out, somewhat confused.`,
		`VROOOOOMMMMM, the elevator dashes from the ${floor} floor, ${this.charName} stumbles out.`,
		`The hotel elevator doors open, and ${this.charName} stumbles out, angrily muttering something about ${cause}.`
	]);
	this.sendMsg(outP, client);
	eMaster('roomGeneric', this.location, {"sayFrom": ""}, respawnString, client);
};
Player.prototype.isAtLeast = defaultPlayerAccessCheck;
Player.prototype.describeAs = defaultPlayerDescribeAs;
Player.prototype.longDescribeAs = defaultPlayerLongDescribeAs;
Player.prototype.attack = defaultAttack;
Player.prototype.craft = defaultCraft;
Player.prototype.flee = defaultFlee;
Player.prototype.on = defaultPlayerEventHandler;
Player.prototype.off = defaultPlayerEventKiller;
Player.prototype.unwield = function(client) {
	this.allItems[this.weapon].unwield(this, client);
};
Player.prototype.wield = function(item, client) {

	// first see if there's something to unwield, and do that
	if (this.weapon) {
		this.allItems[this.weapon].unwield(this, client);
	}

	item.equip(this, client);
};
Player.prototype.getServer = function(client) {
	let who = this.id;

	if (!client) {
		client = this.client;
		dBug("Pulled client from Player in Player.getServer()");
	}

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
			dBug(`Converted a string sent to ${who}.roomExit to object -- refactor the sender!`, 0);
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
		let lastRoomId = data.lastRoom;
		let exitTaken = data.exitTaken || { "exitFlags": 15 };

		//let server = client.guilds.get(players[who].server);
		let server = this.getServer(client);
		if (!server) {
			return false;
		}

		let user = server.members.get(who);
		let roomStr = this.allRooms[lastRoomId].data.title;

		if (!user) {
			dBug(`server.members.get(${who}) is undefined! SLJing ${who}!`, 1);
			player.sleep();
			return false;
		}

		if (typeof whoSaid === 'string') {
			dBug(`Converted a string sent to ${who}.roomEnter to object -- refactor the sender!`, 0);
			let senderPlayerId = whoSaid;
			whoSaid = {
				"sayFrom": players[senderPlayerId].charName,
			};
		}

		// new style roomEnter, whoSaid can be things other than players
		//let exitFlags = this.allRooms[lastRoomId].exitFlags;
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
