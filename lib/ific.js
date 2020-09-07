const ut = require('../lib/utils.js');
const common = require('../lib/common.js');
const cons = require('../lib/constants.js');
const CONFIG = require('../../../' + cons.CFGFILE);
const convotrees = require('../../data/spongemud/convotrees.json');
//-----------------------------------------------------------------------------
const modulePath = "../lib/";
const modules = {};
const moduleList = {
	"player": "player.js",
	"eMaster": "events.js",
	"mail": "mail.js",
	"craft": "craft.js"
};
const client = ut.getClient();
//-----------------------------------------------------------------------------
const dBug = function(str, level) {

	if (typeof level === "undefined") { level = 0; }

	if (typeof str === "object") {
		str = JSON.stringify(str);
	}

	if (level >= cons.DEBUG_LEVEL) {
		console.log(`${cons.DEBUG_LEVEL_STRINGS[level]} ${str}`);
	}
};
//-----------------------------------------------------------------------------
dBug("\n>> LOADING MODULES...", 2);
for (let moduleName in moduleList) {
	modules[moduleName] = require(modulePath + moduleList[moduleName]);
	dBug(`>> LOADED MODULE: "${moduleName}" from: ${modulePath + moduleList[moduleName]}`, 2);
}
dBug(">> MODULE LOADING COMPLETE!\n", 2);
//-----------------------------------------------------------------------------
const players = modules.player.players;
const Player = modules.player.Player;
const eMaster = modules.eMaster.eMaster;
const mail = modules.mail;
const getMail = mail.getMail;
const craft = modules.craft;
const drops = require('../' + cons.DATA_DIR + cons.MUD.droptableFile);

// TODO: refactor into constants.js, move a level deeper into cons.time.*
cons.RECALL_RESET_TICKS = cons.TICKS_IN_DAY;
cons.TICKS_IN_DAY = cons.TICKS_PER_HOUR * cons.HOURS_IN_DAY; // default 240
//-----------------------------------------------------------------------------
const handleDblUpvote = function(vote) {
	let who = vote.user;
	let player = players[who];
	if (!player) {
		dBug(`handleDblUpvote(): got a vote from ${vote.user}, but no player record found. No reward.`, 1);
	} else {
		let voterTitleNum = 18;
		let upvoteMessage = "";
		upvoteMessage += ":information_source: **SpongeMUD System Message:**: Thanks for voting for SpongeMUD on top.gg!";
		player.unlockTitle(voterTitleNum);
		player.stats.dblVotes = player.stats.dblVotes || 0;
		player.stats.dblVotes++;
		upvoteMessage += `\nYou've voted at least ${player.stats.dblVotes} time(s)!`;
		upvoteMessage += "\nI've unlocked the following rewards for you, if they weren't already: ";
		upvoteMessage += "'the Voter' `title`, and one `profile` badge.";
		player.sendMsg(upvoteMessage);
		dBug(`handleDblUpvote(): got a vote from ${vote.user}, rewarding ${player.charName}! (${player.stats.dblVotes} total)`, 1);
	}
};
//-----------------------------------------------------------------------------
const advanceConvo = function(treeId, convoState, theMob, pl) {
	// basically "executes this branch":
	// returns what needs output to channel
	// and sets the new convo state on player record if needed
	let outStr = "";
	let branch = convotrees[treeId].states[convoState];
	if (branch) {
		// handle .say
		let whatToSay = branch.say;
		if (whatToSay) {
			outStr += `${theMob.data.type} tells you, "${whatToSay}"\n`;
		}

		// handle .choices
		let choices = branch.choices;
		if (Array.isArray(choices)) {
			outStr += `\n\`CONVERSATION WITH ${theMob.data.type}\``;
			for (let i = 0; i < choices.length; i++) {
				outStr += `\n\`pick ${i + 1}\`: "${choices[i].text}"`;
			}
		}

		// handle .gosay -- branch + continue
		if (branch.gosay) {
			convoState = branch.gosay;
			outStr += advanceConvo(treeId, convoState, theMob, pl);
		}

		// handle .goto: branch w/out "continue", just update state
		if (branch.goto) {
			convoState = branch.goto;
		}

		pl.convoStates[treeId] = convoState;
		pl.lastConvo.treeId = treeId;
		pl.lastConvo.mobId = theMob.id;

		return outStr;
	} else {
		dBug(`Mob ${theMob.id} wanted to have a conversation but couldn't find state ${convoState} in convo tree ${treeId}`, 3);
		return `They seem oddly distracted. (Please report this bug: "${theMob.id} had no state ${convoState} in convo tree ${treeId}")`;
	}
};
//-----------------------------------------------------------------------------
const buildPicklist = function(itemList, matchStr) {
	// theItems = bunch of objects of type Item, Mob, Exit, Character, etc., I guess
	// matchStr = string to match against
	let pickList = {};
	let where;

	if (!matchStr) {
		return [];
	}

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
				dBug(`buildPickList(): Non-existent player ${pId}!`, 3);
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
		shortNames.forEach(name => {
			if (name.startsWith(matchStr)) {
				pickList[where].push({
					type: itemList[where][mobId],
					ids: [mobId]
				});
			}
		});
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

const rooms = require('../' + cons.DATA_DIR + cons.MUD.roomFile);
const items = {};
const mobs = {};
const itemTypes = require('../' + cons.DATA_DIR + cons.MUD.itemFile);
const zoneList = require('../' + cons.DATA_DIR + cons.MUD.zoneFile);
const mobTypes = require('../' + cons.DATA_DIR + cons.MUD.mobFile);
const MUDnews = require('../' + cons.DATA_DIR + cons.MUD.newsFile);
const resources = require('../' + cons.DATA_DIR + cons.MUD.resourceFile);
const minigames = {
	trollChef: require('../lib/minigames/trollchef.js')
};

let noWiz = false;
const timers = {};

const titleList = cons.TITLE_LIST;
const dreamStrings = {
	'inv': 'You dream about the things you own...\n',
	'go': 'You toss and turn in your sleep.\n',
	'get': 'You dream of acquiring new things...\n',
	'drop': 'Your hand twitches in your sleep.\n',
	'say': 'You mumble incomprehensibly in your sleep.\n',
	'attack': 'You dream of glorious battle!\n',
	'edroom': 'You dream of having godlike powers of creation!\n',
	'profile': 'You dream about morphing into other forms!\n',
	'tele': 'You float high above the world in your dreams...\n',
	'mail': 'You dream about flocks of pigeons.',
	'write': 'You see words in your dreams, but are unable to read them.',
	'money': 'You dream of loot and riches!'
};
const findChar = function(nick, room) {
	// can now be found in common.js
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

const cantDo = function(who, action, data) {
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
			let next = common.mudTime(player.timers[action]);
			let doAgain = common.timeDiffStr(next);
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
				return "You need to `stand` up before moving.";
			}
			break;
		case 'flee':
			if (!player.inBattle) {
				return "What exactly are you fleeing from? You're not in battle!";
			}
			break;
		case 'attack':
			if (player.posture === 'sitting') {
				return "You can't attack from a sitting position!";
			}
			break;
		case 'sit':
			if (player.inBattle) {
				return "No rest for the weary! You're in battle, sitting would be suicide!";
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
				outStr = `Hey you can only wizard up mobs every ${cons.WIZARD_MOB_LIMIT} ticks!`;
				outStr += `You have to wait ${player.timers.wizmob} ticks yet.`;
				return outStr;
			}

			if (!player.isZoneAuthor(rooms) && !player.isWearing('The Omniring')) {
				outStr = "Sorry Wizard, you can only `wizmob` in a zone you author unless you have The Omniring.";
				return outStr;
			}
			break;
		case 'wizitem':
			if (!player.isZoneAuthor(rooms) && !player.isWearing('The Omniring')) {
				outStr = "Sorry Wizard, you can't wizitem outside your zone without The Omniring."
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
					player.sendMsg(outStr); // -client don't return, this is a pass!
				}
			}
			break;
		default:
			// do nothing, continue on to return false
	}

	return false; // all checks passed, they can do this thing
};
//-----------------------------------------------------------------------------
const defaultDecay = function() {

	this.data.decay.endurance -= this.data.decay.amount;

	if (this.data.decay.endurance <= 0) {

		// Fire off some events -- notify eMaster
		eMaster('roomGeneric', this.data.location, {"sayFrom": this.data.type}, 'crumbles away!');

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
let defaultUse = function(who, loc) {
	let player = players[who];
	let phrase = `uses ${this.data.type}`;

	let script = this.data.effects;
	if (script) {
		parseScript(script, {"who": player.id, "room": loc});
		if (!this.data.hidden) {
			// don't fire off event if item is hidden
			eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase);
		}
	} else {
		player.sendMsg("Nothing happens.");
	}

	if (this.data.oneUse) {
		delete player.inventory[this.id];
	}
};
const defaultFoodUse = function(who, loc) {
	let player = players[who];
	let phrase = `consumes ${this.data.type}`;

	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase);
	}

	let script = this.data.effects;

	if (script) {
		parseScript(script, {"who": player.id});
	} else {
		player.sendMsg("You consumed some food and feel less hungry. Too bad hunger isn't a stat in this game.");
	}

	delete player.inventory[this.id];
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile, {getData: true});
};
const defaultEquip = function(player) {
	//let player = players[who];
	let weapon = player.weapon;
	player.weapon = this.id;
	let sayFrom = player.charName;
	let phrase = `equips ${this.data.type}`;
	eMaster('roomGeneric', player.location, {"sayFrom": sayFrom}, phrase);
};
const defaultGet = function(who) {
	this.unregisterForWorldTicks();
	this.freshen(); // reset endurance
	players[who].inventory[this.id] = this.data.type;
	delete rooms[players[who].location].data.items[this.id];
	this.data.location = who;
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile, {getData: true});
	eMaster('roomGet', players[who].location, who, this.id);
};
const defaultUnwield = function(actor) {
	// we are going to assume actor is a Player object for now
	// later, we should do something more here to let this be more general purpose
	// so that mobs can unwield, etc.

	delete actor.weapon;
	let sayFrom = actor.charName; // obv. won't work with mobs
	let phrase = `unwields ${this.data.type}`;
	eMaster('roomGeneric', actor.location, {"sayFrom": sayFrom}, phrase);
};
const defaultDrop = function(who, where) {

	player = players[who];

	rooms[where].data.items[this.id] = this.data.type;
	this.data.location = where;
	delete players[who].inventory[this.id];
	// if it's being wielded, unwield
	if (player.weapon === this.id) {
		player.unwield();
	}

	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile, {getData: true});


	// fire off event even if item is hidden for now
	eMaster('roomDrop', where, who, this.id);

	// register for worldTick events
	this.registerForWorldTicks();
};
const defaultCrush = function(who, where) {

	player = players[who];

	// if it's being wielded, unwield
	if (player.weapon === this.id) {
		player.unwield();
	}

	delete players[who].inventory[this.id];

	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile, {getData: true});

	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomCrush', where, who, this.id);
	}
};
const getExitArray = function(exits, viewAs) {
	let exitsArr = [];
	for (let exName in exits) {
		exits[exName].exName = exName;

		if (exits[exName].hidden) {
			if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
				exitsArr.push(exits[exName]);
			}
		} else {
				exitsArr.push(exits[exName]);
		}
	}
	return exitsArr;
};
const getExitText = function(options) {

	options = options || {};
	let viewAs = options.viewAs;

	let exitText = '';
	let exitCounter = 0;
	// Build exits text
	if (this.data.hasOwnProperty('exits')) {
		exitText += '\n-=-=-=-\nObvious exits: ';

		let exits = getExitArray(this.data.exits, viewAs);

		let exName;
		for (let exNum = 0; exNum < exits.length; exNum++) {
			exName = exits[exNum].exName;
			exitCounter++;
			if (options.numbered) {
				exitText += '\n';
				exitText += `${exitCounter}. \`${exName}\``;
			} else {
				exitText += `\`${exName}\``;
			}

			if (exits[exNum].hidden) {
				exitText += "(h)";
			}

			exitText += '  ';
		}
		return exitText;
	} else {
		return false;
	}
};
const defaultRoomDescribe = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	let id = this.data.id;

	let outStr = `-=-=  **SP:** ${viewAs.stats.stamina.current}/${viewAs.stats.stamina.max}`;
	outStr += `  **HP:** ${viewAs.stats.hp.current}/${viewAs.stats.hp.max}`;
	outStr += `  **XP:** ${viewAs.stats.xp} `;
	if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
		outStr += `  \`dayTicks: ${viewAs.stats.dayTicks}\``;
	}
	outStr += '  =-=-\n';
	outStr += `**${this.data.title}**`;

	if (viewAs.isAtLeast('wizard')) {
		// wizards see IDs also
		outStr += ' "`' + id + '`"';
	}

	if (this.data.menus) {
		outStr += ' (_menu available_ - type `menu` to see)';
	}

	outStr += '\n\n' + this.data.description;

	let exitText = this.getExitText({"viewAs": viewAs});
	if (!exitText) {
		dBug(`SpongeMUD: Room \`${id}\` missing exits!`, 3);
	} else {
		outStr += exitText;
	}

	// Build items text
	if (this.data.hasOwnProperty('items')) {
		let count = 0;
		let itemStr = '';
		for (let itemId in this.data.items) {
			let theItem = items[itemId];

			if (!theItem) {
				dBug(`items.${itemId} was a non-existent item!`, 3)
			} else if (!theItem.describeAs) {
				dBug(`${itemId} had no describeAs()`, 3);
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

		let opponent = mobs[mobId].inBattle;
		if (opponent) {
			outStr += `, fighting **${players[opponent].charName}**!`; // TODO: Refactor for Mob-Mob combat
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
const defaultRoomShortDesc = function(viewAs) {
	// builds a standard "room description string" and returns it
	// it is described as viewed through the eyes of the viewAs passed in
	// viewAs should be a Player object!

	// currently refactoring to put that stuff into .describeAs(viewAs) methods!
	//		I think I'm pretty much there now ^

	let id = this.data.id;

	let outStr = `-=-=  SP: ${viewAs.stats.stamina.current}/${viewAs.stats.stamina.max}`;
	outStr += `   XP: ${viewAs.stats.xp} `;
	if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
		outStr += `  \`dayTicks: ${viewAs.stats.dayTicks}\``;
	}
	outStr += '  =-=-\n';
	outStr += `**${this.data.title}**`;

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
		dBug('SpongeMUD: Room `${id}` missing exits!', 3);
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
const createScript = function(command, args) {
	dBug(`createScript(): args is: ${args}, 1`);
    return command + " " + args.map(
		(x) => {
			if (typeof x === "number") {
				x = x.toString();
				// Sponge added this 21 Mar 2020, prevents e.g. crash on hp loss
				// ( grant hp -35 was passing up a Number, no .replace() method)
			}
			return '"' + x.replace(/"/g, '""') + '"';
		}
	).join(" ");
};
const parseCommand = function(str) {
    let tokens = str.split(/("[^"]*"|[^"\s]+)/);
    let processed = [];
    let cur = "";
    for (let i=0; i<tokens.length; i++) {
        if (tokens[i].length > 0 && tokens[i] === " ".repeat(tokens[i].length)) {
            if (cur) processed.push(cur); cur = "";
        } else {
            cur += tokens[i];
        }
    }
    if (cur) processed.push(cur);
    return processed.map(x => x[0]==='"'?x.slice(1, -1).replace(/""/g, "\""):x);
};
/**
TODO: ADD RETURN VALUE
{
	"success": true/false,
	"reason": "",
	"data": {
		"createdObjects": [],
		"affectedObjects": []
	}
}
*/
const parseScript = function(script, data) {
	/*
		returns: {
			created: {
			mob: [], item: [], ...
		}
	}
	*/
	// so far, the only return is for created mobs
	// TODO: add more returns.created

	let returns = {};

	//parseScript(triggers[phrase], {"who": whoSaid});
	let who = data.who;
	let room = data.room || (data.isMob ? mobs[who].data.location : players[who].location);
	let outP = '';

	if (typeof script === 'string') {
		dBug('parseScript: [DEPRECATED] Parsing legacy MEHScript string -- pass an array of script lines (strings) instead!', 2);
		script = [script];
	}

	for (let lineNum = 0; lineNum < script.length; lineNum++) {
		let scriptLine = script[lineNum];
		let rest = parseCommand(scriptLine);
		let action = rest[0];
		rest = rest.slice(1); // snip action

		let fail;
		let player;
		switch (action) {
			case 'grant':
				// if this is a mob, don't allow "grant"
				if (data.isMob) {
					dBug("parseScript(): I won't grant mobs anything.", 2);
					break;
				}
				let whatToGrant = rest[0];//rest.split(' ')[0];
				fail = cantDo(who, 'grant');
				if (fail) {
					// ut.chSend(message, fail); // no message here
					return;
				}
				player = players[who];
				if (whatToGrant === 'title') {
					let titleNum = parseInt(rest[1], 10);//parseInt(rest.replace('title ', ''), 10);
					let success = players[who].unlockTitle(titleNum);
					if (success) {
						outP += `** TITLE UNLOCKED! ** You have unlocked title: "${titleList[titleNum]}!"`;
						outP += `\n  (to change titles or view avaiable titles, use the \`title\` command)`;
						player.sendMsg(outP);
					}
				} else if (whatToGrant === 'stat') {
					//rest = rest.replace('stat ', '');
					let statName = rest[1];//rest.split(' ')[0];
					let amt = parseInt(rest[2], 10) || 0;//parseInt(rest.split(' ')[1], 10) || 0;
					let modifier = rest[3];//rest.split(' ')[2];
					overflow = (modifier === 'overflow');

					if (!player.stats.hasOwnProperty(statName)) {
						dBug(`MEHScript error on line ${lineNum}): Invalid player stat "${statName}"!\n${scriptLine}`, 3);
					} else {

						if (overflow) {
							player.stats[statName].current += amt;
						} else {
							player.stats[statName].current += amt;
							//player.stats[statName].current.constrain(0, player.stats[statName].max);
							player.stats[statName].current = Math.min(player.stats[statName].current, player.stats[statName].max);
							player.stats[statName].current = Math.max(player.stats[statName].current, 0);
						}

						dBug(`parseScript(): Changed ${player.charName}'s ${statName} by ${amt} to ${player.stats[statName].current}`, 1);

						player.sendMsg(`**${statName}**: ${player.stats[statName].current}`);

					}
				} else if (whatToGrant === 'material') {
					//rest = rest.replace('material ', '');
					//rest = rest.split(' ');
					let material = rest[1];//rest[0];
					let rarity = rest[2];//rest[1];
					let amount = parseInt(rest[3], 10);//parseInt(rest[2], 10);

					let legit = true;

					if (!material) {
						dBug(`MEHScript error on line ${lineNum}): No material specified.\n${scriptLine}`, 3);
						legit = false;
					}

					if (!rarity) {
						dBug(`MEHScript error on line ${lineNum}): No rarity specified.\n${scriptLine}`, 3);
						legit = false;
					}

					if (!amount) {
						dBug(`MEHScript error on line ${lineNum}): Invalid material amount.\n${scriptLine}`, 3);
						legit = false;
					}

					if (legit) {

						dBug(`granting ${amount} ${rarity} ${material}...`, 1);

						player.grantMaterial(material, rarity, amount);
						ut.saveObj(resources, cons.MUD.resourceFile);
					}
				} else if (whatToGrant === 'currency') {
					let currencyZone = rest[1];
					let amount = parseInt(rest[2], 10);
					let currencyType = rest[3];

					let legit = true;

					if (!currencyZone) {
						dBug(`MEHScript error on line ${lineNum}): No currencyZone specified.\n${scriptLine}`, 3);
						legit = false;
					}

					if (!amount) {
						dBug(`MEHScript error on line ${lineNum}): Invalid currency amount to grant.\n${scriptLine}`, 3);
						legit = false;
					}

					if (!currencyType) {
						dBug(`MEHScript error on line ${lineNum}): No currencyType specified.\n${scriptLine}`, 3);
						legit = false;
					}

					if (legit) {
						dBug(`granting ${amount} ${currencyType} (${currencyZone})...`, 1);

						player.grantCurrency(currencyZone, amount, currencyType);
						ut.saveObj(resources, cons.MUD.resourceFile);
					}
				} else if (whatToGrant === 'item') {
					//rest = rest.replace('item ', '');
					let iType = rest[1];//rest.split('"')[1];

					if (!itemTypes.hasOwnProperty(iType)) {
						dBug(`MEHScript error on line ${lineNum}): Tried to grant invalid item "${iType}"!\n${scriptLine}`, 3);
					} else {
						let idata = itemTypes[iType].data; // inherit stuff from itemTypes

						let theItem;
						if (idata.family === "weapon") {
							theItem = new Weapon(iType, {
								"hidden": idata.hidden,
								"shortName": idata.shortName,
								"shortNames": idata.shortNames,
								"description": idata.description,
								"decay": idata.decay,
								"location": who,
								"effects": idata.effects,
								"oneUse": idata.oneUse,
								"zone": idata.zone,
								"global": idata.global
							});
						} else if (idata.family === "prop") {
							theItem = new SceneryItem(iType, {
								"hidden": idata.hidden,
								"shortName": idata.shortName,
								"shortNames": idata.shortNames,
								"description": idata.description,
								"decay": idata.decay,
								"location": who,
								"zone": idata.zone,
								"global": idata.global
							});
						} else {
							theItem = new Item(iType, {
								"hidden": idata.hidden,
								"shortName": idata.shortName,
								"shortNames": idata.shortNames,
								"description": idata.description,
								"decay": idata.decay,
								"location": who,
								"family": idata.family,
								"effects": idata.effects,
								"oneUse": idata.oneUse,
								"zone": idata.zone,
								"global": idata.global
							});
						}
						items[theItem.id] = theItem;
					}
				} else {
					dBug(`MEHScript error on line ${lineNum}: Can't grant ${whatToGrant}!`, 3);
				}
			break;
			case 'tele':
				let target = rest[0];//rest;
				if (data.isMob) {
					dBug("parseScript(): I don't yet know how to tele mobs.", 2);
					break;
				}
				fail = cantDo(who, 'tele', {"location": target, "by": "room"});
				if (fail) {
					dBug("FAILED TO TELE!");
					// ut.chSend(message, fail); // no message here
					return;
				}
				// TODO: Replace with Player.teleport()  (and make that a thing)
				player = players[who];
				let pLoc = player.location;
				outP += 'Your surroundings fade away and you find yourself elsewhere!';

				player.sendMsg(outP);

				player.unregisterForRoomEvents(); // first, unregister for events in this room
				//let newLoc = target; // set our target room

				let newLoc = target;

				eMaster('roomExit', pLoc, who, {"newRoom": newLoc}); // fire off roomExit, notify everyone but us
				let oldLoc = '' + pLoc; // hang onto old location
				player.location = newLoc; // actually move us

				// remove from old room chars[], add to new
				let ind = rooms[oldLoc].data.chars.indexOf(who);
				rooms[oldLoc].data.chars.splice(ind, 1);

				if (!rooms[newLoc]) {
					dBug(`parseScript(): tele: rooms.${newLoc} is undefined! Aborting MEHScript!`, 3);
					return;
				}

				if (!rooms[newLoc].data.chars) {
					dBug('no `.data.chars` on room ' + newLoc + '! Resetting to []!', 3);
					rooms[newLoc].data.chars = [];
				}
				rooms[newLoc].data.chars.push(who);

				player.registerForRoomEvents();// now register for room events in new room
				eMaster('roomEnter', newLoc, who, { "lastRoom": oldLoc }); // fire off roomEnter, notify everyone + us
				ut.saveObj(players, cons.MUD.playerFile, {getData: true}); // save to disk
			break;
			case 'message':
				if (data.isMob) {
					dBug("parseScript(): No sense messaging a mob.", 2);
					break;
				}
				let msg = rest[0]//rest;
				player = players[who];

				if (!player) {
					dBug(`parseScript(): Tried to message undefined player!`, 4);
				} else {
					player.sendMsg(msg);
				}
			break;
			case 'sendmail':
				// sendmail "fromString" "toPlayerId" "subject here" body of the mail here
				// UPDATE, DISREGARD THOSE, you only need to quote things with spaces and quotation marks (replace with 2 quotation marks)
				// // (fromString, toPlayerId, subject must be in quotes, body should not be)
				// // (fromString and subject may not contain quotes)
				//let quotesArr = rest.split('"');
				let fromString = rest[0];//quotesArr[1];
				let toPlayerId = rest[1];//quotesArr[3];
				let subject = rest[2];//quotesArr[5];
				let contents = rest[3];//quotesArr.slice(6);

				dBug('parseScript(): sendmail details: ', 1);
				dBug(`fromString ${fromString}  toPlayerId: ${toPlayerId}  subject: ${subject}\nbody:\n${contents}, 1`);

				if (!players[toPlayerId]) {
					dBug("parseScript(): sendmail FAILED to player ID ${toPlayerId}!", 4);
				} else {
					mail.sendMail(
						{ "from": fromString },
						{ "to": players[toPlayerId] },
						{
							"subject": subject,
							"contents": contents
						},
						world.time.tickCount
					);
				}
			break;
			case 'summon':
				let whatToSummon = rest[0];//rest.split(' ')[0];
				if (whatToSummon === 'item') {
					//rest = rest.replace('item ', '');
					dBug(`parsescript(): summon item: rest is ${rest}`);
					let iType = rest[1];//rest.split('"')[1];
					let amount = rest[2];//rest.split('"')[2].trim();
					if (amount === "") {
						amount = 1;  // default
					} else {
						amount = parseInt(amount, 10);
					}
					if (!itemTypes.hasOwnProperty(iType)) {
						dBug(`MEHScript error on line ${lineNum}): Tried to grant invalid item "${iType}"!\n${scriptLine}`, 3);
					} else {
						let idata = itemTypes[iType].data; // inherit stuff from itemTypes
						let theItem;
						for (let i=0;i<amount;i++) {
							if (idata.family === "weapon") {
								theItem = new Weapon(iType, {
									"hidden": idata.hidden,
									"shortName": idata.shortName,
									"shortNames": idata.shortNames,
									"description": idata.description,
									"decay": idata.decay,
									"location": room,
									"effects": idata.effects,
									"oneUse": idata.oneUse,
									"zone": idata.zone,
									"global": idata.global
								});
							} else if (idata.family === "prop") {
								theItem = new SceneryItem(iType, {
									"hidden": idata.hidden,
									"shortName": idata.shortName,
									"shortNames": idata.shortNames,
									"description": idata.description,
									"decay": idata.decay,
									"location": room,
									"zone": idata.zone,
									"global": idata.global
								});
							} else {
								theItem = new Item(iType, {
									"hidden": idata.hidden,
									"shortName": idata.shortName,
									"shortNames": idata.shortNames,
									"description": idata.description,
									"decay": idata.decay,
									"location": room,
									"family": idata.family,
									"effects": idata.effects,
									"oneUse": idata.oneUse,
									"zone": idata.zone,
									"global": idata.global
								});
							}
							items[theItem.id] = theItem;
						}
					}
				} else if (whatToSummon === 'mob') {
					let theMob;
					let mType = rest[1];//rest.split('"')[1];
					let amount = rest[2];//rest.split('"')[2].trim();
					amount = parseInt(amount, 10) || 1; // note: no summoning 0 mobs
					dBug(`Yo, summoning ${amount} ${mType}(s) in ${room}`, 1);
					for (let i = 0; i < amount; i++) {
						let mdata = mobTypes[mType].data;
						theMob = new Mob(mType, {
							"hidden": mdata.hidden,
							"shortName": mdata.shortName,
							"shortNames": mdata.shortNames,
							"description": mdata.description,
							"location": room,
							"speak": mdata.speak,
							"movementFlavor": mdata.movementFlavor,
							"movementFlavorFrom": mdata.movementFlavorFrom,
							"movementFlavorTowards": mdata.movementFlavorTowards,
							"genericaction": mdata.genericaction,
							"move": mdata.move,
							"decay": mdata.decay,
							"family": mdata.family,
							"xp": mdata.xp,
							"maxHp": mdata.maxHp,
							"hp": mdata.maxHp,
							"source": this.id,
							"isEssential": mdata.isEssential,
							"attack": mdata.attack,
							"defense": mdata.defense,
							"absorb": mdata.absorb,
							"fleeDifficulty": mdata.fleeDifficulty,
							"allowsFleeWithoutDirection": mdata.allowsFleeWithoutDirection,
							"easyFlee": mdata.easyFlee,
							"zone": mdata.zone,
							"drops": mdata.drops,
							"convotree": mdata.convotree
						});
						// theMob.registerForWorldTicks(); // handled by constructor
						// mobs[theMob.id] = theMob; // handled by constructor
						dBug(`Okay, I did it, it has the ID: ${theMob.id}`, 1);
						//dBug(mobs[theMob.id]);
						returns.created = returns.created || {};
						returns.created.mob = returns.created.mob || [];
						returns.created.mob.push(theMob);
					}
				}
			break;
			default: {
				dBug(`MEHScript parse error on line ${lineNum}: ${scriptLine}`, 4);
			}
		}
	}
	return returns;
};

const defaultRoomEventMaker = function(eventType) {
	let handlers = {
		roomSay: () => {
			let triggers = this.data.on.roomSay;
			for (let phrase in triggers) {
				if (phrase !== 'ELSE') {
					this.on('roomSay', (whoSaid, whatSaid) => {
						if (whatSaid.toLowerCase() === phrase.toLowerCase()) {
							parseScript(triggers[phrase], {"who": whoSaid});
						}
					});
				} else {
					// this is for ELSE
				}
			}
		},
		roomEnter: () => {
			let script = this.data.on.roomEnter;
			this.on('roomEnter', (who, lastRoom) => {
				if (typeof who !== "string") {
					dBug(`Not handling roomEnter event for non-player in ${this.data.id}.`);
				} else {
					parseScript(script, {"who": who});
				}
			});
		}
	};

	if (handlers.hasOwnProperty(eventType)) {
		handlers[eventType]();
	} else {
		dBug(`defaultRoomEventMaker: Tried to make an event handler for unknown event type ${eventType}!`, 3);
	}

};
const defaultRoomEventKiller = function(eventName, id) {

	let roomId = this.data.id;

	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		//dBug(`Tried to kill a ${eventName} in ${roomId} that did not have those.`, 1);
		return false;
	}

	if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
		dBug(`Tried to kill nonexistent ${eventName} event with id ${id} in ${roomId}`, 3);
		return false;
	}
	dBug(`I just killed a listener: ${eventName}.${roomId}.${id}`);
	delete eMaster.listens[eventName][roomId][id];
};
const defaultRoomEventHandler = function(eventName, callback) {

	let roomId = this.data.id;

	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		eMaster.listens[eventName][roomId] = {};
	}

	eMaster.listens[eventName][roomId][roomId] = {
		"callback": callback
	};
};

