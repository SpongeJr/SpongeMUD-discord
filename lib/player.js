const ut = require('./utils.js');
const common = require('./common.js');
const client = ut.getClient();
const Discord = ut.getDiscord();
const cons = require('./constants.js');
//const craft = require('./craft.js');
let zoneList = require('../../data/spongemud/zones.json');
let players = require('../' + cons.DATA_DIR + cons.MUD.playerFile);
common.setGlobal("players", players);
let titleList = cons.TITLE_LIST;
let postureStr = cons.POSTURE_STRINGS;
const eMasterModule = require('./events.js');
const eMaster = eMasterModule.eMaster;

let defaultPlayerEventKiller = function(eventName) {

	let id = this.id;

	if (eventName === 'worldTick') {
		if (typeof eMaster.listens[eventName].players === 'undefined') {
			dBug('No eMaster.listens.worldTick.players!', 3);
			return false;
		}

		if (typeof eMaster.listens[eventName].players[id] === 'undefined') {
			dBug(`Tried to kill nonexistent ${eventName} event with id ${id}`, 3);
			return false;
		}
		delete eMaster.listens[eventName].players[id];
	} else {

		let roomId = this.location;

		if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
			//dBug(`Tried to kill a ${eventName} in ${roomId} that did not have those.`, 3);
			return false;
		}

		if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
			dBug(`Tried to kill nonexistent ${eventName} event with id ${id} in ${roomId}`, 3);
			return false;
		}
		delete eMaster.listens[eventName][roomId][id];
	}
};
let defaultPlayerEventHandler = function(eventName, callback) {

	let pId = this.id;

	if (eventName === 'worldTick') {
		dBug(pId + ' registered for worldTick', 1);
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
		str = JSON.stringify(str); // be careful with circular references here!
	}

	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};
const defaultFlee = function(attacker, exitTaken, battles) {

	// exitTaken should be the exit object from a Room object

	let who = this.id;
	let player = this;

	let theOpponent = attacker;
	let fleeSuccessChance;
	if (theOpponent.entityType === cons.ENTITIES.player) {
		// Player
		fleeSuccessChance = cons.COMBAT.defaultFleeSkill || 0.5;
	} else {
		// Mob
		if (theOpponent.data.easyFlee) {
			fleeSuccessChance = 1;
		} else {
			let fleeSkill = player.stats.fleeSkill || cons.COMBAT.defaultFleeSkill;
			let difficulty = theOpponent.data.fleeDifficulty;
			fleeSuccessChance = common.calcFleeChance(fleeSkill, difficulty);
		}
	}

	dBug(`fleeSuccessChance: ${fleeSuccessChance}`, 1);

	if (Math.random() < fleeSuccessChance) {
		player.inBattle = false;
		theOpponent.inBattle = false;
		clearTimeout(battles[who].timer);
		delete battles[who];

		if (exitTaken) {
			let outP = player.go(exitTaken); // actually move the character
			player.sendMsg(outP);
			return true;
		} else {
			// no exit taken (disengaged in place, or undefined)
			return true;
		}
	} else {
		return false;
	}
};

