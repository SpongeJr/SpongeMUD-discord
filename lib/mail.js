const ut = require("./utils.js");
const cons = require("./constants.js");
const mailPath = "../data/spongemud/mail/";
const FS = require("fs");
const mailData = {
	"mail": {},
	"updates": []
};

const dBug = function(str, level) {
	
	if (typeof level === "undefined") { level = 0; }
	
	if (typeof str === "object") {
		str = JSON.stringify(str);
	}
	
	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};
const loadMail = function(playerId) {
		try {
			let path = mailPath + playerId + ".json";
			let mData = FS.readFileSync(path, "utf8");
			mailData.mail[playerId] = JSON.parse(mData);
			return mailData.mail[playerId];
		} catch (err) {
			dBug(`loadMail(${playerId}): ERROR:  ${err}`);
			return false;
		}
};
module.exports = {
	getMail: function(playerId) {
		if (mailData.mail[playerId]) {
			dBug(`getMail(${playerId}): Read from cache.`);
		} else {
			dBug(`getMail(${playerId}): Reading from file...`);
			loadMail(playerId);
		}
		return mailData.mail[playerId];
	}
};