const defaultItemEventHandler = function(eventName, callback) {

	let id = this.id;

	if (eventName === 'worldTick') {
		if (typeof eMaster.listens[eventName].items === 'undefined') {
			eMaster.listens[eventName].items = {};
		}
		eMaster.listens[eventName].items[id] = {
			"callback": callback
		};
	} else {
		dBug(`Unknown event ${eventName} triggered on ${id}`, 3);
	}
};
const defaultItemEventKiller = function(eventName) {

	let id = this.id;

	if (eventName === 'worldTick') {
		if (typeof eMaster.listens[eventName].items === 'undefined') {
			dBug('No eMaster.listens.worldTick.items!', 3);
			return false;
		}

		if (typeof eMaster.listens[eventName].items[id] === 'undefined') {
				dBug(`Tried to kill nonexistent ${eventName} event with id ${id}`, 3);
				return false;
		}
		dBug(id + ' unregistered for worldTick');
		delete eMaster.listens[eventName].items[id];
	} else {
		dBug(`Tried to kill unknown event ${eventName} on ${id}`, 3);
	}
};
const defaultZoneRetrieve = function(oldZone, newZone, playerId) {
	let player = players[playerId];
	let locker = player.zoneLocker[newZone];

	if (locker) {
		// give their stuff back
		for (let itemId in locker) {
			player.inventory[itemId] = items[itemId].data.type;
		}
		player.zoneLocker[newZone] = {};
	}
};
const defaultZoneStore = function(oldZone, newZone, playerId) {
	// stores this item in a "virtual locker"
	// to be retrieved/restored when they enter the zone again

	let player = players[playerId];
	// if it's the current weapon, unwield it before storing
	if (player.weapon === this.id) {
		player.unwield();
	}
	delete players[playerId].inventory[this.id];
	this.unregisterForWorldTicks();

	this.data.location = "ZONELOCKER"; // kinda need this

	if (!player.zoneLocker[oldZone]) {
		dBug(`zoneLocker for ${player.id} in ${oldZone} didn't exist! Resetting to {}.`);
		player.zoneLocker[oldZone] = {};
	}

	player.zoneLocker[oldZone][this.id] = this.data.type;
};
const defaultZoneCrumble = function(playerId) {
	// remove from player
	// unregister for worldTicks
	// remove from items global

	// TODO: change deleting from inventory to Item.crumble() or something

	let player = players[playerId];
	// if it's the current weapon, unwield it before crumbling
	if (player.weapon === this.id) {
		player.unwield();
	}

	delete players[playerId].inventory[this.id];
	this.unregisterForWorldTicks();
	delete items[this.id]; // rip
};

