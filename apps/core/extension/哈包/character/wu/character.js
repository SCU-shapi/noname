/** @type { importCharacterConfig['character'] } */
const character = {
	weiji: {
		sex: "male",
		group: "wu",
		hp: 3,
		skills: ["weiya"],
	},
	baji: {
		sex: "male",
		group: "wu",
		hp: 4,
		skills: ["fucong", "xiaohui", "zhishi"],
	},
	hashangfei: {
		sex: "male",
		group: "wu",
		hp: 4,
		skills: ["fufeng", "lunzhen", "gefang"],
		isZhugong: true,
	},
	habenhaimo: {
		sex: "male",
		group: "wu",
		hp: 4,
		skills: ["zhizi", "liebian", "manha"],
	},
	hazhentian: {
		sex: "female",
		group: "wu",
		hp: 5,
		skills: [],
	},
};
for (let i in character) {
	character[i].img = "extension/哈包/image/character/" + i + ".png";
}
export default character;
