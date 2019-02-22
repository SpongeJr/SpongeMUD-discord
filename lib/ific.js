var ut = require('../lib/utils.js');
var cons = require('../lib/constants.js');
var players = require('../' + cons.DATA_DIR + cons.MUD.playerFile);
var rooms = require('../' + cons.DATA_DIR + cons.MUD.roomFile);
var items = require('../' + cons.DATA_DIR + cons.MUD.itemFile);
var dungeonBuilt = false;
var noWiz = false;

var dreamStrings = {
	'inv': 'You dream about the things you own...\n',
	'go': 'You toss and turn in your sleep.\n',
	'get': 'You dream of acquiring new things...\n',
	'drop': 'Your hand twitches in your sleep.\n',
	'say': 'You mumble incomprehensibly in your sleep.\n',
	'attack': 'You dream of glorious battle!'
};
const findChar = function(nick, room) {
	// returns the id that matches with a nick, if it is in the room provided
	// leave room null to allow it to pass anywhere
	
	// check players (this sucks, will have to store in room data later)
	// horrifying.
	for (let plId in players) {
		if (players[plId].charName === nick) {
			if (players[plId].location === room || !room) {
				return plId;
			}
			break;
		}
	}
	return false;
}
const postureStr = {
	'standing': 'is standing',
	'sitting': 'is sitting',
	'resting': 'is resting',
	'asleep': 'is sleeping'
};
const isPlayer = function(who) {
	return typeof players[who] !== 'undefined';
};
const cantDo = function(who, action) {
	if (!isPlayer(who)) {
		return 'You need to `joinmud` first.';
	}
	if (players[who].posture === 'asleep') {
		return (dreamStrings[action] || 'Visions of sugarplums dance through your head.') +
		' (You are asleep. You need to `joinmud` to wake up first!)';
	}
	
	if (action === 'go') {
		if (players[who].posture === 'sitting') {
			return 'You need to `stand` up before moving.';
		}
	}
	
	if (action === 'attack') {
		if (players[who].posture === 'sitting') {
			return 'You can\'t attack from a sitting position!';
		}
	}
	
	if (action === 'tele') {
		if (players[who].posture === 'asleep') {
			return 'You can\'t tele while asleep, mainly because the code doesn\'t expect it.'
		}
	}
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
var defaultGet = function(who, client) {
	players[who].inventory[this.id] = this.id;
	delete rooms[players[who].location].data.items[this.id];
	this.data.location = who;
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	ut.saveObj(items, cons.MUD.itemFile);
	eMaster('roomGet', players[who].location, who, this.id, client);
};
var defaultDrop = function(who, where, client) {
	rooms[where].data.items[this.id] = this.id;
	this.data.location = where;
	delete players[who].inventory[this.id];
	
	ut.saveObj(rooms, cons.MUD.roomFile);
	ut.saveObj(players, cons.MUD.playerFile);
	ut.saveObj(items, cons.MUD.itemFile);
	
	if (!this.data.hidden) {
	// don't fire off event if item is hidden
		eMaster('roomDrop', where, who, this.id, client);
	}
};
var defaultDescribe = function() {
	// temporary: build a generic stat block thing
	let outStr = '**` -=[ ' + this.charName;
	outStr += ' ]=- `**\n```';
	outStr += '-'.repeat(outStr.length) + '\n';
	if (this.title) {
		outStr += '(' + this.charName + ' ' + this.title + ')\n';
	}
	for (var stat in this.stats) {
		let sLine = ' '.repeat(15) + stat;
		sLine = sLine.substr(-15);
		sLine += ' ... ' + this.stats[stat];
		outStr += sLine + '\n';
	}
	outStr += '```';
		
	return outStr;
};
var defaultAttack = function(target) {
	let hitChance = 0.4;
	let maxDmg = 3;
	let damage; 
	let outStr = '';
	let result; 
	
	// todo: allow no target -- use last target by default

	if (!target) {
		return {fail: true, outStr: 'You need to specify a target to attack!'}
	}
	
	targetId = findChar(target, this.location);
	if (!targetId) {
		return {fail: true, outStr: 'That\'s not a target I can see!'}
	}
	
	if (players[targetId].posture === 'asleep') {
		return {fail: true, outStr: target + ' is asleep and may not be attacked.'}
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
}

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

		} else if (eventName === 'roomDrop') {
			if (!eMaster.listens.roomDrop[where]) {
				// no listeners in this room.
				return;
			}
			for (let evId in eMaster.listens.roomDrop[where]) {
				eMaster.listens.roomDrop[where][evId].callback(sender, data, client);
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
		}
	}
};
eMaster.listens = {
	'roomSay': {},
	'roomDrop': {},
	'roomGet': {},
	'roomEnter': {},
	'roomExit': {},
	'roomGeneric': {},
	'areaSay': [],
};