const defaultZoneChange = function(oldZone, newZone, playerId) {
	// this is for items
	// return true if this item should be mentioned when player changes zones
	let mentionIt;
	if (!this.data.global) {

		if (this.data.zoneCrumbles) {
			// this is a crumbly item: can't walk out of zone with it, doesn't store in locker
			this.zoneCrumble(playerId);
			mentionIt = true;
		} else {
			// most items, though, will go to a locker
			dBug(`Adding ${this.id} to ${playerId}'s locker...'`, 1);
			this.zoneStore(oldZone, newZone, playerId);
			mentionIt = true;
		}
	} else {
		dBug(`A ${this.data.type} refused to .zoneCrumble() because it's a global item.`);
		mentionIt = false;
	}

	return { "mentionIt": mentionIt };
};
const nextId = {};
//-----------------------------------------------------------------------------
// BATTLE
//-----------------------------------------------------------------------------
const Battle = function(data) {
	this.identifier = data.identifier;
	this.initiator = data.initiator;
	this.segment = data.segment || 0;
	this.timer = data.timer;
	this.participants = {};
	this.battleOrder = [];
	this.leavingParticipants = [];
	this.battlingPlayers = [];
	this.arrivingParticipants = data.participants;
	this.addParticipants();
};
Battle.prototype.getBattlingPlayers = function() {
	this.battlingPlayers = [];
	this.battleOrder.forEach(id => {
		let player = this.participants[id].getPlayer();
		if (player) {
			this.battlingPlayers.push(player);
		}
	});
	return this.battlingPlayers;
};
Battle.prototype.addParticipants = function() {
    // add/initialize participants and battle order
    this.arrivingParticipants.forEach(item => {
        this.battleOrder.push(item.participant.id);
        this.participants[item.participant.id] = item;
				this.participants[item.participant.id].participant.inBattle = this.identifier;
				this.participants[item.participant.id].battle = this;
    });
    this.arrivingParticipants = [];
};
Battle.prototype.markParticipantForAddition = function(participant) {
	// participant a BattleParticipant object
	this.arrivingParticipants.push(participant);
};
Battle.prototype.markParticipantForRemoval = function(participantId) {
	this.leavingParticipants.push(participantId);
};
Battle.prototype.removeParticipants = function() {
	this.leavingParticipants.forEach(id => {
		let index = this.battleOrder.indexOf(id);
		if (index >= 0) {
			this.battleOrder.splice(index, 1);
			this.participants[id].participant.inBattle = false;
			delete this.participants[id];
		}
	});
	this.leavingParticipants = [];
};
Battle.prototype.checkTerminated = function() {
	// if <= 1 player left, then end battle
	// TODO: change to if one faction left when we implement factions
	if (this.battleOrder.length <= 1) {
		return true;
	}
	return false;
};
Battle.prototype.end = function() {
    this.battleOrder.forEach(id => {
        this.participants[id].participant.inBattle = false;
    });
		clearTimeout(this.timer);
		delete battles[this.identifier];
};
//-----------------------------------------------------------------------------
// ITEM, SCENERYITEM, WEAPON, MOB, ETC.
//-----------------------------------------------------------------------------
const Item = function(itemType, data) {
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
	this.data.effects = data.effects;
	this.data.oneUse = data.oneUse;
	this.data.zone = data.zone;

	// zoneChange stuff
	if (this.data.zone) {
		//dBug(`Adding a .zoneChange() to a ${this.data.type}.`);
		this.zoneChange = defaultZoneChange;
		this.zoneCrumble = defaultZoneCrumble;
		this.zoneStore = defaultZoneStore;
		this.zoneRetrieve = defaultZoneRetrieve;
	}

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
	this.entityType = cons.ENTITIES.item;

	// this shouldn't happen, I think
	if (typeof itemTypes[itemType] === 'undefined') {
		itemTypes[itemType] = {family: "junk"};
		dBug('(WARNING) That should not have happened!', 4);
	}
	this.data.family = itemTypes[itemType].data.family;
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
		}
	} else {
		// hidden -- nothing special right now
	}
	outP += itemStr;

	if (!options.short) {
		if (theItem.data.family === 'prop') {
			outP += `(${theItem.data.shortName}): `;
		}
		if (theItem.data.zone) {
			outP += ` _(${theItem.data.zone} zone)_ `;
		}
		outP += ": ";
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
Item.prototype.unwield = defaultUnwield;
Item.prototype.use = defaultUse;
Item.prototype.age = defaultAge;
Item.prototype.registerForWorldTicks = function() {
	let item = this;
	let tickCount = 0;

	this.on('worldTick', function({}) {

		// some items only decay every nth tick.
		// increment our rollover counter thing and check that.
		tickCount++;
		tickCount = tickCount % item.data.decay.rate;

		if (tickCount === 0) {
			item.decay();
		}
	});
};
Item.prototype.unregisterForWorldTicks = function() {
	this.off('worldTick');
};
Item.prototype.whereIs = common.defaultWhereIs;
Item.prototype.on = defaultItemEventHandler;
Item.prototype.off = defaultItemEventKiller;
//-----------------------------------------------------------------------------
const SceneryItem = function(itemType, data) {
	this.entityType = cons.ENTITIES.item;
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

	// zoneChange stuff
	if (this.data.zone) {
		dBug(`Adding a .zoneChange() to a ${this.data.type}.`);
		this.zoneChange = defaultZoneChange;
		this.zoneCrumble = defaultZoneCrumble;
		this.zoneStore = defaultZoneStore;
		this.zoneRetrieve = defaultZoneRetrieve;
	}

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
SceneryItem.prototype.wizget = defaultGet;
//-----------------------------------------------------------------------------
const Weapon = function(itemType, data) {

	this.data = Object.assign({}, data); // break first level of references
	this.entityType = cons.ENTITIES.item;
	if (typeof data !== 'object') {
		data = {};
	}
	this.data.hidden = data.hidden || false;
	this.data.description = data.description || "You can attack with this.";
	this.data.shortName = data.shortName || 'weapon';
	this.data.shortNames = data.shortNames || [this.data.shortName];
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || itemType;
	this.data.family = data.family || 'weapon';

	// zoneChange stuff
	if (this.data.zone) {
		dBug(`Adding a .zoneChange() to a ${this.data.type}.`);
		this.zoneChange = defaultZoneChange;
		this.zoneCrumble = defaultZoneCrumble;
		this.zoneStore = defaultZoneStore;
		this.zoneRetrieve = defaultZoneRetrieve;
	}

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
Weapon.prototype = Object.create(Item.prototype); // Weapon extends Item
Weapon.prototype.equip = defaultEquip;
//-----------------------------------------------------------------------------
// MOBS
//-----------------------------------------------------------------------------
const Mob = function(mobTemplate, data) {
	// handles: assigning id, adding to mobs global, registerForWorldTicks

	this.data = Object.assign({}, data); // break first level of references
	this.entityType = cons.ENTITIES.mob;
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
	this.data.isEssential = data.isEssential;
	this.data.attack = data.attack;
	this.data.kills = [];
	this.data.fleeDifficulty = data.fleeDifficulty || 0;
	this.data.drops = data.drops;
	// Auto-array from string
	let movementFlavor = (typeof data.movementFlavor === "string" ? [data.movementFlavor] : data.movementFlavor) || [];
	let movementFlavorFrom = typeof data.movementFlavorFrom === "string" ? [data.movementFlavorFrom] : data.movementFlavorFrom;
	let movementFlavorTowards = typeof data.movementFlavorTowards === "string" ? [data.movementFlavorTowards] : data.movementFlavorTowards

	this.data.movementFlavorFrom = movementFlavorFrom || movementFlavor;
	this.data.movementFlavorTowards = movementFlavorTowards || movementFlavor;
	//this.data.movementFlavorFrom = movementFlavorFrom || movementFlavor.map(a => (a + " from")); // for coming from
	//this.data.movementFlavorTowards = movementFlavorTowards || movementFlavor.map(a => (a + " to")) // for going to

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
	rooms[this.data.location].data.mobs[this.id] = this.data.type;

	nextId[mobTemplate]++;
	mobs[this.id] = this; // add to mobs global
	this.registerForWorldTicks();
};
Mob.prototype.timedActions = function(tickCount) {

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
				eMaster('roomSay', this.data.location, {"sayFrom": sayFrom}, phrase);
			}
		}
	}

	// .generic
	if (generic && tickCount % generic.frequency === 0) {
		if (generic.behavior === "random") {
			if (Math.random() < generic.chance) {
				phrases = JSON.parse(JSON.stringify(generic.phrases));
				let phrase = ut.listPick(phrases);
				eMaster('roomGeneric', this.data.location, {"sayFrom": sayFrom}, phrase);
			}
		}
	}

	// .move
	if (this.inBattle) {
		dBug(`${this.data.type} wanted to .move() but is in battle with ${this.inBattle} and can't!`, 1);
	} else {
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
						if (exits[exit].goesto && rooms[exits[exit].goesto]) {
							exitZone = rooms[exits[exit].goesto].data.zone;
							if (mobZone === exitZone) {
								if (!exits[exit].hidden || this.data.allowHiddenExits) {
									choices.push(exits[exit]);
								}
							}
						}
					}

					if (choices.length > 0) {
						let choice = ut.listPick(choices);
						//eMaster('roomGeneric', this.data.location, {"sayFrom": sayFrom}, ` looks towards ${choice}`);
						eMaster(
							'roomExit',
							 this.data.location,
							 {"sayFrom": sayFrom},
							 {"newRoom": choice.goesto, "exitTaken": choice, "movementFlavor": ut.listPick(this.data.movementFlavorFrom.slice(0)) }
						);
						eMaster(
							'roomEnter',
							choice.goesto,
							{"sayFrom": sayFrom},
							{ "lastRoom": this.data.location, "exitTaken": choice, "movementFlavor": ut.listPick(this.data.movementFlavorTowards.slice(0)) }
						);
						delete rooms[this.data.location].data.mobs[this.id];
						this.data.location = choice.goesto;
						rooms[choice.goesto].data.mobs[this.id] = this.data.type;
					} else {

					}
				}
			}
		}
	}
};
Mob.prototype.registerForWorldTicks = function() {
	let mob = this;
	let tickCount = 0;

	this.on('worldTick', function({}) {
		tickCount++;
		mob.timedActions(tickCount);
	});
};
Mob.prototype.unregisterForWorldTicks = function() {
	this.off('worldTick');
};

