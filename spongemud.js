/* Copyright 2018 Josh Kline ("SpongeJr"), 
Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:
The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
*/
const cons = require('./lib/constants.js');
const Discord = require('discord.js');
const CONFIG = require('../../' + cons.CFGFILE);
const BOT = new Discord.Client();
const FS = require('fs');

const helpfile = require('./lib/helpfile.json');

var debugPrint =function(inpString){
// throw away that old console.log and try our brand new debugPrint!
// can add all sorts of goodies here, like sending output to a Discord chan or DN
// for now, just checks if the global debugMode is true. If it isn't,
// doesn't output, just returns
	if (utils.debugMode) {
		console.log(inpString);
		if (utils.enableDebugChan) {
			if ((inpString !== '') && (typeof inpString === 'string')) {
				// todo: rate limiter?
				if (inpString.length < 1024) {
					BOT.channels.get(cons.DEBUGCHAN_ID).send(inpString);
				}
			}
		}
	}
};
//-----------------------------------------------------------------------------
var spongeBot = {};
//-----------------------------------------------------------------------------
//  MODULES
//-----------------------------------------------------------------------------

var utils = require('./lib/utils.js');
var iFic = require('./lib/ific.js');

var botStorage = {};
//-----------------------------------------------------------------------------
var msToTime = function(inp) {
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
};
//-----------------------------------------------------------------------------
var hasAccess = function(who, accessArr) {
	return (who === cons.SPONGE_ID || who === cons.ARCH_ID);
};
spongeBot.time = {
	help: 'Get info on the current MUD world date and time.',
	do: function(message, parms) {
		iFic.time.do(message, parms);
	}
}
spongeBot.look = {
	help: 'Look at the room you are in.',
	do: function(message, parms) {
		iFic.look.do(message, parms);
	}
};
spongeBot.joinmud = {
	help: 'Join SpongeMUD (extremely early pre-alpha)',
	do: function(message, parms) {
		iFic.joinmud.do(message, parms, BOT);
	}
};
spongeBot.exitmud = {
	help: 'Logoff SpongeMUD and put your character to sleep.' +
	'\nThis will prevent you from seeing people entering and leaving rooms,' +
	' saying things, and any other forms of DMs from SpongeMUD until you log' +
	' back on using `joinmud`',
	do: function(message, parms) {
		iFic.exitmud.do(message, parms, BOT);
	}
};
spongeBot.get = {
	help: '`get <item>` to pick something up',
	do: function(message, parms) {
		iFic.get.do(message, parms, BOT);
	}
};
spongeBot.go = {
	help: '`go <exit>` to move to a different location.',
	do: function(message, parms) {
		iFic.go.do(message, parms, BOT);
	}
};
spongeBot.terse = {
	help: 'Switch between terse and verbose room descriptions ' +
	  ' when travelling. `look` will always show the verbose description.',
	do: function(message, parms) {
		iFic.terse.do(message, parms, BOT);
	}
};

