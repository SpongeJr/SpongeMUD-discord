module.exports = {
	MUD: {
		playerFile: 'spongemud/players.json',
		roomFile: 'spongemud/rooms.json',
		itemFile: 'spongemud/items.json',
		zoneFile: 'spongemud/zones.json',
		worldFile: 'spongemud/world.json',
		mobFile: 'spongemud/mobs.json',
		newsFile: 'spongemud/news.json',
		backups: {
			playerFile: 'spongemud/bak/players',
			roomFile: 'spongemud/bak/rooms',
			worldFile: 'spongemud/bak/world',
			itemFile: 'spongemud/bak/items',
			mobFile: 'spongemud/mobs.json'
		}
	},
	DATA_DIR: '../data/',
	VERSION_STRING: '0.2.4-alpha',
	SPONGEBOT_INFO: 'SpongeMUD (c) 2018, 2019 by Josh Kline',
	SPONGE_ID: "167711491078750208",
	MAINCHAN_ID: "402126095056633863",
	SPAMCHAN_ID: "402591405920223244",
	DEBUGCHAN_ID: "410435013813862401",
	SERVER_ID: "402126095056633859",
	ONE_DAY: 86400000,
	ONE_WEEK: 604800000,
	ONE_HOUR: 3600000,
	WORLDTICKLENGTH: 48000,
	DEFAULTS: {
		itemDecay: {
		rate: 3,
		amount: 10,
		maxEndurance: 100
		},
		stamina: {
			max: 200,
			perTick: 40,
			moveCost: 30
		},
		maxXpTicks: 60,
		xpPerTick: 1
	},
	PERM_LEVELS: {
		"player": "16",
		"wizard": "64",
		"immortal": "128",
		"developer": "250",
		"sponge": "254"
	},
	PREFIX: 'm.',
	CFGFILE: 'spongemudcfg.json'
};
