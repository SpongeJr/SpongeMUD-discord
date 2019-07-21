const express = require("express");

const trollGameDataPath = "../../data/minigames/";
const filePaths = {
	"world": "../../data/spongemud/world.json",
	"players": "../../data/spongemud/players.json",
	"zones": "../../data/spongemud/zones.json",
	"rooms": "../../data/spongemud/rooms.json",
	"cmdHelp": "../../data/spongemud/cmdhelp.json",
	"trollGameSaved":  trollGameDataPath + "trollgamesaved.json",
	"trollGameData":  trollGameDataPath + "trollgamedata.json"
};
const world = require('../../data/spongemud/world.json');
const players = require('../../data/spongemud/players.json');
let zones = require('../../data/spongemud/zones.json');
const rooms = require('../../data/spongemud/rooms.json');
const cons = require('../lib/constants.js');
const ut = require('../lib/utils.js');
const fs = require('fs');
let cmdHelp;
/*
const savefile = 'trollgamesaved.json';
const datafile = 'trollgamedata.json';
const v = {
	saved: require(datapath + savefile),
	gameCfg: require(datapath + datafile)
};
*/

const cors = require('cors');

const app = express();
const PORT = 5095;

app.use(cors());
//-----------------------------------------------------------------------------
const loadFile = function(whichFile, callback) {

	let data;

	if (!filePaths[whichFile]) {
		return;
	}

	let filename = filePaths[whichFile];

	let file = fs.readFile(filename, "utf8", (err, data) => {
		data = JSON.parse(data);
		callback(data);
	});
};
const findChar = function(nick, room) {
	// returns the id that matches with a nick
	for (let plId in players) {
		if (players[plId].charName === nick) {
			return plId;
		}
	}
	return false;
};
const isAtLeast = function(player, permLevel) {
	return (player.stats.accessLevel >= cons.PERM_LEVELS[permLevel]);
};
const sendCmdList = function(res) {
	res.status(200).send({
		success: 'true',
		message: 'success',
		commands: cmdHelp
	});
};
const getCmdHelp = function(cmd) {
	let result = {};
	if (cmdHelp.commands.hasOwnProperty(cmd)) {
		result.success = true;
		result.message = "success";
		data = cmdHelp.commands[cmd];
	} else {
		result.success = false;
		result.message = "No such SpongeMUD command."
	}
	return result;
};
//-----------------------------------------------------------------------------
app.use('/', function (req, res, next) {
  let now = new Date().toTimeString().split(' ')[0];
  console.log(`[${now}] REQUEST IN: ${req.path}`);

  next();
});
//-----------------------------------------------------------------------------
app.get('/api/v1/commands/list', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/commands/list
	if (!cmdHelp) {
		loadFile("cmdHelp", (help) => {
			cmdHelp = help;
			sendCmdList(res);
		});
	} else {
		sendCmdList(res);
	}
});
//-----------------------------------------------------------------------------
app.get('/api/v1/commands/', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/commands/cmd=

	let result = {};
	let success;
	let message;
	
	if (req.query.hasOwnProperty('cmd')) {
		let cmd = req.query.cmd;
		if (!cmdHelp) {
			loadFile("cmdHelp", (help) => {
				cmdHelp = help;
				result = getCmdHelp(cmd);
				success = result.success;
				message = result.message;
			});
		} else {
			result = getCmdHelp(cmd);
			success = result.success;
			message = result.message;
		}
	} else {
		success = false;
		message = "Missing query parameter. Try adding ?cmd="
	}
	res.status(200).send({
		"success": success,
		"message": message,
		"data": result.data
	});


});
//-----------------------------------------------------------------------------
app.get('/api/v1/topxp', (req, res) => {

	loadFile("players", (players) => {
		let playerArr = [];
		let topXpArr = [];
		let pl;

		for (let playerId in players) {
			let charStr;
			let pl = players[playerId];
			let profile = {};

			let pFlags = pl.privacyFlags;

			if (pFlags) {
				if (pFlags & cons.PRIVACY_FLAGS.noListScoreTables) {
					charStr = "UNKNOWN CHARACTER";
				} else {
					charStr = pl.charName;
				}
			} else {
				charStr = pl.charName;
			}

			profile.xp = pl.stats.xp;
			profile.charName = charStr;
			profile.title = cons.TITLE_LIST[pl.title];
			profile.committees = pl.committees;
			profile.isWizard = isAtLeast(pl, "wizard");
			profile.description = pl.description;
			playerArr.push(profile);
		}
		playerArr.sort(ut.objSort("xp", -1));

		topXpArr = playerArr.slice(0, 20);

		res.status(200).send({
			"success": 'true',
			"message": 'success',
			"players": topXpArr
		});
	});
});
//-----------------------------------------------------------------------------
app.get('/api/v1/worldtick', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/worldtick

	loadFile("world", (world) => {
		res.status(200).send({
			"success": 'true',
			"message": 'success',
			"worldtick": world.time.tickCount
		});
	});
});
//-----------------------------------------------------------------------------
app.get('/api/v1/zones/zonedata', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/zones/zonedata
	// how to fail if too big?
	// success: false, message: 'data too big'?
	let success;
	let message;
	let zonePlayers = {};
	loadFile("zones", (zones) => {
		loadFile("players", function(players) {
			for (let pl in players) {
				if (!rooms[players[pl].location]) {
					console.log(`/zones/players: player.${pl} is in invalid room ${players[pl].location}!`);
				} else {
					if (players[pl].posture !== 'asleep') {
						let playerZone = rooms[players[pl].location].data.zone;
						let pFlags = players[pl].privacyFlags;
						let noList = false;
						if (pFlags) {
							noList = pFlags & cons.PRIVACY_FLAGS.noListZone;
						}
						if (!noList) {
							if (!zonePlayers[playerZone]) {
								zonePlayers[playerZone] = [];
							}
							zonePlayers[playerZone].push(players[pl].charName);
							//zonePlayers.push(players[pl].charName);
						}
					}
				}
			}
			success = 'true';
			message = 'success';
			res.status(200).send({
				"success": success,
				"message": message,
				"zoneData": zonePlayers
			});
		});
	});
});
//-----------------------------------------------------------------------------
app.get('/api/v1/zones/info', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/zones/info?zone=elementallis

	let zoneList = Object.keys(zones);
	let zoneInfo;
	let success;
	let message;
	let zone;

	if (req.query.hasOwnProperty('zone')) {
		zone = req.query.zone;
	}

	loadFile("zones", (zones) => {
		if (zones.hasOwnProperty(zone)) {
			success = 'true';
			message = 'success';
			zoneInfo = Object.assign({}, zones[zone]);
			let authorIds = zoneInfo.authors;
			let authorNames = [];

			authorIds.forEach((playerId) => {
				if (players[playerId]) {
					authorNames.push(players[playerId].charName || "Unknown player" );
				}
			});
			zoneInfo.authors = authorNames;
		} else {
			success = 'true';
			message: 'fail'
			zoneInfo = 'No such zone.';
		}

		res.status(200).send({
			"success": success,
			"message": message,
			"info": zoneInfo
		});
	});
//-----------------------------------------------------------------------------
});
app.get('/api/v1/zones/players', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/zones/players?zone=startrek

	let zonePlayers = [];
	let zone;

	if (req.query.hasOwnProperty('zone')) {
		zone = req.query.zone;
	} else {
		// return "no such zone"?
	}

	loadFile("players", function(players) {
		for (let pl in players) {
			if (!rooms[players[pl].location]) {
				console.log(`/zones/players: player.${pl} is in invalid room ${players[pl].location}!`);
			} else {
				if (players[pl].posture !== 'asleep') {
					if (rooms[players[pl].location].data.zone === zone) {
						let pFlags = players[pl].privacyFlags;
						let noList = false;
						if (pFlags) {
							noList = pFlags & cons.PRIVACY_FLAGS.noListZone;
						}
						if (!noList) {
							zonePlayers.push(players[pl].charName);
						}
					}
				}
			}
		}

		res.status(200).send({
			"success": 'true',
			"message": 'success',
			"players": zonePlayers
		});
	});
});
//-----------------------------------------------------------------------------
const getPlayerAge = function(player) {
	let pFlags = player.privacyFlags;
	let noShowAge = false;
	if (pFlags) {
		noShowAge = pFlags & cons.PRIVACY_FLAGS.noShowAge;
	}

	if (!noShowAge) {
		return player.age;
	}
};
//-----------------------------------------------------------------------------
const getPlayerIdle = function(player) {
	let pFlags = player.privacyFlags;
	let noShowIdle = false;
	if (pFlags) {
		noShowIdle = pFlags & cons.PRIVACY_FLAGS.noShowIdleTicks;
	}

	if (!noShowIdle) {
		return player.idle.ticks;
	}
};
//-----------------------------------------------------------------------------
app.get('/api/v1/profile', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/profile?who=Meddlon

	let who;
	let success;
	let msg;
	let profile;
	let extendedProfile;

	if (req.query.hasOwnProperty('who')) {
		who = req.query.who;
	} else {
		// TODO: tell them to specify a character
	}

	loadFile("players", (players) => {

		let match = findChar(who);

		if (!match) {
			success = 'false';
			msg = 'No such character.';
		} else {
			let player = players[match];
			success = 'true';
			msg = 'success';
			profile = player.description || "Character has no profile.";
			extendedProfile = {
				"description": profile || "Character has no profile.",
				"age": getPlayerAge(player),
				"idle": getPlayerIdle(player),
				"xp": player.stats.xp,
				"committees": player.stats.committees
			}
		}

		res.status(200).send({
			"success": success,
			"message": msg,
			"profile": profile,
			"extendedProfile": extendedProfile
		});
	});
});
//-----------------------------------------------------------------------------
app.get('/api/v1/minigames/chef/nextdish', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/minigames/chef/nextdish
	let v = {
		"saved": {},
		"gameCfg": {}
	};

	let temp

	loadFile("trollGameSaved", (saved) => {
		v.saved = saved;
		loadFile("trollGameData", (gameCfg) => {
			v.gameCfg = gameCfg;
			let nextDishString = '';
			let nowTick = world.time.tickCount;
			let success = 'true';
			let msg = 'success';
			nextDishString += '\n  The next ideal dish change is in: ';
			let nextDish = v.saved.dishResetTick;
			let nextDishStr = '';
			if (!nextDish || (nowTick >= nextDish)) {
				nextDishStr = '**right now**.';
			} else {
				let next = ut.mudTime(nextDish - nowTick);
				let lessThanHr = true;
				["month", "day", "hour"].forEach(function(el) {
					if (next[el] > 0) {
						nextDishStr += ` ${next[el]} ${el}(s)`;
						lessThanHr = false;
					}
				});
				if (lessThanHr) { nextDishStr = "less than an hour"; }
			}
			nextDishString += nextDishStr;

		  res.status(200).send({
			"success": success,
			"message": msg,
			"nextDishTick": nextDish,
			"nextDishString": nextDishString,
		  });
		});
	});
});
//-----------------------------------------------------------------------------
app.get('/api/v1/wizards', (req, res) => {
	let success = 'true';
	let msg = 'success';
	let wizards = [];

	loadFile("players", (players) => {
		for (let pl in players) {
			if (players[pl].stats.accessLevel >= cons.PERM_LEVELS.wizard) {
				wizards.push(players[pl].charName);
			}
		}

		res.status(200).send({
			"success": success,
			"message": msg,
			"wizards": wizards
	  });
	});
});
//-----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
});
