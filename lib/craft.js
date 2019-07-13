const ut = require("./utils.js");
const cons = require("./constants.js");
const recipes = require("../../data/spongemud/recipes.json");
const FS = require("fs");

const dBug = function(str, level) {
	
	if (typeof level === "undefined") { level = 0; }
	
	if (typeof str === "object") {
		str = JSON.stringify(str);
	}
	
	if (level >= cons.DEBUG_LEVEL) {
		console.log(cons.DEBUG_LEVEL_STRINGS[level] + " " + str);
	}
};

module.exports = {
	recipes: recipes,
	listRecipes: function() {
		let outP = "";
		for (let recipeName in recipes) {
			outP += `\`${recipeName}\` `;
		}
		return outP;
	},
	showRecipe: function(recipeName) {
		let outP = "";
		
		let rarityStrings = cons.STRINGS.rarity;
		let recipe = recipes[recipeName].recipe;
		let quantity = recipes[recipeName].quantity || 1;
		let itemIdCreated = recipes[recipeName].id;
		
		outP += ` Crafting recipe for: **${recipeName}**:\n`;
		outP += ` Requires the following resources:\n`;
		
		for (let resource in recipe) {
			outP += `\n\n **${resource}**:\n`
			for (let rarity in recipe[resource]) {
				let amount = recipe[resource][rarity];
				outP += `\`${amount} ${rarityStrings[rarity]}\n\`  `;
			}
		}
		outP += `\nOUTPUT: ${quantity} x **${itemIdCreated}**`
		return outP;
	}
};