import { lib, game, ui, get, ai, _status } from "../../main/utils.js";

/** @type { importCharacterConfig['skill'] } */
const skill = {
	xuanpi: {
		forced: true,
		locked: true,
		mod: {
			selectTarget(card, player, range) {
				if (card.name == "sha") {
					range[0] = 1;
					range[1] = Infinity;
				}
			},
			targetInRange(card, player, target) {
				if (card.name == "sha") {
					return player.inRange(target) && get.distance(player, target) == 1;
				}
			},
		},
		ai: {
			order: 4,
			effect: {
				player(card, player, target) {
					if (card.name == "sha") {
						return [1, 0, 0, 0];
					}
				},
			},
		},
	},
	xunji: {
		forced: true,
		locked: true,
		init(player) {
			player.storage.xunji_x = 0;
			player.storage.xunji_drawed = false;
			player.storage.xunji_out = true;
		},
		mod: {
			globalFrom(from, to, distance) {
				return distance + from.storage.xunji_x;
			},
			globalTo(from, to, distance) {
				return distance + to.storage.xunji_x;
			},
		},
		trigger: {
			player: ["useCard", "respond"],
			global: ["dieEnd", "equip", "loseEquip", "phaseBegin"],
		},
		filter(event, player) {
			if (event.name === "phase") {
				player.storage.xunji_drawed = false;
				return false;
			}
			if (event.name === "useCard" || event.name === "respond") {
				return event.card;
			}
			return true;
		},
		async content(event, trigger, player) {
			if (trigger.name === "useCard" || trigger.name === "respond") {
				const card = trigger.card;
				if (!card) return;
				const color = get.color(card);
				if (color === "black") {
					player.storage.xunji_x--;
				} else if (color === "red") {
					player.storage.xunji_x++;
				}
				if (player.storage.xunji_x < -2) {
					player.storage.xunji_x = -2;
				} else if (player.storage.xunji_x > 2) {
					player.storage.xunji_x = 2;
				}
				player.syncStorage("xunji_x");
				player.updateMarks();
			}
			const otherPlayers = game.players.filter(p => p !== player && p.isIn());
			if (otherPlayers.length === 0) return;
			const allOutOfRange = otherPlayers.every(other => !other.inRange(player));
			if (allOutOfRange) {
				if (player.storage.xunji_out === true) {
					player.storage.xunji_out = false;
				} else {
					return;
				}
				if (player.storage.xunji_drawed === true) return;
				player.storage.xunji_drawed = true;
				await player.draw(2);
			} else {
				player.storage.xunji_out = true;
			}
		},
		mark: true,
		intro: {
			content(storage, player) {
				const x = player.storage.xunji_x || 0;
				return `当前X值为${x}（范围[-2,+2]）`;
			},
		},
		ai: {
			order: 3,
			threaten(player, target) {
				const x = target.storage.xunji_x || 0;
				if (x > 0) return 0.8;
				if (x < 0) return 1.2;
				return 1;
			},
		},
	},
	gangren: {
		init(player) {
			player.storage.gangren_li = 0;
		},
		enable: "phaseUse",
		content() {
			"step 0"
			player.chooseToDiscard(1, "hej", true).set("prompt", "钢刃：弃置一张牌获得一枚<b><span style='color: #A40000'>利</span></b>标记");
			"step 1"
			if (result.bool) {
				player.storage.gangren_li++;
				player.syncStorage("gangren_li");
				player.updateMarks();
			}
		},
		mark: true,
		intro: {
			content(storage, player) {
				const li = player.storage.gangren_li || 0;
				return `拥有${li}枚<b><span style='color: #A40000'>利</span></b>标记`;
			},
		},
		ai: {
			order: 5,
			expose: 0.3,
			effect: {
				target(card, player, target) {
					if (card.name === "sha") {
						const li = player.storage.gangren_li || 0;
						if (li > 0) return [2, 0, 0, 0];
						return [-1, 0, 0, 0];
					}
				},
			},
		},
		group: ["gangren_damage"],
	},
	gangren_damage: {
		trigger: { player: "useCard" },
		forced: true,
		filter(event, player) {
			return event.card && event.card.name === "sha";
		},
		async content(event, trigger, player) {
			const liCount = player.storage.gangren_li || 0;
			if (liCount > 0) {
				const result = await player.chooseControl(["弃置标记", "不弃置"])
					.set("prompt", `钢刃：你有${liCount}枚利标记，是否弃置一枚使此杀伤害+1？（不弃置则伤害-1）`)
					.forResult();
				if (result.control === "弃置标记") {
					player.storage.gangren_li--;
					player.syncStorage("gangren_li");
					player.updateMarks();
					trigger.baseDamage += 1;
					return;
				}
			}
			if (trigger.baseDamage === 1) {
				trigger.cancel();
			} else {
				trigger.baseDamage -= 1;
			}
		},
	},

	huaquan: {
		async content(event, trigger, player) {
			const target = event.targets[0];
			if (!target || !target.isIn()) return;
			if (player.countCards("h") === 0 || target.countCards("h") === 0) {
				game.log("划拳双方必须均有手牌");
				return;
			}
			const hq = { target, cardsSet: [], damageBonus: false };
			player.storage._huaquan_state = hq;
			target.storage._huaquan_state = hq;

			if (player.hasSkill("feiyu") && player.hp === 1) {
				await player.draw(2);
				hq.damageBonus = true;
			}

			const playerResult = await player.chooseCard("h", true, "划拳：请扣置一张手牌")
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!playerResult.bool) {
				delete player.storage._huaquan_state;
				delete target.storage._huaquan_state;
				return;
			}
			const playerCard = playerResult.cards[0];
			playerCard._huaquan_card = true;
			hq.cardsSet.push({ card: playerCard, owner: player, used: false });

			if (target.hasSkill("feiyu") && target.hp === 1) {
				await target.draw(2);
				hq.damageBonus = true;
			}

			const targetResult = await target.chooseCard("h", true, "划拳：请扣置一张手牌")
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!targetResult.bool) {
				delete player.storage._huaquan_state;
				delete target.storage._huaquan_state;
				return;
			}
			const targetCard = targetResult.cards[0];
			targetCard._huaquan_card = true;
			hq.cardsSet.push({ card: targetCard, owner: target, used: false });

			const pShaTargetShan = playerCard.name === "sha" && targetCard.name === "shan" && target.hasCard(c => c === targetCard, "h");
			const tShaPlayerShan = targetCard.name === "sha" && playerCard.name === "shan" && player.hasCard(c => c === playerCard, "h");

			if (pShaTargetShan || tShaPlayerShan) {
				const shaUser = pShaTargetShan ? player : target;
				const shanUser = pShaTargetShan ? target : player;
				const shaCard = pShaTargetShan ? playerCard : targetCard;
				const shanCardClip = pShaTargetShan ? targetCard : playerCard;

				hq.cardsSet.forEach(c => c.used = true);
				game.log(shaUser, "翻开了扣置的", shaCard);
				game.log(shanUser, "翻开了扣置的", shanCardClip);

				shanUser.storage._huaquan_onlyShan = shanCardClip;
				shanUser.addTempSkill("_huaquan_onlyShan");

				const useEvent = shaUser.useCard(shaCard, [shanUser], false);
				if (hq.damageBonus) useEvent.baseDamage = (useEvent.baseDamage || 1) + 1;
				await useEvent;

				delete shanUser.storage._huaquan_onlyShan;
				shanUser.removeSkill("_huaquan_onlyShan");
				game.log(shanUser, "使用扣置闪响应了", shaUser, "的杀");
			} else {
				const oppHasShan = playerCard.name === "sha" && targetCard.name === "shan" && target.hasCard(c => c === targetCard, "h");
				const myHasShan = targetCard.name === "sha" && playerCard.name === "shan" && player.hasCard(c => c === playerCard, "h");

				game.log(player, "翻开了扣置的", playerCard);
				const playerCanUse = playerCard.name === "sha" || (player.canUse(playerCard, target, false) && !(player.hasSkill("fufeng") && (get.type(playerCard) === "trick" || get.type(playerCard) === "equip")));
				if (playerCanUse) {
					hq.cardsSet.find(c => c.card === playerCard).used = true;
					const useEvent = player.useCard(playerCard, [target], false);
					if (playerCard.name === "sha" && !oppHasShan) useEvent.directHit = [target];
					if (hq.damageBonus && playerCard.name === "sha") useEvent.baseDamage = (useEvent.baseDamage || 1) + 1;
					await useEvent;
				} else {
					game.log(player, "的扣置牌", playerCard, "无法对", target, "使用");
					if (player.hasSkill("mengbu")) {
						player.logSkill("mengbu");
						await player.draw(2);
					}
				}

				game.log(target, "翻开了扣置的", targetCard);
				const targetCanUse = targetCard.name === "sha" || (target.canUse(targetCard, player, false) && !(target.hasSkill("fufeng") && (get.type(targetCard) === "trick" || get.type(targetCard) === "equip")));
				if (targetCanUse) {
					hq.cardsSet.find(c => c.card === targetCard).used = true;
					const useEvent = target.useCard(targetCard, [player], false);
					if (targetCard.name === "sha" && !myHasShan) useEvent.directHit = [player];
					if (hq.damageBonus && targetCard.name === "sha") useEvent.baseDamage = (useEvent.baseDamage || 1) + 1;
					await useEvent;
				} else {
					game.log(target, "的扣置牌", targetCard, "无法对", player, "使用");
					if (target.hasSkill("mengbu")) {
						target.logSkill("mengbu");
						await target.draw(2);
					}
				}
			}

			for (const hjc of hq.cardsSet) {
				if (!hjc.used && hjc.owner.hasCard(c => c === hjc.card, "h")) {
					await hjc.owner.discard([hjc.card]);
					game.log(hjc.owner, "的扣置牌", hjc.card, "未被使用，弃置");
				}
			}

			if (player.hasSkill("hankuang") || target.hasSkill("hankuang")) {
				const noSha = !hq.cardsSet.some(c => c.card && c.card.name === "sha");
				if (noSha) {
					if (player.hasSkill("hankuang")) {
						player.logSkill("hankuang");
						await player.draw(1);
					}
					if (target.hasSkill("hankuang")) {
						target.logSkill("hankuang");
						await target.draw(1);
					}
				}
			}

			if (player.hasSkill("fufeng") || target.hasSkill("fufeng")) {
				const allUnused = hq.cardsSet.every(c => !c.used);
				if (allUnused) {
					await player.draw(1);
					await target.draw(1);
				}
			}

			delete player.storage._huaquan_state;
			delete target.storage._huaquan_state;

			if (player.hasSkill("mengbu")) {
				await player.useSkill("mengbu");
			}
			if (target.hasSkill("mengbu")) {
				await target.useSkill("mengbu");
			}
		},
		ai: {
			basic: { order: 1, useful: 0 },
		},
	},

	_huaquan_onlyShan: {
		onChooseToUse(event) {
			event.forced = true;
		},
		mod: {
			cardEnabled2(card, player) {
				if (get.name(card) !== "shan") return;
				const only = player.storage._huaquan_onlyShan;
				if (!only) return;
				return card === only;
			},
		},
	},

	niren: {
		forced: true,
		locked: true,
		trigger: { player: "damageBefore" },
		filter(event, player) {
			return event.source && event.source.isIn() && event.source.hp < player.hp;
		},
		async content(event, trigger, player) {
			const source = trigger.source;
			player.logSkill("niren", source);
			trigger.cancel();
			const count = Math.min(2, source.countCards("he"));
			if (count > 0) {
				await player.discardPlayerCard(source, "he", [1, count], true);
			}
		},
		group: ["niren_damage", "niren_reset"],
		subSkill: {
			damage: {
				forced: true,
				locked: true,
				trigger: { player: "useCard" },
				filter(event, player) {
					return event.card && event.card.name === "sha" && !player.storage._niren_first_sha_used;
				},
				async content(event, trigger, player) {
					player.storage._niren_first_sha_used = true;
					trigger.baseDamage += 1;
				},
			},
			reset: {
				forced: true,
				silent: true,
				trigger: { global: "roundStart" },
				content(event, trigger, player) {
					delete player.storage._niren_first_sha_used;
				},
			},
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},

	huoxin: {
		trigger: { global: "phaseBegin" },
		filter(event, player) {
			return event.name === "phaseUse" && event.player !== player && event.player.isIn() && player.countCards("h") > 0;
		},
		async cost(event, trigger, player) {
			const result = await player.chooseBool("活心：是否与" + get.translation(trigger.player) + "划拳？");
			event.result = { bool: result.bool };
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			player.logSkill("huoxin", target);
			player.storage._huoxin_target = target;
			player.storage._huoxin_no_damage = true;
			await player.useSkill("huaquan", [target]);
			if (player.storage._huoxin_no_damage) {
				target.addTempSkill("huoxin_block");
				game.log(target, "本回合无法使用杀");
			}
			delete player.storage._huoxin_target;
			delete player.storage._huoxin_no_damage;
		},
		group: "huoxin_check",
		subSkill: {
			check: {
				forced: true,
				silent: true,
				trigger: { global: "damageBegin1" },
				filter(event, player) {
					return player.storage._huoxin_target && player.storage._huoxin_no_damage;
				},
				content(event, trigger, player) {
					player.storage._huoxin_no_damage = false;
				},
			},
			block: {
				mod: {
					cardEnabled(card, player) {
						if (card.name === "sha") return false;
					},
				},
			},
		},
		ai: {
			order: 6,
			result: { target: 1 },
		},
	},

	feiyu: {
		group: "feiyu_comp",
		subSkill: {
			comp: {
				trigger: { player: "useCardAfter" },
				forced: true,
				locked: true,
				filter(event, player) {
					return player.storage._huaquan_state && event.card && event.card._huaquan_card;
				},
				async content(event, trigger, player) {
					const hq = player.storage._huaquan_state;
					if (!hq) return;
					const oppHjc = hq.cardsSet.find(c => c.owner !== player);
					if (!oppHjc) return;
					const myNum = get.number(trigger.card) || 0;
					const oppNum = get.number(oppHjc.card) || 0;
					if (myNum > oppNum) {
						if (player.canUse({ name: "sha", isCard: true }, hq.target, false)) {
							await player.useCard({ name: "sha", isCard: true }, hq.target, false);
						}
					}
				},
			},
		},
		ai: {
			order: 5,
			result: { player: 0.5 },
		},
	},

	tihu: {
		enable: "phaseUse",
		filterTarget(card, player, target) {
			return target !== player && target.countCards("h") > 0;
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			const target = event.targets[0];
			player.logSkill("tihu", target);
			await player.useSkill("huaquan", [target]);
		},
		group: ["tihu_defend", "tihu_reset"],
		subSkill: {
			defend: {
				trigger: { global: "phaseBegin" },
				filter(event, player) {
					return event.name === "phaseUse" && event.player !== player && event.player.isIn() && player.countCards("h") > 0 && event.player.countCards("h") > 0 && !player.storage._tihu_used;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseBool("提壶：是否与" + get.translation(trigger.player) + "划拳？");
					event.result = { bool: result.bool };
				},
				async content(event, trigger, player) {
					player.storage._tihu_used = true;
					player.logSkill("tihu", trigger.player);
					await player.useSkill("huaquan", [trigger.player]);
				},
			},
			reset: {
				forced: true,
				silent: true,
				trigger: { global: "roundStart" },
				content(event, trigger, player) {
					delete player.storage._tihu_used;
				},
			},
		},
		ai: {
			order: 6,
			result: { target: 1 },
		},
	},

	hankuang: {
		forced: true,
		locked: true,
		group: "hankuang_jiusha",
		subSkill: {
			jiusha: {
				forced: true,
				locked: true,
				trigger: { global: "useCard" },
				filter(event, player) {
					return player.storage._huaquan_state && event.card && event.card.name === "sha";
				},
				async content(event, trigger, player) {
					trigger.card.nature = "liquor";
					game.log(trigger.player, "的杀在划拳中视为酒杀");
				},
			},
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
	},

	tingqiao: {
		forced: true,
		locked: true,
		trigger: {
			player: ["useCardAfter", "respondAfter"],
		},
		filter(event, player) {
			if (!event.card || event.card.name !== "shan") return false;
			const parentUseCard = event.getParent("useCard");
			return parentUseCard && parentUseCard.card && parentUseCard.card.name === "sha";
		},
		async content(event, trigger, player) {
			const parentUseCard = trigger.getParent("useCard");
			if (!parentUseCard) return;
			const shaUser = parentUseCard.player;
			const shaTarget = parentUseCard.targets && parentUseCard.targets[0];
			if (!shaUser || !shaTarget || shaTarget !== player) return;
			if (shaTarget.isIn() && shaTarget.canUse({ name: "sha", isCard: true }, shaUser, false)) {
				const nextUse = shaTarget.useCard({ name: "sha", isCard: true }, shaUser, false);
				shaTarget.addTempSkill("tingqiao_directhit");
				await nextUse;
				shaTarget.removeSkills("tingqiao_directhit");
			}
			await player.draw(1);
		},
		group: "tingqiao_directhit",
		subSkill: {
			directhit: {
				trigger: { player: "useCard" },
				forced: true,
				silent: true,
				firstDo: true,
				filter(event, player) {
					return event.card && event.card.name === "sha";
				},
				content(event, trigger, player) {
					trigger.directHit.addArray(game.players);
				},
			},
		},
		ai: {
			order: 6,
			result: { player: 1 },
		},
	},

	chanmian: {
		forced: true,
		locked: true,
		trigger: { player: ["phaseUseBefore", "phaseDiscardBefore"] },
		async content(event, trigger, player) {
			trigger.cancel();
			const isDiscard = trigger.name === "phaseDiscard";
			game.log(player, "发动禅眠，跳过了" + (isDiscard ? "弃牌阶段" : "出牌阶段"));
			if (isDiscard) {
				player.logSkill("chanmian");
				const targetExists = game.hasPlayer(target => target !== player && target.isIn() && target.countCards("h") > 0);
				if (targetExists) {
					const result = await player.chooseTarget("禅眠：请选择一名其他角色划拳（取消则不发动）")
						.set("filterTarget", (card, p, target) => target !== p && target.countCards("h") > 0)
						.set("ai", target => get.attitude(player, target) < 0 ? 1 : 0)
						.forResult();
					if (result.bool && result.targets && result.targets.length) {
						await player.useSkill("huaquan", [result.targets[0]]);
					}
				}
			}
		},
		ai: {
			order: 8,
			result: { player: 1 },
		},
	},

	mengbu: {
		async content(event, trigger, player) {
			if (!player.countCards("h")) return;
			player.logSkill("mengbu");
			await player.chooseToUse({
				filterCard(card) {
					if (get.itemtype(card) !== "card" || get.position(card) !== "h") return false;
					return lib.filter.cardEnabled(card, player);
				},
				filterTarget(card, player, target) {
					if (get.type(card) === "equip") return target === player;
					return lib.filter.filterTarget2(card, player, target);
				},
				prompt: "梦步：你可使用一张牌",
				addCount: false,
			});
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},

	zhelong: {
		trigger: { global: "useCard" },
		firstDo: true,
		filter(event, player) {
			return !player.storage._huaquan_state &&
				event.player !== player &&
				event.player.isIn() &&
				event.targets && event.targets.includes(player) &&
				player.countCards("h") > 0;
		},
		async content(event, trigger, player) {
			await player.useSkill("huaquan", [trigger.player]);
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},

	gongfang: {
		init(player) {
			player.storage.gongfang_mode = "hengdao";
			player.addSkills("hengdao");
		},
		trigger: { player: ["gameStart", "useCardAfter", "respondAfter"] },
		filter(event, player) {
			if (event.name === "gameStart") return true;
			return event.card && (event.card.name === "sha" || event.card.name === "shan");
		},
		async cost(event, trigger, player) {
			const current = player.storage.gongfang_mode;
			const choices = [];
			if (current !== "hengdao") choices.push("切换为横刀");
			if (current !== "qingdun") choices.push("切换为擎盾");
			choices.push("不切换");
			const result = await player.chooseControl(choices)
				.set("prompt", "攻防：当前为" + (current === "hengdao" ? "横刀" : "擎盾") + "，是否切换？")
				.forResult();
			event.result = { bool: result.control !== "不切换", control: result.control };
		},
		async content(event, trigger, player) {
			if (event.cost_data.control === "切换为横刀") {
				player.storage.gongfang_mode = "hengdao";
				player.removeSkills("qingdun");
				player.addSkills("hengdao");
				game.log(player, "切换为横刀");
			} else if (event.cost_data.control === "切换为擎盾") {
				player.storage.gongfang_mode = "qingdun";
				player.removeSkills("hengdao");
				player.addSkills("qingdun");
				game.log(player, "切换为擎盾");
			}
		},
		ai: {
			order: 8,
			result: { player: 1 },
		},
	},

	hengdao: {
		forced: true,
		trigger: { player: "phaseDrawBegin1" },
		filter(event, player) {
			return player.storage.gongfang_mode === "hengdao" && (player.hujia || 0) > 0;
		},
		async content(event, trigger, player) {
			const shield = player.hujia || 0;
			player.hujia = 0;
			const extra = player.numOf("draw") * shield;
			trigger.num += extra;
			game.log(player, "清空了护盾，多摸了" + extra + "张牌");
		},
		group: "hengdao_convert",
		subSkill: {
			convert: {
				enable: ["chooseToUse", "chooseToRespond"],
				filterCard(card, player) {
					if (!player.storage.gongfang_mode || player.storage.gongfang_mode !== "hengdao") return false;
					return card.name === "sha" || card.name === "shan" || (card.name === "tao" && _status.event.name !== "chooseToRespond");
				},
				viewAs(cards, player) {
					const card = cards[0];
					if (card.name === "shan") return { name: "sha" };
					if (card.name === "sha") return { name: "shan" };
					if (card.name === "tao") return { name: "juedou" };
					return { name: "sha" };
				},
				viewAsFilter(player) {
					return player.storage.gongfang_mode === "hengdao";
				},
				position: "hes",
				async onUse(result, player) {
					await player.draw(1);
				},
			},
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},

	qingdun: {
		forced: true,
		trigger: { player: "phaseDrawBegin1" },
		filter(event, player) {
			return player.storage.gongfang_mode === "qingdun";
		},
		async content(event, trigger, player) {
			if (trigger.num > 0) {
				trigger.num -= 1;
				player.hujia = (player.hujia || 0) + 1;
				game.log(player, "少摸一张牌获得了1点护盾");
			}
		},
		group: ["qingdun_convert", "qingdun_block", "qingdun_revenge", "qingdun_block_reset"],
		subSkill: {
			convert: {
				mod: {
					cardname(card, player) {
						if (card.name === "shan" && player.storage.gongfang_mode === "qingdun") return "sha";
					},
				},
			},
			block: {
				forced: true,
				locked: true,
				trigger: { player: "damageBefore" },
				filter(event, player) {
					return _status.currentPhase !== player &&
						event.card && event.card.name === "sha" &&
						!player.storage._qingdun_blocked;
				},
				async content(event, trigger, player) {
					player.storage._qingdun_blocked = true;
					trigger.cancel();
					game.log(player, "防止了回合外受到的第一次杀的伤害");
				},
			},
			block_reset: {
				forced: true,
				silent: true,
				trigger: { player: "phaseBegin" },
				content(event, trigger, player) {
					delete player.storage._qingdun_blocked;
				},
			},
			revenge: {
				forced: true,
				trigger: { target: "useCardAfter" },
				filter(event, player) {
					return event.card && event.card.name === "sha" &&
						event.targets && event.targets.includes(player) &&
						player.storage.gongfang_mode === "qingdun";
				},
				async content(event, trigger, player) {
					const source = trigger.player;
					if (source && source.isIn() && player.canUse({ name: "sha", isCard: true }, source, false)) {
						await player.useCard({ name: "sha", isCard: true }, source, false);
					}
				},
			},
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},

	chifan: {
		forced: true,
		locked: true,
		trigger: { player: "phaseBegin" },
		filter(event, player) {
			return true;
		},
		async content(event, trigger, player) {
			const others = game.filterPlayer(p => p !== player && p.isIn()).sortBySeat();
			let given = false;
			for (const other of others) {
				if (other.countCards("he") === 0) continue;
				const result = await other.chooseBool("吃饭：是否给" + get.translation(player) + "一张牌并摸一张牌？")
					.set("ai", () => get.attitude(other, player) > 0 ? 1 : 0)
					.forResult();
				if (result.bool) {
					const giveResult = await other.chooseToGive(player, "he", true, "吃饭：请选择一张牌交给" + get.translation(player));
					if (giveResult.bool) {
						given = true;
						const card = giveResult.cards && giveResult.cards[0];
						await other.draw(1);
						if (card && get.name(card, other) === "sha") {
							await other.draw(1);
						}
						break;
					}
				}
			}
			if (!given) {
				await player.draw(1);
			}
		},
		ai: {
			order: 8,
			result: { player: 1 },
		},
	},

	youxi: {
		forced: true,
		locked: true,
		trigger: {
			player: "useCardTo",
			target: "useCardToTargeted",
		},
		filter(event, player) {
			if (!event.card || get.name(event.card) !== "sha") return false;
			return true;
		},
		async content(event, trigger, player) {
			const isSelf = trigger.player === player;
			const attacker = trigger.player;
			const defender = isSelf ? trigger.targets[0] : player;

			if (!defender || !defender.isIn()) return;

			if (defender.countCards("h", "sha") > 0 && defender.canUse({ name: "sha" }, attacker, false)) {
				const result = await defender
					.chooseCard("h", "游戏：必须使用一张杀攻击" + get.translation(attacker))
					.set("filterCard", card => card.name === "sha")
					.set("ai", card => 10)
					.forResult();
				if (result.bool && result.cards && result.cards.length) {
					await defender.useCard(result.cards[0], attacker, false);
					return;
				}
			}
			trigger.directHit.add(defender);
		},
		ai: {
			order: 6,
			result: { player: 1 },
		},
	},

	lingdi: {
		forced: true,
		locked: true,
		mod: {
			targetEnabled(card, player, target) {
				if (get.name(card) === "sha" && target.isTurnedOver()) return false;
			},
		},
		ai: {
			order: 5,
			result: { player: 0.5 },
		},
	},

	shuijiao: {
		trigger: { player: ["phaseZhunbeiAfter", "phaseUseAfter"] },
		async cost(event, trigger, player) {
			const isZhunbei = trigger.name === "phaseZhunbei";
			const action = isZhunbei ? "翻面并回复一点体力" : "翻面并摸两张牌";
			const result = await player.chooseBool("睡觉：是否" + action + "？");
			event.result = { bool: result.bool };
		},
		async content(event, trigger, player) {
			player.logSkill("shuijiao");
			await player.turnOver();
			if (trigger.name === "phaseZhunbei") {
				await player.recover(1);
			} else {
				await player.draw(2);
			}
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},
};

export default skill;
