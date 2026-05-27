import { lib, game, ui, get, ai, _status } from "../../main/utils.js";

/** @type { importCharacterConfig['skill'] } */
const skill = {
	// 地租 - 锁定技，其他角色的出牌阶段结束时，若其身上没有标记烧和抢，则需交给你一张牌
	dizu: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: {
			global: "phaseUseEnd",
		},
		filter(event, player) {
			// 不能是自己，且目标没有"烧"和"抢"标记
			return event.player !== player && 
			       !event.player.hasMark("daosuan_shao") && 
			       !event.player.hasMark("daosuan_qiang");
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			player.logSkill("dizu", target);
			
			// 如果目标有手牌或装备，必须交给还乡基一张牌
			if (target.countCards("he") > 0) {
				await target.chooseToGive(player, 1, true, "he");
			}
		},
		ai: {
			threaten(player, target) {
				// 对敌人威胁度评估
				if (get.attitude(player, target) < 0) {
					return 1.5; // 高威胁
				}
				return 0.8;
			}
		}
	},
	
	// 倒算 - 锁定技，包含回合外标记获取和准备阶段触发
	daosuan: {
		audio: 2,
		forced: true,
		locked: true,
		group: ["daosuan_shao", "daosuan_qiang"],
		trigger: {
			player: "phaseZhunbeiBegin",
		},
		filter(event, player) {
			// 检查是否有角色带有标记
			return true;
		},
		async content(event, trigger, player) {
			// 遍历所有存活角色
			for (const target of game.players.filter(p => p.isIn())) {
				if (target === player) continue;
				
				// 处理"烧"标记
				if (target.hasMark("daosuan_shao")) {
					var num = target.countMark("daosuan_shao");
					
					// 调用useSkill
					await player.useSkill("shaosha", [target]);
					
					// 移除标记
					target.removeMark("daosuan_shao", num);
					game.log(target, "失去标记烧");
				}
				
				// 处理"抢"标记
				if (target.hasMark("daosuan_qiang")) {
					var num = target.countMark("daosuan_qiang");
					
					// 调用useSkill
					await player.useSkill("qianglue", [target]);
					
					// 移除标记
					target.removeMark("daosuan_qiang", num);
					game.log(target, "失去标记抢");
				}
			}
		},
		ai: {
			order: 8,
			result: {
				player: 2,
			}
		}
	},
		
	// 子技能：获得"烧"标记
	daosuan_shao: {
		marktext: "烧",
		intro: {
			content: "拥有#个烧标记",
		},
		forced: true,
		locked: true,
		trigger: {
			player: "damageEnd",
			target: "useCardToTarget",
		},
		filter(event, player, name) {
			// 必须是回合外，且还乡基受到伤害或被杀指定
			if (_status.currentPhase === player) return false;
			
			if (name === "damageEnd") {
				return true;
			}
			
			if (event.card.name === "sha") {
				return true;
			}

			return false;
		},
		logTarget: "source",
		async content(event, trigger, player) {
			if (trigger.name === "damage") {
				const {source} = trigger;
				source.addMark("daosuan_shao", 1);
				game.log(source, "获得标记烧");
			}else if (trigger.name === "useCardToTarget") {
				trigger.player.addMark("daosuan_shao", 1);
				game.log(trigger.player, "获得标记烧");
			}
		}
	},
	
	// 子技能：获得"抢"标记
	daosuan_qiang: {
		marktext: "抢",
		intro: {
			content: "拥有#个抢标记",
		},
		forced: true,
		locked: true,
		trigger: {
			player: "loseAfter",
			global: ["gainAfter", "loseAsyncAfter"],
		},
		filter(event, player) {
			// 必须是回合外
			if (_status.currentPhase === player) return false;

			const evt = event.getl(player);
			if (!(evt?.cards2 ?? []).length) {
				return false;
			}
			if (event.name === "gain" || event.type === "gain") {
				if (
					evt.cards2.some(card => {
						return game.hasPlayer(target => {
							if (target === player) {
								return false;
							}
							return event.getg?.(target)?.includes(card);
						});
					})
				) {
					return true;
				}
			}
			if (event.type === "discard" && event.getlx !== false) {
				const discarder = event.discarder || event.getParent(2).player;
				if (discarder && discarder !== player) {
					return true;
				}
			}
			return false;
		},
		async content(event, trigger, player) {
			let source = null;
        
			// 获取来源
			if (trigger.name === "gain" || trigger.type === "gain") {
				const evt = trigger.getl(player);
				source = game.findPlayer(target => {
					if (target === player) return false;
					return evt.cards2.some(card => 
						trigger.getg?.(target)?.includes(card)
					);
				});
			} else if (trigger.type === "discard") {
				source = trigger.discarder || trigger.getParent(2).player;
			}
			
			// 验证并使用
			if (source && source.isIn()) {
				player.logSkill("技能名", source);
				// 执行你的技能逻辑
				source.addMark("daosuan_qiang", 1);
				game.log(source, "获得标记抢");
			}
		}
	},
	
	// 烧杀 - 视为对目标使用一张火杀，此杀不可响应
	shaosha: {
		audio: 2,
		content(event, trigger, player) {
			const target = event.targets[0];
			// 监听即将触发的 useCard 事件
			player.when("useCard")
				.step(async (event, trigger, player) => {
					trigger.directHit.addArray(game.players);
					game.log(trigger.card, "不可被响应");
				});
			// 直接创建并使用火杀// 创建虚拟火杀
			const sha = { name: 'sha', isCard: true, nature: 'fire', directHit: true };
			const result = player.useCard(sha, target);
		},
		ai: {
			basic: {
				order: 4,
				useful: 1,
			},
			result: {
				target(player, target) {
					const att = get.attitude(player, target);
					if (att < 0) return 2;
					return -1;
				}
			}
		}
	},
	
	// 抢掠 - 获得目标一张牌，然后再弃置目标一张牌
	qianglue: {
		audio: 2,
		async content(event, trigger, player) {
			const target = event.targets[0];
			player.logSkill("qianglue", target);
			
			// 获得目标一张牌
			if (target.countCards("he") > 0) {
				await player.gainPlayerCard(target, "he", true);
			}
			
			// 弃置目标一张牌
			if (target.countDiscardableCards(player, "he")) {
				await player.discardPlayerCard(target, "he", true);
			}
		},
		ai: {
			basic: {
				order: 6,
				useful: 1,
			},
			result: {
				target(player, target) {
					const att = get.attitude(player, target);
					if (att < 0) return 2.5;
					return -1.5;
				}
			}
		}
	},

	tuite: {
		forced: true,
		locked: true,
		mod: {
			suit(card, suit) {
				if (suit === "spade") return "heart";
			},
			cardsuit(card, player, suit) {
				if (suit === "spade") return "heart";
			},
			cardname(card, player, name) {
				if (card.suit === "spade") return "wugu";
			},
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
	},

	gushi: {
		forced: true,
		locked: true,
		trigger: { global: "useCard1" },
		filter(event, player) {
			return event.card && get.name(event.card) === "wugu";
		},
		async content(event, trigger, player) {
			trigger.cancel();
			const user = trigger.player;
			const allPlayers = game.filterPlayer(p => p.isIn()).sortBySeat(user);
			const flipCount = Math.min(allPlayers.length, trigger.targets ? trigger.targets.length : game.countPlayer());
			const cards = get.cards(flipCount);
			game.log(user, "发动五谷丰登（股市效果），从使用者开始依次翻开牌堆顶一张牌");

			let ci = 0;
			for (const currentPlayer of allPlayers) {
				if (ci >= cards.length) break;
				const card = cards[ci++];
				game.broadcastAll(function(card) {
					ui.arena.classList.add("bright");
				}, card);
				game.log(currentPlayer, "翻开了牌堆顶一张牌：", card);
				await game.delay(1);

				var chainCards = [];
				while (true) {
					var found = null;
					for (const p of allPlayers) {
						if (chainCards.some(w => w.player === p)) continue;
						const avail = p.getCards("hs").filter(c => {
							var name = get.name(c, p);
							return name === "wuxie" && !chainCards.some(w => w.card === c);
						});
						if (!avail.length) continue;
						var prompt;
						if (!chainCards.length) {
							prompt = "是否使用无懈可击将" + get.translation(card) + "置入弃牌堆？";
						} else {
							prompt = "是否使用无懈可击抵消" + get.translation(chainCards[chainCards.length - 1].card) + "？";
						}
						const result = await p.chooseCard("hs", "是否使用？", prompt)
							.set("filterCard", c => {
								var name = get.name(c, p);
								return name === "wuxie" && !chainCards.some(w => w.card === c);
							})
							.set("ai", c => {
								if (get.attitude(p, currentPlayer) < 0) return 100;
								return -1;
							})
							.forResult();
						if (result.bool && result.cards && result.cards.length) {
							found = { player: p, card: result.cards[0] };
							break;
						}
					}
					if (!found) break;
					chainCards.push(found);
				}

				var wuxied = false;
				if (chainCards.length > 0 && chainCards.length % 2 === 1) {
					card.discard();
					game.log(chainCards[0].player, "使用了无懈可击，", card, "被弃置");
					wuxied = true;
				}
				for (const w of chainCards) {
					await w.player.discard([w.card]);
				}

				if (!wuxied) {
					await currentPlayer.gain(card, "draw");
					game.log(currentPlayer, "获得了", card);
					var suit = get.suit(card, currentPlayer);
					if (suit === "heart" || suit === "diamond") {
						await currentPlayer.draw(1);
					} else {
						if (currentPlayer.countCards("he") > 0) {
							await currentPlayer.chooseToDiscard("he", 2, true, "股市：获得黑色牌，请弃置两张牌（不足则全弃）");
						}
					}
				}

				game.broadcastAll(function() {
					ui.arena.classList.remove("bright");
				});
			}
			for (let i = ci; i < cards.length; i++) {
				cards[i].discard();
			}
		},
		ai: {
			order: 6,
			result: { player: 1 },
		},
	},

	zhasi: {
		trigger: { player: "dying" },
		filter(event, player) {
			return player.maxHp > 1;
		},
		async content(event, trigger, player) {
			player.logSkill("zhasi");
			await player.loseMaxHp();
			await player.recover(1 - player.hp);
			const spadeCard = get.discardPile(c => get.suit(c) === "spade");
			if (spadeCard) {
				await player.gain(spadeCard, "draw");
			}
		},
		ai: {
			order: 9,
			result: { player: 3 },
			maixie: true,
		},
	},

	zhanshou: {
		trigger: { player: "phaseBegin" },
		zhuSkill: true,
		filter(event, player) {
			return player.isZhu && player.hasCard(c => get.name(c, player) === "wugu", "he");
		},
		async cost(event, trigger, player) {
			const cardResult = await player.chooseCard("he", "斩首：请弃置一张五谷丰登并指定一名其他角色（取消则不发动）")
				.set("filterCard", card => get.name(card, player) === "wugu")
				.forResult();
			if (!cardResult.bool) {
				event.result = { bool: false };
				return;
			}
			const targetResult = await player.chooseTarget("斩首：请指定一名其他角色（取消则不发动）")
				.set("filterTarget", (card, p, target) => target !== p)
				.forResult();
			if (!targetResult.bool) {
				event.result = { bool: false };
				return;
			}
			event.result = {
				bool: true,
				cost_data: { card: cardResult.cards[0], target: targetResult.targets[0] },
			};
		},
		async content(event, trigger, player) {
			const { card, target } = event.cost_data;
			await player.discard([card]);
			player.logSkill("zhanshou", target);
			for (const p of game.players) {
				if (p.isIn()) {
					p.storage._zhanshou_target = target;
					p.addTempSkill("zhanshou_effect", function(event, p2, name) {
						return name === "phaseBegin" && event.player === player;
					});
				}
			}
			game.log("直到" + get.translation(player) + "的下个回合开始阶段前，对" + get.translation(target) + "使用的杀无距离限制");
		},
		ai: {
			order: 8,
			result: { player: 1 },
		},
	},

	zhanshou_effect: {
		onremove(player) {
			delete player.storage._zhanshou_target;
		},
		mod: {
			targetInRange(card, player, target) {
				if (card && card.name === "sha" && target === player.storage._zhanshou_target) return true;
			},
		},
		ai: { order: 1 },
	},
};

export default skill;