//-----------------------------------------------------------------------------
// Immortal commands
//-----------------------------------------------------------------------------
spongeBot.savemud = {
	access: [],
	help: '(immortals only) Does immediate saveObj on players and rooms files.',
	do: function(message, parms) {
		iFic.savemud.do(message, parms);
	}
};
spongeBot.backup = {
	access: [],
	help: '(immortals only) Does immediate backup on players and rooms files.',
	do: function(message, parms) {
		iFic.backup.do(message, parms);
	}
};
spongeBot.approve = {
	access: [],
	help: '(immortals only) `approve <discordId>` to approve a profile. (Will be by character name later)',
	do: function(message, parms) {
		iFic.approve.do(message, parms);
	}
};
spongeBot.killitem = {
	access: [],
	help: '(immortals only) perma delete an item with no undo.' +
	  '_Syntax:_ `killitem <id> <inv | here>`',
	longHelp: ' ** killitem help **\n `wizitem <id> <inv | here>`\n' +
	  'The `killitem` command permanently destroys the item with the id supplied, ' +
	  'if it is a valid target. You must specify whether the item is `here` in the ' +
	  'room or in your `inv`entory. You can destroy scenery items with `here`. ',
	do: function(message, parms) {
		iFic.killitem.do(message, parms);
	}
};
spongeBot.peek = {
	access: [],
	help: '`(immortals only) `peek <roomId>` to have a look around!',
	do: function(message, parms) {
		iFic.peek.do(message,parms);
	}
};
spongeBot.build = {
	access: [],
	help: '(immortals only) Attempts to initialize SpongeMUD',
	do: function(message, parms) {
		iFic.build.do(message, parms);
	}
};
spongeBot.setaccess = {
	help: '(Sponges only) setaccess <discordId> <integer>', 
	do: function(message, parms) {
		iFic.setaccess.do(message, parms, BOT);
	}	
};
spongeBot.nuke = {
	access: [],
	do: function(message, parms) {
		iFic.nuke.do(message, parms);
	}
};
spongeBot.getid = {
	access: [],
	do: function(message, parms) {
		iFic.getid.do(message, parms);
	}
};
spongeBot.listens = {
	access: [],
	help: '(immortals only) Show global event listeners',
	do: function(message, parms) {
		iFic.listens.do(message);
	}
};
spongeBot.who = {
	access: [],
	help: '(immortals only) Show info about a user',
	do: function(message, parms) {
		iFic.who.do(message, parms);
	}
};
//-----------------------------------------------------------------------------
// Direction aliases
//-----------------------------------------------------------------------------
spongeBot.north = {
	do: (message) => spongeBot.go.do(message, 'north')
}
spongeBot.south = {
	do: (message) => spongeBot.go.do(message, 'south')
}
spongeBot.west = {
	do: (message) => spongeBot.go.do(message, 'west')
}
spongeBot.east = {
	do: (message) => spongeBot.go.do(message, 'east')
},
spongeBot.northwest = {
	do: (message) => spongeBot.go.do(message, 'northwest')
}
spongeBot.southwest = {
	do: (message) => spongeBot.go.do(message, 'southwest')
}
spongeBot.northeast = {
	do: (message) => spongeBot.go.do(message, 'northeast')
}
spongeBot.southeast = {
	do: (message) => spongeBot.go.do(message, 'southeast')
}
spongeBot.n = spongeBot.north;
spongeBot.s = spongeBot.south;
spongeBot.w = spongeBot.west;
spongeBot.e = spongeBot.east;
spongeBot.nw = spongeBot.northwest;
spongeBot.sw = spongeBot.southwest;
spongeBot.ne = spongeBot.northeast;
spongeBot.se = spongeBot.southeast;
//-----------------------------------------------------------------------------
spongeBot.attack = {
	help: 'Attack another character or mob! (WIP)',
	do: function(message, parms) {
		iFic.attack.do(message, parms, BOT);
	}
};
spongeBot.att = spongeBot.attack; // alias

