const datapath = '../../../data/minigames/';
const savefile = 'trollgamesaved.json';
const datafile = 'trollgamedata.json';
const v = {
	saved: require(datapath + savefile),
	gameCfg: require(datapath + datafile)
};
v.choiceData = v.gameCfg.choiceData;
const cons = require('../constants.js');
const ut = require('../utils.js');
const gameHelp = "Info here: https://docs.google.com/document/d/1WzMXpXdBbbKkveYTSFdCRpvMUXHlbbnCNic2SaEtlnA/edit#heading=h.l7ulnd6rdcv2";
const pickDish = function(world) {
	// iterates over the possible choices for each dish and picks a random one
	// then saves to peristent storage for the minigame
	let chData = v.choiceData;
	let theDish = [];
	for (let i = 0; i < chData.length; i++) {
		let pick = Math.floor(Math.random() * chData[i].choices.length);
		theDish.push(pick);
	}
	v.saved.idealDish = theDish;
	
	let nowTick = world.time.tickCount;
	let numDays = v.gameCfg.reset.dishDays;
	v.saved.dishResetTick = nowTick + numDays * 240; // TODO: fix hardcoded 240
	
	ut.saveObj(v.saved, 'minigames/' + savefile);
	
	return theDish;
};
const checkDish = function(choices, world) {
	// takes in an array representing player's choices
	// example checkDish([0, 0, 2]) might be meat raw plain
	// compares with the chosen "ideal dish" read from v.saved
	// expects the array to be the correct length (same length as chosen dish)
	// returns an object:
	/*
		{
			isIdeal: boolean,
			comment: string 
		}
	*/
	
	// if it's a fail, we send back a random message saying either
	// something good or something bad (50/50 chance) about their dish
	// to allow for variety (the spice of life), we build these arrays
	// and pick at random from them
	// the elements of the array are also chosen at random from
	// multiple good/bad strings (if available) to say for each thing
	let comments = {
		good: [],
		bad: []
	};
	let comment;
	let hasFailed = false;
	
	let chData = v.choiceData;
	let ideal = v.saved.idealDish;
	
	// no ideal dish? pick one!
	if (!Array.isArray(ideal)) {
		pickDish(world);
	}
	
	// if we're past time for a new dish to be chosen, pick a new dish
	let nowTick = world.time.tickCount; 
	if (nowTick > v.saved.dishResetTick) {
		pickDish(world);
	}
	
	// ideal = [1, 2, 1]; // temporary hardcoded test data
	
	for (var traitNum = 0; traitNum < chData.length; traitNum++) {
		if (ideal[traitNum] === choices[traitNum]) {
			comments.good.push(
				chData[traitNum].choices[choices[traitNum]].good[Math.floor(Math.random() * chData[traitNum].choices[traitNum].good.length)]
			);
		} else {
			comments.bad.push(
				chData[traitNum].choices[choices[traitNum]].bad[Math.floor(Math.random() * chData[traitNum].choices[traitNum].bad.length)]
			);
			hasFailed = true;
		}
	}

	if (hasFailed) {
		let goodOrBad;
		if (comments.good.length > 0) {
			// if there's something good to say, 50% chance of saying it
			goodOrBad = (Math.random() < 0.5) ? "good" : "bad";
		} else {
			goodOrBad = "bad"; // it's all bad
		}
		comment = comments[goodOrBad][Math.floor(Math.random() * comments[goodOrBad].length)];
	} else {
		comment = "This... this is perfect!";
	}
	return {
		"isIdeal": !hasFailed,
		"comment": comment
	}
};
const defaultTimerCheck = function(player, world, cmd) {
	// returns: { isReady: boolean, message: string }
	
	let message = '';
	let isReady = false;
	
	if (!v.saved.nextUse[player.id]) {
		v.saved.nextUse[player.id] = {};
	}
	
	let nextUse = v.saved.nextUse[player.id][cmd];
	let nowTick = world.time.tickCount;
	
	console.log(`nowTick: ${nowTick}    nextUse (${cmd}): ${nextUse}`);
	
	if (!nextUse || (nowTick >= nextUse)) {
		isReady = true;
	} else {
		isReady = false;
		let returnOn = '';
		let next = ut.mudTime(nextUse - nowTick);
		
		let lessThanHr = true;
		["month", "day", "hour"].forEach(function(el) {
			if (next[el] > 0) {
				returnOn += ` ${next[el]} ${el}(s)`;
				lessThanHr = false;
			}
		});
		if (lessThanHr) { returnOn = "less than an hour"; }
		message += "**Troll Chef**, wielding a rolling pin, chases you away. \n"
		message += `**Troll Chef** says, "Out! Get out, ${player.charName}! You can try again after ${returnOn}, come back then!"`;
	}

	return { "isReady": isReady,  "message": message };
};
const noTimerCheck = function() {
	let isReady = true;
	let message = '';
	return { "isReady": isReady,  "message": message };
}
module.exports = {
	trigger: "chef",
	helpText: gameHelp,
	commands: {
		help: {
			timerCheck: noTimerCheck,
			do: function() {
				return {
					"success": true,
					"message": gameHelp
				}
			}
		},
		check: {
			timerCheck: noTimerCheck,
			rooms: ["game-cafe-kitchen", "startrek-sfhq-holodecks"],
			do: function(player, world, args) {
				let who = player.id;
				let message = '';
				let success;
				let chData = v.choiceData;
				let picks = v.saved.charPicks[who] || [];
				
				message += '**Here are your choices for the Troll Cuisine minigame:**\n\`';
				message += '---\n';
				let tmpStr;
				for (let traitNum = 0; traitNum < chData.length; traitNum++) {
					tmpStr = `For "${chData[traitNum].trait}", you have selected: `;
					tmpStr = tmpStr.padStart(52, ' ');
					message += '\n' + tmpStr;
					if (typeof picks[traitNum] === 'undefined' || picks[traitNum] === null) {
						message += `(nothing)  `;
						message += '(Valid choices:';
						for (let c = 0; c < chData[traitNum].choices.length; c++) {
							message += ' ' + chData[traitNum].choices[c].choice;
						}
						message += ')';
					} else {
						message += chData[traitNum].choices[picks[traitNum]].choice;
					}
				}
				message += '`';
				message += '\n\n**Here are the reset times**';
				let nowTick = world.time.tickCount;
				
				message += '\n  You can do `serve` again in: ';
				let cmd = 'serve';
				if (!v.saved.nextUse[player.id]) {
					v.saved.nextUse[player.id] = {};
				}
				let nextUse = v.saved.nextUse[player.id][cmd];
				let nextUseStr = '';
				if (!nextUse || (nowTick >= nextUse)) {
					nextUseStr = '**right now**.';
				} else {
					let next = ut.mudTime(nextUse - nowTick);
					let lessThanHr = true;
					["month", "day", "hour"].forEach(function(el) {
						if (next[el] > 0) {
							nextUseStr += ` ${next[el]} ${el}(s)`;
							lessThanHr = false;
						}
					});
					if (lessThanHr) { nextUseStr = "less than an hour"; }
				}
				message += nextUseStr;
				
				message += '\n  The next ideal dish change is in: ';
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
				message += nextDishStr;
				
				success = true;
				return {
					"success": success,
					"message": message
				};
			}
		},
		pick: {
			timerCheck: noTimerCheck,
			rooms: ["game-cafe-kitchen", "startrek-sfhq-holodecks"],
			do: function(player, world, args) {
				// args should be a choice from one of the traits
				// specific trait is not specified because all choices should be unique
				// returns:
				/*
					{
						success: boolean,
						message: message to output to the character running command
					}
				*/
				let who = player.id;
				let message = '';
				let success;
				let chData = v.choiceData;
				let match = false;
				for (let traitNum = 0; (traitNum < chData.length && !match); traitNum++) {
					for (let choiceNum = 0; (choiceNum < chData[traitNum].choices.length && !match); choiceNum++) {
						if (chData[traitNum].choices[choiceNum].choice === args) {
							match = {
								"trait": traitNum,
								"choice": choiceNum
							}
						}
					}
				}

				v.saved.charPicks[who] = v.saved.charPicks[who] || [];
				let picks = v.saved.charPicks[who];

				if (match) {
					// set their choice in persistent storage
					if (!picks) {
						v.saved.charPicks[who] = [];
					}
					v.saved.charPicks[who][match.trait] = match.choice;
					ut.saveObj(v.saved, 'minigames/' + savefile);
					message = `Okay, I have set the ${chData[match.trait].trait} to ${args} for you!`;
					success = true;
				} else {
					message = 'That is not a valid choice to pick from.\n';
					for (let traitNum = 0; traitNum < chData.length; traitNum++) {
						if (typeof picks[traitNum] === 'undefined' || picks[traitNum] === null) {
							message += `\nYou have not yet selected a ${chData[traitNum].trait}. `;
							message += '(Valid choices:';
							for (let c = 0; c < chData[traitNum].choices.length; c++) {
								message += ' ' + chData[traitNum].choices[c].choice;
							}
							message += ')';
						}
						success = false;
					}
				}

				return {
					"success": success,
					"message": message
				};
			}
		},
		serve: {
			timerCheck: defaultTimerCheck,
			rooms: ["game-cafe-kitchen", "startrek-sfhq-holodecks"],
			do: function(player, world, args) {
				let who = player.id;
				let message = '';
				let success;
				let chData = v.choiceData;
				let picks = v.saved.charPicks[who];
				let pickText = '';

				// first make sure they made a choice for every trait:
				if (!picks) {
					success = false;
					message = "You have not begun preparing a dish yet!\n" +
					 "Use `pick <choice>` to set up your dish first.";
				} else {
					success = true;
					for (let traitNum = 0; traitNum < chData.length; traitNum++) {
						if (typeof picks[traitNum] === 'undefined' || picks[traitNum] === null) {
							message += `\nYou have not yet selected a ${chData[traitNum].trait}. `;
							message += '(Valid choices:';
							for (let c = 0; c < chData[traitNum].choices.length; c++) {
								message += ' ' + chData[traitNum].choices[c].choice;
							}
							message += ')';
							success = false;
						} else {
							pickText += chData[traitNum].choices[picks[traitNum]].choice;
							if (traitNum < chData.length - 1) { pickText += ", " }
						}
					}
				}

				if (success) {
					message += `You serve the ${pickText} dish to the troll chef.\n`
					message += '**Troll Chef** says, "'
					let result = checkDish(picks, world);
					message += result.comment + '"';
					
					// set up when they can use it again -- later may refactor this bit
					v.saved.nextUse[who].serve = world.time.tickCount + v.gameCfg.reset.serve;
					
					// TODO: Here or in checkDish, do awards and stuff
					if (result.isIdeal) {
						message += '\nThe troll chef seems very pleased.\n';
						message += `**Troll Chef** says, "${player.charName}, you've created the perfect dish!"\n\n`;
						let xp = v.gameCfg.xpAward;
						let fame = v.gameCfg.fameAward;
						player.award(xp, 'xp');
						message += `**YOU RECEIVED ${xp} XP`;
						if (player.isRepping) {
							world.serverFame[player.server] += fame;
							message += `, AND ALSO GENERATED ${fame} FAME FOR YOUR SERVER`;
						}
						message += ' FOR GUESSING THE IDEAL DISH!**\n';
						message += '_(Ideal dishes change every so often. Use the `check` minigame command to ' +
						  ' find out about when the change will be as well as when you can `serve` again._';
					}
					
					// reset their picks
					v.saved.charPicks[who] = [];
					
					// save to persistent storage
					ut.saveObj(v.saved, 'minigames/' + savefile);
				}

				return {
					"success": success,
					"message": message
				};
			}
		}
	}
};