Mob.prototype.whereIs = common.defaultWhereIs;
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

	if (!options.short) {
		outP += this.data.type;

		if (!noWiz) {
			if (viewAs.isAtLeast('wizard')) {
				outP += `(\`${this.id}\`)`;
			}
		}

		outP += `: ${this.data.description}\n`;

		let killCount = this.data.kills.length;
		if (killCount) {
			outP += `This ${this.data.type} has shed the blood of ${this.data.kills.length} victim(s). `;
		} else {
			outP += `This ${this.data.type} has been unchallenged so far. `;
		}

		let hpPercent = this.data.hp / this.data.maxHp;

		if (hpPercent === 1) {
			outP += 'It appears healthy.';
		} else if (hpPercent > 0.5) {
			outP += 'It looks somewhat injured.';
		} else {
			outP += 'It looks to be badly hurt!';
		}

		if (viewAs.isAtLeast('wizard') && viewAs.isWearing('wizard hat')) {
			outP += `\`(${(hpPercent * 100).toFixed(2)}% HP)\``;
		}
	}

	return outP;
};
Mob.prototype.takeDamage = function(cause, dmgAmt, dmgType) {
	// cause: Send up a Player object, or a string if it's just generic damage
	// TODO: Handle "absorb" and typed damage
	// Death handling needs to be handled outside of here!
	this.data.hp -= dmgAmt;
};
Mob.prototype.dieStrings = [
	"screams out one last time and falls to the ground, dead!",
	"has exhausted their life force.",
	"collapses, having being defeated.",
	"lives no longer."
];
Mob.prototype.die = function(cause, battles) {
	// cause should be either a String, or a Player object
	// client can be an array of clients
	// FUTURE: also support a Mob object

	let deathString = '';
	let causeString = '';
	let outP = '';
	let victim = this.data.type;
	let mobKill = (cause.entityType === cons.ENTITIES.mob);

	if (typeof cause === 'string') {
		causeString = cause;
	} else if (cause.entityType === cons.ENTITIES.player) {
		// assume it's a Player object
		let player = cause;
		let xpAmt = this.data.xp || 0;
		causeString += player.charName;
		player.award(xpAmt, 'xp');
		player.stats.kills = player.stats.kills || {};
		player.stats.kills[victim] = player.stats.kills[victim] || 0;
		player.stats.kills[victim]++;

		if (!battles[this.inBattle]) {
			dBug(`Weird! ${player.id} killed a ${this.data.type} outside of battle?`, 3);
		}

		outP += `** YOU RECEIVED ${xpAmt} XP FOR DEFEATING ${victim}!**\n`;
		player.sendMsg(outP);
	} else if (cause.entityType === cons.ENTITIES.mob) {
		let mob = cause;
		causeString += mob.data.type;
		// update mob stats?
		if (!battles[this.inBattle]) {
			dBug(`Weird! A ${mob.data.type} killed a ${this.data.type} outside of battle?`, 3);
		}
		// we send a message now to the room!
	}

	// for now, no corpses, no drops, just a message about who's responsible, and an xp award if possible
	deathString += this.dieStrings[Math.floor(Math.random() * this.dieStrings.length)];
	deathString += ` **${this.data.type}** has been defeated by **${causeString}**!`;

	// drops
	let lootTable = this.data.drops;
	dBug(`${this.data.type}.data.drops is: ${lootTable}`);

	//	If there's a loot table entry for this mob...
	if (lootTable) {

		// iterate over all the possible drop tables in the loot table
		// each has a .chance property to determine whether we should roll on that loot table

		for (let dropTableId in lootTable) {
			let dropTable = drops[dropTableId];
			if (!dropTable) {
				dBug(`${this.data.type} had a loot table referencing non-existent drop table ${dropTableId}!`, 4);
			} else {
				let useThisDropTableChance = lootTable[dropTableId].chance;
				dBug(`Possibly rolling on drop table ${dropTableId}... (chance ${useThisDropTableChance})`, 1);
				if (Math.random() < useThisDropTableChance) {
					dBug("...drop table chance roll passed...", 1);

					// total up all the frequencies in dropTable
					let totalFreq = dropTable.reduce((accum, currentElement) => {
						return accum + currentElement.frequency;
					}, 0);

					let pick = Math.floor(Math.random() * totalFreq);
					let tableNum = 0;
					let freqLimit = 0;

					let match = false;
					while (tableNum < dropTable.length - 1 && !match) {
						freqLimit += dropTable[tableNum].frequency;
						if (pick < freqLimit) {
							match = true;
						} else {
							tableNum++;
						}
					}

					dBug(`Rolled drop table #${tableNum} on loot table for ${this.data.type} (${pick} / ${totalFreq})`, 1);
					let table = dropTable[tableNum].drops;

					for (let dropNum = 0; dropNum < table.length; dropNum++) {
						let thisDrop = table[dropNum];
						dBug(`Might drop ${thisDrop.amount} ${thisDrop.drop} ` +
						  `(${thisDrop.dropType}) (chance: ${thisDrop.chance})`, 1);
						if (Math.random() < thisDrop.chance) {
							dBug("...yeah, we'll go ahead and drop that.", 1);
						 	let amountRolled = ut.rollDice(thisDrop.amount);
							switch (thisDrop.dropType) {
								case "item":
									parseScript([
											createScript("summon item", [thisDrop.drop, amountRolled]), //`summon item "${thisDrop.drop}" ${amountRolled}`,
											createScript("message", [`You found ${amountRolled} ${thisDrop.drop}!`]) //`message You found ${amountRolled} ${thisDrop.drop}!`
									], { who: cause.id, room: this.data.location, isMob: mobKill });
								break;
								case "material":
									let rarityStrings = cons.STRINGS.rarity;
									let materialType = thisDrop.drop;
									let materialRarity = thisDrop.rarity;
									let materialStr = rarityStrings[materialRarity];
									parseScript([
										createScript("grant material", [materialType, materialRarity, amountRolled]), //`grant material ${materialType} ${materialRarity} ${amountRolled}`,
										createScript("message", [`You found ${amountRolled} of ${materialStr} ${materialType}!`]) //`message You found ${amountRolled} of ${materialStr} ${materialType}!`
									], { who: cause.id, room: this.data.location, isMob: mobKill });
								break;
								case "currency":
									let currencyZone = thisDrop.currencyZone;
									let currencyType = thisDrop.currencyType;
									parseScript([
										createScript("grant currency", [currencyZone, amountRolled, currencyType]), //`grant currency ${currencyZone} ${amountRolled} ${currencyType}`
										createScript("message", [`You found ${amountRolled} of currency ${currencyType}!`])
									], { who: cause.id, room: this.data.location, isMob: mobKill });
								break;
								case "script":
									dBug(`MEHScript not available yet :(`, 3);
								break;
								default:
									dBug(`What's this thing you tried to drop? A ${thisDrop.dropType}?!`, 3);
							}
						}
					}
				}
			}
		}
	}

	// make it dramatic, let everyone in the room know:
	eMaster('roomGeneric', this.data.location, {"sayFrom": this.data.type}, deathString);

	// check and see if we need to do anything like let the source (if any) know
	// for now, just checks if it came from a generator and takes care of that
	let sourceId = this.data.source;
	if (sourceId) {
		if (!items[sourceId]) {
			dBug(`${this.data.id} had a non-existent source of ${sourceId}!`, 3);
		} else {
			dBug(`Calling items.${sourceId}.handleDeathOf(${this.id}). . .`, 1);
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
	this.entityType = cons.ENTITIES.item;
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
	dBug(`${this.id}: I've handled the death of ${whatDied} and I have ${Object.keys(this.data.generator.mobList).length} out there.`, 1);
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
		dBug(`Generator ${this.id} didn't generate (at the limit of ${max} ${mType}s).`, 0);
	} else if (Math.random() < chance) {
		let parseResult = parseScript(createScript("summon mob", [mType]), { room: this.data.generator.pops });
		dBug(parseResult);
		let theMob = parseResult.created.mob[0]; // we don't support generating multiple mobs, yet
		// theMob.registerForWorldTicks(); // handled by constructor
		theMob.data.source = this.id; // make sure this is necessary?
		this.data.generator.mobList[theMob.id] = theMob.id;
		// mobs[theMob.id] = theMob; // handled by constructor
		dBug(`Generator ${this.id} added a mob ${theMob.id}!`, 1);
	}
};
MobGenerator.prototype.registerForWorldTicks = function() {
	let mobgen = this;
	let tickCount = 0;

	this.on('worldTick', function({}) {
		// some items only decay every nth tick.
		// increment our rollover counter thing and check that.
		tickCount++;

		let decayTick = tickCount % mobgen.data.decay.rate;
		let genTick = tickCount % mobgen.data.generator.frequency;

		if (decayTick === 0) {
			mobgen.decay();
		}

		if (genTick === 0) {
			mobgen.generate();
			//dBug("Skipping mobgen.generate() due to fatal bug! Fix this!", 2)
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
const ItemType = function(data) {
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
const Room = function(data) {
	// data is an object. any necessary properties not given
	// will receive default values

	// not sure what's up with .contents vs. .items
	// .contents isn't used in code (except in nuke command to nuke it)
	this.entityType = cons.ENTITIES.room;
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
	this.data.on = data.on;

	for (let event in this.data.on) {
		this.setEvent(event);
	}
};
Room.prototype.setEvent = defaultRoomEventMaker;
Room.prototype.on = defaultRoomEventHandler;
Room.prototype.off = defaultRoomEventKiller;
Room.prototype.getExitText = getExitText;
Room.prototype.describeAs = defaultRoomDescribe;
Room.prototype.shortDesc = defaultRoomShortDesc;

const saveMUD = function() {
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile, {getData: true});
	ut.saveObj(world, cons.MUD.worldFile);
	ut.saveObj(itemTypes, cons.MUD.itemFile);
	ut.saveObj(resources, cons.MUD.resourceFile);
};
const backupMUD = function() {
	let now = new Date().valueOf();
	ut.saveObj(rooms, cons.MUD.backups.roomFile + now + '.bak');
	ut.saveObj(players, cons.MUD.backups.playerFile + now + '.bak', {getData: true});
	ut.saveObj(world, cons.MUD.backups.worldFile + now + '.bak');
	ut.saveObj(itemTypes, cons.MUD.backups.itemFile + now + '.bak');
	ut.saveObj(resources, cons.MUD.backups.resourceFile + now + '.bak');
};
const buildDungeon = function() {
	// iterates over the rooms object, reads all the .data
	// and puts it back using the Room constructor, so that
	// the rooms are all Room objects, with the appropriate
	// methods, etc.

	for (let room in rooms) {
		if (room === "ZONELOCKER") {
			dBug("buildDungeon(): Skipping the ZONELOCKER room!", 1);
		} else {
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
	}
	dBug('Dungeon built.', 2);
};
const buildPlayers = function() {
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
			thePlayer.registerForWorldTicks(); // sleeping players don't get worldticks
		}

		// if they're missing the server property use The Planet for now
		if (!thePlayer.server) {
			thePlayer.server = cons.SERVER_ID;
		}

		players[player] = thePlayer;

		// LOITERER CLEANUP: TEMPORARY!
		/*
		if (thePlayer.location === "airport") {
			if (thePlayer.posture === 'asleep') {
				thePlayer.location = "Loiterers Lounge 2"
			}
		}
		*/

		// put them in their room:
		if (!rooms[thePlayer.location].data.chars) {
			rooms[thePlayer.location].data.chars = [];
		}
		rooms[thePlayer.location].data.chars.push(player);
	}
	dBug('Players database built.', 2);
};
const buildItems = function() {

	// there's a lot of duplicated code in here,
	// refactor someday

	// iterate over players (inventory, wielded, and zoneLockers), then rooms
	// along the way, we'll build our items global

	// players (equipped weapon and inventory)
	let theItem;
	let iType;
	let wieldedItemType;

	for (let playerId in players) {
		if (!players[playerId].inventory) {
			dBug(`${playerId} had no inventory, creating!`, 3);
			players[playerId].inventory = {};
		}

		// check for current wielded weapon
		// if there is one, we'll need to find a matching inv item
		// and assign that new ID to it
		let weaponItemId = players[playerId].weapon;
		if (weaponItemId) {
			iType = weaponItemId.split("##")[0];
			if (!itemTypes[iType]) {
				dBug(`${playerId} was carrying a weapon of non-existent type ${iType} - ignoring!`, 3);
			} else {
				// find a matching inventory item???
				wieldedItemType = iType;
			}
		}

		// iterate over inventory
		for (let itemId in players[playerId].inventory) {
			iType = players[playerId].inventory[itemId];

			if (!itemTypes[iType]) {
				dBug(`${playerId} was carrying an item of non-existent type ${iType} - ignoring!`, 3);
			} else {

				// delete the old item, we're re-building here, assigning a new id
				delete players[playerId].inventory[itemId];

				// calling new Item will place it on the player

				let idata =  itemTypes[iType].data; // inherit
				if (idata.family === "weapon") {
					theItem = new Weapon(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"location": playerId,
						"effects": idata.effects,
						"oneUse": idata.oneUse,
						"zone": idata.zone,
						"global": idata.global
					});
				} else if (idata.family === "prop") {
					theItem = new SceneryItem(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"location": playerId,
						"effects": idata.effects,
						"zone": idata.zone,
						"global": idata.global
					});
				} else {
					theItem = new Item(iType, {
						"hidden": idata.hidden,
						"shortName": idata.shortName,
						"shortNames": idata.shortNames,
						"description": idata.description,
						"decay": idata.decay,
						"weight": parseInt(idata.weight, 10),
						"location": playerId,
						"effects": idata.effects,
						"oneUse": idata.oneUse,
						"zone": idata.zone,
						"global": idata.global
					});
				}

				// if this matches our wielded weapon, assign that to this id
				// note that this is extra processing in the case of dupes
				if (iType === wieldedItemType) {
					players[playerId].weapon = theItem.id;
					dBug(`Assigning ${theItem.id} to ${playerId}'s weapon.`)
				}

				items[theItem.id] = theItem;
			}
		}

		// iterate over zoneLockers
		// build a fresh locker array to replace the old ones
		let newLocker = {};
		for (let lockerZone in players[playerId].zoneLocker) {
			newLocker[lockerZone] = {};
			for (let itemId in players[playerId].zoneLocker[lockerZone]) {

				iType = players[playerId].zoneLocker[lockerZone][itemId];
				dBug(`buildItems(): Handling ${itemId} (a ${iType}) in ${playerId}'s ${lockerZone} locker.'`, 1);

				if (!itemTypes[iType]) {
					dBug(`${playerId} had in their locker an item of non-existent type ${iType} - ignoring!`, 3);
				} else {
					// calling new Item will NOT place it in the locker
					// we have to modify Player.zoneLocker at the end!

					let idata =  itemTypes[iType].data; // inherit
					if (idata.family === "weapon") {
						theItem = new Weapon(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": "ZONELOCKER",
							"effects": idata.effects,
							"oneUse": idata.oneUse,
							"zone": idata.zone,
							"global": idata.global
						});
					} else if (idata.family === "prop") {
						theItem = new SceneryItem(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": "ZONELOCKER",
							"effects": idata.effects,
							"zone": idata.zone,
							"global": idata.global
						});
					} else {
						theItem = new Item(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"weight": parseInt(idata.weight, 10),
							"location": "ZONELOCKER",
							"effects": idata.effects,
							"oneUse": idata.oneUse,
							"zone": idata.zone,
							"global": idata.global
						});
					}
					newLocker[lockerZone][theItem.id] = iType;
				}
			}
		}
		players[playerId].zoneLocker = newLocker;
	}
	// end of player loop

	// rooms
	for (let roomId in rooms) {
		if (roomId === "ZONELOCKER") {
			dBug("buildItems(): Encountered ZONELOCKER room, skipping it!", 1);
		} else {
			for (let itemId in rooms[roomId].data.items) {
				let iType = rooms[roomId].data.items[itemId];

				if (!itemTypes[iType]) {
					dBug(`Room ${roomId} contained an item of non-existent type ${iType} - ignoring!`, 3);
				} else {
					// delete the old item, we're re-building here, assigning a new id
					delete rooms[roomId].data.items[itemId];

					// calling new Item will place it back in the room
					let idata = itemTypes[iType].data; // inherit

					if (idata.family === "mobgen") {
						theItem = new MobGenerator(iType, {
							"hidden": idata.hidden,
							"decay": idata.decay,
							"generator": idata.generator,
							"location": roomId,
						});
					} else if (idata.family === "weapon") {
						theItem = new Weapon(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": roomId,
							"effects": idata.effects,
							"oneUse": idata.oneUse,
							"zone": idata.zone
						});
					} else if (idata.family === "prop") {
						theItem = new SceneryItem(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": roomId,
							"effects": idata.effects,
							"zone": idata.zone
						});
					} else {
						theItem = new Item(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": roomId,
							"effects": idata.effects,
							"oneUse": idata.oneUse,
							"zone": idata.zone
						});
					}
					// since it's in a room, it should be listening for worldTicks...
					theItem.registerForWorldTicks();

					items[theItem.id] = theItem;
				}
			}
		}
	}
};
const mobCleanupList = {
	"airport sewer rat": {
		chance: 0.95,
		cleanCount: 0,
		total: 0
	},
	"The Klingon": {
		chance: 1,
		cleanCount: 0,
		total: 0
	},
	"Professor Moriarty": {
		chance: 1,
		cleanCount: 0,
		total: 0
	},
	"capricorn": {
		chance: 1,
		cleanCount: 0,
		total: 0
	}
};
const buildMobs = function() {
	let dontRespawn;
	for (let roomId in rooms) {
		for (let mobId in rooms[roomId].data.mobs) {
			dontRespawn = false;
			let mobTemplate = rooms[roomId].data.mobs[mobId];

			// undead check -- "Developer's Curse" (cleanup leftovers)
			if (mobCleanupList.hasOwnProperty(mobTemplate)) {
				mobCleanupList[mobTemplate].total++;
				if (Math.random() < mobCleanupList[mobTemplate].chance) {
					dontRespawn = true;
					mobCleanupList[mobTemplate].cleanCount++;
				}
			}

			if (mobTemplate === "airport sewer rat") {
				dBug(`Turned a rat into undead rat in ${roomId}`, 2);
				mobTemplate = "undead airport sewer rat";
			}

			if (!mobTypes[mobTemplate]) {
				dBug(`Room ${roomId} contained a mob of non-existent type ${mobTemplate} - ignoring!`, 3);
			} else {

				// delete the old mob, we're re-building here, assigning a new id
				delete rooms[roomId].data.mobs[mobId];
				let mdata = mobTypes[mobTemplate].data;
				// calling new Mob will give it an id and place it in room
				// Don't do if it's set for cleanup!

				if (!dontRespawn) {
					let theMob = new Mob(mobTemplate, {
						"hidden": mdata.hidden,
						"shortName": mdata.shortName,
						"shortNames": mdata.shortNames,
						"description": mdata.description,
						"location": roomId,
						"speak": mdata.speak,
						"movementFlavor": mdata.movementFlavor,
						"movementFlavorFrom": mdata.movementFlavorFrom,
						"movementFlavorTowards": mdata.movementFlavorTowards,
						"genericaction": mdata.genericaction,
						"move": mdata.move,
						"decay": mdata.decay,
						"family": mdata.family,
						"xp": mdata.xp,
						"maxHp": mdata.maxHp,
						"hp": mdata.maxHp,
						"isEssential": mdata.isEssential,
						"attack": mdata.attack,
						"defense": mdata.defense,
						"absorb": mdata.absorb,
						"fleeDifficulty": mdata.fleeDifficulty,
						"allowsFleeWithoutDirection": mdata.allowsFleeWithoutDirection,
						"easyFlee": mdata.easyFlee,
						"zone": mdata.zone,
						"drops": mdata.drops,
						"convotree": mdata.convotree
					});
				}
				// theMob.registerForWorldTicks(); // handled by constructor
				// mobs[theMob.id] = theMob; // handled by constructor
			}
		}
	}
	for (let mob in mobCleanupList) {
		dBug(` Cleaned up ${mobCleanupList[mob].cleanCount} of ${mobCleanupList[mob].total} of mob ${mob}!`, 2);
	}
};
//-----------------------------------------------------------------------------
// COMBAT
//-----------------------------------------------------------------------------
const getWeapon = function(weaponId) {
	let weapon;
	if (weaponId) {
		if (items[weaponId]) {
			let weaponItemType = items[weaponId].data.type;
			weapon = itemTypes[weaponItemType]; // an ItemType object
			if (weapon) {
				return {
					delay: weapon.data.delay,
					dmg: weapon.data.dmg,
					attack: weapon.data.attack,
					dmgType: weapon.data.dmgType,
					weaponName: weapon.data.type
				};
			} else {
				dBug(`battle participant had ${weaponId}, but that's not an Itemtype!`, 4);
			}
		} else {
			dBug(`battle participant had a non-existent weapon of ID ${weaponId}`, 4);
		}
	}
	return null;
};

const battles = {};
const BattleParticipant = function(participant, data) {
	this.participant = participant;
	// this.faction; // not implemented
	this.previousActionSegment = -Infinity;
	this.nextAction = data.nextAction;
	this.leftBattle = false;
	this.lastAggressor = null;
	this.battle = null;
	// change to change the target

	let target = data.nextAction.split(' ');
	target.shift();
	this.target = target.join(' ');
};
BattleParticipant.prototype.nextActionSegment = function() {
    // Step 1: Check if first attack:
    if (this.previousActionSegment === -Infinity) {
        return 0; // just attack
    }
    // Step 2: Check weapon:
    let weapon = getWeapon(this.participant.weapon);
    if (weapon) {
        return this.previousActionSegment + weapon.delay;
    }
    if (this.participant.entityType === cons.ENTITIES.mob) {
        return this.previousActionSegment + this.participant.data.attack.delay;
    } else if (this.participant.entityType === cons.ENTITIES.player) {
        return this.previousActionSegment + cons.COMBAT.defaultUnarmed.delay;
    }
};
BattleParticipant.prototype.getPlayer = function() {
	if (this.participant.entityType === cons.ENTITIES.player) {
		return this.participant;
	}
	return null;
};
BattleParticipant.prototype.getName = function() {
	if (this.participant.entityType === cons.ENTITIES.mob) {
		return this.participant.data.type;
	} else if (this.participant.entityType === cons.ENTITIES.player) {
		return this.participant.charName;
	}
	return "Unnamed Fighter";
};
BattleParticipant.prototype.takeDamage = function(damageDealt, dmgType) {
	if (this.participant.entityType === cons.ENTITIES.mob) {
		this.participant.takeDamage(this.lastAggressor, damageDealt, dmgType);
	} else if (this.participant.entityType === cons.ENTITIES.player) {
		parseScript([createScript("grant stat hp", [-damageDealt] )], {"who": this.participant.id}); //parseScript([`grant stat hp -${damageDealt}`], {"who": this.participant.id});
	}
};
BattleParticipant.prototype.getDefense = function() {
	if (this.participant.entityType === cons.ENTITIES.mob) {
		return this.participant.data.defense;
	} else if (this.participant.entityType === cons.ENTITIES.player) {
		return this.participant.stats.defense || cons.COMBAT.defaultDefense;
	}
};
BattleParticipant.prototype.handleAbsorb = function(damageDealt, dmgType) {
	if (this.participant.entityType === cons.ENTITIES.mob) {
		let mobAbsorb = this.participant.data.absorb;
		if (mobAbsorb) {
			if (Math.random() < mobAbsorb.chance) {
				if (mobAbsorb.percent) {
					damageDealt -= Math.floor(damageDealt * mobAbsorb.percent);
				} else if (mobAbsorb.hp) {
					damageDealt = damageDealt - mobAbsorb.hp;
					dBug(`${damageDealt} damage dealt after absorb`, 1);
					damageDealt = Math.max(damageDealt, 0);
					dBug(`damageDealt is now ${damageDealt}`, 1);
				} else {
					dBug(`${this.participant.data.type} has .absorb but no percent or hp property???`, 3);
				}
			}
		}
		return damageDealt;
	} else if (this.participant.entityType === cons.ENTITIES.player) {
		// TODO: player absorb
		return damageDealt;
	}
	return damageDealt;
};
BattleParticipant.prototype.doAction = function(battle) {
	// returns the battle message
	let battleStr = '';
	let delay; // weapon.delay
	let dmg; // weapon.dmg
	let attack; // weapon.attack
	let dmgType; // weapon.dmgType
	let weaponName; // weapon.weaponName
	let weapon = getWeapon(this.participant.weapon);
	if (weapon) {
		// done
	} else if (this.participant.entityType === cons.ENTITIES.player) {
		// unarmed, so use defaults
		weapon = {
			delay: cons.COMBAT.defaultUnarmed.delay,
			dmg: cons.COMBAT.defaultUnarmed.dmg,
			attack: cons.COMBAT.defaultUnarmed.attack,
			dmgType: cons.COMBAT.defaultUnarmed.dmgType,
			weaponName: cons.COMBAT.defaultUnarmed.name
		};
	} else if (this.participant.entityType === cons.ENTITIES.mob) {
		weapon = {
			delay: this.participant.data.attack.delay,
			dmg: this.participant.data.attack.dmg,
			attack: this.participant.data.attack.attack,
			dmgType: this.participant.data.attack.dmgType,
			weaponName: this.participant.data.attack.name
		};
	} else {
		dBug("Non-player or mob in combat trying to find a weapon. This shouldn't happen.", 4);
		return "Non-player or mob tries to attack, but has no weapon!\n";
	}
	// figure out what they are doing
	let nextAction = this.nextAction.split(' ');
  if (nextAction[0] === 'flee') {
    // handle fleeing
    let exitTakenName = nextAction[1];
    let exitTaken;
    let fleeSuccess;
    if (this.participant.entityType === cons.ENTITIES.mob) {
      exitTaken = rooms[this.participant.data.location].data.exits[exitTakenName];
      fleeSuccess = true;
    } else if (this.participant.entityType === cons.ENTITIES.player) {
      exitTaken = rooms[this.participant.location].data.exits[exitTakenName];
      if (this.lastAggressor) {
        fleeSuccess = this.participant.flee(battle.participants[this.lastAggressor].participant, exitTaken, battles);
      } else {
		//dBug(this.target);
		fleeSuccess = this.participant.flee(battle.participants[this.target].participant, exitTaken, battles);
      }
    }
    if (fleeSuccess) {
      if (this.lastAggressor) {
        battleStr += `:runner: **${this.getName()}** has successfully fled from ${battle.participants[this.lastAggressor].getName()}!\n`;
      } else {
        battleStr += `:runner: **${this.getName()}** has successfully fled from the battle!\n`;
      }
      this.leftBattle = true;
      this.participant.inBattle = false;
      // player.sendMsg(battleStr); // removed so that the player can witness the rest of the battle for this segment
      return battleStr;
		} else {
			battleStr += `:warning: _**${this.getName()}** tried to flee from the ${battle.participants[this.target].getName()}, but were unable!_\n`;
		}
	} else {
		// handle attacking (if it's not a flee, it's attack, for now)
		// If target does not exist:
		if (!battle.participants[this.target]) {
			return battleStr; // you are not going to get to attack today.
		}
		battle.participants[this.target].lastAggressor = this.participant.id; // set self as last aggressor
		// TODO: (?) Refactor into something like player.attack()

		battleStr += `**${this.getName()}** attacks **${battle.participants[this.target].getName()}** with their ${weapon.weaponName}`;
		let defense = battle.participants[this.target].getDefense();
		let hitChance;
		if (weapon.attack > defense) {
			hitChance = 0.5 + 0.5 * (1 - defense / weapon.attack);
		} else {
			hitChance = 0.5 * (weapon.attack / defense);
		}
		dBug(`${this.getName()}'s hitChance is ${hitChance}`, 1);

		if (Math.random() < hitChance) {
			let damageDealt = ut.rollDice(weapon.dmg);
			damageDealt = battle.participants[this.target].handleAbsorb(damageDealt);
			if (damageDealt <= 0) {
				battleStr += ` but ${battle.participants[this.target].getName()} seems unharmed.\n`;
			} else {
				battleStr += ` and hits for ${damageDealt} damage (${weapon.dmgType})!\n`;
			}
			battle.participants[this.target].takeDamage(damageDealt, weapon.dmgType);

			// not critical
			// dBug(`${this.getName()} hit ${battle.participants[this.target].getName()} for ${damageDealt} (${target.data.hp} / ${target.data.maxHp})`);
			dBug(`${this.getName()} hit ${battle.participants[this.target].getName()} for ${damageDealt}`, 1);
		} else {
			battleStr += ` but fails to hit!\n`;
		}
	}
	// important to know the previous action segment
	this.previousActionSegment = battle.segment;
	return battleStr;
};
BattleParticipant.prototype.handleDeath = function(battle) {
	let death = false;
	if (this.participant.entityType === cons.ENTITIES.mob) {
		death = (this.participant.data.hp <= 0);
	} else if (this.participant.entityType === cons.ENTITIES.player) {
		death = (this.participant.stats.hp.current <= 0);
	}

	if (death) {
		this.participant.die(battle.participants[this.lastAggressor].participant, battles);
		this.leftBattle = true;
		return true;
	}
	return false;
};