spongeBot.inv = {
	help: 'Check your inventory',
	do: function(message, parms) {
		iFic.inv.do(message, parms);
	}
};
spongeBot.say = {
	help: 'speak to those in the same location',
	do: function(message, parms) {
		iFic.say.do(message, parms, BOT);
	}
};
//-----------------------------------------------------------------------------
// wiz commands
//-----------------------------------------------------------------------------
spongeBot.wizitem = {
	help: '(wizards only) create a new item\n' +
	  '_Syntax:_ `wizitem <id> <shortname> <description>`',
	longHelp: ' ** wizitem help **\n `wizitem <id> <description>`\n' +
	  '_Syntax:_ `wizitem <id> <shortname> <description>`',
	do: function(message, parms) {
		iFic.wizitem.do(message, parms);
	}
};
spongeBot.wizprop = {
	help: '(wizards only, temporarily unlocked) create a prop (scenery) item\n' +
	  '_Syntax:_ `wizprop <id> <description>`',
	longHelp: ' ** wizprop help **\n `wizprop <id> <description>`\n' +
	  ' The current version of this command allows wizards to create a "prop".' +
	  ' Props are scenery items that do not show up in the "Obvious items" list' +
	  ' when `look`ing at a room. Props cannot be picked up. The prop will appear' +
	  ' in your inventory after creation. You should then drop it in the room' +
	  ' where you want it to become part of the scenery. Once dropped, even you' +
	  ' will not be able to pick it back up, so take care! If you do accidentally' +
	  ' drop a prop in the wrong place, `killitem <id>` can be used to destroy it.' +
	  '\n\n _Syntax:_ `wizitem <id> <description>`\n' +
	  ' `<id>` is required, should be a single word that starts with a letter, ' +
	  'and should be unique _to this room_.\n' +
	  ' `<description>` is required, and can be multiple words and include line ' +
	  'breaks and standard markdown formatting. Emoji is discouraged, and may be ' +
	  'unsupported in the future.',
	do: function(message, parms) {
		iFic.wizprop.do(message, parms);
	}
};
spongeBot.edtemp = {
	help: '(wizards only, temporarily unlocked) edit an item template' +
	  ' Use: `edtem "template id" property value` or `edtem "template id" property subproperty value',
	longHelp: 'Use this as an alias/shortcut for the wizard command `edroom exits `...',
	do: function(message, parms) {
		iFic.edtemp.do(message, parms);
	}
},
spongeBot.edex = {
	help: '(wizards only, temporarily unlocked) shortcut for `edroom exits',
	longHelp: 'Use this as an alias/shortcut for the wizard command `edroom exits `...',
	do: function(message, parms) {
		iFic.edroom.do(message, "exits " + parms);
	}
};
spongeBot.edroom = {
	help: '(wizards only, temporary unlocked) edit a room\n' +	
	  '_Syntax:_ `edroom <title | description | exits | delexit`',
	longHelp: ' ** edroom help **\n `edroom <title | description | exits | delexit>`\n' +
	  ' Use this command to edit the current room\'s title, description, or exits.' +
	  ' The room\'s id cannot be changed.\n\n _Syntax:_ \n' +
	  ' `edroom title <new title>` to change the title, which can be several words\n' +
	  ' `edroom description <new description>` to change the room\'s description. This ' +
	  ' can include line breaks and markdown. Emoji are discouraged, and may not ' +
	  ' be supported eventually. A general guideline is to be descriptive but to keep ' +
	  ' descriptions under about 1K chars or so. You can also add detail via props.\n' +
	  ' `edroom exits <exitName> <description | goesto | hidden | other property>`' +
	  ' allows you to edit the room\'s exits.\n' +
	  '   `edroom exits <exitName> <description>`: change the description' +
	  ' shown when a player `exam`ines the exit.\n   `edroom exits <exitName> goesto <roomId>`:' +
	  ' either edit or create an exit, and link it to <roomId>. You can do this even if ' +
	  ' <roomId> does not yet exist, and a fresh room will be created for you.\n' +
	  '   `edroom exits <exitName> <property> <value>` sets a property like `.hidden`. Please ' +
	  ' have a good reason for using any other properties. To set a boolean, use `TRUE` or' +
	  ' `FALSE` in all caps, such as: `edroom exits trapdoor hidden TRUE`.\n' +
	  '   `edroom exits <exitName> <property>` (with no value) is also valid. This will' +
	  ' delete a property from an exit, should you want to do that. If the property did not' +
	  ' previously exist, this form of the command will create the property and set its ' +
	  ' value to the empty string. Doing it a second time would delete that property.\n' +
 	  ' `edroom delexit <exitId>`: irreversibly delete an exit. The room it linked to' +
	  ' will not be altered in any way.\n',
	access: false,
	do: function(message, parms) {
		iFic.edroom.do(message, parms);
	}
};
spongeBot.wizroom = {
	access: false,
	help: '(wizards only, temporarily unlocked) create a room',
	do: function(message, parms) {
		iFic.wizroom.do(message, parms);
	}
};
spongeBot.wiztemp = {
	access: false,
	help: '(wizards only, temporarily unlocked?) create a tempate.\n Use: `wiztemp <"unique id name"> <shortName> <long description>`',
	do: function(message, parms) {
		iFic.wiztemp.do(message, parms);
	}
};
spongeBot.publish = {
	access: false,
	help: '(wizards only, temporarily unlocked?) create a tempate',
	do: function(message, parms) {
		iFic.publish.do(message, parms);
	}
};
//-----------------------------------------------------------------------------
spongeBot.autolog = {
	help: 'Toggles automatically logging your character out after a time.',
	do: function(message, parms) {
		iFic.autolog.do(message, parms, BOT);
	}
};
spongeBot.drop = {
	help: '`drop <item>` to drop something into the room.',
	do: function(message, parms) {
		iFic.drop.do(message, parms, BOT);
	}
};
spongeBot.list = {
	help: '`list <matchString>` show all items, exits, mobs, and characters matching the string.',
	do: function(message, args) {
		iFic.list.do(message, args);
	}
};
spongeBot.exam = {
	help: '`exam <item | exit | character | mob>` to take a closer look at something.',
	do: function(message, parms) {
		iFic.exam.do(message, parms);
	}
};
spongeBot.examine = spongeBot.exam; // alias
spongeBot.tele = {
	help: '(Wizards+ only) `tele <room>` to teleport to <room>.',
	do: function(message, parms) {
		iFic.tele.do(message, parms, BOT);
	}
};
spongeBot.sit = {
	help: "Sits down, or stands up if you're already sitting.",
	do: (message, parms) => {
		iFic.sit.do(message, parms, BOT);
	}
};
spongeBot.stand = {
	help: 'Stands up, if you aren\'t already.',
	do: (message, parms) => {
		iFic.stand.do(message, parms, BOT);
	}
};
spongeBot.me = {
	help: 'Perform a "generic action", for role-playing.',
	do: function(message, parms) {
		iFic.me.do(message, parms, BOT);
	}
};

