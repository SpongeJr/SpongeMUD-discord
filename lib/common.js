const ut = require('../lib/utils.js');
const cons = require('./constants.js');
//-----------------------------------------------------------------------------
// Globals for SpongeMUD
const globals = {};
const setGlobal = function(name, obj) {
    globals[name] = obj;
};

const getGlobal = function(id) {
    if (Array.isArray(id)) {
        const result = {};
        id.forEach(name => {
          if (typeof globals[name] === 'undefined') globals[name] = {};
          result[name] = globals[name]
        });
        return result;
    }
    if (typeof globals[id] === 'undefined') globals[id] = {};
    return globals[id];
};
//-----------------------------------------------------------------------------
const findChar = function(nick, room) {
	// returns the id that matches with a nick, if it is in the room provided
	// leave room null to allow it to pass anywhere

	// check players (this sucks, will have to store in room data later)
	for (let plId in globals.players) {
		if (globals.players[plId].charName === nick) {
			if (globals.players[plId].location === room || !room) {
				return plId;
			}
			break;
		}
	}
	return false;
};
//-----------------------------------------------------------------------------
const calcFleeChance = function(skill, difficulty) {
	// Examples:
	// 0.5, 0: 50% success
	// 0.5, 0.5: 25%
	// 0.5, 0.1: 45%
	// 0.8, 0.2: 64%
	// 0.8, 1: 0%
	return skill - skill * difficulty;
};
const elementCalcFleeChance = function(skill, difficulty) {
  const ABSOLUTE_FLEE = 64;
  if (skill < difficulty - ABSOLUTE_FLEE) {
    return 0;
  }
  if (skill > difficulty + ABSOLUTE_FLEE) {
    return 1;
  }
  return 1/(1+Math.exp(difficulty-skill));
};
const resourceGather = function (rData) {
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
const Only = function(players) {
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
const playersDataOnly = function(players) {
  let playersOnly = {};
  for (let player in players) {
    playersOnly[player] = players[player].getData();
  }
  return playersOnly;
};
//-----------------------------------------------------------------------------
module.exports = {
  setGlobal: setGlobal,
  getGlobal: getGlobal,
  findChar: findChar,
  playersDataOnly: playersDataOnly,
  gatherMany: function(howMany, rData) {
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
  timeDiffStr: function(when) {
    // accepts an object like mudTime() returns,
    // returns a nice text string like "3 days, 2 hours" or "less than an hour"
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
  calcFleeChance: calcFleeChance,
  defaultWhereIs: defaultWhereIs,
  MaterialRecord: MaterialRecord,
	resourceGather: resourceGather
};