const battleSegment = function(battle) {
	battle.segment++;
	dBug(`BATTLE: Segment: ${battle.segment}`);
	//
	battle.getBattlingPlayers();
	let battleMessage = ""; // the message sent in this round
	// for each participant in this battle segment, handle action
	battle.battleOrder.forEach(participant => {
		if (battle.segment >= battle.participants[participant].nextActionSegment()) { // >= in case switch to a weapon with a smaller delay
			battleMessage += battle.participants[participant].doAction(battle);
		}
	});
	// for each participant, handle death and leaving battle (fleeing)
	battle.battleOrder.forEach(participant => {
		if (battle.participants[participant].handleDeath(battle)) {
			battle.markParticipantForRemoval(participant);
		} else if (battle.participants[participant].leftBattle) {
			battle.markParticipantForRemoval(participant);
		}
	});
	if (battleMessage) {
		battle.battlingPlayers.forEach(player => {
			player.sendMsg(battleMessage);
		});
	}
	battle.removeParticipants();
	battle.addParticipants();
	// Setup timer for next battle segment
    if (!battle.checkTerminated()) {
        battle.timer = setTimeout(function() {
            battleSegment(battle);
        }, cons.COMBAT.segDelay);
    } else {
        battle.end();
    }
};
//-----------------------------------------------------------------------------
let worldTick = function() {

	let timeStart = new Date().valueOf();

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

	let now = common.mudTime(world.time.tickCount);

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
			if (Math.random() < 0.01) {
				spam += ' A new day has dawned for the brave explorers of SpongeMUD. Do you have a character?';
				client.channels.cache.get(cons.SPAMCHAN_ID).send(spam);
			}
		} else if (now.hour === cons.SUNSET) {
			// sunset -- decay server fame reset player dayTicks and grant XP and server fame

			// decay 1% (currently) of serverFame per server
			for (let serverId in world.serverFame) {
				let server = client.guilds.cache.get(serverId) || {name: "UNKNOWN SERVER"};
				let serverName = server.name;
				serverFameDecay = Math.floor(world.serverFame[serverId] * cons.DEFAULTS.serverFameDecayRate);
				dBug(` Decaying ${serverFameDecay} fame from ${serverName}`, 2);
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

			dBug(` The sun has set! Awarded ${totalTotalPlayerXp} player XP and ${totalServerFame} server fame total!`, 2);

			// More spammy advert stuff!
			if (Math.random() < 0.02) {
				spam += ` ...and so, the sun falls over the SpongeMUD world.\n`;
				spam += `Characters who were logged in for up to ${cons.DEFAULTS.maxXpTicks} ticks today `;
				spam += `will receive ${cons.DEFAULTS.xpPerTick} XP for each of those ticks.`;
				spam += `\n**${totalTotalPlayerXp} player XP** and **${totalServerFame} server fame** total were awarded!`;
				client.channels.cache.get(cons.SPAMCHAN_ID).send(spam);
			}
		}
		dBug(`     *  The time is now hour ${now.hour.toString().padStart(2, ' ')}`, 1);
		ut.saveObj(world, cons.MUD.worldFile);
	}
	eMaster('worldTick',{},{});
	timers.worldTick.main = setTimeout(() => {worldTick();}, cons.WORLDTICKLENGTH);

	let timeEnd = new Date().valueOf();

	dBug(` ====== worldTick() spent ${timeEnd - timeStart} ms in processing. ======`);
};
let initTimers = function() {
	timers.worldTick = {};
	timers.worldTick.main = setTimeout(() => {worldTick();}, cons.WORLDTICKLENGTH);
};
//-----------------------------------------------------------------------------
// COMMANDS
//-----------------------------------------------------------------------------
module.exports = {
	handleDblUpvote: handleDblUpvote,
	initTimers: initTimers,
	buildDungeon: buildDungeon,
	buildPlayers: buildPlayers,
	buildItems: buildItems,
	buildMobs: buildMobs,
	idleReset: function(message) {
		let who = message.author.id;
		let player = players[who];

		if (!player) {
			dBug(`idle timeout checker found no players.${who}.`, 2);
		} else {
			if (!player.idle) {
				player.idle = {
					ticks: 0,
					threshhold: 45,
					autolog: true,
					warn: true
				};
				dBug(`created .idle for players.${who}.`, 2);
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
						ut.saveObj(players, cons.MUD.playerFile, {getData: true});
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("privacy attempted to send empty message, exception caught!", 3);
			}
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
			ut.saveObj(players, cons.MUD.playerFile, {getData: true});
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
		do: function(message, args) {
			if (rooms.hasOwnProperty(args)) {
				//ut.longChSend(message, rooms[args].describeAs(player));
				ut.chSend(message, 'Hey no peeking!');
			} else {
				ut.chSend(message, `You want to see ${args}, eh? I don't know that place.`);
			}
		}
	},
	go: {
		do: function(message, args) {
			let cmd = 'go';
			let who = message.author.id;
			let minAccess = 'player';
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

			let exitTaken = rooms[pLoc].data.exits[where];

			if (typeof exitTaken !== 'undefined') {
				if (!exitTaken.goesto) {
					ut.chSend(message, `You tried to leave via ${where} but you were unable to get anywhere!`);
					return;
				} else if (player.inBattle) {
					if (!battles[player.inBattle]) {
						dBug(`Player.go(): players.${who}.inBattle is truthy, but there's no battle! Resetting to false!`, 4);
						player.inBattle = false;
						return;
					}
					ut.chSend(message, `You can't leave while you are fighting!`);
					return;
				} else if (exitTaken.key) {
					// this exit requires a key to take
					// TODO: also check for exitTaken.accessItem (better name?)
					if (!player.keyring.has(exitTaken.key)) {
						// TODO: allow for custom messages
						ut.chSend(message, `You try to leave via ${where} but you seem to be missing the key ${exitTaken.key}.`);
						return;
					} else {
						// TODO: allow wizards to add a message here
						// ex: "Your skeleton key opens the vault!"
						chanStr += player.go(exitTaken); // actually move the character
					}
				} else {
					chanStr += player.go(exitTaken); // actually move the character
				}
			} else {
				chanStr = `You tried to leave via ${where} but that's not an exit!`;
			}
			console.log(chanStr);
			ut.longChSend(message, chanStr);
		}
	},
	flee: {
  do: function(message, args) {
      let cmd = 'flee';
      let who = message.author.id;
      let minAccess = 'player';
      let fail = cantDo(who, cmd);
      if (fail) {
        ut.chSend(message, fail);
        return;
      }
      let player = players[who];
      let theMob = null;

      if (battles[player.inBattle]
  		&& battles[player.inBattle].participants[who]
  		&& battles[player.inBattle].participants[who].target
  		&& battles[player.inBattle].participants[battles[player.inBattle].participants[who].target]) {
        theMob = battles[player.inBattle].participants[battles[player.inBattle].participants[who].target].participant;
        if (theMob.entityType !== cons.ENTITIES.mob) {
          theMob = null;
        }
      }

      args = args.split(' ');
      let where = args[0];
      let pLoc = player.location;
      let exitTaken;
      let fledWithoutDirection;

      if (args[0] === '') {
        if (!theMob || theMob.data.allowsFleeWithoutDirection) {
          fledWithoutDirection = true;
        } else {
          ut.chSend(message, "You need to pick a direction to flee to!");
          return;
        }
      }

			if (!fledWithoutDirection) {
				if (typeof rooms[pLoc].data.exits[where] !== 'undefined') {
					if (!rooms[pLoc].data.exits[where].goesto) {
						ut.chSend(message, "You tried to flee via ${where} but you went nowhere!");
						return;
					} else {
						exitTaken = where;
					}
				} else {
					ut.chSend(message, "You can't flee _that_ way!");
					return;
				}
			}
			ut.chSend(message, "_You try to get away from combat..._");
			battles[player.inBattle].participants[who].nextAction = `flee ${exitTaken}`;
		}
	},
	exits: {
		do: function(message, args) {
			let cmd = 'exits';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			let room = rooms[player.location];

			let exitText = room.getExitText({
				"numbered": true,
				"viewAs": player
			});
			if (!exitText) {
				dBug(`SpongeMUD: Room \`${room.data.id}\` missing exits!`, 3);
			} else {
				outP += exitText;
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, will bug on missing exits
				dBug("exits attempted to send empty message, exception caught!", 3);
			}
		}
	},
	exit: {
		do: function(message, args) {
			let cmd = 'go';
			let who = message.author.id;
			let minAccess = 'player';
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';
			let room = player.allRooms[player.location];
			let exits = getExitArray(room.data.exits, player);

			let choice = parseInt(args[0], 10);

			if (isNaN(choice) || choice < 1 || !exits[choice - 1]) {
				outP += "That's not a valid exit number. Type `exits` to see obvious exits and their numbers.";
			} else {
				let exitTaken = room.data.exits[exits[choice - 1].exName];

				outP += player.go(exitTaken);
			}
			ut.chSend(message, outP);
		}
	},
	topxp: {
		do: function(message, args) {
			let playerArr = [];
			let outP = "";
			outP += "_Not seeing your home server here? Ask your server admins to run `m.setup`_\n";

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

				let serverRepped = pl.getServerRepped();
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
		do: function(message, args) {
			let fames = [];
			let server;
			let outP = '';
			outP += "_Not seeing your home server here? Ask your server admins to run `m.setup`_\n";
			for (let serverId in world.serverFame) {
				server = client.guilds.cache.get(serverId) || {name: "UNKNOWN SERVER"};

				let serverCfg = ut.getServerCfg(serverId);
				let optedIn = false;
				if (serverCfg) {
					if (serverCfg.options) {
						optedIn = serverCfg.options.useFame;
					}
				}
				if (optedIn) {
					fames.push({"server": server.name, "fame": world.serverFame[serverId]});
				}
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
		do: function(message, args) {

			let who = message.author.id;
			let fail = cantDo(who, 'represent', {});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let player = players[who];
			let lastServerId = player.server;
			let server = client.guilds.cache.get(lastServerId);
			let outP = '';

			// check for servers that have opted out of representation
			if (!player.isRepping) {
				let serverCfg = ut.getServerCfg(lastServerId);
				if (!serverCfg) {
					outP += 'Sorry, someone with "Manage Server" permissions for your current server needs to do the `setup` command and opt-in to the fame system.\n';
					outP += 'You can do `m.joinmud` elsewhere and `represent` a different server, or simply not generate fame for any server.';
					outP += '\nOr, check with your server admins and see if they want to enable this system with the `setup` command.';
					ut.chSend(message, outP);
					return;
				}
				if (!serverCfg.options.useFame) {
					outP += 'Sorry, your current server does not have representation enabled.\n';
					outP += 'You can do `m.joinmud` elsewhere and `represent` a different server, or simply not generate fame for any server.';
					outP += '\nOr, check with your server admins and see if they want to enable this policy and opt-in to the fame system with the `setup` command.';
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
	setup: {
		do: function(message, args, servercfgs) {
			let user = message.author;
			let who = user.id;
			let server = message.guild;
			let permFlagNeeded = cons.SETUP_COMMAND_PERM_FLAG; // 32 = MANAGE_GUILD
			let outP = "";

			if (!server) {
				outP += "This command must be run from in a channel of the server you are configuring.";
				ut.chSend(message, outP);
				return;
			}

			let canConfig = message.member.hasPermission(permFlagNeeded);

			if (canConfig) {
				args = args.split(" ");
				if (args[0] === "usefame") {
					servercfgs.servers[server.id] = servercfgs.servers[server.id] || { "options": {} };
					servercfgs.servers[server.id].options.useFame = true;
					ut.saveObj(servercfgs, cons.SERVERCFGFILE);
					outP += `\n "${server.name}" is now set up to be able to be represented and show up in places like profiles and high score lists. `;
					outP += "\nSince you have the Manage Server permission, you may opt-out at any time with the command `setup nofame`.";
					outP += "\n **YOUR SERVER HAS NOW BEEN CONFIGURED**. Thanks so much for using SpongeMUD!";
				} else if (args[0] === "nofame") {
					servercfgs.servers[server.id] = servercfgs.servers[server.id] || { "options": {} };
					servercfgs.servers[server.id].options.useFame = false;
					ut.saveObj(servercfgs, cons.SERVERCFGFILE);
					outP += '\n Your server is now set up so that the users cannot "represent" the server, and the server name will never show publicly, ';
					outP += "such as on high score lists or character profiles.";
					outP += "\nSince you have the Manage Server, you may opt-in at any time with the command `setup usefame`.";
					outP += "\n **YOUR SERVER HAS NOW BEEN CONFIGURED**. Thanks so much for using SpongeMUD!";
				} else {
					outP += ":crossed_swords: Thanks so much for trying out SpongeMUD Alpha. We are in an Alpha release, put open to the public, so please be patient with us!";
					outP += "\nThere are a couple of things we think you should know about SpongeMUD if you don't already.";
					outP += "\n - The SpongeMUD experience may involve interaction with players from other Discord servers (guilds).";
					outP += "\n - Users are expected to behave respectfully, and when they join the virtual world, will be given a statement about such expectations.";
					outP += "\n - We use a moderation team to make sure things go smoothly. They will take actions against individual users if necessary.";
					outP += "\n - Our moderation team may block an entire Discord server (guild) from the experience should it become necessary.";
					let fameOptInStr = "\n:information_source: **SERVER REPRESENTATION DISCLOSURE**: We have a 'server representation' system that can be opted into.";
					fameOptInStr += "\nIf you choose to opt in, your server's users may choose to generate 'fame' for your server by being active in the virtual world.";
					fameOptInStr += "\nThey may list the name of your server on their character's profile, and your server's name may appear on high score lists or similar places.";
					fameOptInStr += "\nHigh score lists that include your server's name may also be published to the world wide web."
					fameOptInStr += "\nCurrently, no other information about your server would be shown, and we would let you know if that ever were going to change.";
					fameOptInStr += "\nWe think it's a really fun part of the game, but for privacy reasons, you must OPT-IN if you want your users to be able to represent your server.";
					fameOptInStr += "\n AFTER reading and agreeing to the above, **TO COMPLETE SERVER SETUP TYPE ONE OF THE FOLLOWING COMMANDS:**\n";
					fameOptInStr += "`setup usefame` if you want to allow users to represent your server and have the name shown on high score lists and profiles, or\n";
					fameOptInStr += "`setup nofame` if you would like to keep your server name private. It will never be shown anywhere publicly, unless you later opt-in.";
					ut.chSend(message, outP);
					ut.chSend(message, fameOptInStr);
					// kinda klunky return here, oh well
					// it's because we have this extra message to send
					return;
				}
			} else {
				outP += "Only those who can manage this Discord guild may run the setup command. (Manage Server permission required)";
			}
			ut.chSend(message, outP);
		}
	},
	joinmud: {
		do: function(message, args, servercfgs) {
			let who = message.author.id;
			let server = message.guild;
			let player = players[who];
			let lastServer;
			let lastId;
			let outP = '';
			let dmOut = '';

			let failed = false;

			if (typeof player === 'undefined') {
				args = args.split(' ');
				let charName = args[0];

				if (charName.length < 3 || charName.length > 15) {
					outP += message.author.username + ', use `' + cons.PREFIX + 'joinmud <character name>`.' +
					  ' Your character name must be a **single word** between 3 and 15 chars.';
					outP += '\nYour character name should be suitable for all audiences, and will be subject to approval by our moderators.';
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
				} else {
					// no character, the message was on a server, do "server setup" checks...
					if (!servercfgs.servers.hasOwnProperty(server.id)) {
						outP += "\nNo one from this server has set up SpongeMUD. You can't make a character from " +
						  "this server until they have done so. Please tell someone with the Manage Server permission " +
						  "to do the command `" + cons.PREFIX + "setup ` and follow the instructions " +
						   "so that everyone on this server can join the fun!";
						failed = true;
					}
				}

				// kick out if things aren't Kosher so far
				if (failed) {
					ut.chSend(message, outP);
					return;
				}

				player = new Player({charName: charName, id: who, posture: "standing", server: server.id}, rooms, items, resources);
				players[who] = player;
				ut.saveObj(players, cons.MUD.playerFile, {getData: true});

				let newCharChanText = `\`${new Date().toISOString()}\`: A new character has entered the SpongeMUD World! Welcome, \`${charName}\`!`;
				message.client.channels.cache.get(cons.NEWCHARCHAN_ID).send(newCharChanText);

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
				player.sendMsg(dmOut);

				ut.saveObj(players, cons.MUD.playerFile, {getData: true});
			} else {
				ut.chSend(message, " You're already a SpongeMUD player. Awesome!");
				if (!server) {
					// This was a DM joinmud, and we have a character
					// check last server, see if it's valid and if they're on there
					lastId = player.server;
					lastServer = client.guilds.cache.get(lastId);

					dBug(`lastServer is ${lastServer}`, 1);

					if (!lastServer) {
						outP += `${message.author}, I don't have you listed as having joined SpongeMUD ` +
						  'before. Can you do `m.joinmud` on a server you share with me to join first?';
						ut.chSend(message, outP);
						return;
					} else {
						let user = lastServer.members.cache.get(who);
						if (!user) {
							outP += `${message.author}, I could not find you on ${lastServer.name}, `;
							outP += 'where you last logged in from. You need to do `' + cons.PREFIX + 'joinmud`';
							outP += ' on a server you share with me.';
							ut.chSend(message, outP);
							return;
						} else {
							// Okay, we have valid last server, we have valid character, can login
							dBug(`Logging in ${player.charName} via DM. Last: ${lastServer.name} / ${lastServer.id}`, 1);
							server = {"name": lastServer.name, "id": lastServer.id};
						}
					}
				}
			}

			if (server && !servercfgs.servers.hasOwnProperty(server.id)) {
				outP += "\nNo one from this server has set up SpongeMUD. You can't join the game from " +
				  "this server until they have done so. Please tell someone with the Manage Server permission " +
				  " to do the command `" + cons.PREFIX + "setup` and follow the instructions " +
				  "so that everyone on this server can join the fun!";
				ut.chSend(message, outP);
				return;
			}

			// if we're here, we should have passed these checks:
			// 1. Player exists
			// 2. If joinmud was DM'd, we have a valid lastServer
			// 		Or, this was not a DM, so we can use the server from message
			// 3. If this was NOT a DM, we also have passed the "server has been configured" check

			if (typeof player.server === 'undefined') {
				dBug(`joinmud: ${player.charName} had undefined .server just now. Setting to ${server.id}`, 2);
				player.server = server.id; // will be message.guild.id or else from lastServer
				player.posture = 'standing';
				ut.saveObj(players, cons.MUD.playerFile, {getData: true});
				ut.chSend(message, ` You are now logged in via **${server.name}** (${server.id}). No previous login found.`);
			} else {
				lastId = player.server;
				lastServer = client.guilds.cache.get(lastId);
				player.server = server.id;
				player.posture = 'standing';
				ut.saveObj(players, cons.MUD.playerFile, {getData: true});
				dBug(`lastServer: ${lastServer}.`, 1);

				if (!lastServer) {
					lastServer = {name: "None"};
				}

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
					topServer = client.guilds.cache.get(topFame.server);
					dmOut += `**${topServer.name}** with **${topFame.fame}** fame!`;
				}

				dmOut += '\n Generate fame for your home server with `represent`!';
				player.sendMsg(dmOut);

				// mail check:
				let mailMsg = "";
				let mailbox = getMail(who);

				if (mailbox) {
					mailMsg += "You check your backpack for mail: ";
					let messages = mailbox.mail;
					let read = 0;
					let unread = 0;
					for (let msgNum = 0; msgNum < messages.length; msgNum++) {
						if (messages[msgNum].read) {
							 read++;
						 } else {
							 unread++;
						 }
					}

					if (!read && !unread) {
						mailMsg += "No mail."
					} else {
						mailMsg += `Found ${read} read and ${unread} unread messages. `;
						if (unread) { mailMsg += "**You have new mail!**"; }
						mailMsg += "\n Use `mail list` to list your mail.";
					}
				}
				if (mailMsg !== "") { player.sendMsg(mailMsg); }
			}
			player.registerForRoomEvents();
			player.registerForWorldTicks();
			player.unregisterForLoudRoomEvents();
			ut.saveObj(players, cons.MUD.playerFile, {getData: true});
		}
	},
	exitmud: {
		do: function(message, args) {
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

				eMaster('roomGeneric', player.location, {"sayFrom": player.charName}, phrase);
				ut.saveObj(players, cons.MUD.playerFile, {getData: true});
			}
		}
	},
	time: {
		do: function(message, args) {
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
				time = common.mudTime(world.time.tickCount);
			} else {
				time = common.mudTime(parseInt(args), 10);
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
		do: function(message, args) {

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
				});
			}
		}
	},
	worldcast: {
		do: function(message, args) {

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
				});
			}
		}
	},
	yell: {
		do: function(message, args) {
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
					});
					// Fire off roomLoud to wake light sleepers
					eMaster('roomLoud', pLoc, who, {});
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
						});
						// Fire off roomLoud to wake light sleepers
						eMaster('roomLoud', roomId, who, {});
					}
				}
			}
		}
	},
	say: {
		do: function(message, args) {
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
			eMaster('roomSay', pLoc, who, whatSaid);
		}
	},
	listens: {
		do: function(message) {
			let who = players[message.author.id];
			ut.chSend(message, ' Dumping global and local events object to console.');
			dBug(eMaster.listens, 1);
			dBug(' roomSay In this area (' + who.location + '): ', 2);
			dBug(eMaster.listens.roomSay[who.location], 2);
		}
	},
	getid: {
		do: function(message, args) {
			// getid <nick> to search globally
			// getid <roomId> to search a particular room
			// getid <here> to search current location

			args = args.split(' ');
			let nick = args[0];
			let match;

			if (args[1] === 'here') {
				match = findChar(nick, players[message.author.id].location);
			} else if (args[1]) {
				match = findChar(nick, args[1]);
			} else {
				match = findChar(nick);
			}
			dBug(players[message.author.id].location, 2);

			if (match) {
				ut.chSend(message, '```' + match + ' : ' + nick + '```');
			} else {
				ut.chSend(message, nick + ' couldn\'t be found.');
			}
		}
	},
	wield: {
		do: function(message, args) {
			let choiceList;
			let who = message.author.id;

			let fail = cantDo(who, 'equip');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, "Specify what you want to equip.");
				return;
			}

			let pl = players[who];
			let loc = pl.location;

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

			// Can equip from inventory and floor
			choiceList = buildPicklist({
				inv: pl.inventory,
				floor: rooms[loc].data.items
			}, target);

			// BEGIN IDENTICAL PART 2 !!!

			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target, see if it has a .equip() method, though

				let theItem = items[choiceList[choiceNum].ids[0]];

				if (typeof theItem.equip !== 'function') {
					ut.chSend(message, 'You can\'t equip **that**!');
					return false;
				}

				// ok, we can let them equip
				pl.wield(theItem);
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, would happen
				dBug("wield attempted to send empty message, exception caught!", 3);
			}
		}
	},
	unwield: {
		do: function(message, args) {
			let who = message.author.id;

			let fail = cantDo(who, 'unequip');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let pl = players[who];
			let loc = pl.location;
			let outP = "";

			let theItemId = pl.weapon;

			if (!theItemId) {
				outP += `You're not wielding anything, and you can't unequip ${cons.COMBAT.defaultUnarmed.name}!`;
			} else {
				theItem = items[theItemId];
				if (!theItem) {
					dBug(`Couldn't unwield invalid item ${theItemId}!`, 4);
					outP += "There seems to be something really wrong with your weapon!"
				} else {
					pl.unwield();
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, will happen
				dBug("unwield attempted to send empty message, exception caught!", 3);
			}
		}
	},
	attack: {
		do: function(message, args) {
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
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2

				// legit target so far, see if we can attack it
				if (choiceList[choiceNum].where === 'char') {
					// check zone

					if (zoneList[pl.zoneOf()] && !zoneList[pl.zoneOf()].hasPvpRooms) {
						outP += `That is a character. `;
						outP += `You may not (currently) attack other characters except in PvP zones.`;
					} else {
						let target = players[choiceList[choiceNum].ids[0]];
						dBug(choiceList[choiceNum]);
						dBug(target); // let's check this out

						// start combat (assuming it isn't already)
						// set up initial setTimeout

						if (pl.inBattle) {
							outP += `You're already engaged in combat!`;
						} else if (target.inBattle) { // get the target object please
							outP += `**${target.charName}** is already in battle!`;
						} else {
							// the battle object is now responsible for this
							//pl.inBattle = true;
							//theMob.inBattle = who;

							let battleId = who;

							if (typeof client !== 'undefined') {
								dBug(' Do not fear, new battle and client is not undefined.');
							}

							battles[battleId] = new Battle({
								identifier: battleId,
								initiator: pl,
								participants: [
									new BattleParticipant(
										pl,
										{
											nextActionSegment: 0,
											nextAction: `attack ${target.id}`,
											faction: "faction 1"
										}
									),
									new BattleParticipant(
										target,
										{
											nextActionSegment: 0,
											nextAction: `attack ${pl.id}`,
											faction: "faction 2"
										}
									)
								],
								timer: setTimeout(function() {
									ut.chSend(message, `Combat with ${target.charName} begins!`);
									battleSegment(battles[battleId]); // -client
								}, cons.COMBAT.segDelay)
							});
							//dBug(battles[battleId]);
						}
					}
				} else { // is mob
					let targetName = choiceList[choiceNum];
					let mobId = targetName.ids[0];
					theMob = mobs[mobId];

					if (theMob.data.isEssential || !theMob.data.attack) {
						outP += `A powerful force prevents you from taking that action against that target!`;
					} else {

						// start combat (assuming it isn't already)
						// set up initial setTimeout

						if (pl.inBattle) {
							outP += `You're already engaged in combat!`;
						} else if (theMob.inBattle) {
							outP += `**${theMob.data.type}** is already in battle!`;
						} else {
							// the battle object is now responsible for this
							//pl.inBattle = true;
							//theMob.inBattle = who;

							let battleId = who;

							if (typeof client !== 'undefined') {
								dBug(' Do not fear, new battle and client is not undefined.');
							}

							battles[battleId] = new Battle({
								identifier: battleId,
								initiator: pl,
								participants: [
									new BattleParticipant(
										pl,
										{
											nextActionSegment: 0,
											nextAction: `attack ${theMob.id}`,
											faction: "player"
										}
									),
									new BattleParticipant(
										theMob,
										{
											nextActionSegment: 0,
											nextAction: `attack ${pl.id}`,
											faction: "mob"
										}
									)
								],
								timer: setTimeout(function() {
									ut.chSend(message, `Combat with the ${theMob.data.type} begins!`);
									battleSegment(battles[battleId]); // -client
								}, cons.COMBAT.segDelay)
							});
							//dBug(battles[battleId]);
						}
					}
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
			let who = message.author.id;
			let fail = cantDo(who, 'exam');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

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
			ut.chSend(message, outP); // analysed, not empty
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
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}

				let entity;
				if (choiceList[choiceNum].where === 'char') {
					entity = players[choiceList[choiceNum].ids[0]];
					outP = entity.longDescribeAs(pl);
					outP += `\nLocation is: ` + entity.whereIs(players, rooms).data.title;
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
					entity = mobs[choiceList[choiceNum].ids[0]];
					outP = entity.describeAs(pl);
					outP += `\nLocation is: ` + entity.whereIs(players, rooms).data.title;
				} else {
					// must be an item
					entity = items[choiceList[choiceNum].ids[0]];
					// TODO: remove passing players when possible
					let loc = entity.whereIs(players, rooms); // we'll get either a Room or Player
					let locStr;
					if (loc.entityType === cons.ENTITIES.player) {
						locStr = loc.charName;
					} else {
						// assume floor (room)
						locStr = loc.data.title;
					}
					outP += `\nLocation is: ${locStr}\n`;
					outP += entity.describeAs(pl); // ids[0] = just use first one
					// TODO: don't just use first one? Not sure here
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("exam attempted to send empty message, exception caught!", 3);
			}
		}
	},
	nukemyzone: {
		do: function(message, args) {
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
						player.sendJSON(theirData, fn);
						outP += `:warning: You should already have backed stuff up probably.:warning:\n`;
						outP += `\nThis operation happened only in memory -- no changes were written to disk (yet)`;
						outP += `\nZone **${zoneRequest}** had ${roomCount} rooms. I sent a file of them to you.`;
					} else {
						outP += `Your zone ${zoneRequest} has no rooms associated with it yet.`;
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("nukemyzone attempted to send empty message, exception caught!", 3);
			}
		}
	},
	get: {
		do: function(message, args) {
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
				theItem.get(who);
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("get attempted to send empty message, exception caught!", 3);
			}
		}
	},
	wizget: {
		do: function(message, args) {
			let choiceList;
			// for wizget, we only allow picking from floor

			// add wizard check

			let who = message.author.id;
			let minAccess = 'wizard';
			let fail = cantDo(who, 'wizget', {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, 'Wizget _what_, though?');
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
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2
				// legit target, see if it has a .get() method, though

				let theItem = items[choiceList[choiceNum].ids[0]];

				if (typeof theItem.wizget !== 'function') {
					ut.chSend(message, "That's not something you can `wizget`.");
					return false;
				}

				// ok, we can let them wiz-pick it up
				theItem.wizget(who);
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("wizget attempted to send empty message, exception caught!", 3);
			}
		}
	},
	drop: {
		do: function(message, args) {
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
				theItem.drop(who, loc);
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, should happen
				dBug("drop attempted to send empty message, exception caught!", 3);
			}
		}
	},
	crush: {
		do: function(message, args) {
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
				theItem.crush(who, loc); // does this output the message now?
			}
			if (outP) {
				ut.chSend(message, outP);
			}
		}
	},
	use: {
		do: function(message, args) {
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
				theItem.use(who, loc);
			}
			if (outP) {
				ut.chSend(message, outP);
			}  else { // analysed, shouldn't happen
				dBug("use attempted to send empty message, exception caught!", 3);
			}
		}
	},
	talk: {
		do: function(message, args) {
			let choiceList;
			let who = message.author.id;

			let fail = cantDo(who, 'talk');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			if (!args) {
				ut.chSend(message, "Specify who you want to talk to.");
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

			// only mobs
			choiceList = buildPicklist({
				"mob": rooms[loc].data.mobs
			}, target);

			// BEGIN IDENTICAL PART 2 !!!

			let numFound = choiceList.length;
			if (!numFound || firstPart > numFound || firstPart < 0) {
				outP += `I see no ${target} here. `;
			} else {
				if (choiceNum !== 0) {
					choiceNum = firstPart - 1; // subtract one because 2.foo is index 1
				}
				// END IDENTICAL PART 2

				// legit target so far, see if we can talk to it
				let targetName = choiceList[choiceNum];
				let mobId = targetName.ids[0];
				theMob = mobs[mobId];

				if (theMob.data.convotree) {
					let treeId = theMob.data.convotree;
					if (convotrees.hasOwnProperty(treeId)) {
						let convoState = pl.convoStates[treeId] || convotrees[treeId].initialState;
						outP += advanceConvo(treeId, convoState, theMob, pl);
					} else {
						dBug(`Mob ${mobId} wanted to have a conversation but couldn't find convo tree: ${treeId}`, 3);
						outP += `They seem oddly distracted. (Please report this bug: "${mobId} had no convo tree: ${treeId}")`;
					}
				} else {
					outP += "You can't talk to them.";
				}
			}
			ut.chSend(message, outP);
		}
	},
	pick: {
		do: function(message, args) {
			let choiceList;
			let who = message.author.id;

			let fail = cantDo(who, 'talk');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let pl = players[who];
			let outP = '';
			let lastConvo = pl.lastConvo;
			let treeId = lastConvo.treeId;
			let mobId = lastConvo.mobId;
			let convoState = pl.convoStates[treeId];
			if (!treeId || !mobId) {
				ut.chSend(message, "You aren't in a conversation interface. Try `talk`ing to someone.");
				return;
			}
			let theMob = mobs[mobId];

			if (!theMob) {
				ut.chSend(message, "I don't see the person you were last talking to anymore.");
				return;
			}

			if (convotrees.hasOwnProperty(treeId)) {
				if (theMob.data.location !== pl.location) {
					ut.chSend(message, "You are not in a conversation where you can `pick` a response right now.")
					return;
				}
				if (!convotrees[treeId].states[convoState]) {
					dBug(`missing convo state ${convoState} in tree ${treeId}`, 3);
					ut.chSend(message, `That conversation went astray. (Please report this bug: "missing convo state ${convoState} in tree ${treeId}")`);
					return;
				}
				if (!args) {
					ut.chSend(message, 'You need to specify a choice number after `pick`, like `pick 2`');
					return;
				}
				let choiceNum = parseInt(args);
				if (isNaN(choiceNum) || !choiceNum) {
					ut.chSend(message, "Invalid pick. You need to specify a choice number after `pick`, like `pick 2`");
					return;
				}
				let choices = convotrees[treeId].states[convoState].choices;
				if (!choices) {
					ut.chSend(message, "You can't pick something to say now, try `talk`ing to someone first.");
					return;
				}
				if (!choices[choiceNum - 1]) {
					ut.chSend(message, "Invalid pick.");
					return;
				}
				outP += `You say, "${choices[choiceNum - 1].text}"\n`;

				// Handle if the chosen response sends us to another branch:
				// handle gosay:
				if (choices[choiceNum - 1].gosay) {
					let convoState = choices[choiceNum - 1].gosay;
					// pl.convoStates[treeId] = convoState; // now handled by advanceConvo
					outP += advanceConvo(treeId, convoState, theMob, pl);
				}

				if (choices[choiceNum - 1].goto) {

				}

				ut.chSend(message, outP);
			} else {
				dBug(`missing convotree ${treeId}!`, 3);
				ut.chSend(message, `That conversation went astray. (Please report this bug: "missing convo tree: ${treeId}")`);
				return;
			}
		}
	},
	allmoney: {
		do: function(message, args) {
			let who = message.author.id;
			let fail = cantDo(who, 'money');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let pl = players[who];
			let outP = '';

			let pouch = pl.moneyPouch;
			if (!pouch) {
				outP += "Totally empty.";
			} else {
				pouch.zones = pouch.zones || {};
				for (let zone in pouch.zones) {
					let zoneTitle;
					if (!zoneList[zone]) {
						dBug(`${who} had money from unknown zone ${zone}!`)
						zoneTitle = playerZone;
					} else {
						zoneTitle = zoneList[zone].title || playerZone;
					}
					outP += `\n\n =-=- **ZONE: ${zoneTitle}** -=-=`;
					for (let currencyType in pouch.zones[zone]) {
						let amount = pouch.zones[zone][currencyType] || 0;
						outP += `\n${amount.toString().padStart(12)} x ${currencyType}`;
					}
				}
			}
			ut.chSend(message, `${pl.charName}'s money pouch: ${outP}`);
		}
	},
	money: {
		do: function(message, args) {
			let who = message.author.id;
			let fail = cantDo(who, 'money');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let pl = players[who];
			let room = rooms[pl.location];
			let playerZone = room.data.zone;
			let outP = '';

			pouch = pl.moneyPouch;
			if (!pouch) {
				outP += "Totally empty.";
			} else {
				pouch.zones = pouch.zones || {};
				if (pouch.zones.global) {
					outP += "\n\n =-=- **GLOBAL CURRENCY** -=-=";
					for (let currencyType of pouch.zones.global) {
						let amount = pouch.zones[zone][currencyType] || 0;
						outP += `\n${amount.toString().padStart(12)} x ${currencyType}`;
					}
				}
				if (!playerZone) {
					// they're in no zone at all. no problem, just skip the next bit
				} else {
					if (!zoneList[playerZone]) {
						dBug("money(): ${who} is in room with unknown zone ${playerZone}");
					} else {
						if (pouch.zones[playerZone]) {
							let zoneTitle = zoneList[playerZone].title || playerZone;
							outP += `\n\n =-=- **ZONE: ${zoneTitle}** -=-=`;
							for (let currencyType in pouch.zones[playerZone]) {
								let amount = pouch.zones[playerZone][currencyType] || 0;
								outP += `\n${amount.toString().padStart(12)} x ${currencyType}`;
							}
						}
					}
				}
			}
			ut.chSend(message, `${pl.charName}'s money pouch: ${outP}`);
		}
	},
	inv: {
		do: function(message, args) {
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
						dBug(`No such item ID: ${itemId} in items! (Player inventory: ${who})`, 3);
						outP += ' -- some buggy items, please notify a developer! --';
					} else if (!items[itemId].data) {
						dBug(`No .data property on item ID: ${itemId}!`, 3);
						outP += ' -- some buggy items, please notify a developer! --';
					} else if (!items[itemId].data.shortName) {
						outP += '!UNKNOWN!(';
					} else {
						outP += `\n${items[itemId].data.type} (${items[itemId].data.shortName}) `;
						if (pl.isAtLeast('wizard') && pl.isWearing('wizard hat')) {
							outP +=  `\`(${itemId})\``;
						}
					}
				}
			}

			let weapon;
			let weaponName;
			if (pl.weapon) {
				weapon = items[pl.weapon];

				if (!weapon) {
					dBug(`${pl.charName} had an invalid item ${pl.weapon}`, 4)
				} else {
					weaponName = weapon.data.type;
				}
			}

			weaponName = weaponName || cons.COMBAT.defaultUnarmed.name;

			outP += `\n\nYour equipped weapon is: **${weaponName}**`
			ut.chSend(message, `${pl.charName}'s inventory: ${outP}`);
		}
	},