var defaultRoomEventKiller = function(eventName, id) {

	let roomId = this.data.id;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		console.log('WARNING: Tried to kill a ' + eventName +
		  ' in ' + roomId + ' that did not have those.');
		return false;
	}
	
	if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
		console.log('WARNING: Tried to kill nonexistent ' + eventName +
		' event with id ' + id + ' in ' + roomId);
		return false;
	}
	delete(eMaster.listens[eventName][roomId][id]);
};
var defaultRoomEventHandler = function(eventName, callback, id) {

	let roomId = this.data.id;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		eMaster.listens[eventName][roomId] = {};
	}
	
	eMaster.listens[eventName][roomId][roomId] = {
		"callback": callback
	};
};
var defaultPlayerEventKiller = function(eventName, id) {

	let roomId = this.location;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		console.log('WARNING: Tried to kill a ' + eventName +
		  ' in ' + roomId + ' that did not have those.');
		return false;
	}
	
	if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
		console.log('WARNING: Tried to kill nonexistent ' + eventName +
		'event with id ' + id + ' in ' + roomId);
		return false;
	}
	delete(eMaster.listens[eventName][roomId][id]);
};
var defaultPlayerEventHandler = function(eventName, callback, id) {
	
	let pId = this.id;
	let roomId = this.location;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		eMaster.listens[eventName][roomId] = {};
	}
	
	eMaster.listens[eventName][roomId][pId] = {
		"callback": callback
	};
};
var defaultItemEventHandler = function(eventName, callback, id) {

	let roomId = this.location;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		eMaster.listens[eventName][roomId] = {};
	}
	
	eMaster.listens[eventName][roomId][this.id] = {
		"callback": callback
	};
};
var defaultItemEventKiller = function(eventName, id) {

	let roomId = this.location;
	
	if (typeof eMaster.listens[eventName][roomId] === 'undefined') {
		console.log('WARNING: Tried to kill a ' + eventName +
		  ' in ' + roomId + ' that did not have those.');
		return false;
	}
	
	if (typeof eMaster.listens[eventName][roomId][id] === 'undefined') {
		console.log('WARNING: Tried to kill nonexistent ' + eventName +
		'event with id ' + id + ' in ' + roomId);
		return false;
	}
	delete(eMaster.listens[eventName][roomId][id]);
};

var defaultRoomDescribe = function(id) {
	// builds a standard "room description string" and returns it
	var outStr = '-=-=-=-\n';
	outStr += '**' + rooms[id].data.title + '**  ' + '"`' + id + '`"\n';
	outStr += '\n' + rooms[id].data.description;
	
	// Build exits text
	if (rooms[id].data.hasOwnProperty('exits')) {
		outStr += '\n-=-=-=-\nObvious exits: ';
		for (var exName in rooms[id].data.exits) {
			if (!rooms[id].data.exits[exName].hidden) {
				outStr += '`' + exName + '`   ';
			}
		}
	} else {
		console.log('SpongeMUD: WARNING! Room ' + id + ' missing exits!');
	}
	
	// Build items text
	if (rooms[id].data.hasOwnProperty('items')) {
		
		var count = 0;
		var itemStr = '';
		for (let itemId in rooms[id].data.items) {
			console.log(itemId);
			let theItem = items[itemId];
			if (!theItem.data.hidden) {
				itemStr += theItem.data.description;
				itemStr += '(' + theItem.data.shortName + ')';
				if (!noWiz) {
					itemStr += '(' + '`' + itemId + '`)';
				}
				itemStr += ' ';
				count++;
			}
		}
		
		if (count === 0) {
			outStr += '\n_No obvious items here_';
		} else {
			outStr += '\n_Obvious items here_: ' + itemStr;
		}
	}
	
	// See who else is here. Later, let's store this in Rooms also.
	// This seems terribly expensive.
	var numHere = 0;
	var playersHereStr = '';
	for (var player in players) {
		if (players[player].location === id) {
			playersHereStr += '\n**' + players[player].charName;
			if (players[player].title) {
				playersHereStr += ' ' + players[player].title;
			}
			playersHereStr += '** ' + (postureStr[players[player].posture] || 'is') + ' here.';
			numHere++;
		}
	}
	if (numHere > 0) {
		// outStr += '\n\nWho is here: ' + playersHereStr;
		outStr += playersHereStr;
	}
	return outStr;
};
var defaultRoomShortDesc = function(id) {
	// builds a standard "short room description string" and returns it
	var outStr = '';
	outStr += '**' + rooms[id].data.title + '**  ' + '"`' + id + '`"\n';
	
	// Build exits text
	if (rooms[id].data.hasOwnProperty('exits')) {
		outStr += 'Exits: ';
		for (var exName in rooms[id].data.exits) {
			if (!rooms[id].data.exits.hidden) {
				outStr += '`' + exName + '`  ';
			}
		}
	} else {
		console.log('SpongeMUD: WARNING! Room ' + id + ' missing exits!');
	}
	
	// Build items text
	if (rooms[id].data.hasOwnProperty('items')) {
		var count = 0;
		var itemStr = '';
		for (var itemName in rooms[id].data.items) {
			if (!rooms[id].data.items[itemName].data.hidden) {
				itemStr += '`' + itemName + '`   ';
				count++;
			}
		}
		
		if (count === 0) {
			// add nothing to the output
		} else {
			outStr += '\nItems: ' + itemStr;
		}
	}
	
	// See who else is here
	var numHere = 0;
	var playersHereStr = '';
	for (var player in players) {
		if (players[player].location === id) {
			playersHereStr += '`' + players[player].charName + '` ';
			numHere++;
		}
	}
	if (numHere > 0) {
		outStr += '\nWho is here: ' + playersHereStr;
	}
	return outStr;
};
var defaultValidItems = function() {
	for (var item in this.items) {
		theItem = items[item];
		
		
	}
};
var nextId = {};

