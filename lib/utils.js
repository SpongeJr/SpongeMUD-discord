/*  UTILS.JS 
		- Functions for working with stats and banks
			(saveStats, loadStats, alterStat, checkStat, & helper functions,
			saveBanks & helper functions)
		- chSend and auSend for sending messages to message.channel or message.author
		- general purpose utility functions like makeTag, makeId, listPick() and bigLet()
*/

const cons = require('./constants.js');
const FS = require('fs');

module.exports = {
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
		return (who === cons.SPONGE_ID || who === cons.ARCH_ID);
	},
	collectTimer: function(message, who, timerName, timer, gameStats) {
		// who: (String) an id, or a tag (will be sent through utils.makeId() )
		// botCommand: the spongeBot.yourCommand passed in
		// timerName: the name linked to the timer in lastUsed in the stats file
		// timer: the Timer object
		// checks to see if this user can use this command yet, and if not...
		//   it sends them either .failResponse from botCommand.timedCmd or a default response
		//   failResponse can include these substitutions:
		//   <<next>> <<last>> <<nextDate>> <<lastDate>> <<cmd>> <<howOften>>
		//  and returns false;
		// If check succeeds (user can !command),
		//   returns true, and sets the lastUsed to now
		// If user has never collected (id.lastUsed.command does not exist)
		// then a new id.lastUsed.timerName will be created and set to now, and check
		// succeeds.
			
		var now = new Date();
		var timedCmd = timer;
		var lastCol = this.alterStat(this.makeId(who), 'lastUsed', timerName, 0, gameStats);
		// the alterStat call above saves to disk unnecessarily. improve later.
		var nextCol = lastCol + timedCmd.howOften - timedCmd.gracePeriod;
		now = now.valueOf();
		
		if (now > nextCol) {
			this.debugPrint('collectTimer: lastCol: ' + lastCol + '   nextCol: ' + nextCol + '   now: ' + now);
			this.setStat(this.makeId(who), 'lastUsed', timerName, now, gameStats);
			return true;
		} else {
			var failStr;
			if (!timedCmd.hasOwnProperty('failResponse')) {
				failStr = 'Ya can\'t do that yet. ' + this.makeTag(message.author.id);
				this.chSend(message, failStr);
				return false;
			} else {
				failStr = timedCmd.failResponse
				  .replace('<<next>>', this.msToTime(nextCol - now))
				  .replace('<<last>>', this.msToTime(now - lastCol))
				  .replace('<<nextDate>>', new Date(nextCol).toString())
				  .replace('<<lastDate>>', new Date(lastCol).toString())
				  .replace('<<howOften>>', this.msToTime(timedCmd.howOften - timedCmd.gracePeriod))
				  .replace('<<cmd>>', timerName);
				  
				this.chSend(message, failStr);
				return false;
			}
		}
	},
	checkTimer: function(message, who, timerName, timer, gameStats) {
		// who: (String) an id, or a tag (will be sent through utils.makeId() )
		// timerName: for in the stats file
		// timer: a Timer object (SOOON)   (currently pass the whole command)
		// checks to see if this user can use this command yet, and if not, returns false.
		// If check succeeds (user can !command), returns true, and DOES NOT ALTER lastUsed 
		// If user has never collected (id.lastUsed.command does not exist)
		// then a new id.lastUsed.command will be created and set to 0, and check
		// succeeds.

		var now = new Date();
		var timedCmd = timer;
		var lastCol = this.alterStat(this.makeId(who), 'lastUsed', timerName, 0, gameStats);
		var nextCol = lastCol + timedCmd.howOften - timedCmd.gracePeriod;
		now = now.valueOf();
		
		if (now > nextCol) {
			this.debugPrint(' BEFORE: last: ' + gameStats[who].lastUsed[timerName] + '  next: ' + gameStats[who].lastUsed[timerName]);
			this.debugPrint('checkTimer: lastCol: ' + lastCol + '   nextCol: ' + nextCol + '   now: ' + now);
			this.debugPrint(' AFTER: last: ' + gameStats[who].lastUsed[timerName] + '  next: ' + gameStats[who].lastUsed[timerName]);
			return true;
		} else {
			return false;
		}
	},
	saveBanks: function(filename, bankroll) {		
		if (!filename) {
			filename = cons.BANK_FILENAME;
		}
		var writeStream = FS.createWriteStream(filename, {autoClose: true});
		var theBankString = (JSON.stringify(bankroll, null, 1));
		writeStream.write(theBankString);
		var utils = this;
		writeStream.end(function() {
			utils.debugPrint(' Banks saved to: ' + filename);
		});		
	},
	addBank: function(who, amt, bankroll) {
		
		// WARNING: addBank now more dangeous, without this check
		// put back somewhere someday, or check before sending data up!
		/*
		if (!BOT.users.get(who)) {
			utils.debugPrint('addBank: nonexistent user: ' + who);
			return false;
		}
		*/
		var utils = this;
		if (!bankroll.hasOwnProperty(who)) {
			bankroll[who] = {};
			utils.debugPrint('!addBank: created bankroll.' + who);	
			bankroll[who].credits = cons.START_BANK;
			utils.debugPrint('addBank: New bankroll made for ' + who +
			  ' and set to ' + cons.START_BANK);
		}
		
		bankroll[who].credits += parseInt(amt);
		this.saveBanks(cons.BANK_FILENAME, bankroll);
		return bankroll[who].credits;
	},
	makeFile: function(inp) {
		var theFile = JSON.stringify(inp, null, 1);
		return theFile;
	},
	parseStatFile: function(botStorage) {
		var outp = JSON.parse(botStorage.statloaddata);
		this.debugPrint(outp);
		return outp;
	},
	loadStats: function(gameStats, botStorage) {
		var readStream = FS.createReadStream(cons.STATS_FILENAME);
		readStream.on('readable', function() {
			var chunk;
			while (null !== (chunk = readStream.read())) {
				botStorage.statloaddata = '';
				for (var i = 0; i < chunk.length; i++) {
					botStorage.statloaddata += String.fromCharCode(chunk[i]);
				};
				this.debugPrint('  loadStats(): Data chunk loaded.');
			}
		}).on('end', function(gameStats) {
			gameStats = parseStatFile(botStorage);
		});
	},
	saveStats: function(filename, gameStats) {
		if (!filename) {
			filename = cons.STATS_FILENAME;
		}
		
		var writeStream = FS.createWriteStream(filename, {autoClose: true});
		writeStream.write(this.makeFile(gameStats));
		var utils = this;
		writeStream.end(function() {
			utils.debugPrint(' Game stats saved to: ' + filename);
		});
	},
	getStat: function(who, game, stat, gameStats) {
		// returns if something does not exist, otherwise...
		// if stat is unspecified, returns all of gameStats[who][stat] object
		// if game unspecified returns all of gameStats[who] object
		// otherwise, returns the stat as stored on gameStats
		
		who = this.makeId(who);
		
		if (!gameStats.hasOwnProperty(who)) {
			return; // user doesn't exist
		} else {
			
			// no game sent up, return whole player object
			if (typeof game === 'undefined') {
				return gameStats[who];
			}
			
			// no stat sent up, return game object if possible
			if (typeof stat === 'undefined') { 
				if (!gameStats[who].hasOwnProperty(game)) {
					return; // game doesn't exist
				} else {
					return gameStats[who][game];
				}
			}	
			
			// return stat if possible
			if (!gameStats[who].hasOwnProperty(game)) {
				return; // game doesn't exist
			} else {
				if (!gameStats[who][game].hasOwnProperty(stat)) {
					return; // game exists, stat doesn't
				} else {
					return gameStats[who][game][stat];
				}
			}	
		}
	},
	addNick: function(who, nick, gameStats) {
		// adds or updates .profile.nick in gameStats
		// who is a userID (gameStats key)
		// nick is the nick you want to put there
		// gameStats is required to be passed in
		// does not add gameStats[user]
		// will check for and add .profile and .nick 
		
		if (!gameStats[who]) {
			// fail, no user
			return false;
		}
			
		if (!gameStats[who].profile) {
			// if they had no .profile, create it
			gameStats[who].profile = {};
		}
		
		if (nick === '') {
			// no nick was sent up
			if (gameStats[who].profile.hasOwnProperty('nick')) {
				// already have a .profile.nick so leave it alone
				return;
			}
		} else {
			// nick was sent up
			if (gameStats[who].profile.hasOwnProperty('nick')) {
				// already had one, update
				this.debugPrint('Changing gameStats.' + who + '.profile.nick ' +
				  ' from ' + gameStats[who].profile.nick + ' to ' + nick);
				gameStats[who].profile.nick = nick;
			} else {
				// no .profile.nick, so add it
				this.debugPrint('Adding gameStats.' + who + '.profile.nick ' +
				  ' = ' + nick);
				gameStats[who].profile.nick = nick;
			}
		}
		return;
	},
	saveObj: function(obj, filename) {
		if (!filename) {
			filename = cons.OBJECTS_FILENAME;
			this.debugPrint('saveObj(): using default filename: ' + cons.DATA_DIR + cons.OBJECTS_FILENAME);
		}

		var writeStream = FS.createWriteStream(cons.DATA_DIR + filename, {autoClose: true});
		writeStream.write(this.makeFile(obj));
		var utils = this;
		writeStream.end(function() {
			utils.debugPrint(' Object saved to: ' + cons.DATA_DIR + filename + ' overwriting old file.');
		});
	},
	setStat: function(who, game, stat, val, gameStats, filename) {
		var nick = ''; // default if we don't have a nick
		var author = {}; // in case we want to keep a passed m.author for later
		// Sets a stat. Accepts anything, even an object for val.
		// Returns: the stat's new value (what you just passed up, hopefully)
		// Does not check validity of who, game, or stat, and will make a new
		// Object key (who), game, or stat as needed if it doesn't exist.
		// If stat didn't exist, sets this new stat to 0;
		// Also does no validation on val parameter, call with care.
	
		// Also, makes sure a user has a "nick" property on their .profile
		// If you (legacy code) pass me a String, I'll do what I used to do,
		// since you must have sent me an ID to use for a key.
		// If you pass me an Object, it must have been a User data type,
		//   so I'll use the `id` property from it,
		//   and then I'll ninja their nick and add it to the stats file

		if (typeof who === 'string') {
			// old-style, ID was passed. do nothing for now
		} else if (typeof who === 'object') {
			// looks like we got a User object up in here
			nick = who.username;
			who = who.id;
		}
		
		if (!gameStats[who]) {
			gameStats[who] = {};
		}
		
		this.addNick(who, nick, gameStats); // adds or updates .profile.nick
		
		if (!gameStats[who][game]) {
			gameStats[who][game] = {};
		}
		
		if (!gameStats[who][game].hasOwnProperty(stat)) {
			gameStats[who][game][stat] = 0;
			this.debugPrint('setStat(): Made a new ' + game + ' stat for ' + who);
		}
		
		gameStats[who][game][stat] = val;
		this.saveStats(cons.STATS_FILENAME, gameStats);
		return gameStats[who][game][stat];
	},
	alterStat: function(who, game, stat, amt, gameStats, filename) {
		var nick = ''; // default if we don't have a nick
		var author = {}; // in case we want to keep a passed m.author for later
		// Alters an integer stat. Returns: the stat's new value
		// Does not check validity of who, game, or stat, and will make a new
		// Object key (who), game, or stat as needed if it doesn't exist.
		// If stat didn't exist, sets this new stat to 0;
		// Also does no validation on amount parameter, call with care.
		// Calls parseInt() on amount parameter.
		// Also, makes sure a user has a "nick" property on their .profile
		// if you (legacy code) pass me a String, I'll do what I used to do...
		// if you pass me an Object, it must have been message.author,
		//   so I'll use the `id` property from it,
		//   and then I'll ninja their nick and add it to the stats file
		// Pass no filename to use the default stats file (STATS_FILENAME in constants.js)
		// Pass the exact string 'nosave' as filename to skip saving to disk at this time

		if (typeof who === 'string') {
			// old-style, ID was passed. do nothing for now
		} else if (typeof who === 'object') {
			// looks like we got a message.author up in here
			nick = who.username;
			who = who.id;
		}
		
		if (!gameStats[who]) {
			gameStats[who] = {};
		}
		
		this.addNick(who, nick, gameStats); // adds or updates .profile.nick
		
		if (!gameStats[who][game]) {
			gameStats[who][game] = {};
		}
		
		if (!gameStats[who][game].hasOwnProperty(stat)) {
			gameStats[who][game][stat] = 0;
			this.debugPrint('alterStat(): Made a new ' + game + ' stat for ' + who);
		}
		
		// make the actual adjustment
		gameStats[who][game][stat] = parseInt(gameStats[who][game][stat]) + parseInt(amt);
		
		// save to disk or don't
		if (filename !== 'nosave') {
			if (!filename) {
				filename = cons.STATS_FILENAME;
			}	
			this.saveStats(filename, gameStats);			
		}
		return gameStats[who][game][stat];
	},
	longChSend: function(message, str, maxMsgs, emb) {
		if (typeof message === 'undefined') {
			this.debugPrint('chSend: message is undefined!');
			return
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
		// turn all chSend() messages into embed, if autoEmbed is on
			if (typeof emb === 'undefined') {
				emb = {"description": str}
			}
		}
	
		if (typeof emb !== 'undefined') {
			// we have an embed, so use it
			message.channel.send({embed: emb}).catch(reason => {
				this.debugPrint('Error sending a channel message: ' + reason);
			});
		} else {	
			// no embed, send standard message

			// truncate if pushing 6K
			if (str.length > 5994) {
				str = str.substr(0, 5994)
			}
			
			// [\s\S] matches all characters. 1,1998 matches all strings 1998 chars long.
			// .match() breaks a string into whatever matches ^ and array-ifies it
			var smallStr = str.match(/[\s\S]{1,1998}/g);
			
			for (var i = 0; i < smallStr.length; i++) {
				message.channel.send(smallStr[i]).catch(reason => {
					this.debugPrint('Error sending a channel message: ' + reason);
				});
			}
		}
	},
	chSend: function(message, str, emb) {

		// temporary stuff
		
		if (typeof message === 'undefined') {
			this.debugPrint('chSend: message is undefined!');
			return
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
				emb = {"description": str}
			}
		}
	
		if (typeof emb !== 'undefined') {
			// we have an embed, so use it
			message.channel.send({embed: emb}).catch(reason => {
				this.debugPrint('Error sending a channel message: ' + reason);
			});
		} else {	
			// no embed, send standard message
			message.channel.send(str).catch(reason => {
				this.debugPrint('Error sending a channel message: ' + reason);
			});
		}
	},
	auSend: function(message, str) {
		if (message.author.bot) {
			debugPrint(' -- Blocked a bot-to-bot m.author.send');
			return;
		}
		
		message.author.send(str).catch(reason => {
			debugPrint('Error sending a DM: ' + reason);
		});
	},
	makeBackups: function(backroll, gameStats) {
		// call me to write out backup copies of the banks.csv and stats.JSON
		// currently has never been invoked from anywhere, careful!
		this.saveBanks(cons.BANK_BACKUP_FILENAME, bankroll);
		this.saveStats(cons.STATS_BACKUP_FILENAME, gameStats);
	},
	makeAuthorTag(message) {
		return this.makeTag(message.author.id);
	},
	makeId: function(inp) {
		// strips out the first <@! and > in a string
		// if you send it a string that is already a legit id, it won't be harmed
		// if not passed a String, sends the input back
		// should always return a String
		if (typeof(inp) !== 'string') {return inp};
		var outp = inp.replace('<', '').replace('>', '').replace('!', '').replace('@', '');
		return outp;
	},
	makeTag: function(inp) {
		// wraps a string in <@>
		var outp = '<@' + inp + '>';
		return outp;
	},
	bigLet: function(inp) {
		var outp = '';
		var ch = '';
		for (var i = 0; i < inp.length; i++) {
			ch = inp.charAt(i);
			
			if (ch === ' ') {
				//TODO: figure out how to do the blank tile emoji
				//outp += '<:blank:410757195836293120>';
				outp += '<:blank1:409116028476588038> ' ;
			} else {
				ch = ch.toLowerCase();
				outp += ':regional_indicator_' + ch + ': ';
			}
		}	
		return outp;
	},
	listPick: function(theList) {
		// expects Array, returns a random element destructively pulled from it
		var choice = Math.random() * theList.length;
		return theList.splice(choice, 1);
	}
};