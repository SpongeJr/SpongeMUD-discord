/*  UTILS.JS
		- Functions for file writing
		- chSend and auSend for sending messages to message.channel or message.author
		- general purpose utility functions like makeTag, makeId, listPick()
*/
const cons = require('./constants.js');
const common = require('../lib/common.js');
const servercfgs = require("../" + cons.SERVERCFGFILE);

cons.TICKS_IN_DAY = cons.TICKS_PER_HOUR * cons.HOURS_IN_DAY; // default 240
const FS = require('fs');
const openSaves = {};
const calcFleeChance = function(skill, difficulty) {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF calcFleeChance!");
	// Examples:
	// 0.5, 0: 50% success
	// 0.5, 0.5: 25%
	// 0.5, 0.1: 45%
	// 0.8, 0.2: 64%
	// 0.8, 1: 0%
	return skill - skill * difficulty;
};

let client;
let Discord;
let battles;
let scriptFns = {};

const setClient = function(newClient) {
	client = newClient;
};
const getClient = function() {
	if (!client) {
		console.log("utils.getClient(): Client is not defined!");
	}
	return client;
};
const setDiscord = function(newDiscord) {
	Discord = newDiscord;
};
const getDiscord = function() {
	if (!Discord) {
		console.log("utils.getDiscord(): Discord is not defined!");
	}
	return Discord;
};
const getServerCfg = function(serverId) {
	if (!servercfgs) {
		console.log("utils.getServerCfg(): servercfgs is not defined!");
	}
	return servercfgs.servers[serverId];
};

