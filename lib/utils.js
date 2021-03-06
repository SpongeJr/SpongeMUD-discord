/*  UTILS.JS 
		- Functions for file writing
		- chSend and auSend for sending messages to message.channel or message.author
		- general purpose utility functions like makeTag, makeId, listPick()
*/

const cons = require('./constants.js');
cons.TICKS_IN_DAY =cons.TICKS_PER_HOUR * cons.HOURS_IN_DAY // default 240
const FS = require('fs');
module.exports = {
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
		}
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
	makeFile: function(inp) {
		var theFile = JSON.stringify(inp, null, 1);
		return theFile;
	},
	saveObj: function(obj, filename, options) {
		
		if (!filename) {
			filename = cons.OBJECTS_FILENAME;
			this.debugPrint('saveObj(): using default filename: ' + cons.DATA_DIR + cons.OBJECTS_FILENAME);
		}

		var writeStream = FS.createWriteStream(cons.DATA_DIR + filename, {autoClose: true});
		writeStream.write(this.makeFile(obj));
		var utils = this;
		writeStream.end(function() {
			if (!options || !options.noLogging) {
				utils.debugPrint(' Object saved to: ' + cons.DATA_DIR + filename);
			}
		});
	},
	longChSend: function(message, str, maxMsgs, emb) {
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
		// turn all chSend() messages into embed, if autoEmbed is on
			if (typeof emb === 'undefined') {
				emb = {"description": str};
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
				str = str.substr(0, 5994);
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
				this.debugPrint('Error sending a channel message: ' + reason);
			});
			
		}
	},
	auSend: function(message, str) {
		if (message.author.bot) {
			this.debugPrint(' -- Blocked a bot-to-bot m.author.send');
			return;
		}

		message.author.send(str).catch(reason => {
			this.debugPrint('Error sending a DM: ' + reason);
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
		var outp = '<@' + inp + '>';
		return outp;
	},
	diceToRangeStr: function(dStr) {
		// "3d4" -> "3-12"
		
		dStr = dStr.split('d');
		let dice = dStr[0];
		let sides = dStr[1];
		return `${dice}-${dice * sides}`;
	},
	rollDice: function(dStr) {
		// "3d4" -> 9
		
		dStr = dStr.split('d');
		let dice = dStr[0];
		let sides = dStr[1];
		let total = 0;
		
		for (let dNum = 0; dNum < dice; dNum++) {
			total += Math.floor(Math.random() * sides) + 1;
		}
		return total;		
	},
	listPick: function(theList) {
		// expects Array, returns a random element destructively pulled from it
		var choice = Math.random() * theList.length;
		return theList.splice(choice, 1);
	}
};