//-----------------------------------------------------------------------------
	zone: {
		do: function(message, args) {
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
		do: function(message, args) {
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
		do: function(message, args) {
			// title, description: String
			// items: leave it out, can wizitem them
			// exits: use wizex ?
			let cmd = 'edroom';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let loc = player.location;
			args = args.split(' ');
			let prop = args[0];
			args.shift();
			args = args.join(' ');
			let val = args;
			let target;
			if (prop === 'title' || prop === 'description' || prop === 'zone') {
				rooms[loc].data[prop] = val;
				ut.chSend(message, prop + ' of ' + loc + ' now:\n ' + val);
				ut.saveObj(rooms, cons.MUD.roomFile);
			} else if (prop === 'delexit') {
				args = args.split(' ');
				target = args[0];
				if (typeof rooms[loc].data.exits[target] !== 'undefined') {
					delete rooms[loc].data.exits[target];
					ut.chSend(message, 'Exit "' + target + '" deleted! :open_mouth:');
				} else {
					ut.chSend(message, target + ' is not a valid exit, can\'t delete!');
					return;
				}
			} else if (prop === 'exits') {
				args = args.split(' ');
				target = args[0]; // which exit they're editing
				let exProp = args[1]; // what property of the exit they want to change
				args.shift();
				args.shift();
				val = args.join(' '); // anything left is the value they want to change to

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
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("makeprop attempted to send empty message, exception caught!", 3);
			}
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
							outP += `I've also set "${template.data.id}".${prop[0]} to: ${val}`;
					} else {
						template.data[prop[0]] = val;
						outP += `I've set "${template.data.id}".${prop[0]} to: ${val}`;
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("edtemp attempted to send empty message, exception caught!", 3);
			}
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
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("wiztemp attempted to send empty message, exception caught!", 3);
			}
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
				ut.chSend(message, outP);
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
		do: function(message, args) {
			// "itemType", shortname, description
			let cmd = 'wizitem';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			args = args.split('"');

			let iType = args[1];
			if (!iType) {
				ut.chSend(message, ' You need to specify an item template (in quotes) as first argument! See documentation for valid tempates.');
				return;
			}

			if (!itemTypes.hasOwnProperty(iType)) {
				ut.chSend(message, `${iType} is not a valid template. Consult the documentation.`);
				return;
			}

			let idata = itemTypes[iType].data; // inherit stuff from itemTypes

			let currentZone = rooms[player.location].data.zone;
			let itemZone = idata.zone;

			if (currentZone === "arena") {
				outP += `(Item allowed because arena whitelist includes all items!)\n`;
			} else if (itemZone !== currentZone && !idata.global) {
				outP += `Sorry, that item is a themed item from **${itemZone}.** `;
				outP += `You can only summon items for the current zone (**${currentZone}**), `;
				outP += ` or global items.`;
				ut.chSend(message, outP);
				return;
			}

			let theItem;

			if (idata.family === "weapon") {
				theItem = new Weapon(iType, {
					"hidden": idata.hidden,
					"shortName": idata.shortName,
					"shortNames": idata.shortNames,
					"description": idata.description,
					"decay": idata.decay,
					"location": who,
					"effects": idata.effects,
					"oneUse": idata.oneUse,
					"zone": idata.zone,
					"global": idata.global
				});
				outP += ` Okay, Wizard. Gave you a ${theItem.data.type}(${theItem.data.shortName}).`;
				outP += " Try not to hurt yourself with it?";
			} else if (idata.family === "prop") {
				theItem = new SceneryItem(iType, {
					"hidden": idata.hidden,
					"shortName": idata.shortName,
					"shortNames": idata.shortNames,
					"description": idata.description,
					"decay": idata.decay,
					"location": who,
					"zone": idata.zone,
					"global": idata.global
				});
				outP += ` Gave you a ${theItem.data.type}(${theItem.data.shortName}) prop with id ${theItem.id} .\n :warning:`;
				outP += " When you drop it, you won't be able to pick it up with `get`.";
				outP += " Use `wizget` to pick it up if you need!";
			} else {
				theItem = new Item(iType, {
					"hidden": idata.hidden,
					"shortName": idata.shortName,
					"shortNames": idata.shortNames,
					"description": idata.description,
					"decay": idata.decay,
					"location": who,
					"family": idata.family,
					"effects": idata.effects,
					"oneUse": idata.oneUse,
					"zone": idata.zone,
					"global": idata.global
				});
				outP += `New ${theItem.data.type}(${theItem.data.shortName}) created for you, wizard.`;
				outP += `\nIt has the ID \`${theItem.id}\` and has been placed in your inventory.`;

			}
			items[theItem.id] = theItem;
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("wizitem attempted to send empty message, exception caught!", 3);
			}
			ut.saveObj(rooms, cons.MUD.roomFile);
			ut.saveObj(players, cons.MUD.playerFile, {getData: true});
		}
	},
	wizmob: {
		do: function(message, args) {
			// "itemType", shortname, description
			let cmd = 'wizmob';
			let minAccess = 'wizard';
			let who = message.author.id;
			let fail = cantDo(who, cmd, {"minAccess": minAccess});
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			args = args.split('"');

			let mType = args[1];
			if (!mType) {
				ut.chSend(message, ' You need to specify a mob template (in quotes) as first argument! See documentation for valid tempates.');
				return;
			}

			if (!mobTypes.hasOwnProperty(mType)) {
				ut.chSend(message, `${mType} is not a valid template. Consult the documentation.`);
				return;
			}

			let mdata = mobTypes[mType].data; // inherit stuff

			let currentZone = rooms[player.location].data.zone;
			let mobZone = mdata.zone;
			if (mobZone !== currentZone && currentZone !== "arena") {
				outP += `Sorry, that mob is from **${mobZone}.** `;
				outP += `You can only summon mobs for the current zone (**${currentZone}**).`;
				ut.chSend(message, outP);
				return;
			}

			parseScript(createScript("summon mob", [mType]), { room: player.location }); //parseScript(`summon mob "${mType}"`, { room: player.location });

			/*

			// calling new Mob will give it an id and place it in room
			let theMob = new Mob(mType, {
				"hidden": mdata.hidden,
				"shortName": mdata.shortName,
				"shortNames": mdata.shortNames,
				"description": mdata.description,
				"location": players[who].location,
				"speak": mdata.speak,
				"movementFlavor": mdata.movementFlavor,
				"movementFlavorFrom": mdata.movementFlavorFrom,
				"movementFlavorTowards": mdata.movementFlavorTowards,
				"genericaction": mdata.genericaction,
				"move": mdata.move,
				"decay": mdata.decay,
				"family": mdata.family,
				"xp": mdata.xp,
				"maxHp": mdata.maxHp,
				"hp": mdata.maxHp,
				"isEssential": mdata.isEssential,
				"attack": mdata.attack,
				"defense": mdata.defense,
				"absorb": mdata.absorb,
				"fleeDifficulty": mdata.fleeDifficulty,
				"allowsFleeWithoutDirection": mdata.allowsFleeWithoutDirection,
				"easyFlee": mdata.easyFlee,
				"zone": mdata.zone,
				"drops": mdata.drops
			});
			theMob.registerForWorldTicks();
			*/

			outP += `The ${mType} appears on the ground in front of you!`;
			players[who].timers.wizmob = cons.WIZARD_MOB_LIMIT;
			ut.chSend(message, outP);
			ut.saveObj(rooms, cons.MUD.roomFile);
			ut.saveObj(players, cons.MUD.playerFile, {getData: true});
		}
	},
	killitem: {
		do: function(message, args) {
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
			args = args.split(' ');
			let target = args[0]; // what we're deleting
			args.shift();
			args = args.join(' ');

			let outP = '';
			let found = 0;
			if (typeof pl.inventory[target] !== 'undefined') {
				outP += '(inv.) `' + target + '`: ' + pl.inventory[target].data.description;
				if (args === 'inv') {
					delete pl.inventory[target];
					outP += ' was deleted! :open_mouth: \n';
				} else {
					outP += ' was left alone.\n';
				}
				found++;
			}
			if (typeof rooms[loc].data.items[target] !== 'undefined') {
				outP += '(here) `' + target + '`: ' + rooms[loc].data.items[target].data.description;
				if (args === 'here') {
					delete rooms[loc].data.items[target];
					outP += ' was deleted!\n';
				} else {
					outP += ' was left alone.\n';
				}
				found++;
			}

			if (!found) {
				outP += `I see no ${target} here.`;
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("killItem attempted to send empty message, exception caught!", 3);
			}
		}
	},