const Player = function(data, allRooms, allItems, allResources) {
	this.entityType = cons.ENTITIES.player;
	this.allItems = allItems;
	this.allRooms = allRooms;
	this.allResources = allResources;
	this.location = data.location || cons.START_ROOM;

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
	this.friends = data.friends || []; // array of ids
};
Player.prototype.getFriends = function() {
	return this.friends.map(id => players[id].charName);
};
Player.prototype.hasFriend = function(charName) {
	let id = common.findChar(charName); // ? brb still not sure here TODO
	return this.friends.find(fid => fid === id);
};
Player.prototype.getData = function() {
    let result = Object.assign({}, this);
    delete result.allRooms;
    delete result.allItems;
    delete result.allResources;
    return result;
};
Player.prototype.getBadges = function() {

	let badges = [];
	let committees = this.stats.committees;

	// wizard+ check:
	if (this.isAtLeast('wizard')) {
		badges.push("<:wizard:555118327547166720>");
	}

	// if they've voted on DBL, give them this one:
	if (this.stats.dblVotes > 0) {
		badges.push(":ballot_box_with_check:");
	}

	// handle committees:
	if (Array.isArray(committees)) {
		committees.forEach((committee) => {
			if (cons.COMMITTEES.hasOwnProperty(committee)) {
				badges.push(cons.COMMITTEES[committee].emoji);
			}
		});
	}
	return badges;
};
Player.prototype.privacyFlag = function(flagName) {
	let flag = cons.PRIVACY_FLAGS[flagName];

	if (typeof flag === 'undefined') {
		dBug(`${this.charName}.privacyFlag(): Tried to check invalid flag "${flagName}", 4`);
		return;
	}

	let flagIsSet = ((this.privacyFlags & cons.PRIVACY_FLAGS[flagName]) === cons.PRIVACY_FLAGS[flagName]);
	return flagIsSet;
};
Player.prototype.getServerRepped = function() {
	let theServer;
	//let pFlags = this.privacyFlags;
	let noShowServer = true;
	let serverCfg = ut.getServerCfg(this.server);

	// first check server options for opt-in to fame system
	// if no options or opt-in found, default to NOT showing
	if (serverCfg) {
		if (serverCfg.options) {
			if (serverCfg.options.useFame) { noShowServer = false; }
		}
	}
	// check their privacy flag next
	if (this.privacyFlag("noShowServer")) { noShowServer = true; }

	if (this.isRepping && !noShowServer) {
		let serverId = this.server;
		let server = client.guilds.cache.get(serverId) || {name: "UNKNOWN SERVER"};
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
Player.prototype.zoneChange = function(oldZone, newZone) {

	let items = this.allItems;

	let affectedItems = [];
	let affectedItemTypes = {};
	let outP = "";

	for (let itemId in this.inventory) {
		if (typeof items[itemId].zoneChange === "function") {
			let itemType = items[itemId].data.type;
			let mentionIt = items[itemId].zoneChange(oldZone, newZone);

			if (mentionIt) {
				affectedItems.push(itemId);
				affectedItemTypes[itemType] = affectedItemTypes[itemType] || 0;
				affectedItemTypes[itemType]++;
			}
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
		outP += `The following ${affectedItems.length} item(s) ` +
		  `were affected by your zone change: ${affectedItemTypeArr.join(", ")}\n`;
	}

	outP += "\n";
	if (zoneList[oldZone]) {
		outP += `Leaving zone: **${oldZone}**  `;
	}

	if (zoneList[newZone]) {
		outP += `Entering zone: **${newZone}**\n`;
		if (zoneList[newZone].hasPvpRooms) {
			outP += `\n:warning: WARNING! You have entered a zone with some rooms ` +
			  `that have Player-vs-Player (PvP) options enabled!`
		}
	} else {
		dBug(`${this.id} just walked into unknown zone ${newZone}!`, 2);
	}

	if (outP !== "") {
		this.sendMsg(outP);
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
			dBug(`room ${this.location} has non-existent zone ${zone}!`, 3);
			return false;
		}
	}
};
Player.prototype.unlockTitle = function(titleNum) {
	if (this.stats.unlockedTitles.indexOf(titleNum) !== -1) {
		dBug(`${this.id}.unlockTitle(${titleNum}): Already had it.`, 1);
		return false;
	} else {
		this.stats.unlockedTitles.push(titleNum);
		dBug(`${this.id}.stats.unlockedTitles is now: ${this.stats.unlockedTitles}`, 1);
		return true;
	}
};
Player.prototype.award = function(amt, stat) {
	if (typeof this.stats[stat] === 'undefined') {
		this.stats[stat] = 0;
	}

	this.stats[stat] += amt;
	dBug(`AWARDED:  ${amt} ${stat} to ${this.charName}`, 2);
};
Player.prototype.weighMe = function() {
	let totalWeight = 0;
	for (let itemId in this.inventory) {
		totalWeight += this.allItems[itemId].data.weight || 2;
	}
	return totalWeight;
};
Player.prototype.sendMsg = function(msg) {
	let who = this.id;
	if (this.posture === "asleep") {
		dBug(`Player.${who}.sendMsg(): Aborting! Player is logged out!`, 2);
		return false;
	}
	let user = this.getUser();
	if (!user) {
		return false;
	}
	user.send(msg);
};
Player.prototype.sendFile = function(fname) {
	// NO CHECKING AT ALL BE CAREFUL
	// PREPENDS + cons.DATA_DIR
	let user = this.getUser();
	if (!user) {
		return false;
	}
	//let now = new Date().valueOf();
	let attach = new Discord.Attachment(cons.DATA_DIR + fname, fname);
	user.send('Your file, as requested:', attach);
};
Player.prototype.sendJSON = function(obj, fname) {
	// obj needs to be safe to JSON.stringify
	// fname is just a string for what we call the file given to user
	let user = this.getUser(); // their User object
	let buff = Buffer.from(JSON.stringify(obj));
	let attach = new Discord.Attachment(buff, fname);
	user.send('Your file, as requested:', attach);
};
Player.prototype.isWearing = function(iType) {
	// check the player to see if they've equipped an item of iType
	// currently, there is no equipping of items, so just check inv
	for (let item in this.inventory) {
		if (this.inventory[item] === iType) { return true; }
	}
	return false;
};
Player.prototype.whereIs = common.defaultWhereIs;
Player.prototype.resPlant = function() {
	if (this.allResources[this.id]) {
		let claims = this.allResources[this.id].claims;

		for (let roomId in claims) {
			// for each room where they have claims...
			for (let rType in claims[roomId]) {
				dBug(`planting ${rType} in ${roomId} for ${this.id}`, 1);
				// for each rType, add it to unripes
				// init objects if needed:
				this.allResources[this.id].unripes = this.allResources[this.id].unripes || {};
				this.allResources[this.id].unripes[roomId] = this.allResources[this.id].unripes[roomId] || {};
				this.allResources[this.id].unripes[roomId][rType] = this.allResources[this.id].unripes[roomId][rType] || 0;

				// add to unripes
				this.allResources[this.id].unripes[roomId][rType] += claims[roomId][rType];

				// and remove from claims
				delete claims[roomId][rType];
			}
		}
	}
};
Player.prototype.resRipen = function() {
	if (this.allResources[this.id]) {
		let unripes = this.allResources[this.id].unripes;

		for (let roomId in unripes) {
			// for each room where they have unripes...
			for (let rType in unripes[roomId]) {
				dBug(`ripening ${rType} in ${roomId} for ${this.id}`, 1);
				// for each rType, add it to ripes
				// init objects if needed:
				this.allResources[this.id].ripes = this.allResources[this.id].ripes || {};
				this.allResources[this.id].ripes[roomId] = this.allResources[this.id].ripes[roomId] || {};
				this.allResources[this.id].ripes[roomId][rType] = this.allResources[this.id].ripes[roomId][rType] || 0;

				// add to ripes
				this.allResources[this.id].ripes[roomId][rType] += unripes[roomId][rType];

				// and remove from unripes
				delete unripes[roomId][rType];
			}
		}
	}
};
Player.prototype.resShow = function() {
	let outP = "";

	// unripes & ripes
	let resTypes = ["claims", "unripes", "ripes"];
	resTypes.forEach((resType) => {

		if (!this.allResources[this.id]) {
			this.allResources[this.id] = {};
		}

		let resources = this.allResources[this.id][resType] || {};

		if (resType === "claims") {
			outP += "**YOUR RESOURCES AND CLAIMS**\n";
			outP += "You have the following claims that will start to mature at sunrise:\n";
		} else 	if (resType === "unripes") {
			outP += "---\nThese resource claims are still maturing, and not ready to be gathered from:\n";
		} else {
			outP += "---\nYou can `gather` from the resources at these locations:\n";
		}

		let roomCount = 0;
		let roomStr = "";
		let zoneStr = "";
		for (let roomId in resources) {
			if (Object.keys(resources[roomId]).length !== 0) {
				roomCount++;

				let room = this.allRooms[roomId];
				if (!room) {
					dBug(`${this.id} had resource claims in invalid room ${roomId}!`, 2);
				} else {
					roomStr = room.data.title;
					zoneStr = room.data.zone;
				}
				outP += `\nAt **${roomStr}** `;
				if (zoneStr) {
					outP += `(zone: ${zoneStr})`;
				}
				outP += ": ";
				for (let rType in resources[roomId]) {
					outP += `\`${rType} x${resources[roomId][rType]}\` `;
				}
			}
		}

		if (!roomCount) {
			outP += "_(nothing)_";
		}
		outP += "\n"

	});

	// stored
	outP += "---\nThese are your stored resources:";
	let rarityStrings = cons.STRINGS.rarity;
	let stored = this.allResources[this.id].stored;
	for (let resource in stored) {
		outP += `\n **${resource}**:\n`
		for (let rarity in stored[resource]) {
			let amount = stored[resource][rarity];
			outP += `\`${amount} ${rarityStrings[rarity]}\`  `;
		}
	}
	outP += `\n**Free gather points**: ${this.stats.gather.current} `;
	return outP;
};
Player.prototype.resGather = function() {
	// gather all ripe resources in current room if possible
	// will modify resources global as appropriate and save to disk
	// returns a string with the results

	let outP = "";
	if (!this.allResources[this.id]) {
		dBug(`${this.id}.resHarvest(): No resources.${this.id}!`, 3);
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

	let totalCount = 0; // used to restore gather points
	for (let rType in ripes[roomId]) {
		// for each rType, run gatherMany(n), add to .stored and remove from ripes
		let count = ripes[roomId][rType];
		totalCount += count;
		let resultTable = common.gatherMany(count, resData[rType]);
		//dBug(resultTable);

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

	// restore gathering points
	this.stats.gather.current = Math.min(this.stats.gather.max, this.stats.gather.current + totalCount);

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
Player.prototype.go = function(exitTaken) {
	// needs to be refactored and call this.moveTo()
	// currently, where this.unregisterForRoomEvents() is called makes this annoying
	// exitTaken is an .exit object from a Room object

	let pLoc = this.location;
	let who = this.id;
	let outP = '';
	let newLoc = exitTaken.goesto;

	if (!newLoc) {
		dBug(`Player.go(): ${who} tried to take ${exitTaken.exName} to ${newLoc}! Aborted!`, 3);
		return `You tried to take ${exitTaken.exName} to invalid room ${newLoc}! Please report this bug!`;
	}

	let moveCost = this.stats.moveCost + this.weighMe();
	if (this.stats.stamina.current < moveCost) {
		return "You need more stamina to move. Try sitting to restore it more quickly.";
	}

	this.unregisterForRoomEvents(); // first, unregister for events in this room
	eMaster('roomExit', pLoc, who, { "newRoom": newLoc, "exitTaken": exitTaken }); // fire off roomExit, notify everyone but us
	let oldLoc = '' + pLoc; // hang onto old location

	this.stats.stamina.current -= moveCost; // handle stamina

	this.location = newLoc; // actually move us

	// remove from old room chars[], add to new
	let ind = this.allRooms[oldLoc].data.chars.indexOf(who);
	this.allRooms[oldLoc].data.chars.splice(ind, 1);
	if (!this.allRooms[newLoc].data.chars) {
		dBug('no `.data.chars` on room ' + newLoc + '! Resetting to []!', 3);
		this.allRooms[newLoc].data.chars = [];
	}
	this.allRooms[newLoc].data.chars.push(who);

	// handle possible zoneChange
	let oldZone = this.allRooms[oldLoc].data.zone;
	let newZone = this.allRooms[newLoc].data.zone;

	if (oldZone !== newZone) {
		this.zoneChange(oldZone, newZone);
	}

	this.registerForRoomEvents();// now register for room events in new room
	eMaster('roomEnter', newLoc, who, { "lastRoom": oldLoc, "exitTaken": exitTaken }); // fire off roomEnter, notify everyone + us
	ut.saveObj(players, cons.MUD.playerFile, {getData: true}); // save to disk
	if (players[who].terseTravel) {
		outP += this.allRooms[newLoc].describeAs(this);
	} else {
		outP += this.allRooms[newLoc].describeAs(this);
	}
	return outP;
};
Player.prototype.moveTo = function(destination, callback) {

	// first, unregister for events in this room
	// ... TODO: Send off roomExit message, so that this.go() can use .moveTo()
	// remove from old room chars[], add to new
	// handle possible zoneChange
	// run callback? (TODO)
	// set .location
	// register for events
	let who = this.id;

	let oldLoc = '' + this.location; // hang onto old location
	let newLoc = destination;

	if (!this.allRooms[destination]) {
		dBug(`Player.${this.id}.moveTo(${destination}): Nonexistent room!`, 3);
		return false;
	}
	this.unregisterForRoomEvents();

	// remove from old room chars[], add to new
	let ind = this.allRooms[oldLoc].data.chars.indexOf(who);
	this.allRooms[oldLoc].data.chars.splice(ind, 1);
	if (!this.allRooms[newLoc].data.chars) {
		dBug('no `.data.chars` on room ' + newLoc + '! Resetting to []!', 3);
		this.allRooms[newLoc].data.chars = [];
	}
	this.allRooms[newLoc].data.chars.push(who);


	// handle possible zoneChange
	let oldZone = this.allRooms[oldLoc].data.zone;
	let newZone = this.allRooms[newLoc].data.zone;

	if (oldZone !== newZone) {
		dBug(`ZONE CHANGE: ${this.charName}: ${oldZone} -> ${newZone}`);
		this.zoneChange(oldZone, newZone);
	}

	this.location = destination;
	this.registerForRoomEvents();
};
Player.prototype.die = function(cause, battles) {
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
	let causeString = "";
	if (typeof cause === 'string') {
		causeString = cause;
	} else if (cause.entityType === cons.ENTITIES.player) {
		//let player = cause;
		causeString += cause.charName;

		if (!battles[this.inBattle]) {
			dBug(`Weird! ${cause.id} killed ${this.id} outside of battle?`, 3);
		}
		//
		cause.sendMsg(outP);
	} else if (cause.entityType === cons.ENTITIES.mob) {
		//let mob = cause;
		causeString += cause.data.type;
		// update mob stats?

		if (!battles[this.inBattle]) {
			dBug(`Weird! A ${cause.data.type} killed ${this.id} outside of battle?`, 1);
		}
		// we send a message now to the room!
	}

	dBug(`${this.id} just died from: ${causeString} in ${this.location}!`, 2);

	this.moveTo("airport hotel", null);
	let xpPenalty = Math.floor(this.stats.xp * cons.DEATH_XP_PENALTY);

	outP += `** YOU HAVE DIED ** as a result of **${causeString}**!\n\n`;
	outP += `** ${cons.DEATH_XP_PENALTY * 100}% of your XP has been lost (lost ${xpPenalty} XP)**`;

	this.stats.xp -= xpPenalty;
	this.stats.hp.current = 1;
	this.stats.stamina.current = 1;

	this.stats.deaths = this.stats.deaths || {};
	this.stats.deaths[causeString] = this.stats.deaths[causeString] || 0;
	this.stats.deaths[causeString]++;

	let floor = Math.floor(Math.random() * 700) + 300;
	let floor2 = Math.floor(Math.random() * 700) + 300;
	while (floor2 === floor) floor2 = Math.floor(Math.random() * 700) + 300;
	let floor3 = Math.floor(Math.random() * 700) + 300;
	while (floor3 === floor || floor3 === floor2) floor3 = Math.floor(Math.random() * 700) + 300;
	let respawnString = ut.listPick([
		`The elevator whirrls as it comes down from the ${floor} floor. ${this.charName} pops out of the elevator!`,
		`The elevator makes a deafening roar from the ${floor} floor, ${this.charName} walks out, somewhat confused.`,
		`VROOOOOMMMMM, the elevator dashes from the ${floor} floor, ${this.charName} stumbles out.`,
		`The hotel elevator doors open, and ${this.charName} stumbles out, angrily muttering something about ${causeString}.`,
		`The elevator comes from floor ${floor}+${floor2}i. Wait, floor ${floor}+${floor2}i? You hear the elevator come from a direction you never knew existed at this hotel. ${this.charName} phases out of the elevator. "My, the electricity here looks weird."`,
		`The elevator door shakes and deforms as the dial shows random numbers. ${floor}, ${floor2}, ${floor3}. It comes back to normal and out comes ${this.charName}, strangely unfazed.`,
		`The elevator door opens. No carriage? Suddenly, a carriage zooms past. Whoops. It oscillates back and forth, stabilising into the correct floor. When the bouncing ends, ${this.charName} walks out of the elevator.`,
		`The elevator information panel says "WARNING: CABLE SNAP". You definitely heard a loud snapping sound, or did you? A screech comes as the elevator friction breaks engage, becoming louder and louder as the elevator reaches the correct floor. The doors open and out come ${this.charName}! The elevator goes back to working as usual, strangely.`,
		`The elevator. What elevator? You suddenly found that the door disappeared. The buttons, the elevator control panel too, the whole thing. Even the hotel staff do not know that there was once an elevator. A green portal appears when you thought the elevator once was (it's not a orange or blue portal, because of copyright issues). It leads to another hotel reception like this one. The elevator comes from floor ${Math.floor(2+Math.random()*8)}, and out comes ${this.charName}. You quickly beckon them to come to the portal and it closes as they jump through. The portal turns into an elevator.`,
		`The elevator maintenance guy comes in. They override and open the elevator doors. Out comes ${this.charName}. They weren't stuck for long, I hope!`,
		`A DeLorean crashes out of the elevator. Out comes ${this.charName}. The DeLorean fades and the elevator fades back to normal.`,
		`The elevator pixellises. The pixels fall to the floor revealing a backdoor. The backdoor opens to reveal ${this.charName}. "I guess someone found an exploit..." The backdoor pixellises. The pixels fall to the floor revealing an elevator. The elevator... does not open.`,
		`The elevator warps in size, growing bigger and smaller. You see the doors open and ${this.charName} gets bigger and smaller as well. When it stabilises, ${this.charName} walks out. "Should have tossed some gold in while you could."`,
		`The elevator opens normally. At last, it opens normally. Nobody's there but an empty carriage. Out from the shaft climbs ${this.charName}.`,
		`The elevator buttons open. Have you ever seen the elevator buttons open? No? The hole widens and ${this.charName} walks out! The hole grows back to the original size and the elevator buttons close.`,
		`The elevator information panel turns off and starts unscrewing itself. ${this.charName} climbs out of it and places the elevator information panel back. The screws twist into place, as if it never happened.`,
		`The elevator door opens. No carriage? ${this.charName} climbs out of the shaft via a ladder.`,
		`The elevator opens normally. At last it opens normally. There's a door on the other side. Wait, that's just the elevator mirror. No... ${this.charName} walks past the mirrored door, out of the mirror out of the regular door. The elevator closes and resumes its mystical service.`,
		`The elevator. What elevator? That's not an elevator, that's a escalator! ${this.charName} drifts down the escalator from floor ${floor}. Finally, the elevator comes back down the escalator and slots back into place.`,
		`"That elevated quickly!" "Oof" The elevator stops ascending and opens to the current floor, bumping ${this.charName} on the ceiling. Fortunately, that elevator cabin was made of cushions. Out walks ${this.charName}. "I really don't want to try this elevator again."`,
		`The elevator music sounds familiar. It's a bunch of broken chords played somewhere familiar. Was it Live Coding With Sponge? Or Live Sponging With Code? No idea. The elevator slows down (finally!) to a stop and out walks ${this.charName}. There's a recording studio in there too. I guess that's why there's elevator music.`,
		`The elevator maintenance guy comes in. "I know this is a weird elevator, it does weird stuff." The elevator was not there. They flip the wall over. That's there where elevator was hiding. Coming from floor ${floor}, ${this.charName} steps out of the elevator.`,
		`The elevator maintenance guy comes in. "They are calling me in too frequently!" "I quit!" The elevator opens normally and lets ${this.charName} out.`,
		`The elevator maintenance guy comes in. They try to insert the override key, but the keyhole moves around everywhere. Finally they catch the keyhole. The key is swallowed by the keyhole and the doors open to reveal ${this.charName}. "That's why I have ${Math.floor(30+Math.random()*70)} duplicate keys!"`,
		`The elevator override keyhole opens up and ${this.charName} walks out. "That was a weird cave..."`,
		`The elevator. Strange things. ${this.charName}. "Did someone get lazy while writing the descriptions?"`,
		`Floor ${floor}. I think there was a ${causeString} on that floor. ${this.charName} runs out of the elevator. "I don't want to go back there..."`,
		`The meta elevator. Legend has it coming from the meta-airport. It opens and you find another elevator. The regular elevator. ${this.charName} comes from floor ${floor} of ${causeString}.`,
		`The elevator goes deeper, goes back up, goes deeper, goes back up, goes deeper, goes back up... and then opens. ${this.charName} walks out, a bit shaken.`
	]);
	this.sendMsg(outP);
	eMaster('roomGeneric', this.location, {"sayFrom": ""}, respawnString);
};
Player.prototype.isAtLeast = defaultPlayerAccessCheck;
Player.prototype.describeAs = defaultPlayerDescribeAs;
Player.prototype.longDescribeAs = defaultPlayerLongDescribeAs;
Player.prototype.attack = defaultAttack;
Player.prototype.craft = defaultCraft;
Player.prototype.flee = defaultFlee;
Player.prototype.on = defaultPlayerEventHandler;
Player.prototype.off = defaultPlayerEventKiller;
Player.prototype.unwield = function() {
	this.allItems[this.weapon].unwield(this);
};
Player.prototype.wield = function(item) {

	// first see if there's something to unwield, and do that
	if (this.weapon) {
		this.allItems[this.weapon].unwield(this);
	}

	item.equip(this);
};
Player.prototype.getServer = function() {
	let who = this.id;
	let server = client.guilds.cache.get(players[who].server);
	if (!server) {
		dBug(`Player.getServer() just failed for ${who}, hence they shall sleep.`, 2);
		this.sleep();
		return false;
	}
	return server;
};
Player.prototype.getServerCfg = function() {
	let server = this.getServer();
	if (!server) return false;
	return ut.getServerCfg(server);
};
Player.prototype.getUser = function() {
	let who = this.id;
	let server = this.getServer();
	if (!server) return false;
	let user = server.members.cache.get(who); // their User object
	if (!user) {
		dBug(`server.members.cache.get(${who}) is undefined, hence they shall sleep.`, 2);
		this.sleep();
		return false;
	}
	return user;
};
Player.prototype.registerForWorldTicks = function() {
	this.on('worldTick', () => {
		this.age++;

		if (!this.stats.dayTicks) {
			this.stats.dayTicks = 0;
		}
		this.stats.dayTicks++;

		// temporary? bootstrap the xp stat
		if (!this.stats.xp) {
			this.stats.xp = 1;
		}

		// idle timeout stuff
		if (!this.idle) {
			this.idle = {
				ticks: 0,
				threshhold: 45,
				autolog: true,
				warn: true
			};
			dBug(`created .idle for players.${this.id}.`, 2);
		}

		// stamina restoration
		let staminaMultiplier = this.posture === "sitting" ? cons.DEFAULTS.stamina.bonuses.sitMultiplier : 1;
		let staminaRestored = this.stats.staminaPerTick * staminaMultiplier;
		this.stats.stamina.current = Math.min(this.stats.stamina.current + staminaRestored, this.stats.stamina.max);

		// hp restoration
		let hpMultiplier = this.posture === "sitting" ? cons.DEFAULTS.hp.bonuses.sitMultiplier : 1;
		let hpRestored = this.stats.hpPerTick * hpMultiplier;
		this.stats.hp.current = Math.min(this.stats.hp.current + hpRestored, this.stats.hp.max);

		this.idle.ticks++;

		// --- TIMERS ---
		// later, probably want to not do all this extra work decrementing, etc.
		// and instead save last used tick and only calculate when they do command
		if (!this.timers) {
			this.timers = {};
		}

		// yell timer
		this.timers.yell = 0; // let 'em holla again

		// wizmob timer
		if (this.timers.wizmob) {
			this.timers.wizmob--;
		}

		// recall timer
		if (this.timers.recall) {
			this.timers.recall--;
		}

		if (this.idle.ticks > this.idle.threshhold) {
			// TODO: "warning" them a couple ticks early
			if (this.idle.autolog) {
				this.sleep(); // Zzz
				// we can fire off a "X snores" because they should be unregistered now
				let phrase = ut.listPick(["drifts off to sleep", "closes their eyes and immediately starts snoring",
					"falls asleep", "nods off to sleep", "falls into a deep slumber"]);
				eMaster('roomGeneric', this.location, {"sayFrom": this.charName}, phrase);
				dBug(`[ IDLE TIMEOUT ] Just forced ${this.charName} to .sleep() (>${this.idle.threshhold} ticks)`, 1);
			}
		}
	});
};
Player.prototype.registerForAreaTicks = function() {
	// TODO
};
Player.prototype.registerForRoomEvents = function() {
	// also registers for "gameEvent" events, which we don't use yet
	this.on('gameEvent', (whoSaid, data) => {
		// UNTESTED!
		// whoSaid: possibly unused?
		// data:
		//		whatSaid
		let who = this.id; // this is who registered
		let user = this.getUser();
		if (user) {
			user.send(data.whatSaid);
		}
	});
	this.on('roomSay', (whoSaid, whatSaid) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event

		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.

		let who = this.id; // this is who registered
		let user = this.getUser();
		if (!user) {
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
	this.on('roomGet', (whoSaid, itemId) => {
		let who = this.id;
		let user = this.getUser();
		if (!user) {
			return false;
		}

		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = this.allItems[itemId].data.type;
		user.send(`**${whoStr}** picked up ${itemName}.`);
	});

	this.on('roomDrop', (whoSaid, itemId) => {
		let who = this.id;
		let user = this.getUser();
		if (!user) {
			return false;
		}

		let whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		let itemName = this.allItems[itemId].data.type;
		user.send(`**${whoStr}** dropped ${itemName}.`);
	});
	this.on('roomCrush', (whoSaid, itemId) => {
		let who = this.id;
		let user = this.getUser();
		if (!user) {
			return false;
		}

		let whoStr, pronounStr, actionStr;
		whoStr = (whoSaid === who) ? '**You** hold' : `**${players[whoSaid].charName}** holds`;
		pronounStr = (whoSaid === who) ? 'your' : 'their';
		actionStr = (whoSaid === who) ? 'crush' : 'crushes';
		let itemName = this.allItems[itemId].data.type;
		user.send(`${whoStr} ${itemName} in ${pronounStr} hand and ${actionStr} it to dust!`);
	});
	this.on('roomExit', (whoSaid, data) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event
		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.

		let newRoom = data.newRoom;

		// TODO: 15
		let exitTaken = data.exitTaken || { "exitFlags": 15 };

		let who = this.id;
		let user = this.getUser();
		let roomStr = this.allRooms[newRoom].data.title;
		if (!user) {
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
		let movementFlavor = data.movementFlavor || "leaves";
		if (exitTaken) {
			//let exitFlags = this.allRooms[currentRoom][exitTaken].exitFlags;
			let exitFlags = exitTaken.exitFlags || 0;
			if (!(exitFlags & cons.EXIT_FLAGS.hideExit)) {
				// we are showing the exiting...
				if (exitFlags & cons.EXIT_FLAGS.hideDestination) {
					roomStr = 'somewhere';
				}
				user.send(`**${whoSaid.sayFrom}** ${movementFlavor} towards ${roomStr}.`);
			}
		} else {
			user.send(`**${whoSaid.sayFrom}** ${movementFlavor}.`);
		}

	});
	this.on('roomEnter', (whoSaid, data) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event

		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.

		let who = this.id; // this is who registered
		let movementFlavor = data.movementFlavor || "enters";
		let lastRoomId = data.lastRoom;
		let exitTaken = data.exitTaken || { "exitFlags": 15 };
		let user = this.getUser();
		let roomStr = this.allRooms[lastRoomId].data.title;

		if (!user) {
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
			user.send(`**${whoSaid.sayFrom}** ${movementFlavor} from ${roomStr}.`);
		}
	});
	this.on('roomGeneric', (whoSaid, whatSaid) => {
		// if whoSaid is a string, we do old-style stuff. For sit, stand, me, etc.
		//		this is for when players are the cause of the event

		// if whoSaid is an object, something other than a player triggered this roomGeneric
		//		use for messages that you need to come from objects, rooms, the void, etc.

		let who = this.id; // this is who registered
		let user = this.getUser();
		if (!user) {
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
	// loud room events just wake people up for now
	this.on('roomLoud', (whoSaid, whatSaid) => {
		this.posture = 'sitting';

		this.registerForRoomEvents();
		this.registerForWorldTicks();
		eMaster('roomGeneric', this.location, {"sayFrom": this.charName}, 'is disturbed and wakes up!');
		this.unregisterForLoudRoomEvents();
		this.idle.ticks = 0; // they're "not idle" again starting now, someone disturbed them
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