const setBattles = function(newBattles) {
	battles = newBattles;
};
const getBattles = function() {
	if (!battles) {
		console.log("utils.getBattles(): battles is not defined!");
	}
	console.log("===== ut.getBattles(): RETURNING THE FOLLOWING:");
	console.log(battles);
	return battles;
};
const setScriptFns = function(newFuncs) {
	scriptFns.parseScript = newFuncs.parseScript;
	scriptFns.createScript = newFuncs.createScript;
	scriptFns.parseCommand = newFuncs.parseCommand;
};
const getScriptFns = function() {

	// TODO: maybe check for all 3?
	if (!scriptFns.parseScript) {
		console.log("utils.getScriptFns(): scriptFns.parseScript is not defined!");
	}
	return scriptFns;
};
const elementCalcFleeChance = function(skill, difficulty) {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF elementCalcFleeChance!");
  const ABSOLUTE_FLEE = 64;
  if (skill < difficulty - ABSOLUTE_FLEE) {
    return 0;
  }
  if (skill > difficulty + ABSOLUTE_FLEE) {
    return 1;
  }
  return 1/(1+Math.exp(difficulty-skill));
};
const rollDice = function(dStr) {
	// "3d4" -> 9

	dStr = dStr.split('d');
	let dice = dStr[0];
	let sides = dStr[1];
	let total = 0;

	for (let dNum = 0; dNum < dice; dNum++) {
		total += Math.floor(Math.random() * sides) + 1;
	}
	return total;
};
const resourceGather = function (rData) {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF resourceGather!");
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

			results[buckets[buckNum].name][material][rarity] += rollDice(dStr);
		}
	}
	return results;
};
const MaterialRecord = function() {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF MaterialRecord!");
	this.c = 0;
	this.u = 0;
	this.r = 0;
};
MaterialRecord.prototype.add = function(counts) {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF MaterialRecord.prototype.add!");
	this.c += counts.c || 0;
	this.u += counts.u || 0;
	this.r += counts.r || 0;
};
const playersDataOnly = function(players) {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF playersDataOnly!");
  let playersOnly = {};
  for (let player in players) {
    playersOnly[player] = players[player].getData();
  }
  return playersOnly;
};
//-----------------------------------------------------------------------------
// default common/shared methods -- probably move to something like common.js
//-----------------------------------------------------------------------------
const defaultWhereIs = function(players, rooms) {
	console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF defaultWhereIs!");
	// for now, expects players and rooms globals
	// later, this should be available!

	// will return a Room, Player, or Mob object
	// currently does not check Mobs (mobs can't carry objects anyway)
	// Future: may return a "Container" object which will be an Item
	let where;
	let entityType = this.entityType;
	let allTypes = cons.ENTITIES;

	if (entityType === allTypes.player) {
		where = rooms[this.location];
	} else if (entityType === allTypes.mob) {
		where = rooms[this.data.location];
	} else if (entityType === allTypes.item) {
		let itemLoc = this.data.location;
		// TODO: store the entityType of locations
		// for now we just determine by first char, ugh
		if (typeof itemLoc === "object" ) {
			// for future handling
			// we'll have a .entityType property on .location
			// that will tell us what it is
		} else {
			// current/legacy handling
			let firstChar = this.data.location.substring(0, 1);
			if (isNaN(parseInt(firstChar, 10))) {
				// first char not a number, so assume location is room
				where = rooms[this.data.location];
			} else {
				// assume it's a player
				where = players[this.data.location];
			}
		}
	}
	if (typeof where === 'undefined') {
		console.log(` ${this.id}.whereIs(): Undefined!`);
	}
	return where;
};
//-----------------------------------------------------------------------------
Object.assign(module.exports, {
	defaultWhereIs: defaultWhereIs,
	setClient: setClient,
	getClient: getClient,
	setDiscord: setDiscord,
	getDiscord: getDiscord,
	getServerCfg: getServerCfg,
	setBattles: setBattles,
	getBattles: getBattles,
	setScriptFns: setScriptFns,
	getScriptFns: getScriptFns,
	MaterialRecord: MaterialRecord,
	resourceGather: resourceGather,
	gatherMany: function(howMany, rData) {
		console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF gatherMany!");
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
	},
	mudTime: function(inp) {
		console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF mudTime!");
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

		let time = {
			year: year,
			month: month,
			day: day,
			hour: hour,
			remain: left
		};
		return time;
	},
	timeDiffStr: function(when) {
		// accepts an object like mudTime() returns,
		// returns a nice text string like "3 days, 2 hours" or "less than an hour"
		console.log("HEY, YOU ARE USING THE DEPRECATED VERSION OF timeDiffStr!");
		let diffStr = '';

		let lessThanHr = true;
		["month", "day", "hour"].forEach(function(el) {
			if (when[el] > 0) {
				diffStr += ` ${when[el]} ${el}(s)`;
				lessThanHr = false;
			}
		});
		if (lessThanHr) { diffStr = "less than an hour"; }

		return diffStr;
	},
	debugPrint: function(inpString){
	// throw away that old console.log and try our brand new debugPrint!
	// can add all sorts of goodies here, like sending output to a Discord chan or DN
	// for now, just checks if the global debugMode is true. If it isn't,
	// doesn't output, just returns
		if (this.debugMode) {
			console.log(inpString);
			if (this.enableDebugChan) {
				if ((inpString !== '') && (typeof inpString === 'string')) {
				// todo: rate limiter?
					if (inpString.length < 1024) {
						//BOT.channels.get(DEBUGCHAN_ID).send(inpString);
					}
				}
			}
		}
	},
	debugMode: true,
	enableDebugChan: false,
	autoEmbed: false,
	objSort: function(key, ordering) {
		// returns a function to be passed to Array.sort()
		// that sorts an array of objects by a given key
		// pass -1 as second param for reverse order
		ordering = ordering || 1;
		var theFunction = function(a, b) {
			if (a[key] < b[key]) {
				return -1 * ordering;
			} else if (a[key] === b[key]) {
				return 0;
			} else {
				return 1 * ordering;
			}
		};
		return theFunction;
	},
	msToTime: function(inp) {
		var sec = Math.floor(inp / 1000);
		var min = Math.floor(inp / (1000 * 60));
		var hr = Math.floor(inp / (1000 * 3600));
		var day = Math.floor(inp / (1000 * 3600 * 24));

		if (sec < 60) {
			return sec + ' sec ';
		} else if (min < 60) {
			return min + ' min ' + sec % 60 + ' sec ';
		} else if (hr < 24) {
			return hr + ' hr ' + min % 60 + ' min ' + sec % 60 + ' sec ';
		} else {
			return day + ' days ' + hr % 24 + ' hr ' + min % 60 + ' min ' + sec % 60 + ' sec ';
		}
	},
	hasAccess: function(who, accessArr) {
		return (who === cons.SPONGE_ID);
	},
	makeFile: function(inp) {
		let theFile = JSON.stringify(inp, null, 1);
		return theFile;
	},
	saveObj: function(obj, filename, options) {
		// Precondition: obj is passed by reference
		options = options || {};
		// options:
		//	.getData: filter out extra stuff like "allItems..."
		// 	.noLogging: What it says on the tin
		let savedObject = obj; // required, because we don't want to override the reference
		//this.debugPrint(openSaves);

		if (!filename) { // initialise the filename first, if we have a default filename, we can save it in 2 different ways and corrupt stuff
			filename = cons.OBJECTS_FILENAME;
			this.debugPrint('saveObj(): using default filename: ' + cons.DATA_DIR + cons.OBJECTS_FILENAME);
		}

		if (openSaves[filename] === "saving" || openSaves[filename] === "needs save") {
			this.debugPrint(`saveObj(): ${filename} already opened for writing, deferring!`);
			openSaves[filename] = "needs save";
			return;
		}
		// filter out the "alls" if playersOnly (getData) flag was set
		if (options.getData) {
			savedObject = common.playersDataOnly(obj);
		}

		let utils = this;
		let theFile = this.makeFile(savedObject);
		//console.log(`Begin save of ${filename}.`);
		openSaves[filename] = "saving";
		FS.writeFile(cons.DATA_DIR + filename, theFile, (err) => {
			if (err) throw err;

			if (!options.noLogging) {
				utils.debugPrint(' Object newsaved to: ' + cons.DATA_DIR + filename);
			}
			if (openSaves[filename] === "needs save") {
				openSaves[filename] = "done";
				this.saveObj(obj, filename, options); // obj is a reference
			} else {
				openSaves[filename] = "done";
			}
		});
	},
	longChSend: function(message, str, maxMsgs, emb) {
		if (typeof message === 'undefined') {
			this.debugPrint('longChSend: message is undefined!');
			return;
		}

		if (!message.hasOwnProperty('author')) {
			this.debugPrint('longChSend: No .author property on message!');
			return;
		}

		if (!message.author.hasOwnProperty('bot')) {
			this.debugPrint('longChSend: no .bot property on message.author!');
			return;
		}

		if (message.author.bot) {
			this.debugPrint(' -- Blocked a bot-to-bot m.channel.send');
			return;
		}

		if (this.autoEmbed) {
		// turn all chSend() messages into embed, if autoEmbed is on
			if (typeof emb === 'undefined') {
				emb = {"description": str};
			}
		}

		if (typeof emb !== 'undefined') {
			// we have an embed, so use it
			message.channel.send({embed: emb}).catch(reason => {
				this.debugPrint('Error sending a channel message: ' + reason);
				console.log("while sending embed, longChSend");
			});
		} else {
			// no embed, send standard message

			// truncate if pushing 6K
			if (str.length > 5994) {
				str = str.substr(0, 5994);
			}

			// [\s\S] matches all characters. 1,1998 matches all strings 1998 chars long.
			// .match() breaks a string into whatever matches ^ and array-ifies it

			var smallStr = str.match(/[\s\S]{1,1998}/g);

			if (!smallStr) {
				this.debugPrint('longChSend(): Blank message.');
				smallStr = [];
			}

			for (var i = 0; i < smallStr.length; i++) {
				message.channel.send(smallStr[i]).catch(reason => {
					this.debugPrint('Error sending a channel message: ' + reason);
					console.log("in longChSend");
				});
			}
		}
	},
	chSend: function(message, str, emb) {
		//console.log('chsend');
		// temporary stuff

		if (typeof message === 'undefined') {
			this.debugPrint('chSend: message is undefined!');
			return;
		}

		if (!message.hasOwnProperty('author')) {
			this.debugPrint('chSend: No .author property on message!');
			return;
		}

		if (!message.author.hasOwnProperty('bot')) {
			this.debugPrint('chSend: no .bot property on message.author!');
			return;
		}

		if (message.author.bot) {
			this.debugPrint(' -- Blocked a bot-to-bot m.channel.send');
			return;
		}
		if (this.autoEmbed) {
		// turn all chSend() messages into emebed, if autoEmbed is on
			if (typeof emb === 'undefined') {
				emb = {"description": str};
			}
		}

		if (typeof emb !== 'undefined') {
			// we have an embed, so use it
			message.channel.send({embed: emb}).catch(reason => {
				//this.debugPrint('Error sending a channel message: ' + reason);
			});
		} else {
			// no embed, send standard message
			//console.log(this.messageQueue.send);
			//this.messageQueue.send(message.channel, str);
			/*.catch(reason => {
				this.debugPrint('Error sending a channel message: ' + reason);
			});
			*/

			message.channel.send(str).catch(reason => {
				this.debugPrint(`Error sending a channel message: ${reason}`);
				console.log("in chSend");
			});

		}
	},
	auSend: function(message, str) {
		if (message.author.bot) {
			this.debugPrint(' -- Blocked a bot-to-bot m.author.send');
			return;
		}

		message.author.send(str).catch(reason => {
			this.debugPrint(`Error sending a DM: ${reason}`);
		});
	},
	makeAuthorTag(message) {
		return this.makeTag(message.author.id);
	},
	makeId: function(inp) {
		// strips out the first <@! and > in a string
		// if you send it a string that is already a legit id, it won't be harmed
		// if not passed a String, sends the input back
		// should always return a String
		if (typeof(inp) !== 'string') {return inp;}
		var outp = inp.replace('<', '').replace('>', '').replace('!', '').replace('@', '');
		return outp;
	},
	makeTag: function(inp) {
		// wraps a string in <@>
		var outp = `<@${inp}>`;
		return outp;
	},
	diceToRangeStr: function(dStr) {
		// "3d4" -> "3-12"

		dStr = dStr.split('d');
		let dice = dStr[0];
		let sides = dStr[1];
		return `${dice}-${dice * sides}`;
	},
	rollDice: rollDice,
	calcFleeChance: calcFleeChance,
	listPick: function(theList) {
		// expects Array, returns a random element destructively pulled from it

		var choice = Math.random() * theList.length;

		return theList.splice(choice, 1)[0];
	}
});