var itemGroup = {
	"junk": {
		
	},
	"potion": {
		
	},
	"unique" : {
		
	}
};
var itemTypes = {
	"energy drink": {
		group: "potion"
	},
	"healing potion": {
		group: "potion"
	},
	"empty soda can": {
		shortName: "can",
		group: "junk"
	},
	"unique": {
		group: "unique"
	},
	"soda machine": {
		group: "unique"
	}
};
var Item = function(itemType, data) {
	this.data = data || {};
	if (typeof data !== 'object') {
		data = {};
	}
	this.data.hidden = data.hidden || false; // doesn't make sense
	this.data.description = data.description || "Some object you spotted.";
	this.data.shortName = data.shortName || 'item';
	this.data.location = data.location || 'nowhere really';
	this.data.type = data.type || itemType;
	if (!nextId[itemType]) {
		nextId[itemType] = 1;
	}
	
	// stamp it with an instance # and increment the instance counter
	this.id = itemType + '##' + nextId[itemType];
	if (typeof itemTypes[itemType] === 'undefined') {
		itemTypes[itemType] = {group: "junk"};
	}
	console.log('Item "' + this.data.shortName + '" created with id: ' + this.id +
	  ' (group: ' + itemTypes[itemType].group + '). Placing in: ' + this.data.location);
	
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
	//console.log(items[this.id]);
};
Item.prototype.look = defaultLook;
Item.prototype.get = defaultGet;
Item.prototype.drop = defaultDrop;
var SceneryItem = function(data) {
	this.data = data || {};
	this.data.description = data.description || "A part of the scenery.";
	this.id = data.id;
	this.data.hidden = true;
};
SceneryItem.prototype.look = defaultLook;
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
	console.log('Item(scenery) "' + this.data.shortName + '" created with id: ' + this.id +
	  ' (group: ' + itemTypes[itemType].group + '). Placing in: ' + this.data.location);
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
var Player = function(data) {
	this.location = data.location || "airport",
	this.inventory = data.inventory || {
		"backpack": new Item("unique", {
			description: "You can keep some stuff in here safely.",
			shortName: "backpack",
			location: this.location
		})
	};
	this.charName = data.charName || 'Anonymous';
	this.stats = data.stats || {
		"shtyle": "mundane",
		"speed": 120,
		"status": "normal",
		"hp": 40,
	};
	this.stats.attackDelay = 2400;
	this.stats.attackSpamWarns = this.stats.attackSpamWarns || 0;
	this.posture = data.posture || "asleep";
	this.id = data.id;
	this.title = data.title;

	this.description = data.description || "a brave MUD tester";
	
	this.timers = {
		"nextAttack": 0,
		"nextMove": 0
	}
};
var Room = function(data) {
	// data is an object. any necessary properties not given
	// will receive default values
	
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
};
Room.prototype.on = defaultRoomEventHandler;
Room.prototype.off = defaultRoomEventKiller;
Room.prototype.describe = defaultRoomDescribe;
Room.prototype.shortDesc = defaultRoomShortDesc;
Player.prototype.describe = defaultDescribe;
Player.prototype.attack = defaultAttack;