//-----------------------------------------------------------------------------
	profile: {
		do: function(message, args) {
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
					let serverRepped = player.getServerRepped();
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
						if (players[match].title) {
							outP += ` _${titleList[players[match].title]}_`;
						}
						outP += '**\n';
						outP += players[match].description;
						let serverRepped = players[match].getServerRepped();
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
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("profile attempted to send empty message, exception caught!", 3);
			}
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
				let modApproveText = "";
				// <@&${cons.MODERATORPING_ROLEID}> for @Moderator mention on dev discord
				modApproveText += `\`${new Date().toISOString()}\` :memo: `;
				modApproveText += `please review and \`approve\` or \`deny\` this character's new profile: \`${players[who].charName}\``;
				modApproveText += `\n\`NEW PROFILE\`: ${args}`;
				players[who].pendingDescription = args;
				message.client.channels.cache.get(cons.MODERATORCHAN_ID).send(modApproveText);
				outP += `${players[who].charName}, your new character description is now pending approval.`;
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("setprofile attempted to send empty message, exception caught!", 3);
			}
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
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("title attempted to send empty message, exception caught!", 3);
			}
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
						let profileApprovedModText = `\`${new Date().toISOString()}\` :thumbsup: `;
						profileApprovedModText += `${message.author.username} approved ${player.charName}'s new profile.`;
						outP += `Changing ${player.charName}'s description FROM:\n ${player.description}`;
						outP += `\nTO:\n ${player.pendingDescription}`;
						player.description = player.pendingDescription;
						delete player.pendingDescription;
						outP += '\n Also unlocking "the Explorer" title for them if necessary.';
						message.client.channels.cache.get(cons.MODERATORCHAN_ID).send(profileApprovedModText);
						player.unlockTitle(2);
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("approve attempted to send empty message, exception caught!", 3);
			}
		}
	},
	deny: {
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
						let profileDeniedModText = `\`${new Date().toISOString()}\` :x: `;
						profileDeniedModText += `${message.author.username} denied ${player.charName}'s new profile.`;
						let playerMsg = ":information_source: **SpongeMUD System Message:** ";
						playerMsg += "Your pending character profile was not able to be accepted by the moderation team at this time.";
						outP += `${player.charName}'s description has been denied. `;
						outP += `It will remain:\n${player.description}`;
						delete player.pendingDescription;
						message.client.channels.cache.get(cons.MODERATORCHAN_ID).send(profileDeniedModText);
						player.sendMsg(playerMsg);
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("deny attempted to send empty message, exception caught!", 3);
			}
		}
	},
	build: {
		do: function(message, args) {
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

			//ut.chSend(message, outP);
			ut.chSend(message, "Info sent to console.");
			dBug(outP);
		}
	},
	getfile: {
		do: function(message, args) {
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
				player.sendFile(fname);
			} else {
				outP += 'That is not a legit file that you can have, sorry.';
			}
			ut.chSend(message, outP);
		}
	},
	icanhaz: {
		do: function(message, args) {
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
						player.sendJSON(theirData, fn);
						outP += `Zone **${zoneRequest}** has ${roomCount} rooms. File sent.`;

					} else {
						outP += `Your zone ${zoneRequest} has no rooms associated with it yet.`;
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("icanhaz attempted to send empty message, exception caught!", 3);
			}
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
					let muteModeratorText = `\`${new Date().toISOString()}\` :zipper_mouth: ${message.author.username} has muted ${target.charName} in room ${target.location}`;
					outP += `${args} is now unable to use \`say\` \`yell\` or \`me\` commands` +
					  ' until a moderator `unmute`s them.';
					outP += "\nIncident will be written to #moderation-log of SpongeMUD-dev.";
					outP += "\nPlease followup with your moderation teammates if necessary!";
					message.client.channels.cache.get(cons.MODERATORCHAN_ID).send(muteModeratorText);

				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("mute attempted to send empty message, exception caught!", 3);
			}
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
					let unmuteModeratorText = `\`${new Date().toISOString()}\` :open_mouth: ${message.author.username} has unmuted ${target.charName} in room ${target.location}`;
					outP += `${args} is now able to use \`say\` \`yell\` and \`me\` commands again.`;
					outP += "\nIncident will be written to #moderation-log of SpongeMUD-dev.";
					outP += "\nPlease followup with your moderation teammates if necessary!";
					message.client.channels.cache.get(cons.MODERATORCHAN_ID).send(unmuteModeratorText);
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("unmute attempted to send empty message, exception caught!", 3);
			}
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
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("setaccess attempted to send empty message, exception caught!", 3);
			}
		}
	},
	recall: {
		do: function(message, args) {
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
				player.sendMsg(outP);
			} else {
				player.timers.recall = cons.RECALL_RESET_TICKS;
				outP += 'You use your recall power! Your surroundings fade away and you find yourself elsewhere!';
				player.sendMsg(outP);
				let newLoc = recallPoint; // set our target room

/*
				player.unregisterForRoomEvents(); // first, unregister for events in this room

				eMaster('roomExit', pLoc, who, {"newRoom": newLoc}); // fire off roomExit, notify everyone but us
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

				// handle possible zoneChange
				let oldZone = player.allRooms[oldLoc].data.zone;
				let newZone = player.allRooms[newLoc].data.zone;

				dBug(`${oldZone} -> ${newZone}`);

				if (oldZone !== newZone) {
					dBug(`player.zoneChange(${oldZone}, ${newZone}, ${player.id})`)
					player.zoneChange(oldZone, newZone);
				}

				player.registerForRoomEvents(); // now register for room events in new room
				eMaster('roomEnter', newLoc, who, { "lastRoom": oldLoc }); // fire off roomEnter, notify everyone + us
*/
				player.moveTo(newLoc);	// actually move us
				ut.saveObj(players, cons.MUD.playerFile, {getData: true}); // save to disk
			}
		}
	},
	setrecall: {
		do: function(message, args) {
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
			ut.saveObj(players, cons.MUD.playerFile, {getData: true}); // save to disk
			player.sendMsg(outP);
		}
	},
	wiztele: {
		do: function(message, args) {
			// TODO: Refactor to use player.moveTo()
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

			ut.saveObj(players, cons.MUD.playerFile, {getData: true});
			ut.chSend(message, ' You teleport!');

			player.unregisterForRoomEvents(); // first, unregister for events in this room
			let newLoc = target; // set our target room

			eMaster('roomExit', pLoc, who, { "newRoom": newLoc }); // fire off roomExit, notify everyone but us
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

			// handle possible zoneChange
			let oldZone = player.allRooms[oldLoc].data.zone;
			let newZone = player.allRooms[newLoc].data.zone;

			dBug(`${oldZone} -> ${newZone}`);

			if (oldZone !== newZone) {
				dBug(`player.zoneChange(${oldZone}, ${newZone}, ${player.id})`)
				player.zoneChange(oldZone, newZone);
			}

			player.registerForRoomEvents();// now register for room events in new room
			eMaster('roomEnter', newLoc, who, { "lastRoom": oldLoc }); // fire off roomEnter, notify everyone + us
			ut.saveObj(players, cons.MUD.playerFile, {getData: true}); // save to disk
		}
	},
	sit: {
		do: function(message, args) {
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
				});

			} else {
				player.posture = 'sitting';
				eMaster('roomGeneric', pLoc, who, {
					normal: ['You sit down and get comfortable.','sits down and gets comfortable.']
				});
			}
		}
	},
	stand: {
		do: function(message, args) {
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
				});
			}
		}
	},
	me: {
		do: function(message, args) {
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
			});
		}
	},
	who: {
		do: function(message, args) {
			// accepts either an id or a charName
			let player;
			let outP = "";

			if (players.hasOwnProperty(args)) {
				player = players[args];
			} else {
				player = function() {
					for (let pl in players) {
						if (players[pl].charName === args) {
							return players[pl];
						}
					}
				}();
			}

			if (player) {
				outP = `\n** ${player.charName} (${player.id}) **\n`;
				outP += `.location: ${player.location}  .posture: ${player.posture}\n`;
				outP += `.accessLevel: ${player.stats.accessLevel}  .server: ${player.server}\n---`;
				dBug(outP, 2);
				ut.chSend(message, `|| ${player.charName} (${player.id}) || \nDetails sent to console.`);
			} else {
				outP += `Sorry, I couldn\'t find ${args}.`;
				ut.chSend(message, outP);
			}
		}
	},
	nuke: {
		do: function(message, args) {
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
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("pcalc attempted to send empty message, exception caught!", 3);
			}
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
			let rarityStrings = cons.STRINGS.rarity;

			let player = players[who];
			let pLoc = player.location;
			let resData = rooms[pLoc].data.resources;
			let outP = '';
			let dStr;

			outP += `You begin surveying for resources here (${rooms[pLoc].data.title})...`;

			if (resData) {
				outP += "\nYou found:";
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
			} else {
				outP += "\nYou failed to find any sources of usable resources here.";
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("survey attempted to send empty message, exception caught!", 3);
			}
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
	resources: {
		do: function(message, args) {
			let cmd = 'resources';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let player = players[who];
			let outP = '';

			outP = player.resShow();

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
			let gPoints = player.stats.gather.current || 0;
			let updateData = function() {

				if (!claims[pLoc]) {
					claims[pLoc] = {};
				}

				claims[pLoc][target] = amt; // allocate
				resources[who].claims = claims;
				player.stats.gather.current = gPoints; // update Player (does this need done?)
				ut.saveObj(resources, cons.MUD.resourceFile);
				ut.saveObj(players, cons.MUD.playerFile, {getData: true});
			};

			if (!target) {
				outP += "You need to specify a target gathering spot and a number of gathering points to invest.\n";
				outP += "If there were a gathering spot here called `trees`, and you wanted to invest 10 points,\n";
				outP += "you could do `gather trees 10` if you had 10 gathering points free to invest.\n";
				outP += "\nTo see resources available in this location, if any, try `survey`.\n";
				outP += "\nTo see your current claims and resources, use `resources`.";
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
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("claim attempted to send empty message, exception caught!", 3);
			}
		}
	},
	recipe: {
		do: function(message, args) {
			let cmd = 'craft';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let outP = '';
			let player = players[who];

			if (!args) {
				outP += "Use `recipe <recipe name>` to see a crafting recipe.";
				outP += "\nHere is a list of existing recipe names:";
				outP += craft.listRecipes();

				ut.chSend(message, outP);
				return;
			}

			if (craft.recipes.hasOwnProperty(args)) {
				outP += craft.showRecipe(args);
			} else {
				outP += "That's not a valid recipe.";
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("recipe attempted to send empty message, exception caught!", 3);
			}
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
			let outP = '';
			let player = players[who];

			if (!args) {
				outP += "Use `craft <recipe name>` to use your gathered resources to craft something.";
				outP += "\nHere is a list of existing recipe names:";
				outP += craft.listRecipes();

				ut.chSend(message, outP);
				return;
			}

			let craftResult;
			if (craft.recipes.hasOwnProperty(args)) {
				craftResult = player.craft(craft.recipes[args], itemTypes);
				outP += craftResult.outP;

				if (craftResult.success) {
					// now we can call new Item() like it was wizitem'd
					// new Item() places it on the Player
					let theItem;
					let iType = craftResult.itemIdCreated;
					let quantity = craftResult.quantity;  // TODO
					let idata = itemTypes[iType].data;
					if (idata.family === "weapon") {
						theItem = new Weapon(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": who,
							"effects": idata.effects,
							"oneUse": idata.oneUse,
							"zone": idata.zone,
							"global": idata.global
						});
					} else {
						theItem = new Item(iType, {
							"hidden": idata.hidden,
							"shortName": idata.shortName,
							"shortNames": idata.shortNames,
							"description": idata.description,
							"decay": idata.decay,
							"location": who,
							"family": idata.family,
							"effects": idata.effects,
							"oneUse": idata.oneUse,
							"zone": idata.zone,
							"global": idata.global
						});
					}
					items[theItem.id] = theItem;
					ut.saveObj(players, cons.MUD.playerFile, {getData: true});
					outP += `${quantity} x **${iType}** created!`;
				}
			} else {
				outP += "That's not a valid recipe. Try `recipe` for a list.";
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("craft attempted to send empty message, exception caught!", 3);
			}
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
				ut.saveObj(players, cons.MUD.playerFile, {getData: true});
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("setmacro attempted to send empty message, exception caught!", 3);
			}
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
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("menu attempted to send empty message, exception caught!", 3);
			}
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
						dBug(`Running minigames.${validGame} command: ${gameCmd}(${cmdArgs})!`, 1);
						let result;
						result = minigames[validGame].commands[gameCmd].do(player, world, cmdArgs);
						outP = result.message;

						if (result.script) {
							dBug(`Minigame "${game}" is running a MEHscript on exit...`, 1);
							dBug(result.script, 1);
							parseScript(result.script, {"who": who});
						}

					} else {
						outP += `\`${gameCmd}\` is not available for you yet.\n`;
						outP += readyStatus.message;
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
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("game attempted to send empty message, exception caught!", 3);
			}
		}
	},
	mail: {
		do: function(message, args) {
			let cmd = 'mail';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			let mailbox = getMail(who);

			if (!mailbox) {
				ut.chSend(message, `I can't find a mailbox for ${player.charName}, sorry!`);
				return;
			}
			let messages = mailbox.mail;
			let subCmd = args.split(' ')[0];
			subCmd = subCmd.toLowerCase();
			let msgNum = parseInt(args.split(' ')[1], 10);

			if (subCmd === "read") {
				if (!msgNum || msgNum < 0 || msgNum > messages.length) {
					outP += "That's an invalid message number. Try `mail` or `mail list` to list your mail first.";
				} else {
					let msg = messages[msgNum - 1];
					let sentTime = common.mudTime(msg.timestamp);
					outP += "```";
					outP += `  TO: ${player.charName}  FROM: ${msg.from}\n`;
					outP += `SENT ON: ${cons.MONTHS[sentTime.month]} ${sentTime.day + 1}, year ${sentTime.year}`;
					outP += `\nSUBJECT: ${msg.subject}\n-----\n`;
					outP += msg.contents;
					outP += "```";
					msg.read = true;
					mail.saveMail(mailbox, player.id);
				}
			} else if (subCmd === "send") {
				/*
				outP += "If you want to send mail, you'll need to go to a Postpigeon's Roost. Once there,\n";
				*/
				outP += "\nType `write <message>` to to compose your letter. ";
				outP += "You can make your message several lines long, but it should be under 1K chars.\n";
				outP += "Then, use the command post <character> <subject> to send your letter off!\n";
			} else if (subCmd === "del" || subCmd === "delete") {
				if (!msgNum || msgNum < 0 || msgNum > messages.length) {
					outP += "That's an invalid message number. Try `mail` or `mail list` to list your mail first.";
				} else {
					let msg = messages[msgNum - 1];

					if (!msg.read) {
						outP += "\n ** WARNING! ** You are deleting an unread message!\n";
						outP += "If you didn't mean to do this, you should do `mail undelete` now!\n";
					}
					player.deletedMail = messages.splice(msgNum - 1, 1)[0];
					mail.saveMail(mailbox, player.id);
					outP += `Message #${msgNum} was deleted. `;
					outP += "This can be undone for a limited time by doing `mail undelete`.";
				}
			} else if (subCmd === "undelete") {
				if (!player.deletedMail) {
					outP += "Unfortunately, the postpigeon was unable to find any recently deleted mail.\n";
				} else {
					let recovered = player.deletedMail;
					mail.sendMail(
						{ "from": recovered.from },
						{ "to": player },
						{
							"subject": recovered.subject,
							"contents": recovered.contents
						},
						recovered.timestamp
					);
					delete player.deletedMail;
					outP += "The postpigeon returns with the most recent message you asked it to delete.\n";
					outP += "You count yourself very lucky that it was still nearby, and vow to be more careful when deleting.";
					mail.saveMail(mailbox, player.id);
				}
			} else if (!subCmd || subCmd === "list") {
				outP += `I found ${messages.length} messages for you, ${player.charName}:\n`
				outP += "```";
				outP += "NEW |  #  |         FROM         |     SUBJECT\n"
				outP += "---------------------------------------------------------------------------\n";
				for (let msgNum = 0; msgNum < messages.length; msgNum++) {
					let msg = messages[msgNum];
					outP += (msg.read) ? "    " : " *  ";
					outP += `[${msgNum + 1}]`.padStart(5, " ");
					outP += `  ${msg.from}`.padEnd(25, " ");
					outP += `${msg.subject}`.padEnd(25, " ");
					outP += "\n";
				}
				outP += "```";
			} else {
				outP += "Type `mail` or `mail list` to check your mail. Or try `help mail` for more help."
			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("mail attempted to send empty message, exception caught!", 3);
			}
		}
	},
	write: {
		do: function(message, args) {
			let cmd = 'post';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let player = players[who];
			let outP = '';

			if (!args) {
				if (player.unsentLetter) {
					outP += "You take a look at the unsent letter you are carrying.\n"
					outP += "You remember that can replace it with `write <type your new letter here>`,\n";
					outP += "and that you can use `post <recipent> <subject>` to send it.\n";
					outP += "** -- YOUR UNSENT LETTER READS: -- **\n\n";
					outP += player.unsentLetter;
				} else {
					outP += "To write a letter, use `write <start typing your letter here>`.\n\n";
					outP += "Your letter can be several lines long, though it should be less than 1K characters. ";
					outP += "After your letter is prepared, do the `post` command to send it off.\n";
					//outP += "After your letter is prepared, visit a Postpigeon's Roost and do the `post` command.\n";
				}
			} else if (args.length > 1023) {
				outP += "While writing, you discover that you have run out of room on the paper!\n"
				outP += " _Letter too long! Please keep under 1K characters!_";
			} else {
				if (player.unsentLetter) {
					outP += "**You have replaced your previous unsent letter.**\n";
				}
				player.unsentLetter = args;
				/*
				outP += "\nNow, you need just take this to a Postpigeon's Roost, ";
				outP += "and use `post <recipient> <subject>` to send it!";
				*/
				outP += "Now, you just need to do `post <recipient> <subject>` to send it off!";
				outP += "\nIf you've made a mistake, you can can just use `write` again to overwrite it."

			}
			if (outP) {
				ut.chSend(message, outP);
			} else { // analysed, shouldn't happen
				dBug("write attempted to send empty message, exception caught!", 3);
			}
		}
	},
	post: {
		do: function(message, args) {
			let cmd = 'post';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}

			let player = players[who];
			let outP = '';

			args = args.split(' ');
			let recipient = args[0];
			args.shift();
			args = args.join(' ');
			let subject = args;

			if (!recipient) {
				outP += "Use: `post <recipient> <subject>`. Example: `post Meddlon How's it going?`\n";
				outP += "Make sure you also have written a letter using `write <type your letter here>`, first.";
			} else {
				if (!subject) {
					outP += "Use: `post <recipient> <subject>`. Example: `post Meddlon How's it going?`\n";
					outP += "Also make sure you also have written a letter using `write <type your letter here>`, first.\n";
				} else if (subject.length > 30) {
					outP += "Your subject is too long. Please limit the subject to 30 characters.";
				} else {
					let letter = player.unsentLetter;
					if (!letter) {
						outP += "\nYou need to write a letter first. Use `write <type your letter here>`.";
						outP += " You can type `write` by itself to view it. ";
						outP += "Once you're happy with your letter, then do `post <recipient> <subject>`.\n";
					} else {
						outP += `You inscribe a magic envelope to be delivered to ${recipient}.`;
						let validRecipient = false;
						let match = findChar(recipient);
						let failReason = "";
						if (match) {
							// check privacy options of target
							// and friend status if necessary
							let targetPlayer = players[match];
							let onlyFriends = targetPlayer.privacyFlag("acceptFriendMailOnly");
							if (onlyFriends) {
								if (targetPlayer.hasFriend(player.charName)) {
									validRecipient = true;
									// good to go
								} else if (targetPlayer === player) {
									failReason += `Oh wait, nevermind, this is a valid recipent. The postpigeon takes the letter, flies off and back, returning you your letter.`;
								} else {
									failReason += `**The recipient only accepts mail from those on their friend list.**`;
									// no friend, no send
								}
							} else {
								validRecipient = true; // they allow anyone to mail them
							}
						} else {
							failReason += `**That character could not be found.**`;
						}

						if (!validRecipient) {
							outP += "\nThe postpigeon glares at you. The name disappears from the envelope.\n"
							outP += "It would seem you've chosen an invalid recipent for your message.\n";
							outP += failReason;
							outP += "\nYou can try again with `post <recipient> <subject>`.";

						} else {
							// "from": a name, String; "to": a Player object
							// "subject" and "contents" are Strings
							mail.sendMail(
								{ "from": player.charName },
								{ "to": players[match] },
								{
									"subject": subject,
									"contents": letter
								},
								world.time.tickCount
							);
							outP += `\nAs soon as you finish inscribing the magic envelope, a postpigeon swoops down `;
							outP += `and takes it from your hand. You are confident it will reach ${recipient}, hampered `;
							outP += `by neither snow nor rain nor heat nor dropped packets.`;
							delete player.unsentLetter;
							players[match].sendMsg(":bird: :incoming_envelope: A postpigeon lands on your backpack and slips a letter in!" +
							  "\n_(You have new MUDmail. Use `mail list` to view your MUDmail)_");
						}
					}
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("post attempted to send empty message, exception caught!", 3);
			}
		}
	},
	friend: {
		do: function(message, args) {
			let cmd = 'friend';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			args = args.split(' ');
			let targetName = args[0];

			if (!targetName) { // Check if it has a parameter for friends
				// No parameter, print friend list
				outP += `Friends of ${player.charName}:\n`;
				player.getFriends().forEach(name => {
					outP += `${name}\n`;
				});
				outP += "\nType friend <name> to add someone as a friend today!";
			} else { // Has parameter, check if valid name
				let pid = findChar(targetName);
				if (!pid) { // not valid, send "not found"
					outP += `${targetName} not found.`;
				} else if (player.hasFriend(targetName)) { // is friend, send "already friend"
					outP += `${targetName} is already a friend.`;
				} else { // is not friend, send "added friend"
					player.friends.push(pid);
					outP += `Added ${targetName} as friend.`;
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("friend attempted to send empty message, exception caught!", 3);
			}
		}
	},
	unfriend: {
		do: function(message, args) {
			let cmd = 'unfriend';
			let who = message.author.id;
			let fail = cantDo(who, cmd);
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let player = players[who];
			let outP = '';

			args = args.split(' ');
			let targetName = args[0];

			if (!targetName) { // Check if it has a parameter for friends
				outP += "\nWho are you trying to unfriend? Use `friends` to see your friend list.";
			} else {
				let pid = findChar(targetName);
				if (!pid) {
					outP += `${targetName} not found.`;
				} else if (player.hasFriend(targetName)) {
					outP += `${targetName} has been removed from your friend list.`;
					let ind = player.friends.indexOf(pid);
					if (ind >= 0) {
						player.friends.splice(ind, 1);
					}
				} else {
					outP += `${targetName} is not a friend yet.`;
				}
			}
			if (outP) {
				ut.chSend(message, outP);
			} else {
				dBug("unfriend attempted to send empty message, exception caught!", 3);
			}
		}
	}
};
