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
const cons = require("./lib/constants.js");
const manual = require("./manual/manual.json");
const Discord = require("discord.js");
const CONFIG = require("../../" + cons.CFGFILE);
const servercfgs = require(cons.SERVERCFGFILE);
const BOT = new Discord.Client();
const FS = require("fs");
const helpfile = require('./lib/helpfile.json');
//-----------------------------------------------------------------------------
// Discord Bot List / top.gg webhook for vote updates
const DBL = require("dblapi.js");
const dbl = new DBL(CONFIG.dbl.dbltoken, { webhookPort: CONFIG.dbl.webhookPort, webhookAuth: CONFIG.dbl.webhookAuth });
dbl.webhook.on('ready', hook => {
  console.log(`Webhook running at http://${hook.hostname}:${hook.port}${hook.path}`);
});
dbl.webhook.on('vote', vote => {
    let newVoteStr = "";

    if (vote.type === "test") {
        newVoteStr += `:test_tube: A test SpongeMUD vote was received!`;
        console.log(`DBL webhook: ${vote.user} just test-voted!`);
        // iFic.handleDblUpvote(vote); // don't do this, it's a test!
    } else {
        newVoteStr += `:arrow_up: SpongeMUD has just been upvoted on top.gg!`;
        console.log(`DBL webhook: ${vote.user} just voted!`);
        iFic.handleDblUpvote(vote);
    }
    BOT.channels.cache.get(cons.MODERATORCHAN_ID).send(newVoteStr);
});
// Optional events
dbl.on('posted', () => {
    console.log('Server count posted!');
});
dbl.on('error', e => {
    console.log("DBL webhook error! data follows:")
    console.log(e);
});
//-----------------------------------------------------------------------------
const debugPrint = function(inpString){
// for now, just checks if the global debugMode is true. If it isn't,
// doesn't output, just returns
	if (utils.debugMode) {
		console.log(inpString);
		if (utils.enableDebugChan) {
			if ((inpString !== '') && (typeof inpString === 'string')) {
				// todo: rate limiter?
				if (inpString.length < 1024) {
					BOT.channels.cache.get(cons.DEBUGCHAN_ID).send(inpString);
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
const utils = require("./lib/utils.js");
utils.setClient(BOT); // Just to make sure the client is set
utils.setDiscord(Discord); // to make sure discord is set
const iFic = require("./lib/ific.js");
//-----------------------------------------------------------------------------
const hasAccess = function(who, accessArr) {
	return (who === cons.SPONGE_ID);
};
//-----------------------------------------------------------------------------
/*const MUDInstance = function() {
	this.useCount = 0;
	this.ready = false;
	this.iFic = iFic;
};
MUDInstance.prototype.reserve = function() { // call when you want to use the world
	if (this.ready) {
		this.useCount++;
		return true;
	}
	return false;
};
MUDInstance.prototype.release = function() { // call when you are done using the world
	if (this.ready) {
		this.useCount--;
	} else {
		// THIS SHOULDN'T HAPPEN PLEASE ERROR MESSAGE
	}
};
MUDInstance.prototype.externalRun = function(callback, response) { // call when you want to do stuff with the world in a callback
	if (this.reserve()) {
		callback();
		this.release();
	} else {
		response("The world is not accessible.");
	}
};
let mudInstance = new MUDInstance();
const discordCommandUseMUDInstance = function(callback) {
	mudInstance.externalRun(callback, function(result) { ut.chSend(message, result); });
};*/
//-----------------------------------------------------------------------------
const objectMap = function(source, mapFn) {
	let result = {};
	for (let i in source) {
		result[i] = mapFn(source[i]);
	}
	return result;
};
//-----------------------------------------------------------------------------
/*const isPlayer = function(data) {
	let who = data.who;
	return typeof players[who] !== 'undefined';
};

const hasAccessLevel = function(data) {

}*/

/*
say: {
	"standardTests":
	"isAwake": true,
	"isMuted": false,
}

whisper: {
	"say": true,
	"inFriendList": true,
}
*/


// lots of code from cantDo() to be refactored into here!
// (see ific.js ~L260 for cantDo())



/*const Validators = {
	methods: {
		and: function(validators) {
			for (let i=0;i<validators.length;i++) {
				// result.push() ?
				let result = Validators[validators[i]](data);
				if (!result.success) return result;
			}
			return { message: "", success: true };
		}
	}
};
Object.assign(Validators, {
	"isAwake": awakeTester,
	"isPlayer": isPlayer,
	"standardTests": Validators.methods.and(["isAwake", "isPlayer"]) // is good
});


const Command = function(trigger, data) {

	// do validation
	let canRunCommand;
	canRunCommand = Validators[trigger](data);

	if (canRunCommand) {
		mudInstance.iFic[trigger].do(data.message, data.args);
	}



	// I think our "command/subcommand" approach here is pretty fine
};*/
// how does this look???
/*Object.assign(spongeBot, objectMap({
	time: { help: "Get info on the current MUD world date and time.", do: "time" },
	look: { help: "Look at the room you are in.", do: "look" },
	joinmud: { help: "Joins SpongeMUD (wakes your character up if asleep, " +
	  " or creates a new character if you don't have one.", do: "joinmud" },
	exitmud: { "help": "Logoff SpongeMUD and put your character to sleep." +
	"\nThis will prevent you from seeing people entering and leaving rooms," +
	" saying things, and any other forms of DMs from SpongeMUD until you log" +
	" back on using `joinmud`", "do": "exitmud" },
	get: { "help": "`get <item>` to pick something up", "do": "get" },
	"look": { "help": "Look at the room you are in.", "do": "look" }
}, function(command) {
	let result = Object.assign({}, command);
	result.do = function(message, args) {
		discordUseMUDInstance(function() { mudInstance[command.do].time.do(message, args); });
	};
	return result;
});*/
// actually this seems like a good idea, reducing code repetition ^^^ but



spongeBot.time = {
	help: "Get info on the current MUD world date and time.",
	do: function(message, args) {
		iFic.time.do(message, args);
	}
};
spongeBot.look = {
	help: "Look at the room you are in.",
	do: function(message, args) {
		//iFic.look.do(message, args);
		iFic.look.do(message, args);
	}
};
spongeBot.setup = {
	help: "Discord server (guild) admins should run this to set up their server.\n" +
	  "Players will be unable to login (and thus, join the game) until this command has been run by a server admin.",
	do: function(message, args) {
		iFic.setup.do(message, args, servercfgs);
	}
}
spongeBot.joinmud = {
	help: "Joins SpongeMUD (wakes your character up if asleep, " +
	  " or creates a new character if you don't have one.",
	do: function(message, args) {
		iFic.joinmud.do(message, args, servercfgs);
	}
};
spongeBot.exitmud = {
	help: "Logoff SpongeMUD and put your character to sleep." +
	"\nThis will prevent you from seeing people entering and leaving rooms," +
	" saying things, and any other forms of DMs from SpongeMUD until you log" +
	" back on using `joinmud`",
	do: function(message, args) {
		iFic.exitmud.do(message, args);
	}
};
spongeBot.get = {
	help: "`get <item>` to pick something up",
	do: function(message, args) {
		iFic.get.do(message, args);
	}
};
spongeBot.wizget = {
	help: "Wizards can use `wizget <item>` to pick up scenery items.",
	do: function(message, args) {
		iFic.wizget.do(message, args);
	}
};
spongeBot.go = {
	help: "`go <exit>` to move to a different location.",
	do: function(message, args) {
		iFic.go.do(message, args);
	}
};
spongeBot.flee = {
	help: "If you are in combat, `flee` will let you try to escape.",
	do: function(message, args) {
		iFic.flee.do(message, args);
	}
};
spongeBot.exits = {
	help: "Use `exits` to view current exits.",
	do: function(message, args) {
		iFic.exits.do(message, args);
	}
};
spongeBot.exit = {
	help: "Use `exit <#>` to take a numbered exit.",
	do: function(message, args) {
		iFic.exit.do(message, args);
	}
};
spongeBot.ex = spongeBot.exit;
spongeBot.terse = {
	help: "Switch between terse and verbose room descriptions " +
	  " when travelling. `look` will always show the verbose description.",
	do: function(message, args) {
		iFic.terse.do(message, args);
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
		iFic.represent.do(message, args);
	}
};
spongeBot.topfame = {
	help: "Lets you see the top servers in fame",
	do: function(message, args) {
		iFic.topfame.do(message, args);
	}
};
spongeBot.topxp = {
	help: "Lets you see the top players by XP",
	do: function(message, args) {
		iFic.topxp.do(message, args);
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
	help: "(moderator command) `approve <character>` to approve a pending profile.",
	do: function(message, args) {
		iFic.approve.do(message, args);
	}
};
spongeBot.deny = {
	help: "(moderator command) `deny <character>` to deny a pending profile.",
	do: function(message, args) {
		iFic.deny.do(message, args);
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
		iFic.peek.do(message, args);
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
		iFic.setaccess.do(message, args);
	}
};
spongeBot.icanhaz = {
	help: "(Wizards+) `icanhaz <zonename>` to get the raw data of a zone you author",
	do: function(message, args) {
		iFic.icanhaz.do(message, args);
	}
};
spongeBot.nukemyzone = {
	help: "(Wizards+) `nuke <zonename>` to TOTALLY WIPE OUT YOUR ZONE SERIOUSLY FOR REAL",
	do: function(message, args) {
		iFic.nukemyzone.do(message, args);
	}
};
spongeBot.getfile = {
	help: "(Developer+ only) (you should know the syntax)",
	do: function(message, args) {
		iFic.getfile.do(message, args);
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
		iFic.worldsay.do(message, args);
	}
};
spongeBot.worldcast = {
	help: '(immortals only) broadcast a message to the world',
	do: function(message, args) {
		iFic.worldcast.do(message, args);
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
		iFic.edroom.do(message, "exits " + args);
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
		iFic.edroom.do(message, args);
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
		iFic.wiztele.do(message, args);
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
spongeBot.resources = {
	help: 'Use `resources` to see your resources',
	do: function(message, args) {
		iFic.resources.do(message, args);
	}
};
spongeBot.resource = spongeBot.resources;
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
		iFic.attack.do(message, args);
	}
};
spongeBot.att = spongeBot.attack; // alias
spongeBot.kill = spongeBot.attack;  // alias
spongeBot.wield = {
	help: 'Equip something like a weapon',
	do: function(message, args) {
		iFic.wield.do(message, args);
	}
};
spongeBot.equip = spongeBot.wield; // alias
spongeBot.eq = spongeBot.equip; // alias
spongeBot.unwield = {
	help: 'Unequip something like a weapon',
	do: function(message, args) {
		iFic.unwield.do(message, args);
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
		iFic.say.do(message, args);
	}
};
spongeBot.yell = {
	help: 'yell to those in the same zone as you',
	do: function(message, args) {
		iFic.yell.do(message, args);
	}
};
//-----------------------------------------------------------------------------
spongeBot.privacy = {
	help: 'Display or edit your privacy-related options.',
	do: function(message, args) {
		iFic.privacy.do(message, args);
	}
};
spongeBot.autolog = {
	help: 'Toggles automatically logging your character out after a time.',
	do: function(message, args) {
		iFic.autolog.do(message, args);
	}
};
spongeBot.drop = {
	help: '`drop <item>` to drop something into the room.',
	do: function(message, args) {
		iFic.drop.do(message, args);
	}
};
spongeBot.crush = {
	help: '`crush <item>` to destroy an item in your inventory.',
	do: function(message, args) {
		iFic.crush.do(message, args);
	}
};
spongeBot.use = {
	help: '`use <item>` to use something.',
	do: function(message, args) {
		iFic.use.do(message, args);
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
		iFic.recall.do(message, args);
	}
};
spongeBot.setrecall = {
	help: '`setrecall` sets your recall point for use with `recall`\n' +
	'Note: Only some rooms may be set as recall points.',
	do: function(message, args) {
		iFic.setrecall.do(message, args);
	}
};
spongeBot.sit = {
	help: "Sits down, or stands up if you're already sitting.",
	do: function(message, args) {
		iFic.sit.do(message, args);
	}
};
spongeBot.stand = {
	help: 'Stands up, if you aren\'t already.',
	do: function(message, args) {
		iFic.stand.do(message, args);
	}
};
spongeBot.me = {
	help: 'Perform a "generic action", for role-playing.',
	do: function(message, args) {
		iFic.me.do(message, args);
	}
};
spongeBot.title = {
	help: 'Set your character\'s title, or set no title. Try `title` by itself for more help.',
	do: function(message, args) {
		iFic.title.do(message, args);
	}
};
spongeBot.profile = {
	help: "Use `profile <character>` to view another character's profile",
	do: function(message, args) {
		iFic.profile.do(message, args);
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
	help: 'age <character> reveal a character\'s age in ticks',
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
spongeBot.friend = {
	help: "Add a friend.",
	longHelp: "Use `friend <character name>` to add a friend.",
	do: function(message, args) {
		iFic.friend.do(message, args);
	}
};
spongeBot.unfriend = {
	help: "Remove a friend.",
	longHelp: "Use `unfriend <character name>` to remove a friend.",
	do: function(message, args) {
		iFic.unfriend.do(message, args);
	}
};
spongeBot.mail = {
	subcommands: {
		read: {
			help: "Read a particular message. Use `mail read <number>`.",
			do: function(message, args) {
				iFic.mail.do(message, "read "+args);
			}
		},
		list: {
			help: "List all mail. Use `mail list`.",
			do: function(message, args) {
				iFic.mail.do(message, "list "+args);
			}
		},
		delete: {
			help: "Delete a particular message. Use `mail delete <number>`.",
			do: function(message, args) {
				iFic.mail.do(message, "delete "+args);
			}
		},
		undelete: {
			help: "Undelete your mail. Use `mail undelete`.",
			do: function(message, args) {
				iFic.mail.do(message, "undelete "+args);
			}
		}
	},
	help: "List all mail.",
	longHelp: "**MUDmail help**: use `mail` or `mail list` to list your mail." +
      "\nUse `write` to begin writing a letter, and `post` to send it off." +
      "\n`help mail <subcommand>` will give help on the subcommands.",
	do: function(message, args) {
		iFic.mail.do(message, args);
	}
};
spongeBot.write = {
	help: "Use `write <your whole letter here>` to write a letter to be sent later with `post`.",
	longHelp: "Use `write <your letter>` to write a letter to be sent with the `post` command.",
	do: function(message, args) {
		iFic.write.do(message, args);
	}
};
spongeBot.post = {
	help: "Use `post <recipient> <subject> to send off a letter you've previously written using `write`.",
	longHelp: "Use `post <recipient> <subject>` to send off a letter you've previously written using `write`.",
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
	do: function(message, args) {
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
	do: function(message, args) {
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
spongeBot.man = {
	do: function(message, args) {
		let outStr = "";
		let topics = manual.topics;
		if (!args) {
			outStr += " **SpongeMUD Player Manual** available topics:";
			outStr += "\n```=-=-=-=-=-=-=";
			for (let topic of manual.topics) {
				outStr += "\n";
				outStr += `man ${topic.name}`.padEnd(20) + ` : ${topic.desc}`;
			}
			outStr += "```";
		} else {
			args = args.split(" ");
			let chosenTopic = args[0];
			let match = manual.topics.find(function(topic) {
				let goodMatch = false;
				if (topic.name === chosenTopic) {
					// exact match
					goodMatch = true;
				} else {
					// inexact, check partial matches...
					// we only take at least 2 characters on inexact matches
					if (chosenTopic.length >= 2) {
						goodMatch = topic.name.startsWith(chosenTopic);
					}
				}
				return goodMatch;
			 });
			if (match) {
				outStr += ` **SpongeMUD Player Manual**  TOPIC: \`${match.name}\`\n`;
				outStr += ` _${match.desc}_\n`;
				outStr += match.textPages[0];
			} else {
				outStr += "Topic not found. Try `man` by itself for a list.";
			}
		}
		utils.chSend(message, outStr);
	}
};
spongeBot.help = {
	do: function(message, args) {
		let outStr;
		if (args) {
			let command = findCommand(message, args.split(" "));
			if (command) { // has command
				let helpOutput = `**${command.name}**:\n`;
				if (command.command.longHelp) {
					helpOutput += command.command.longHelp;
				} else if (command.command.help) {
					helpOutput += command.command.help;
				} else {
					helpOutput += "No help available for this command.";
				}
				if (command.command.subcommands) {
					let subcommandText = "\n\nSubcommands available:\n";
					for (let cmd in command.command.subcommands) {
						if (command.command.subcommands[cmd].access) {
							// special access imm command hard block
							if (hasAccess(message.author.id, command.command.subcommands[cmd].access)) {
								subcommandText += '   _`' + cmd + '`_';
							}
						} else {
							subcommandText += '   `' + cmd + '`';
						}
					}
					helpOutput += subcommandText;
				}
				utils.chSend(message, helpOutput);
			} else {
				// do check for other help topics...
				utils.chSend(message, 'Not a command I know, ' + message.author);
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
					if (hasAccess(message.author.id, spongeBot[cmd].access)) {
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

	// write out the command help file (for API to use, etc.)
	let cmdHelp = {};
	for (let cmd in spongeBot) {
		cmdHelp[cmd] = {
			"help": spongeBot[cmd].help,
			"longHelp": spongeBot[cmd].longHelp,
			"cmdGroup": spongeBot[cmd].cmdGroup,
			"specialAccess": !(typeof spongeBot[cmd].access === "undefined")
		}
	}
	utils.saveObj(cmdHelp, cons.MUD.helpFile);

	iFic.buildDungeon(); // build dungeon (rooms object)
	iFic.buildPlayers(); // build players object
	iFic.buildItems(); // rebuild items global
	iFic.buildMobs();
	debugPrint(`SpongeMUD version ${cons.VERSION_STRING} READY!`);
	BOT.user.setActivity(`${cons.PREFIX}joinmud   (if you dare!)`, { type: 'PLAYING' });
	if (Math.random() < 0.02) {BOT.channels.cache.get(cons.SPAMCHAN_ID).send(`Join the MUD today with \`${cons.PREFIX}joinmud\`!`);}

	iFic.initTimers(); // kick off all the ticks and timers and stuff
});
BOT.on('error', (info) => {
	console.log(`##### ERROR! #####  ${new Date()}`);
	//console.log(info); // circular reference, can't stringify
});
BOT.on('warn', (info) => {
	console.log(`##### WARNING! #####  ${new Date()}`);
	//console.log(info); // circular reference, can't stringify
});
BOT.on('rateLimit', (info) => {
    console.log(`##### RATE LIMITED #####  ${new Date()}    Data follows:`);
    console.log(JSON.stringify(info));
	/*
    info = JSON.stringify(info);

	// get channel id from info.path and get a Channel object:
    const channel = BOT.channels.cache.get(info.split("/channels")[1].split("/")[1]);

    //console.log(channel);
    ut.messageQueue.setSlowMode(channel, info.timeDifference);
	*/
});
//-----------------------------------------------------------------------------
// Find a command, return command object and remaining arguments
let findCommand = function(message, args, commandList) {
	if (!commandList) commandList = spongeBot;
	let theCmd = args[0].toLowerCase();
	if (typeof commandList[theCmd] !== 'undefined') {
		//debugPrint(`  @${message.author.id}: ${theCmd} (${args.slice(1)})`);

		// check for subcommands and a match
		if (args.length > 1 && commandList[theCmd].hasOwnProperty('subcommands') && commandList[theCmd].subcommands.hasOwnProperty(args[1].toLowerCase())) {
			let command = findCommand(message, args.slice(1), commandList[theCmd].subcommands);
			if (!command) { return null };
			if (commandList[theCmd].disableall) { command.disabled = true; }
			command.name = theCmd + " " + command.name;
			return command;
		} else {
			// all good, return command
			return {
				disabled: commandList[theCmd].disableall || commandList[theCmd].disabled,
				name: args[0],
				command: commandList[theCmd],
				message: message,
				args: args.slice(1).join(" ")
			};
		}
	} else {
		// not a valid command
		return null;
	}
};

BOT.on('message', message => {
	if (message.content.startsWith(cons.PREFIX) || message.channel.type === 'dm') {

    let botCmd;
    if (message.content.startsWith(cons.PREFIX)) {
      botCmd = message.content.slice(2); // retains the whole line, minus m.
    } else {
      botCmd = message.content; // DM and didn't start with m. so whole line is command
    }
    let args = botCmd.split(' '); // remove the command itself, rest is args
    let theCmd = args[0];

    theCmd = theCmd.toLowerCase();
    if (!spongeBot.hasOwnProperty(theCmd)) {
      // not a valid command, might be a menu-mode number or player macro...
      if (isNaN(parseInt(theCmd)) && theCmd !== cons.PLAYER_MACRO_LETTER) {
        return; // nope, not a number, either, so fail out of here
      } else {

        isMenu = (theCmd !== cons.PLAYER_MACRO_LETTER);
        if (!isMenu) {
          // if it's a player macro, replace theCmd with everything after the "macro letter"]
          theCmd = args.slice(1).join(" ");
        }
        let newFullCmd = iFic.macro.do(message, theCmd, isMenu);
        if (newFullCmd) {
          args = newFullCmd.split(' ');
          let newCmd = args[0].toLowerCase();
          if (!spongeBot.hasOwnProperty(newCmd)) {
            debugPrint(` WARNING! Menu or macro alias for ${theCmd} was invalid command ${newCmd}!`);
          } else {
            theCmd = newCmd; // ...and continue on through to regular parser
          }
        }
      }
    }
		resultCommand = findCommand(message, args);
		if (resultCommand) { // command found
			debugPrint(`  @${message.author.id}: ${resultCommand.name} (${resultCommand.args})`);
			if (!resultCommand.disabled) {
				let runCommand = true;
				if (resultCommand.command.access) {
					// requires special access
					if (!hasAccess(message.author.id, resultCommand.command.access)) {
						utils.chSend(message, 'Your shtyle is too weak ' +
						  'for that command, ' + message.author);
						runCommand = false;
					}
				} else if (message.author.bot) {
					debugPrint('Blocked a bot-to-bot !command.');
					runCommand = false;
				}
				if (runCommand) {
					// missing .do
					if (!resultCommand.command.hasOwnProperty('do')) {
						debugPrint('!!! WARNING:  BOT.on(): missing .do() on ' + theCmd +
						  ', ignoring limited-access command !' + theCmd);
					} else {
						// all good. reset users idle timeout and then run command
						iFic.idleReset(message);
						resultCommand.command.do(message, resultCommand.args);
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