Player.prototype.on = defaultPlayerEventHandler;
Player.prototype.off = defaultPlayerEventKiller;
Player.prototype.registerForRoomEvents = function() {
	var player = this;
	this.on('roomSay', function(whoSaid, whatSaid, client) {
		var server = client.guilds.get(players[whoSaid].server);
		var who = player.id;
		var user = server.members.get(who);
		
		if (!user) {
			console.log('WARNING! server.members.get(' + who + ') is undefined!');
			return false;
		}
		
		var whoStr;
		
		if (whoSaid === who) {
			whoStr = 'You say';
		} else {
			whoStr = '**' + players[whoSaid].charName + '** says';
		}
		user.send(whoStr + ', "' + whatSaid + '"');
	}, this.id);
	this.on('roomGet', function(whoSaid, item, client) {
		var server = client.guilds.get(players[whoSaid].server);
		var who = player.id;
		var user = server.members.get(who);
		var whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		user.send('**' + whoStr + '**' + ' picked up ' + item + '.');
	}, this.id);
	this.on('roomDrop', function(whoSaid, item, client) {
		var server = client.guilds.get(players[whoSaid].server);
		var who = player.id;
		var user = server.members.get(who);
		var whoStr;
		whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
		user.send('**' + whoStr + '**' + ' dropped ' + item + '.');
	}, this.id);
	this.on('roomExit', function(whoSaid, newRoom, client) {
		var server = client.guilds.get(players[whoSaid].server);
		var who = player.id;
		var user = server.members.get(who);
		
		if (!user) {
			console.log('WARNING! server.members.get(' + who + ') is undefined!');
			return false;
		}
		var whoStr;
		whoStr = players[whoSaid].charName;
		user.send('**' + whoStr + '**' + ' leaves towards ' + newRoom);
	}, this.id);
	this.on('roomEnter', function(whoSaid, lastRoom, client) {
		var server = client.guilds.get(players[whoSaid].server);
		var who = player.id;
		var user = server.members.get(who);
		
		if (!user) {
			console.log('WARNING! server.members.get(' + who + ') is undefined!');
			return false;
		}		
		
		var whoStr;
		whoStr = (whoSaid === who) ? 'You arrive' : '**' + players[whoSaid].charName + '** arrives';
		user.send(whoStr + ' from ' + lastRoom);
	}, this.id);
	this.on('roomGeneric', function(whoSaid, whatSaid, client) {
		var server = client.guilds.get(players[whoSaid].server);
		var who = player.id;
		var user = server.members.get(who);
		
		if (!user) {
			console.log('WARNING! server.members.get(' + who + ') is undefined!');
			return false;
		}	
		
		var whoStr;
	
		if (typeof whatSaid === 'string') {		
			whoStr = (whoSaid === who) ? 'You' : players[whoSaid].charName;
			user.send('**' + whoStr + '**' + ' ' + whatSaid);
		} else {
			whoStr = (whoSaid === who) ? whatSaid.normal[0] : '**' + players[whoSaid].charName + '** ' + whatSaid.normal[1];
			user.send(whoStr);
		}
	}, this.id);
};
Player.prototype.unregisterForRoomEvents = function() {
	this.off('roomSay', this.id);
	this.off('roomDrop', this.id);
	this.off('roomGet', this.id);
	this.off('roomEnter', this.id);
	this.off('roomExit', this.id);
	this.off('roomGeneric', this.id);
};

//------- hardcoded test room ---------
var talkingRoom = new Room({title: "A talking room?!", id: "talking room"});
talkingRoom.on('roomSay', function(whoSaid, whatSaid, client) {
	
	// find out who all is in the room
	var pLoc = players[whoSaid].location;
	var dmList = []; // list of ids
	
	for (var player in players) {
		if (players[player].location === pLoc) {
			if (players[player].server === players[whoSaid].server) {
				dmList.push(player);
			} else {
				// not same server
			}
		}
	}
	
	// DM all those that should know
	for (var i = 0; i < dmList.length; i++) {
		//var user = message.guild.members.get(dmList[i]);
		var server = client.guilds.get(players[whoSaid].server);
		var user = server.members.get(dmList[i]);
		
		if (whatSaid === 'shazam') {
			user.send('[SpongeMUD] ' + players[whoSaid].charName + ' has uttered ' +
			  'the secret password. The ground beneath you begins to shake. . .');
		} else {
			user.send('[SpongeMUD] **A voice from nowhere** says, ' +
			  'That is very interesting, ' + players[whoSaid].charName + '!"');
		}
	}
}, this.id);

