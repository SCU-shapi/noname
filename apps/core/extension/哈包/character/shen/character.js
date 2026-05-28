/** @type { importCharacterConfig['character'] } */
const character = {
	sanli: {
		sex: "female",
		group: "shen",
		hp: 3,
		skills: ["xuanpi", "xunji", "gangren"],
	},
	jianxin: {
		sex: "male",
		group: "shen",
		hp: 3,
		skills: ["niren", "huoxin", "feiyu"],
	},
	huilongjiaozhu: {
		sex: "none",
		group: "shen",
		hp: 4,
		skills: ["chanmian", "mengbu", "zhelong"],
	},
	huadiaozuiji: {
		sex: "none",
		group: "shen",
		hp: 4,
		skills: ["tihu", "hankuang", "tingqiao"],
	},
	daodun: {
		sex: "male",
		group: "shen",
		hp: 4,
		maxHp: 4,
		hujia: 1,
		// skills: ["gongfang"],
	},
	xiaohuihui: {
		sex: "female",
		group: "shen",
		hp: 4,
		// skills: ["chifan", "youxi", "lingdi", "shuijiao"],
	},
};
for (let i in character) {
	character[i].img = "extension/哈包/image/character/" + i + ".png";
}
export default character;
