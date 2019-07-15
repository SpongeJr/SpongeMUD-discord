const express = require("express");

const trollGameDataPath = "../../data/minigames/";
const filePaths = {
	"world": "../../data/spongemud/world.json",
	"players": "../../data/spongemud/players.json",
	"zones": "../../data/spongemud/zones.json",
	"rooms": "../../data/spongemud/rooms.json",
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
//-----------------------------------------------------------------------------
app.get('/api/v1/worldtick', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/worldtick
	
	loadFile("world", (world) => {
		res.status(200).send({
			success: 'true',
			message: 'success',
			worldtick: world.time.tickCount
		});
	});
});
//-----------------------------------------------------------------------------
app.get('/api/v1/zones/list', (req, res) => {
	// http://api.spongemud.com:5095/api/v1/zones/list
	
	loadFile("zones", (zones) => {
		let zoneList = Object.keys(zones);

		res.status(200).send({
			success: 'true',
			message: 'success',
			zones: zoneList
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
			success: success,
			message: message,
			info: zoneInfo
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
				console.log(`/zones/players: player.${pl} is in invalid room ${players[pl].location}!`, 2);
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
			success: 'true',
			message: 'success',
			players: zonePlayers
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
			success: success,
			message: msg,
			profile: profile,
			extendedProfile: extendedProfile
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
			success: success,
			message: msg,
			nextDishTick: nextDish,
			nextDishString: nextDishString,
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
			success: success,
			message: msg,
			wizards: wizards
	  });		
	});
});
//-----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
});