import { lib, game, ui, get, ai, _status } from "./main/utils.js";
import { precontent } from "./main/precontent.js";
import config from "./main/config.js";
import { content } from "./main/content.js";
import { arenaReady } from "./main/arenaReady.js";

// 延迟导入角色模块，在precontent中加载
// await import("./character/ha/index.js");

const extensionInfo = await lib.init.promises.json(`${lib.assetURL}extension/哈包/info.json`);
let extensionPackage = {
	name: "哈包",
	config,
	content,
	help: {},
	package: {},
	precontent,
	arenaReady,
	files: { character: [], card: [], skill: [], audio: [] },
};

Object.keys(extensionInfo)
	.filter(key => key !== "name")
	.forEach(key => {
		extensionPackage.package[key] = extensionInfo[key];
	});

export let type = "extension";
export default extensionPackage;