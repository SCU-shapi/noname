import { lib, game } from "./utils.js";
import character from "../character/ha/character.js";
import skill from "../character/ha/skill.js";
import translate from "../character/ha/translate.js";
import shenCharacter from "../character/shen/character.js";
import shenSkill from "../character/shen/skill.js";
import shenTranslate from "../character/shen/translate.js";
import waCharacter from "../character/wa/character.js";
import waSkill from "../character/wa/skill.js";
import waTranslate from "../character/wa/translate.js";
import wuCharacter from "../character/wu/character.js";
import wuSkill from "../character/wu/skill.js";
import wuTranslate from "../character/wu/translate.js";

export async function precontent(config, pack) {
	// 检查是否启用了哈包角色
	if (lib.config.extension_哈包_ha !== false) {
		try {
			console.log("开始加载哈包扩展...");
			
			// 直接注册角色到lib.character
			if (!lib.character) {
				lib.character = {};
			}
			Object.assign(lib.character, character);
			Object.assign(lib.character, shenCharacter);
			Object.assign(lib.character, waCharacter);
			Object.assign(lib.character, wuCharacter);
			console.log("角色注册成功:", Object.keys(character), Object.keys(shenCharacter), Object.keys(waCharacter), Object.keys(wuCharacter));
			
			// 直接注册技能到lib.skill
			if (!lib.skill) {
				lib.skill = {};
			}
			Object.assign(lib.skill, skill);
			Object.assign(lib.skill, shenSkill);
			Object.assign(lib.skill, waSkill);
			Object.assign(lib.skill, wuSkill);
			console.log("技能注册成功:", Object.keys(skill), Object.keys(shenSkill), Object.keys(waSkill), Object.keys(wuSkill));
			
			// 注册翻译
			if (!lib.translate) {
				lib.translate = {};
			}
			Object.assign(lib.translate, translate);
			Object.assign(lib.translate, shenTranslate);
			Object.assign(lib.translate, waTranslate);
			Object.assign(lib.translate, wuTranslate);
			lib.translate.ha_character_config = "哈包";
			console.log("翻译注册成功");
			
			// 确保扩展被添加到可用列表中（安全检查）
			if (lib.config && lib.config.all && Array.isArray(lib.config.all.extensions)) {
				if (!lib.config.all.extensions.includes("哈包")) {
					lib.config.all.extensions.push("哈包");
				}
			} else {
				console.warn("lib.config.all.extensions 不存在，跳过扩展列表添加");
			}
			
			console.log("哈包扩展加载完成");
		} catch (err) {
			console.error("Failed to import extension 『哈包』: ", err);
			console.error("错误堆栈:", err.stack);
			alert(`『哈包』扩展加载失败: ${err.message}`);
		}
	}
}
