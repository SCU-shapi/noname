/** @type { importCharacterConfig['character'] } */
const character = {
	maodie: {
		sex: "male",
		group: "ha",
		hp: 4,
		skills: ["youji", "suji", "wenda"],
		isZhugong: true,
	},
	wuji: {
		sex: "female",
		group: "ha",
		hp: 3,
		skills: ["yinqing"],
	},
	chuanshuosanha: {
		sex: "none",
		group: "ha",
		hp: 3,
		skills: ["youxian", "chujiang", "yinjun"],
	},
	hagongda: {
		sex: "none",
		group: "ha",
		hp: 4,
		skills: ["jibian", "jiba", "jibai"],
	},
	liudaolunhui: {
		sex: "none",
		group: "ha",
		hp: 6,
		skills: ["xiaoshi", "lunhui"],
	},
	wangzhaiha: {
		sex: "male",
		group: "ha",
		hp: 3,
		skills: ["zongheng", "xiaxian", "zibi"],
	},
	lianting: {
		sex: "double",
		group: "ha",
		hp: 3,
		skills: ["kuihua"],
	},
	woshiha: {
		sex: "male",
		group: "ha",
		hp: 3,
		skills: ["congzhong", "qunqi"],
	},
	habotong: {
		sex: "male",
		group: "ha",
		hp: 3,
		skills: ["kongling", "jiuyin", "shuangbo"],
	},
	jimiha: {
		sex: "male",
		group: "ha",
		hp: 4,
		skills: ["chouxiang", "gongyou", "zhengpai"],
	},
	renwoha: {
		sex: "male",
		group: "ha",
		hp: 3,
		skills: ["mofo"],
	},
};
for (let i in character) {
	character[i].img = "extension/哈包/image/character/" + i + ".png";
}
export default character;
