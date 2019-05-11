const express = require('express');
const world = require('../../data/spongemud/world.json');
const players = require('../../data/spongemud/players.json');
const datapath = '../../data/minigames/';
const savefile = 'trollgamesaved.json';
const datafile = 'trollgamedata.json';
const cons = require('../lib/constants.js');
const ut = require('../lib/utils.js');
const v = {
	saved: require(datapath + savefile),
	gameCfg: require(datapath + datafile)
};
const cors = require('cors');

const app = express();
const PORT = 5050;

app.use(cors());

const findChar = function(nick, room) {
	// returns the id that matches with a nick
	
	for (let plId in players) {
		if (players[plId].charName === nick) {
			return plId;
		}
	}
	return false;
};

app.get('/api/v1/worldtick', (req, res) => {
  res.status(200).send({
    success: 'true',
    message: 'success',
    worldtick: world.time.tickCount
  })
});

app.get('/api/v1/profile', (req, res) => {
	let who;
	let success;
	let msg;
	let profile;
	
	if (req.query.hasOwnProperty('who')) {
		who = req.query.who;
	}
	
	let match = findChar(who);
	
	if (!match) {
		success = 'false';
		msg = 'No such character.';
	} else {
		success = 'true';
		msg = 'success';
		profile = players[match].description || "Character has no profile.";
	}
	
  res.status(200).send({
    success: success,
    message: msg,
    profile: profile
  });
});

app.get('/api/v1/minigames/chef/nextdish', (req, res) => {
	
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

app.get('/api/v1/wizards', (req, res) => {
	let success = 'true';
	let msg = 'success';
	
	let wizards = [];
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

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
});