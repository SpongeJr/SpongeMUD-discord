const ut = require('../lib/utils.js');
const client = ut.getClient();
const dBug = function(str, level) {

	if (typeof level === "undefined") { level = 0; }

	if (typeof str === "object") {
		str = JSON.stringify(str);
	}

	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};

const cons = require('./constants.js');

let eMaster = function(eventName, where, sender, data) {
    if (eMaster.listens[eventName]) {
         if (eventName === 'worldTick') {
            // send to players:
            if (!eMaster.listens.worldTick.players) {
                dBug('No players listening for worldTick?');
                return;
            }
            for (let evId in eMaster.listens.worldTick.players) {
                //dBug(evId + ' is listening for worldTick.');
                eMaster.listens.worldTick.players[evId].callback(sender, data);
            }

            // send to all items on floors:
            // skip props/scenery? or just let them exclude themselves by being invalid?
            // nvm, let them register themselves
            if (!eMaster.listens.worldTick.items) {
                dBug('No items{} listener worldTick?');
                return;
            }

            for (let evId in eMaster.listens.worldTick.items) {
                //dBug(evId + ' is listening for worldTick.');
                eMaster.listens.worldTick.items[evId].callback(sender, data);
            }

            return;
        }
        if (!eMaster.listens[eventName][where]) {
            // no listeners in this room.
            return;
        }
        // hit up everyone listed for this event in this room...
        for (let evId in eMaster.listens[eventName][where]) {
            eMaster.listens[eventName][where][evId].callback(sender, data);
        }
    }
};

eMaster.listens = {
	'roomSay': {},
	'roomLoud': {},
	'roomDrop': {},
	'roomCrush': {},
	'roomGet': {},
	'roomEnter': {},
	'roomExit': {},
	'roomGeneric': {},
	'zoneSay': [],
	'worldTick': {},
	'gameEvent': {}
};

module.exports = {
	eMaster: eMaster
};