var buildDungeon = function() {
	// iterates over the rooms object, reads all the .data
	// and puts it back using the Room constructor, so that
	// the rooms are all Room objects, with the appropriate
	// methods, etc.
	
	for (var room in rooms) {
		var theRoom = new Room(rooms[room].data);
		
		// wipe out any existing chars and items
		// they'll get replaced by buildPlayers() and buildItems() calling new Item
		theRoom.data.items = {};
		theRoom.data.chars = [];
		
		rooms[room] = theRoom;
	}

	console.log('Dungeon built.');
	
	//----- temporary hardcoded exit to test room -----
	rooms["talking room"].on = talkingRoom.on;
	rooms["outside poriferan oasis"].data.exits.special = {
		goesto: "talking room",
		description: "a special exit"
	};
};
var buildPlayers = function() {
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
		console.log(' Putting ' + player + ' in ' + thePlayer.location);
		rooms[thePlayer.location].data.chars.push(player);
	}
	console.log('Players database built.');
};
var buildItems = function() {
	for (var item in items) {	
		if (!items[item].type) {
			// no type found, so we'll pull it from the id
			items[item].type = items[item].id.split('##')[0];	
		}
		var theItem = new Item(items[item].type, items[item].data);
	}
	
	//----- hardcoded test "generator"-----
	var drinkMachine = new ItemGenerator('soda machine', {
		description: "This machine dispenses drinks from time to time",
		shortName: "machine",
		location: "tarmac"
	});

	/*
	drinkMachine.on('roomSay', () => {
		console.log(this);
		this.make('empty soda can', this.location);
	});
	*/

	drinkMachine.on('roomSay', function() {
		console.log(this);
		drinkMachine.make('empty soda can', {
			shortName: "can",
			location: drinkMachine.location,
			description: "An empty aluminum soda can is here."
		});
		ut.saveObj(items, cons.MUD.itemFile);
	});
	console.log(drinkMachine.id);
	rooms.tarmac.data.items[drinkMachine.id] = drinkMachine.id;
}
module.exports = {
	buildDungeon: buildDungeon,
	buildPlayers: buildPlayers,
	buildItems: buildItems,
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
				ut.longChSend(message, rooms[parms].describe(parms));
			} else {
				ut.chSend(message, 'You want to see ' + parms + ', eh?' +
				  ' I don\'t really know that place.');
			}
			
		}
	},
	go: {
		do: function(message, parms, client) {
			var who = message.author.id;
			parms = parms.split(' ');
			var where = parms[0];
			var fail = cantDo(who, 'go');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			var player = players[who];
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
						console.log('WARNING! no `.data.chars` on room ' + newLoc + '! Resetting to []!');
						rooms[newLoc].data.chars = [];
					}
					rooms[newLoc].data.chars.push(who);
					
					player.registerForRoomEvents();// now register for room events in new room
					eMaster('roomEnter', newLoc, who, oldLoc, client); // fire off roomEnter, notify everyone + us
					ut.saveObj(players, cons.MUD.playerFile); // save to disk
					if (players[who].terseTravel) {
						chanStr += rooms[newLoc].shortDesc(newLoc);
					} else {
						chanStr += rooms[newLoc].describe(newLoc);
					}
				}
			} else {
				chanStr = 'You tried to leave via ' + where + ' but that\'s not an exit!';
			}
			ut.longChSend(message, chanStr);
		}
	},
	joinmud: {
		do: function(message, parms) {
			var who = message.author.id;
			var server = message.guild;
			var player = players[who];
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
				}
				player = new Player({charName: charName, id: who, posture: "standing"});
				players[who] = player;
				ut.saveObj(players, cons.MUD.playerFile);
				ut.chSend(message, ' Welcome to SpongeMUD, ' + charName +
				  '! (' + message.author.id + '). Try `look` to get started.');
				ut.saveObj(players, cons.MUD.playerFile);
			} else {
				ut.chSend(message, ' You\'re already a SpongeMUD player. Awesome!');
			}
			if (typeof player.server === 'undefined') {
				ut.chSend(message, ' You are now logged in via ' + server.name +
				  ' (' + server.id + ')');
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
			
		}
	},
	exitmud: {
		do: function(message, parms) {
			var who = message.author.id;
			
			if (typeof players[who] === 'undefined') {
				ut.chSend(message, message.author + ', you don\'t have a SpongeMUD ' +
				  ' character that you can logout! Use `joinmud` to join the fun!');
			} else if (!players[who].server) {
				ut.chSend(message, message.author + ', ' + players[who].charName +
				  ' wasn\'t logged in. Use `joinmud` to login if you want though.');
			} else {
				ut.chSend(message, players[who].charName + ' is being logged out ' +
				  ' from server id ' + players[who].server);
				players[who].server = null;
				players[who].unregisterForRoomEvents();
				players[who].posture = 'asleep';
			}
		}
	},
	say: {
		do: function(message, parms, client) {
			
			var whatSaid = parms;
			
			if (!whatSaid) {
				ut.chSend(message, 'Cat got your tongue?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only say up to 511 characters.');
				return;
			} 
			
			var who = message.author.id;
			var fail = cantDo(who, 'say');
			if (fail) {
				ut.chSend(message, fail);
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
			console.log(eMaster.listens);
			console.log(' roomSay In this area (' + who.location + '): ');
			console.log(eMaster.listens.roomSay[who.location]);
		}
	},
	getid: {
		do: function(message, parms) {
			// getid <nick> to search globally
			// getid <roomId> to search a particular room
			// getid <here> to search current location
			
			parms = parms.split(' ');
			nick = parms[0];
			let match;
			
			if (parms[1] === 'here') {
				match = findChar(nick, players[message.author.id].location);
			} else if (parms[1]) {
				match = findChar(nick, parms[1]);
			} else {
				match = findChar(nick);
			}
			console.log(players[message.author.id].location);
			
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
			target = parms[0];

			let result = players[message.author.id].attack(target);
			
			if (result.fail) {
				ut.chSend(message, result.outStr);
			} else {
				ut.chSend(message, result.outStr);
			}
		}
	},
	look: {
		do: function(message, parms) {
			
			if (parms) {
				module.exports.exam.do(message, parms);
				return;
			}
			
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
			ut.longChSend(message, rooms[pLoc].describe(pLoc));
		}
	},
	get: {
		do: function(message, parms, client) {
			var who = message.author.id;
			var targetId;
			var choiceNum;
			var fail = cantDo(who, 'get');
			if (fail) {
				ut.chSend(message, fail);
				return false;
			}
			
			var pl = players[who];
			parms = parms.split(' ');
			var target = parms[0];
			
			choiceNum = parseInt(target.split('.')[0]);
			if (!isNaN(choiceNum)) {
				target = target.split('.')[1];
			} else {
				choiceNum = 0;
			}
			
			var choices = [];
			for (var itemId in rooms[pl.location].data.items) {
				console.log('(get list) itemId: ' + itemId);
				if (items[itemId].data.shortName.startsWith(target)) {
					if (!items[itemId].data.hidden) {
						// not "hidden"
						//ut.chSend (message, '(here) `' + items[itemId].data.shortName + '`: ' + items[itemId].data.description + '\n');
						choices.push(itemId);
					} else {
						// is "hidden"!
					}
				}
			}
			
			if (choices.length === 0) {
				ut.chSend(message, 'I see no ' + target + ' here!');
				return false;
			}
			
			if (choiceNum > choices.length) {
				ut.chSend(message, 'I see no ' + choiceNum + '.' + target + ' here!!!');
				return false;
			}
			
			if (choices.length === 1) {
				targetId = choices[0];
			} else {
				targetId = choices[choiceNum];
				ut.chSend(message, 'Found ' + choices.length + ' matches, using [' + choiceNum + ']');
			}

			if (typeof rooms[pl.location].data.items[targetId] !== 'undefined') {
				// legit target, see if it has a .get() method, though
				
				var theItem = items[targetId];
				if (typeof theItem.get === 'undefined') {
					ut.chSend(message, 'You can\'t pick **that** up!');
					return false;
				}
				
				// ok, we can let them pick it up
				// later, this will probably call theItem.get()
				theItem.get(who, client); // it's later.

			} else {
				ut.chSend(message, 'I see no ' + target + ' here.');
			}
		}
	},
	drop: {
		do: function(message, parms, client) {
			var who = message.author.id;
			var fail = cantDo(who, 'drop');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			var pl = players[who];
			parms = parms.split(' ');
			var target = parms[0];
			
			choiceNum = parseInt(target.split('.')[0]);
			if (!isNaN(choiceNum)) {
				target = target.split('.')[1];
			} else {
				choiceNum = 0;
			}
			
			var choices = [];
			for (var itemId in pl.inventory) {
				console.log('(drop list) itemId: ' + itemId);
				if (items[itemId].data.shortName.startsWith(target)) {
					choices.push(itemId);
				}
			}			
			
			if (choices.length === 0) {
				ut.chSend(message, 'I see no ' + target + ' that you can drop.');
				return false;
			}
			
			if (choiceNum > choices.length) {
				ut.chSend(message, 'I see no ' + choiceNum + '.' + target + ' here!');
				return false;
			}
			
			if (choices.length === 1) {
				targetId = choices[0];
			} else {
				targetId = choices[choiceNum];
				ut.chSend(message, 'Found ' + choices.length + ' matches, using [' + choiceNum + ']');
			}
			
			var theItem = pl.inventory[targetId];
			items[theItem].drop(who, pl.location, client);
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
				for (var item in pl.inventory) {
					outP += '`' + item + '`   ';
				}
			}
			ut.chSend(message, pl.charName + '\'s inventory: ' + outP);
		}
	},
	edroom: {
		do: function(message, parms) {
			// title, description: String
			// items: leave it out, can wizitem them
			// exits: use wizex ?
			
			var who = message.author.id;
			
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			}
			var loc = players[who].location;
			parms = parms.split(' ');
			var prop = parms[0];
			parms.shift();
			parms = parms.join(' ');
			var val = parms;
			var target;
			if (prop === 'title' || prop === 'description') {
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
						  'you do any necessary editing to it!');
						ut.saveObj(rooms, cons.MUD.roomFile);
					}
				}
			} else {
				ut.chSend(message, 'Can only edit `title`, `description` or `exits` properties. ' +
				  ' or use `delexit` to delete an exit.');
			}
		}
	},
	wizroom: {
		do: function(message, parms) {
			var who = message.author.id;
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			}
			who = message.author.id;
			parms = parms.split(' ');
			var roomId = parms[0];
			parms.shift();
			parms = parms.join(' ');
			var title = parms;
			
			if (typeof rooms[roomId] !== 'undefined') {
				ut.chSend(message, message.author + ', ' + roomId + ' is already a room!');
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
			var who = message.author.id;
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			} 
			
			if (who !== cons.SPONGE_ID && noWiz) {
				ut.chSend(message, ' magicking up items is temporarily disabled, sorry. ');
			}
			
			who = message.author.id;
			var pl = players[who];
			parms = parms.split(' ');
			var itemName = parms[0];
			
			if (itemName.length < 2 || itemName.length > 31) {
				ut.chSend(message, ' Invalid prop name. It needs to be between 2 and 31 chars.');
				return;
			}
			
			parms.shift();
			var itemDesc = parms.join(' ');
			var theItem = new SceneryItem({
				"description": itemDesc
			});
			pl.inventory[itemName] = theItem;
			ut.chSend(message, ' Gave you a prop "' + itemName + '".\n :warning:' +
			  ' When you drop it, you won\'t be able to pick it back up, so make sure ' +
			  'you drop it in the room where you want to make it part of the scenery!');
			ut.saveObj(rooms, cons.MUD.roomFile);
		}
	},
	wizitem: {
		do: function(message, parms) {
			// "itemType", shortname, description
			var who = message.author.id;
			if (!isPlayer(who)) {
				ut.chSend(message, message.author + ', you need to `!joinmud` first.');
				return;
			} 
			
			if (who !== cons.SPONGE_ID && noWiz) {
				ut.chSend(message, ' magicking up items is temporarily disabled, sorry. ');
			}
			
			who = message.author.id;
			var pl = players[who];
			
			parms = parms.split('"');
			iType = parms[1];
		
			var iType = parms[1];
			if (!iType) {
				ut.chSend(message, ' You need to specify an itemType (in quotes) as first argument!');
				return;
			}
			
			parms.shift();
			parms.shift();
			parms = parms[0].split(' ');
			parms.shift();
			
			var shortName = parms[0];
			
			if (!shortName) {
				ut.chSend(message, ' Need to specify a one-word shortName for second argument!');
				return;
			}
			
			parms.shift();
			var itemDesc = parms.join(' '); // everything that's left
			var theItem = new Item(iType, {
				"shortName": shortName,
				"description": itemDesc,
				"location": who
			});
			items[theItem.id] = theItem;
			pl.inventory[theItem.id] = theItem.id;
			
			ut.saveObj(rooms, cons.MUD.roomFile);
			ut.saveObj(players, cons.MUD.playerFile);
			ut.saveObj(items, cons.MUD.itemFile);
		}
	},
	killitem: {
		do: function(message, parms) {
			var who = message.author.id;
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
	build: {
		do: function(message, parms) {
			buildDungeon();
			buildPlayers();
			ut.chSend(message, 'SpongeMUD v0.foo: Dungeon may have been built.');
		}
	},
	exam: {
		do: function(message, parms) {
			var who = message.author.id;
			var fail = cantDo(who, 'exam'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			var pl = players[who];
			var loc = players[who].location;
			parms = parms.split(' ');
			var target = parms[0];
			
			/*
			We'd like them to be able to:
				exam <Item in Room>
				exam <Item in Inv>
				exam <Exit>
				exam <Player>
				exam <SceneryItem>
			*/
		
			var outP = '';
			var found = 0;

			// check inventory NEW
			for (var itemId in pl.inventory) {
				if (items[pl.inventory[itemId]].data.shortName.startsWith(target)) {
					outP += '(inv.) `' + items[pl.inventory[itemId]].data.shortName + '`: ' + items[pl.inventory[itemId]].data.description + '\n';
					found++;
				}
			}
			
			// check room NEW
			// items...
			for (var itemId in rooms[loc].data.items) {
				console.log('(look list) itemId: ' + itemId);
				if (items[itemId].data.shortName.startsWith(target)) {
					if (!items[itemId].data.hidden) {
						// not "hidden"
						outP += '(here) `' + items[itemId].data.shortName + '`: ' + items[itemId].data.description + '\n';
						found++;
					} else {
						// is "hidden", only use .description by itself
						outP += items[itemId].data.description + '\n';
						found++;
					}
				}
			}
			// players...
			if (!rooms[loc].data.chars) {
				console.log('WARNING! no `.data.chars` on room ' + loc + '! Resetting to []!');
				rooms[loc].data.chars = [];
			}

			for (var i = 0; i < rooms[loc].data.chars.length; i++) {
				console.log(players[rooms[loc].data.chars[i]].charName + ' is here.');
				if (players[rooms[loc].data.chars[i]].charName.startsWith(target)) {
					outP += players[rooms[loc].data.chars[i]].description;
					found++;
				}
			}

			// check exits
			if (typeof rooms[loc].data.exits[target] !== 'undefined') {
				outP += '(exit) `' + target + '`: ';
				if (rooms[loc].data.exits[target].description) {
					outP += rooms[loc].data.exits[target].description;
				} else {
					outP += ' -> ' + rooms[loc].data.exits[target].goesto;
				}
				found++;
			}
			
			if (!found) {
				outP += 'I see no ' + target + ' here.';
			}
			
			if (found > 1) {outP += '\n_(' + found + ' matches shown)_';}
			
			ut.chSend(message, outP);
		}
	},
	tele: {
		do: function(message, parms, client) {
			let who = message.author.id;
			let player = players[who];
			let target = parms;
			let fail = cantDo(who, 'tele'); 
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			let pLoc = player.location;
			let chanStr = '';
			if (typeof rooms[target] !== 'undefined') {
				ut.saveObj(players, cons.MUD.playerFile);
				ut.chSend(message, ' You teleport!');
				
				player.unregisterForRoomEvents(); // first, unregister for events in this room
				let newLoc = target; // set our target room

				eMaster('roomExit', pLoc, who, newLoc, client); // fire off roomExit, notify everyone but us
				let oldLoc = '' + pLoc; // hang onto old location
				player.location = newLoc; // actually move us
				player.registerForRoomEvents();// now register for room events in new room
				eMaster('roomEnter', newLoc, who, oldLoc, client); // fire off roomEnter, notify everyone + us
				ut.saveObj(players, cons.MUD.playerFile); // save to disk
				if (players[who].terseTravel) {
					chanStr += rooms[newLoc].shortDesc(newLoc);
				} else {
					chanStr += rooms[newLoc].describe(newLoc);
				}
			} else {
				ut.chSend(message, target + ' is not a valid room to teleport to.');
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
			var pl = players[who];
			var pLoc = pl.location;
			
			if (pl.posture === 'sitting') {
				pl.posture = 'standing';
				eMaster('roomGeneric', pLoc, who, {
					normal: ['You stand up.','stands up.']
				}, client);
				
			} else {
				pl.posture = 'sitting';
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
			
			var pl = players[who];
			var pLoc = pl.location;

			if (pl.posture === 'standing') {
				ut.chSend(message, 'You are already standing up.');
			} else {
				pl.posture = 'standing';
				eMaster('roomGeneric', pLoc, who, {
					normal: ['You stand up.','stands up.']
				}, client);
			}
		}
	},
	me: {
		do: function(message, parms, client) {
			
			var whatSaid = parms;
			
			if (!whatSaid) {
				ut.chSend(message, 'It\'s always about you, isn\'t it?');
				return;
			}
			
			if (whatSaid.length > 511) {
				ut.chSend(message, 'You may only use actions up to 511 characters.');
				return;
			} 

			var who = message.author.id;
			var fail = cantDo(who, 'me');
			if (fail) {
				ut.chSend(message, fail);
				return;
			}
			var pLoc = players[who].location;
			
			// Fire off some events -- notify eMaster
			eMaster('roomGeneric', pLoc, who, {
				normal: [
					'_' + players[who].charName + ' ' + whatSaid + '_',
					' _' + whatSaid + '_'
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
				console.log(player);
			} else {
				ut.chSend(message, 'Sorry, I couldn\'t find ' + parms);
			}
		}
	},
	nuke: {
		do: function(message, parms) {
			for (var roomId in rooms) {
				rooms[roomId].data.contents ={};
				rooms[roomId].data.items ={};
			}
			ut.chSend(message, 'All room contents nuked. :bomb: :open_mouth:');
			for (var pId in players) {
				players[pId].inventory = {};
			}
			ut.chSend(message, 'All player inventories nuked. :bomb: :open_mouth:');
		}
	}
};