spongeBot.title = {
	help: 'Use `profile <description>` to set the description others see when `exam`ining your character.' +
	  '\n. Changes do not take effect immediately and must be approved by an immortal.',
	do: function(message, parms) {
		iFic.title.do(message, parms);
	}
};
spongeBot.profile = {
	help: 'Use `profile <description>` to set the description others see when `exam`ining your character.' +
	  '\n. Changes do not take effect immediately and must be approved by an immortal.',
	do: function(message, parms) {
		iFic.profile.do(message, parms);
	}
};
spongeBot.age = {
	help: 'age <character> (experimental) reveal a charcters age in ticks',
	do: function(message, parms) {
		iFic.age.do(message, parms);
	}
};
spongeBot.zones = {
	help: 'Scan the world and list off all the found zones.',
	longHelp: 'Scan the world and list off all the found zones.',
	do: function(message, parms) {
		iFic.zones.do(message, parms);
	}
};
spongeBot.zone = {
	help: 'See info about the zone you are currently in.',
	longHelp: 'See info about the zone you are currently in.',
	do: function(message, parms) {
		iFic.zone.do(message, parms);
	}
};
//-----------------------------------------------------------------------------
spongeBot.v = {
	cmdGroup: 'Miscellaneous',
	do: function(message) {
		utils.chSend(message, '`' + cons.VERSION_STRING + '`');
	},
	help: 'Outputs the current bot code cons.VERSION_STRING.'
};
spongeBot.version = {
	cmdGroup: 'Miscellaneous',
	do: function(message) {
		utils.chSend(message, ':robot:` SpongeMUD v.' + cons.VERSION_STRING + ' online.`');
		utils.chSend(message, cons.SPONGEMUD_INFO);
	},
	help: 'Outputs the current bot code version and other info.'
};
spongeBot.server = {
	cmdGroup: 'Miscellaneous',
	do: function(message) {
		var server = message.guild;
		
		if (!server) {
			utils.auSend(message, ' Doesn\'t look like you sent me that message on _any_ server!');
			return;
		}
		
		var str = ' You are on ' + server.name + ', which has the id: ' + 
		  server.id + '. It was created on: ' + server.createdAt + '.';
		
		utils.chSend(message, str);
	},
	help: 'Gives info about the server on which you send me the command.'
};
spongeBot.help = {
	do: function(message, parms) {
		var outStr;
		if (parms) {
			if (typeof spongeBot[parms] !== 'undefined') {	
				if (spongeBot[parms].longHelp) {
					utils.chSend(message, spongeBot[parms].longHelp);
				} else if (spongeBot[parms].help) {
					utils.chSend(message, spongeBot[parms].help);
				} else {
					utils.chSend(message, 'I have no help about that, ' + message.author);
				}
			} else {
				
				// do check for other help topics...
				
				utils.chSend(message, 'Not a command I know, ' + message.author);
			}
		} else {
			outStr = ' ** SpongeMUD Help ** _(WIP)_\n\n' +
			  ' List of commands (may not be complete). Use `help <command>` ' +
			  ' for more information about a command. More help to come on ' +
			  ' other topics.\n\n';
			
			for (var cmd in spongeBot) {
				if (spongeBot[cmd].access) {
					// special access imm command hard block
					if (message.author.id === cons.SPONGE_ID) {
						outStr += '   _`' + cmd + '`_';
					}
				} else {
					outStr += '   `' + cmd + '`';
				}
			}
			utils.chSend(message, outStr);
		}
	}
};
//-----------------------------------------------------------------------------
BOT.on('ready', () => {
	iFic.buildDungeon(); // build dungeon (rooms object)
	iFic.buildPlayers(BOT); // build players object
	iFic.buildItems(); // rebuild items global
	debugPrint(`SpongeMUD version ${cons.VERSION_STRING} READY!`);
	BOT.user.setActivity(`SpongeMUD |  ${cons.PREFIX}joinmud to play!`, { type: 'PLAYING' });;
	if (Math.random() < 0.01) {BOT.channels.get(cons.SPAMCHAN_ID).send(`Join the MUD today with \`${cons.PREFIX}joinmud\`!`);}
	
	iFic.initTimers(BOT); // kick off all the ticks and timers and stuff
});
//-----------------------------------------------------------------------------
BOT.on('rateLimit', (info) => {
	console.log(`##### RATE LIMITED #####  ${new Date()}    Data follows:`);
	console.log(JSON.stringify(info));
});
//-----------------------------------------------------------------------------
BOT.on('message', message => {
	if (message.content.startsWith(cons.PREFIX) || message.channel.type === 'dm') {
		
		var botCmd;
		if (message.content.startsWith(cons.PREFIX)) {
			var botCmd = message.content.slice(2); // retains the whole line, minus m.
		} else {
			botCmd = message.content; // DM and didn't start with m. so whole line is command
		}
		var theCmd = botCmd.split(' ')[0];

		var parms = botCmd.replace(theCmd, ''); // remove the command itself, rest is parms
		theCmd = theCmd.toLowerCase();
		if (!spongeBot.hasOwnProperty(theCmd)) {
			// not a valid command
			return;
		}
		parms = parms.slice(1); // remove leading space
		
		if (typeof spongeBot[theCmd] !== 'undefined') {
			//debugPrint('  ' + utils.makeTag(message.author.id) + ': ' + theCmd + ' (' + parms + ') : ' + message.channel);
			debugPrint(`  @${message.author.id}: ${theCmd} (${parms})`);
			
			if (!spongeBot[theCmd].disabled) {
				if (spongeBot[theCmd].access) {
					// requires special access
					if (!hasAccess(message.author.id, spongeBot[theCmd].access)) {
						utils.chSend(message, 'Your shtyle is too weak ' +
						  'for that command, ' + message.author);
					} else {
						// missing spongebot.command.do
						if (!spongeBot[theCmd].hasOwnProperty('do')) {
							debugPrint('!!! WARNING:  BOT.on(): missing .do() on ' + theCmd +
							  ', ignoring limited-access command !' + theCmd);
						} else {
							// all good. reset users idle timeout and then run command
							iFic.idleReset(message);							
							spongeBot[theCmd].do(message, parms);
						}
					}
				} else {
					
					if (message.author.bot) {
						debugPrint('Blocked a bot-to-bot !command.');
					} else {
						if (!spongeBot[theCmd].hasOwnProperty('do')) {
							debugPrint('!!! WARNING:  BOT.on(): missing .do() on ' + theCmd +
							  ', ignoring user command !' + theCmd);
						} else {
							// all good. reset users idle timeout and then run command
							iFic.idleReset(message);
							spongeBot[theCmd].do(message, parms);
						}
					}
				}
			} else {
				utils.chSend(message, 'Sorry, that is disabled.');
			}
		} else {
			// not a valid command
		}
	}
});
//=============================================================================
BOT.login(CONFIG.token);