const ut = require("./utils.js");
const cons = require("./constants.js");
const mailPath = "../data/" + cons.MUD.mailPath;
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
	},
	sendMail: function(sender, recipient, data, timestamp) {
		// returns: {"success": Boolean, "data": {}}
		
		// expects:
		/*
			sender: {
				"from": a String; in future, either a String (generic sender) or a Player object
			},
			recipient: {
				"to": a Player object
			},
			data: {
				"subject": String,
				"contents": String
			},
			timestamp: Number (should be a world tick count)
		*/
		
		// first, make sure we're in sync -- call getMail
		// on return from that, add our record, and write it out
		
		let mailRecord = {};
		
		mailRecord.read = false;
		mailRecord.timestamp = timestamp;
		mailRecord.from = sender.from;
		mailRecord.subject = data.subject;
		mailRecord.contents = data.contents;
		
		let mailData = this.getMail(recipient.to.id);
		
		if (!mailData) {
			mailData = {"mail": []};
		}
		
		mailData.mail.push(mailRecord);
		
		ut.saveObj(mailData, mailPath + recipient.to.id + ".json");
	}
};