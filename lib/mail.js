const ut = require("./utils.js");
const cons = require("./constants.js");
const mailPath = "../data/spongemud/mail/";
const FS = require("fs");

module.exports = {
	getMail: function(playerId) {
		try {
			let path = mailPath + playerId + ".json";
			let mailData = FS.readFileSync(path, "utf8");
			return JSON.parse(mailData);
		} catch (err) {
			console.log(`checkMail(${playerId}): ERROR:  ${err}`);
			return false;
		}
	}
};