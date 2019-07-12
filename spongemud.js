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

const debugPrint = function(inpString){
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
const spongeBot = {};
//-----------------------------------------------------------------------------
//  MODULES
//-----------------------------------------------------------------------------
const utils = require('./lib/utils.js');
const iFic = require('./lib/ific.js');
//-----------------------------------------------------------------------------
const hasAccess = function(who, accessArr) {
	return (who === cons.SPONGE_ID);
};
spongeBot.time = {
	help: "Get info on the current MUD world date and time.",
	do: function(message, args) {
		iFic.time.do(message, args);
	}
};
spongeBot.look = {
	help: "Look at the room you are in.",
	do: function(message, args) {
		iFic.look.do(message, args);
	}
};
spongeBot.joinmud = {
	help: "Joins SpongeMUD (wakes your character up if asleep, " +
	  " or creates a new character if you don't have one.",
	do: function(message, args) {
		iFic.joinmud.do(message, args, BOT);
	}
};
spongeBot.exitmud = {
	help: "Logoff SpongeMUD and put your character to sleep." +
	"\nThis will prevent you from seeing people entering and leaving rooms," +
	" saying things, and any other forms of DMs from SpongeMUD until you log" +
	" back on using `joinmud`",
	do: function(message, args) {
		iFic.exitmud.do(message, args, BOT);
	}
};
spongeBot.get = {
	help: "`get <item>` to pick something up",
	do: function(message, args) {
		iFic.get.do(message, args, BOT);
	}
};
spongeBot.wizget = {
	help: "Wizards can use `wizget <item>` to pick up scenery items.",
	do: function(message, args) {
		iFic.wizget.do(message, args, BOT);
	}
};
spongeBot.go = {
	help: "`go <exit>` to move to a different location.",
	do: function(message, args) {
		iFic.go.do(message, args, BOT);
	}
};
spongeBot.flee = {
	help: "If you are in combat, `flee` will let you try to escape.",
	do: function(message, args) {
		iFic.flee.do(message, args, BOT);
	}
}
spongeBot.exits = {
	help: "Use `exits` to view current exits.",
	do: function(message, args) {
		iFic.exits.do(message, args, BOT);
	}	
};
spongeBot.exit = {
	help: "Use `exit <#>` to take a numbered exit.",
	do: function(message, args) {
		iFic.exit.do(message, args, BOT);
	}	
};
spongeBot.ex = spongeBot.exit;
spongeBot.terse = {
	help: "Switch between terse and verbose room descriptions " +
	  " when travelling. `look` will always show the verbose description.",
	do: function(message, args) {
		iFic.terse.do(message, args, BOT);
	}
};
//-----------------------------------------------------------------------------
// Limited access commands
//-----------------------------------------------------------------------------
spongeBot.savemud = {
	access: [],
	help: "(immortals only) Does immediate saveObj on players and rooms files.",
	do: function(message, args) {
		iFic.savemud.do(message, args);
	}
};
spongeBot.represent = {
	help: "`represent` lets you opt-in or opt-out of generating fame for your server.",
	do: function(message, args) {
		iFic.represent.do(message, args, BOT);
	}
};
spongeBot.topfame = {
	help: "Lets you see the top servers in fame",
	do: function(message, args) {
		iFic.topfame.do(message, args, BOT);
	}
};
spongeBot.topxp = {
	help: "Lets you see the top players by XP",
	do: function(message, args) {
		iFic.topxp.do(message, args, BOT);
	}
};
spongeBot.backup = {
	access: [],
	help: "(immortals only) Does immediate backup on players and rooms files.",
	do: function(message, args) {
		iFic.backup.do(message, args);
	}
};
spongeBot.approve = {
	help: "(wizards+ only) `approve <character>` to approve a profile.",
	do: function(message, args) {
		iFic.approve.do(message, args);
	}
};
spongeBot.mute = {
	help: "(moderator command) `mute <character>` to mute someone",
	do: function(message, args) {
		iFic.mute.do(message, args);
	}
};
spongeBot.unmute = {
	help: "(moderator command) `unmute <character>` to unmute someone",
	do: function(message, args) {
		iFic.unmute.do(message, args);
	}
};
spongeBot.players = {
	access: [],
	help: "Get info about the number of players and currently active players.",
	do: function(message, args) {
		iFic.players.do(message, args);
	}
},
spongeBot.killitem = {
	access: [],
	help: "(immortals only) perma delete an item with no undo." +
	  "_Syntax:_ `killitem <id> <inv | here>`",
	longHelp: " ** killitem help **\n `wizitem <id> <inv | here>`\n" +
	  "The `killitem` command permanently destroys the item with the id supplied, " +
	  "if it is a valid target. You must specify whether the item is `here` in the " +
	  "room or in your `inv`entory. You can destroy scenery items with `here`. ",
	do: function(message, args) {
		iFic.killitem.do(message, args);
	}
};
spongeBot.peek = {
	access: [],
	help: "`(immortals only) `peek <roomId>` to have a look around!",
	do: function(message, args) {
		iFic.peek.do(message,args);
	}
};
spongeBot.pcalc = {
	help: "(testing thing) calculate power level and power points for a character of specified level",
	do: function(message, args) {
		iFic.pcalc.do(message, args);
	}
};
spongeBot.build = {
	access: [],
	help: "(immortals only) Attempts to initialize SpongeMUD",
	do: function(message, args) {
		iFic.build.do(message, args);
	}
};
spongeBot.setaccess = {
	help: "(Sponges only) setaccess <discordId> <integer>", 
	do: function(message, args) {
		iFic.setaccess.do(message, args, BOT);
	}
};
spongeBot.icanhaz = {
	help: "(Wizards+) `icanhaz <zonename>` to get the raw data of a zone you author",
	do: function(message, args) {
		iFic.icanhaz.do(message, args, BOT, Discord);
	}
};
spongeBot.nukemyzone = {
	help: "(Wizards+) `nuke <zonename>` to TOTALLY WIPE OUT YOUR ZONE SERIOUSLY FOR REAL",
	do: function(message, args) {
		iFic.nukemyzone.do(message, args, BOT, Discord);
	}
};
spongeBot.getfile = {
	help: "(Developer+ only) (you should know the syntax)",
	do: function(message, args) {
		iFic.getfile.do(message, args, BOT, Discord);
	}
};
spongeBot.nuke = {
	access: [],
	do: function(message, args) {
		iFic.nuke.do(message, args);
	}
};
spongeBot.getid = {
	access: [],
	do: function(message, args) {
		iFic.getid.do(message, args);
	}
};
spongeBot.listens = {
	access: [],
	help: "(immortals only) Show global event listeners",
	do: function(message, args) {
		iFic.listens.do(message);
	}
};
spongeBot.who = {
	access: [],
	help: "(immortals only) Show info about a user",
	do: function(message, args) {
		iFic.who.do(message, args);
	}
};
spongeBot.worldsay = {
	help: '(immortals only) broadcast a message to the world',
	do: function(message, args) {
		iFic.worldsay.do(message, args, BOT);
	}
};
spongeBot.worldcast = {
	help: '(immortals only) broadcast a message to the world',
	do: function(message, args) {
		iFic.worldcast.do(message, args, BOT);
	}
};
//-----------------------------------------------------------------------------
// Wizard commands
//-----------------------------------------------------------------------------
spongeBot.wizitem = {
	help: '(wizards only) create a new item\n' +
	  '_Syntax:_ `wizitem <id> <shortname> <description>`',
	longHelp: ' ** wizitem help **\n `wizitem <id> <description>`\n' +
	  '_Syntax:_ `wizitem <id> <shortname> <description>`',
	do: function(message, args) {
		iFic.wizitem.do(message, args);
	}
};
spongeBot.wizmob = {
	help: '(wizards only) (non-functional) create a new mob from a mob template\n',
	do: function(message, args) {
		iFic.wizmob.do(message, args);
	}
};
spongeBot.makemob = {
	help: '(wizards only) (non-functional) turn a held template into a mob\n',
	do: function(message, args) {
		//iFic.makemob.do(message, args);
	}
};
spongeBot.makeprop = {
	help: 'Use to turn a template you are holding into a prop before `publish`ing.',
	longHelp: ' ** PROPS HELP **\n ' +
	  ' makeprop`: Use to turn a template you are holding into a prop before `publish`ing.\n' +
	  ' The current version of this command allows wizards to create a "prop".' +
	  ' Props are scenery items that do not show up in the "Obvious items" list' +
	  ' when `look`ing at a room. Props cannot be picked up. The prop will appear' +
	  ' in your inventory after creation. You should then drop it in the room' +
	  ' where you want it to become part of the scenery. Once dropped, even you' +
	  ' will not be able to pick it back up, so take care!',
	do: function(message, args) {
		iFic.makeprop.do(message, args);
	}
};
spongeBot.edtemp = {
	help: '(wizards only) edit an item template' +
	  ' Use: `edtem "template id" property value` or `edtem "template id" property subproperty value',
	longHelp: '(wizards only, temporarily unlocked) edit an item template' +
	  ' Use: `edtem "template id" property value` or `edtem "template id" property subproperty value',
	do: function(message, args) {
		iFic.edtemp.do(message, args);
	}
};
spongeBot.edex = {
	help: '(wizards only) shortcut for `edroom exits',
	longHelp: 'Use this as an alias/shortcut for the wizard command `edroom exits `...',
	do: function(message, args) {
		iFic.edroom.do(message, "exits " + args, BOT);
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
	do: function(message, args) {
		iFic.edroom.do(message, args, BOT);
	}
};
spongeBot.wiztemp = {
	access: false,
	help: '(wizards only) create a tempate.\n Use: `wiztemp <"unique id name"> <shortName> <long description>`',
	do: function(message, args) {
		iFic.wiztemp.do(message, args);
	}
};
spongeBot.publish = {
	access: false,
	help: '(wizards only) publish a pending template',
	do: function(message, args) {
		iFic.publish.do(message, args);
	}
};
spongeBot.wiztele = {
	help: '(Wizards+ only) `wiztele <room>` to teleport to <room>.',
	do: function(message, args) {
		iFic.wiztele.do(message, args, BOT);
	}
};
//-----------------------------------------------------------------------------
// Gathering and Crafting commands
//-----------------------------------------------------------------------------
spongeBot.survey = {
	help: 'Survey a room for potential resources. Requires surveypoints.',
	do: function(message, args) {
		iFic.survey.do(message, args);
	}
};
spongeBot.gather = {
	help: 'Gather resources from a room you have `survey`ed. Required gatherpoints.',
	do: function(message, args) {
		iFic.gather.do(message, args);
	}
};
spongeBot.claim = {
	help: '`claim <resource> <# points to spend>`: Lay claim to a resource in the current room.' +
	  '\nYou can also use this to change the number of points you already have allotted to a resource.' +
	  '\nExample: `claim plants 20` would allocate 20 gathering points to plants in the current room.',
	do: function(message, args) {
		iFic.claim.do(message, args);
	}
};
spongeBot.craft = {
	help: 'Be all crafty and stuff.',
	do: function(message, args) {
		iFic.craft.do(message, args);
	}
};
spongeBot.recipe = {
	help: 'See a crafting recipe.',
	do: function(message, args) {
		iFic.recipe.do(message, args);
	}
};
//-----------------------------------------------------------------------------
// Direction aliases
//-----------------------------------------------------------------------------
spongeBot.north = {
	do: (message) => spongeBot.go.do(message, 'north')
};
spongeBot.south = {
	do: (message) => spongeBot.go.do(message, 'south')
};
spongeBot.west = {
	do: (message) => spongeBot.go.do(message, 'west')
};
spongeBot.east = {
	do: (message) => spongeBot.go.do(message, 'east')
};
spongeBot.northwest = {
	do: (message) => spongeBot.go.do(message, 'northwest')
};
spongeBot.southwest = {
	do: (message) => spongeBot.go.do(message, 'southwest')
};
spongeBot.northeast = {
	do: (message) => spongeBot.go.do(message, 'northeast')
};
spongeBot.southeast = {
	do: (message) => spongeBot.go.do(message, 'southeast')
};
spongeBot.up = {
	do: (message) => spongeBot.go.do(message, 'up')
};
spongeBot.down = {
	do: (message) => spongeBot.go.do(message, 'down')
};
spongeBot.n = spongeBot.north;
spongeBot.s = spongeBot.south;
spongeBot.w = spongeBot.west;
spongeBot.e = spongeBot.east;
spongeBot.nw = spongeBot.northwest;
spongeBot.sw = spongeBot.southwest;
spongeBot.ne = spongeBot.northeast;
spongeBot.se = spongeBot.southeast;
spongeBot.u = spongeBot.up;
spongeBot.d = spongeBot.down;
//-----------------------------------------------------------------------------
spongeBot.attack = {
	help: 'Attack another character or mob! (WIP)',
	do: function(message, args) {
		iFic.attack.do(message, args, BOT);
	}
};
spongeBot.att = spongeBot.attack; // alias
spongeBot.kill = spongeBot.attack;  // alias
spongeBot.wield = {
	help: 'Equip something like a weapon',
	do: function(message, args) {
		iFic.wield.do(message, args, BOT);
	}
};
spongeBot.equip = spongeBot.wield; // alias
spongeBot.eq = spongeBot.equip; // alias
spongeBot.unwield = {
	help: 'Unequip something like a weapon',
	do: function(message, args) {
		iFic.unwield.do(message, args, BOT);
	}
};
spongeBot.unequip = spongeBot.unwield; // alias
spongeBot.uneq = spongeBot.unequip // alias
spongeBot.inv = {
	help: 'Check your inventory',
	do: function(message, args) {
		iFic.inv.do(message, args);
	}
};
spongeBot.say = {
	help: 'speak to those in the same location',
	do: function(message, args) {
		iFic.say.do(message, args, BOT);
	}
};
spongeBot.yell = {
	help: 'yell to those in the same zone as you',
	do: function(message, args) {
		iFic.yell.do(message, args, BOT);
	}
};
//-----------------------------------------------------------------------------
spongeBot.privacy = {
	help: 'Display or edit your privacy-related options.',
	do: function(message, args) {
		iFic.privacy.do(message, args, BOT);
	}
};
spongeBot.autolog = {
	help: 'Toggles automatically logging your character out after a time.',
	do: function(message, args) {
		iFic.autolog.do(message, args, BOT);
	}
};
spongeBot.drop = {
	help: '`drop <item>` to drop something into the room.',
	do: function(message, args) {
		iFic.drop.do(message, args, BOT);
	}
};
spongeBot.crush = {
	help: '`crush <item>` to destroy an item in your inventory.',
	do: function(message, args) {
		iFic.crush.do(message, args, BOT);
	}
};
spongeBot.use = {
	help: '`use <item>` to use something.',
	do: function(message, args) {
		iFic.use.do(message, args, BOT);
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
	do: function(message, args) {
		iFic.exam.do(message, args);
	}
};
spongeBot.examine = spongeBot.exam; // alias
spongeBot.recall = {
	help: '`recall` Instantly teleports you to a recall point you have set.\n' +
	'This command is usable once per day. To set your recall point, use `setrecall`.',
	do: function(message, args) {
		iFic.recall.do(message, args, BOT);
	}
};
spongeBot.setrecall = {
	help: '`setrecall` sets your recall point for use with `recall`\n' +
	'Note: Only some rooms may be set as recall points.',
	do: function(message, args) {
		iFic.setrecall.do(message, args, BOT);
	}
};
spongeBot.sit = {
	help: "Sits down, or stands up if you're already sitting.",
	do: (message, args) => {
		iFic.sit.do(message, args, BOT);
	}
};
spongeBot.stand = {
	help: 'Stands up, if you aren\'t already.',
	do: (message, args) => {
		iFic.stand.do(message, args, BOT);
	}
};
spongeBot.me = {
	help: 'Perform a "generic action", for role-playing.',
	do: function(message, args) {
		iFic.me.do(message, args, BOT);
	}
};
spongeBot.title = {
	help: 'Set your characters title, or set no title. Try `title` by itself for more help.',
	do: function(message, args) {
		iFic.title.do(message, args);
	}
};
spongeBot.profile = {
	help: "Use `profile <character>` to view another charcter's profile",
	do: function(message, args) {
		iFic.profile.do(message, args, BOT);
	}
};
spongeBot.setprofile = {
	help: 'Use `setprofile <description>` to set the description others see when `exam`ining your character.' +
	  '\n. Changes do not take effect immediately and must be approved by an immortal.',
	do: function(message, args) {
		iFic.setprofile.do(message, args);
	}
};
spongeBot.age = {
	help: 'age <character> reveal a charcter\'s age in ticks',
	do: function(message, args) {
		iFic.age.do(message, args);
	}
};
spongeBot.zones = {
	help: 'Scan the world and list off all the found zones.',
	longHelp: 'Scan the world and list off all the found zones.',
	do: function(message, args) {
		iFic.zones.do(message, args);
	}
};
spongeBot.zone = {
	help: 'See info about the zone you are currently in.',
	longHelp: 'See info about the zone you are currently in.',
	do: function(message, args) {
		iFic.zone.do(message, args);
	}
};
spongeBot.mail = {
	help: "Work with MUDmail",
	longHelp: "Command for working with MUDmail",
	do: function(message, args) {
		iFic.mail.do(message, args);
	}
};
spongeBot.post = {
	help: "Create an envelope for sending MUDmail",
	longHelp: "Create an envelope for sending MUDmail",
	do: function(message, args) {
		iFic.post.do(message, args);
	}
};
//-----------------------------------------------------------------------------
spongeBot.game = {
	cmdGroup: 'Minigames',
	help: 'For interaction with minigames.',
	longHelp: 'For interaction with minigames. Use: `game <gameName> <gameCommand>` \n' +
		' Current minigames:\n `chef`: "Troll cuisine"',
	do: function(message, args, BOT) {
		iFic.game.do(message, args);
	}
};
//-----------------------------------------------------------------------------
spongeBot.menu = {
	cmdGroup: 'Miscellaneous',
	help: 'If you are in a room with a menu interface available, use `menu` to view the menu.',
	do: function(message, args) {
		iFic.menu.do(message, args)
	}
}
spongeBot.setmacro = {
	cmdGroup: 'Miscellaneous',
	help: 'Use to set a personal macro.',
	longHelp: 'Use `setmacro <#> <command>` to set a personal macro that you then ' +
		`can activate using \`${cons.PLAYER_MACRO_LETTER} <#>\` at any time`,
	do: function(message, args, BOT) {
		iFic.setmacro.do(message, args);
	}
};
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
		let server = message.guild;
		
		if (!server) {
			utils.auSend(message, ' Doesn\'t look like you sent me that message on _any_ server!');
			return;
		}
		
		let str = ` You are on ${server.name}, which has the id: ${server.id}` +
		  `. It was created on: ${server.createdAt}.`;
		
		utils.chSend(message, str);
	},
	help: 'Gives info about the server on which you send me the command.'
};
spongeBot.help = {
	do: function(message, args) {
		let outStr;
		if (args) {
			if (typeof spongeBot[args] !== 'undefined') {	
				if (spongeBot[args].longHelp) {
					utils.chSend(message, spongeBot[args].longHelp);
				} else if (spongeBot[args].help) {
					utils.chSend(message, spongeBot[args].help);
				} else {
					utils.chSend(message, 'I have no help about that.');
				}
			} else {
				
				// do check for other help topics...
				
				utils.chSend(message, 'That is not a command I know.');
			}
		} else {
			outStr = ' ** SpongeMUD Help ** _(WIP)_\n\n' +
			  ' List of commands (may not be complete). Use `help <command>` ' +
			  ' for more information about a command. More help to come on ' +
			  ' other topics. \n\nMore help also available at ' +
			  ' http://www.spongemud.com/help/\n\n';
			
			for (let cmd in spongeBot) {
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
	iFic.buildMobs();
	debugPrint(`SpongeMUD version ${cons.VERSION_STRING} READY!`);
	BOT.user.setActivity(`${cons.PREFIX}joinmud   (if you dare!)`, { type: 'PLAYING' });
	if (Math.random() < 0.01) {BOT.channels.get(cons.SPAMCHAN_ID).send(`Join the MUD today with \`${cons.PREFIX}joinmud\`!`);}
	
	iFic.initTimers(BOT); // kick off all the ticks and timers and stuff
});

BOT.on('rateLimit', (info) => {
    console.log(`##### RATE LIMITED #####  ${new Date()}    Data follows:`);
    console.log(JSON.stringify(info));
	/*
    info = JSON.stringify(info);
	
	// get channel id from info.path and get a Channel object:
    const channel = BOT.channels.get(info.split("/channels")[1].split("/")[1]);
	
    //console.log(channel);
    ut.messageQueue.setSlowMode(channel, info.timeDifference);
	*/
});
//-----------------------------------------------------------------------------
BOT.on('message', message => {
	if (message.content.startsWith(cons.PREFIX) || message.channel.type === 'dm') {

		let botCmd;
		if (message.content.startsWith(cons.PREFIX)) {
			botCmd = message.content.slice(2); // retains the whole line, minus m.
		} else {
			botCmd = message.content; // DM and didn't start with m. so whole line is command
		}
		let theCmd = botCmd.split(' ')[0];

		let args = botCmd.replace(theCmd, ''); // remove the command itself, rest is args
		theCmd = theCmd.toLowerCase();
		if (!spongeBot.hasOwnProperty(theCmd)) {
			// not a valid command, might be a menu-mode number or player macro...
			if (isNaN(parseInt(theCmd)) && theCmd !== cons.PLAYER_MACRO_LETTER) {
				return; // nope, not a number, either, so fail out of here
			} else {
				
				isMenu = (theCmd !== cons.PLAYER_MACRO_LETTER);			
				if (!isMenu) {
					// if it's a player macro, replace theCmd with everything after the "macro letter"]
					theCmd = args;
				}			
				let newFullCmd = iFic.macro.do(message, theCmd, isMenu);
				if (newFullCmd) {
					let newCmd = newFullCmd.split(' ')[0];
					args = newFullCmd.replace(newCmd, '');
					if (!spongeBot.hasOwnProperty(newCmd)) {
						debugPrint(` WARNING! Menu or macro alias for ${theCmd} was invalid command ${newCmd}!`);
					} else {
						theCmd = newCmd; // ...and continue on through to regular parser
					}
				}
			}
		}

		args = args.slice(1); // remove leading space

		if (typeof spongeBot[theCmd] !== 'undefined') {
			debugPrint(`  @${message.author.id}: ${theCmd} (${args})`);
			
			if (!spongeBot[theCmd].disabled) {
				if (spongeBot[theCmd].access) {
					// requires special access
					if (!hasAccess(message.author.id, spongeBot[theCmd].access)) {
						utils.chSend(message, 'You are unable to do that.');
					} else {
						// missing spongebot.command.do
						if (!spongeBot[theCmd].hasOwnProperty('do')) {
							debugPrint('!!! WARNING:  BOT.on(): missing .do() on ' + theCmd +
							  ', ignoring limited-access command !' + theCmd);
						} else {
							// all good. reset users idle timeout and then run command
							iFic.idleReset(message);
							spongeBot[theCmd].do(message, args);
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
							spongeBot[theCmd].do(message, args);
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