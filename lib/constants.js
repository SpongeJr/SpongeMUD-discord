module.exports = {
	MUD: {
		playerFile: 'spongemud/players.json',
		roomFile: 'spongemud/rooms.json',
		itemFile: 'spongemud/items.json',
		zoneFile: 'spongemud/zones.json',
		worldFile: 'spongemud/world.json',
		resourceFile: 'spongemud/resources.json',
		mobFile: 'spongemud/mobs.json',
		newsFile: 'spongemud/news.json',
		backups: {
			playerFile: 'spongemud/bak/players',
			roomFile: 'spongemud/bak/rooms',
			worldFile: 'spongemud/bak/world',
			itemFile: 'spongemud/bak/items',
			mobFile: 'spongemud/bak/mobs.json',
			resoureFile: 'spongemud/bak/resources.json',
		}
	},
	DATA_DIR: '../data/',
	VERSION_STRING: '0.2.5-spearmint-000',
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
		hp: {
			max: 40,
			perTick: 6
		},
		gather: {
			maxPts: 20
		},
		maxXpTicks: 60,
		xpPerTick: 1,
		serverFameDecayRate: 0.01
	},
	PERM_LEVELS: {
		"player": "10",
		"wizard": "64",
		"immortal": "128",
		"developer": "250",
		"sponge": "254"
	},
	MOD_FLAGS: {
		"isMod": 1,
		"canMute": 2,
		"canApproveProfiles": 4,
		"canRenamePlayers": 8,
		"canSleepPlayers": 16,
		"canFreezePlayers": 32,
		"canTelePlayers": 64,
		"canBanPlayers": 128,
		"canBanServers": 256,
		"canAccessRawData": 512
	},
	PRIVACY_FLAGS: {
		"noListZone": 1,
		"noListWorld": 2,
		"noListScoreTables": 4,
		"noShowIdleTicks": 8,
		"noShowAge": 16,
		"noShowServer": 32,
		"reservedOption": 64
	},
	PRIVACY_FLAG_DESC: {
		"noListZone": "Do not allow players to see if I'm in the same zone as them with `zone`",
		"noListWorld": "Do not allow me to be seen in certain realm-wide lists",
		"noListScoreTables": "Do not show me on any high score charts",
		"noShowIdleTicks": "Do not allow ordinary players to see how long my character has been idle",
		"noShowAge": "Do not show my character's 'age in ticks' stat"
	},
	PREFIX: 'm.',
	PLAYER_MACRO_LETTER: 'm',
	CFGFILE: 'spongemudcfg.json',
	COMMITTEES: {
		"combat": {"emoji": ":crossed_swords:"},
		"documentation": {"emoji": ":pencil:"},
		"moderation": {"emoji": ":zipper_mouth:"},
		"noobtown": {"emoji": ":cityscape:"},
		"website": {"emoji": ":spider_web:"}
	},
	MONTHS: ['Archuary', 'Fooshuary', 'Keplembler', 'Wael', 'Skarl', 'Nicholaseptember', 'Squishuary'],
	TIME_OF_DAY_STRINGS: [
		{
			"endHour": 2,
			"str": ["It is the middle of the night", "It's around midnight", "Midnight is upon you"]
		},
		{
			"endHour": 5,
			"str": ["It is the wee hours", "Morning comes soon", "Night is changing to day"]
		},
		{
			"endHour": 8,
			"str": ["The sun is rising","Another day is beginning","Day is breaking"]
		},
		{
			"endHour": 10,
			"str": ["It is early in the morning","The morning is young","It is just after daybreak"]
		},
		{
			"endHour": 12,
			"str": ["It is mid-morning","It's the middle of morning","Morning grows on"]
		},
		{
			"endHour": 14,
			"str": ["The sun is high in the sky","It is around noon","It's midday"]
		},
		{
			"endHour": 17,
			"str": ["It's afternoon", "It is the afternoon", "It is the main part of the day"]
		},
		{
			"endHour": 20,
			"str": ["The sun has gone down", "The sun has sunk low", "It's around sunset"]
		},
		{
			"endHour": 23,
			"str": ["It's late evening", "The night has just begun", "The night is young"]
		}
	],
	SUNRISE: 6,
	SUNSET: 18,
	MATERIALS: ["wood", "metals", "fibre", "edibles"],
	DAYS_IN_YEAR: 360,
	TICKS_PER_HOUR: 10,
	HOURS_IN_DAY: 24,
};