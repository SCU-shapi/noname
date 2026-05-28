import { lib, game, ui, get, ai, _status } from "../../main/utils.js";

/** @type { importCharacterConfig['skill'] } */
const skill = {
	// 威压 - 锁定技，包含两个效果
	weiya: {
		audio: 2,
		forced: true,
		locked: true,
		group: ["weiya_defense", "weiya_offense"],
	},
	
	// 子技能：防御效果 - 成为杀或延时锦囊目标时触发
	weiya_defense: {
		forced: true,
		locked: true,
		trigger: {
			target: "useCardToTarget",
		},
		filter(event, player) {
			// 必须是其他角色对威基使用的牌
			if (event.player === player) return false;
			
			const card = event.card;
			// 检查是否是杀或延时锦囊
			if (card.name === "sha") return true;
			// 延时锦囊包括：乐不思蜀、兵粮寸断、闪电
			if (get.type(event.card) == "delay") return true;
			
			return false;
		},
		logTarget: "player",
		async content(event, trigger, player) {
			const source = trigger.player;
			player.logSkill("weiya", source);
			
			// 检查来源是否有杀或锦囊牌可以交出
			const hasRequiredCards = source.countCards("h", card => {
				return card.name === "sha" || 
						get.type(card) == "trick" || 
						get.type(card) == "delay";
			}) > 0;
			
			let giveSuccess = false;
			
			if (hasRequiredCards) {
				// 让来源选择一张杀或锦囊牌交给威基
				const result = await source.chooseToGive(
					player,
					"he",
					card => {
						return card.name === "sha" || 
								get.type(card) == "trick" || 
								get.type(card) == "delay";
					},
					"请选择一张杀或锦囊牌交给" + get.translation(player)
				).forResult();
				if (result?.bool) {
					giveSuccess = true;
				};
			}
			
			// 如果没有交出牌，则此牌对威基无效
			if (!giveSuccess) {
				trigger.getParent().targets.remove(player);
				game.log(trigger.card, "对", player, "无效");
			}
		},
		ai: {
			threaten(player, target) {
				// 对敌人威胁度评估
				if (get.attitude(player, target) < 0) {
					return 1.8; // 高威胁
				}
				return 0.5;
			}
		}
	},
	
	// 子技能：进攻效果 - 使用杀或锦囊指定目标时触发
	weiya_offense: {
		forced: true,
		locked: true,
		trigger: {
			player: "useCard",
		},
		filter(event, player) {
			// 必须是对其他角色使用的牌
			if (player === event.target) return false;
			const card = event.card;
			// 检查威基是否使用了杀或锦囊牌
			if (event.player !== player) return false;
			if (card.name === "sha") return true;
			if (get.type(card) == "trick") return true;
			
			return false;
		},
		logTarget: "targets",
		async content(event, trigger, player) {
			const targets = trigger.targets.filter(target => target !== player);
			
			if (targets.length === 0) return;
			
			for (const target of targets) {
				// 检查目标是否有牌可以交出
				if (target.countCards("he") > 0) {
					// 让目标选择一张牌交给威基
					const result = await target.chooseToGive(
						player,
						"he",
						1,
						"请选择一张牌交给" + get.translation(player)
					).forResult();
					
					if (!result?.bool) {
						// 如果没有交出牌，则此杀不可被响应，锦囊不可被无懈可击
						if (trigger.card.name === "sha") {
							trigger.directHit.add(target);
							game.log(trigger.card, "对", target, "不可被响应");
						} else if (get.type(trigger.card) == "trick") {
							trigger.nowuxie = true;
							game.log(trigger.card, "不可被无懈可击");
						}
					}
				}
			}
		},
		ai: {
			order: 7,
			result: {
				player: 1.5,
			}
		}
	},
	zhizi: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: { global: "useCard" },
		filter(event, player) {
			return event.card && get.type(event.card, "trick") === "trick";
		},
		async content(event, trigger, player) {
			const user = trigger.player;
			player.logSkill("zhizi", user);
			const judgeEvent = user.judge(card => {
				if (get.suit(card) === "diamond") return -2;
				return 2;
			});
			judgeEvent.judge2 = result => result.bool;
			const result = await judgeEvent.forResult();
			if (!result.bool) {
				game.log(player, "发动了智子，", trigger.card, "被无效了");
				trigger.cancel();
			}
		},
		ai: {
			threaten: 1.2,
		},
	},
	liebian: {
		audio: 2,
		trigger: { global: "judge" },
		filter(event, player) {
			return player.countCards("h") > 0 || player.getExpansions("liebian").length > 0;
		},
		async cost(event, trigger, player) {
			const heCards = player.getExpansions("liebian").sort((a, b) => get.number(a) - get.number(b));
			const hasHand = player.countCards("h") > 0;
			const hasHe = heCards.length > 0;
			const choices = [];
			if (hasHand) choices.push("手牌");
			if (hasHe) choices.push("核");
			if (choices.length === 0) {
				event.result = { bool: false };
				return;
			}
			choices.push("取消");
			const controlResult = await player.chooseControl(choices)
				.set("prompt", "裂变：请选择用来代替判定牌的牌")
				.set("ai", () => {
					const judgeTarget = trigger.player;
					const att = get.attitude(player, judgeTarget);
					if (att > 0 && hasHe) return "核";
					if (hasHand) return "手牌";
					return "取消";
				}).forResult();
			if (!controlResult || controlResult.control === "取消") {
				event.result = { bool: false };
				return;
			}
			if (controlResult.control === "手牌") {
				const cardResult = await player.chooseCard("h", "裂变：请选择一张手牌代替判定牌")
					.set("ai", card => {
						const trigger = _status.event.getTrigger();
						const judgeTarget = trigger.player;
						const att = get.attitude(player, judgeTarget);
						if (att > 0) {
							const suit = get.suit(card);
							if (suit === "diamond") return 10;
							if (suit === "heart") return 8;
						} else {
							const suit = get.suit(card);
							if (suit === "spade" || suit === "club") return 10;
						}
						return 6 - get.value(card);
					}).forResult();
				event.result = {
					bool: cardResult.bool,
					cost_data: { type: "hand", cards: cardResult.cards },
				};
			} else {
				const buttonResult = await player.chooseButton(["裂变：请选择一个核代替判定牌", heCards], [1, 1])
					.set("ai", button => {
						const trigger = _status.event.getTrigger();
						const judgeTarget = trigger.player;
						const att = get.attitude(player, judgeTarget);
						const card = button.link;
						if (att > 0) {
							const suit = get.suit(card);
							if (suit === "diamond") return 10;
							if (suit === "heart") return 8;
						} else {
							const suit = get.suit(card);
							if (suit === "spade" || suit === "club") return 10;
						}
						return get.value(card);
					}).forResult();
				event.result = {
					bool: buttonResult.bool,
					cost_data: { type: "he", cards: buttonResult.links },
				};
			}
		},
		async content(event, trigger, player) {
			const { type, cards } = event.cost_data;
			const newCard = cards[0];
			const originalCard = trigger.player.judging[0];
			player.logSkill("liebian", trigger.player);
			if (trigger.player.judging[0].clone) {
				trigger.player.judging[0].clone.delete();
				game.addVideo("deletenode", player, get.cardsInfo([trigger.player.judging[0].clone]));
			}
			if (type === "hand") {
				await player.respond(cards, "highlight", "noOrdering");
			} else {
				await player.loseToDiscardpile([newCard]);
			}
			const next = player.addToExpansion(originalCard, player, "give");
			next.gaintag.add("liebian");
			await next;
			trigger.player.judging[0] = newCard;
			trigger.orderingCards.addArray([newCard]);
			game.log(player, "发动裂变，将", trigger.player, "的判定牌改为", newCard);
			await game.delay(2);
			const heCount = player.getExpansions("liebian").length;
			if ([4, 8, 12].includes(heCount)) {
				if (!player.storage.liebian_milestones) {
					player.storage.liebian_milestones = {};
				}
				if (!player.storage.liebian_milestones[heCount]) {
					player.storage.liebian_milestones[heCount] = true;
					player.popup("裂变");
					await player.draw(2);
				}
			}
		},
		marktext: "核",
		intro: {
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("liebian");
				if (cards.length) {
					cards.sort((a, b) => get.number(a) - get.number(b));
					dialog.addSmall(cards);
				} else {
					return "暂无核";
				}
			},
			content(storage, player) {
				const cards = player.getExpansions("liebian");
				const points = new Set(cards.map(c => get.number(c)).filter(n => typeof n === "number"));
				return "已集" + points.size + "种点数，共" + cards.length + "个核";
			},
		},
		onremove(player) {
			const cards = player.getExpansions("liebian");
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
			delete player.storage.liebian_milestones;
		},
		ai: {
			rejudge: true,
			tag: { rejudge: 1 },
			result: {
				player: 1,
			},
		},
	},
	manha: {
		audio: 2,
		enable: "phaseUse",
		filterTarget(card, player, target) {
			return true;
		},
		selectTarget: 1,
		filter(event, player) {
			if (player.storage.manha_used) return false;
			const heCards = player.getExpansions("liebian");
			const points = new Set(heCards.map(c => get.number(c)).filter(n => typeof n === "number"));
			return points.size >= 13;
		},
		async content(event, trigger, player) {
			player.storage.manha_used = true;
			const target = event.targets[0];
			player.logSkill("manha", target);
			const heCards = player.getExpansions("liebian");
			const pointMap = {};
			const cardsToRemove = [];
			for (const card of heCards) {
				const num = get.number(card);
				if (typeof num === "number" && !pointMap[num]) {
					pointMap[num] = true;
					cardsToRemove.push(card);
					if (cardsToRemove.length >= 13) break;
				}
			}
			if (cardsToRemove.length > 0) {
				player.loseToDiscardpile(cardsToRemove);
			}
			await target.loseHp(7);
			const allPlayers = game.filterPlayer(p => p.isIn());
			for (const p of allPlayers) {
				if (p.hujia > 0) {
					p.hujia = 0;
				}
			}
			for (const p of allPlayers) {
				await p.damage(1);
			}
		},
		ai: {
			order: 10,
			result: {
				target(player, target) {
					return get.attitude(player, target) < 0 ? 10 : -10;
				},
			},
		},
	},

	fucong: {
		forced: true,
		locked: true,
		trigger: {
			global: ["phaseUseBegin", "loseAfter", "equipAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter", "damageAfter", "recoverAfter"],
		},
		filter(event, player) {
			return true;
		},
		async content(event, trigger, player) {
			const others = game.filterPlayer(p => p !== player && p.isIn());
			for (const p of others) {
				const hand = p.countCards("h");
				const equip = p.countCards("e");
				const hp = p.hp;
				let count = 0;
				if (hand > player.countCards("h")) count++;
				if (equip > player.countCards("e")) count++;
				if (hp > player.hp) count++;
				const meets = count >= 2 && p.countCards("h", "sha") > 0;
				const hasActive = p.hasSkill("fucong_active");
				if (meets && !hasActive) {
					p.addTempSkill("fucong_active", "phaseUseAfter");
				} else if (!meets && hasActive) {
					p.removeSkills("fucong_active");
					delete p.storage._fucong_used;
				}
			}
		},
		ai: {
			order: 6,
			result: { player: 0.5 },
		},
	},

	fucong_active: {
		enable: "phaseUse",
		filter(event, player) {
			return !player.storage._fucong_used && player.countCards("h", "sha") > 0;
		},
		async content(event, trigger, player) {
			player.storage._fucong_used = true;
			const baji = game.filterPlayer(p => p.hasSkill("fucong") && p.isIn())[0];
			if (!baji) return;
			const result = await player.chooseBool("服从：是否交给" + get.translation(baji) + "一张杀，令其对一名你指定的角色使用杀？");
			if (!result.bool) return;
			const giveResult = await player.chooseToGive(baji, "h", "服从：请交给" + get.translation(baji) + "一张杀")
				.set("filterCard", card => card.name === "sha")
				.set("ai", card => get.value(card) < 5 ? 1 : 0)
				.forResult();
			if (!giveResult.bool) return;
			baji.logSkill("fucong", player);
			const targetResult = await player.chooseTarget("服从：请指定" + get.translation(baji) + "出杀的目标")
				.set("filterTarget", (card, cur, t) => t !== baji && baji.canUse({ name: "sha", isCard: true }, t, false))
				.set("ai", t => get.effect(t, { name: "sha" }, baji, baji))
				.forResult();
			if (targetResult.bool && targetResult.targets && targetResult.targets.length) {
				await baji.useCard({ name: "sha", isCard: true }, targetResult.targets, false);
			}
		},
		group: "fucong_reset",
		subSkill: {
			reset: {
				trigger: { player: "phaseUseEnd" },
				silent: true,
				content(event, trigger, player) {
					delete player.storage._fucong_used;
				},
			},
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
	},

	xiaohui: {
		enable: "phaseUse",
		usable: 1,
		filterCard: true,
		selectCard: 1,
		filterTarget(card, player, target) {
			return target !== player;
		},
		selectTarget: 1,
		position: "he",
		discard: false,
		lose: false,
		async content(event, trigger, player) {
			const target = event.targets[0];
			player.logSkill("xiaohui", target);
			const card = event.cards[0];
			await player.give(card, target);
			player.storage._xiaohui_gave_to = target;
			player.addTempSkill("xiaohui_block", function(event, p, name) {
				return name === "phaseBegin" && event.player === player;
			});
		},
		ai: {
			order: 5,
			result: { target: 1 },
		},
	},

	xiaohui_block: {
		mod: {
			targetEnabled(card, player, target) {
				if (card && card.name === "sha" && player === target.storage._xiaohui_gave_to) return false;
			},
		},
		onremove(player) {
			delete player.storage._xiaohui_gave_to;
		},
		ai: { order: 1 },
	},

	zhishi: {
		enable: "phaseUse",
		usable: 1,
		filterTarget(card, player, target) {
			return target !== player;
		},
		selectTarget: 1,
		async content(event, trigger, player) {
			const target = event.targets[0];
			player.logSkill("zhishi", target);
			const target2Result = await player.chooseTarget("指使：请指定一名" + get.translation(target) + "使用杀的目标（取消则结束技能）")
				.set("filterTarget", (card, p, t) => t !== target && target.canUse({ name: "sha", isCard: true }, t, false))
				.set("ai", t => get.effect(t, { name: "sha" }, target, target))
				.forResult();
			if (!target2Result.bool || !target2Result.targets || !target2Result.targets.length) return;
			const confirm = await target.chooseBool("指使：" + get.translation(player) + "要求你对" + get.translation(target2Result.targets[0]) + "使用一张杀并获得其一张牌，否则需交给" + get.translation(player) + "一张牌")
				.set("ai", () => get.effect(target2Result.targets[0], { name: "sha" }, target, target) > 0 ? 1 : 0)
				.forResult();
			if (confirm.bool) {
				await target.useCard({ name: "sha", isCard: true }, target2Result.targets, false);
				if (player.countCards("he") > 0) {
					await target.gainPlayerCard(player, "he", true);
				}
			} else {
				if (target.countCards("he") > 0) {
					await target.chooseToGive(player, "he", "指使：请交给" + get.translation(player) + "一张牌");
				}
			}
		},
		ai: {
			order: 6,
			result: { target: 1 },
		},
	},
};

export default skill;
