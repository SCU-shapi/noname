/** @type { importCharacterConfig['character'] } */
const character = {
	huanxiangji: {
		sex: "none",
		group: "wa",
		hp: 3,
		skills: ["dizu", "daosuan"],
	},
	tanglaoha: {
		sex: "male",
		group: "wa",
		hp: 3,
		skills: ["tuite", "gushi", "zhasi", "zhanshou"],
		isZhugong: true,
	},
	zhongchui: {
		sex: "male",
		group: "wa",
		hp: 1,
		maxHp: 1,
		hujia: 3,
		skills: [],
	},
};
for (let i in character) {
	character[i].img = "extension/哈包/image/character/" + i + ".png";
}
export default character;
