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
		subSkill: {
			forced_shan: {
				mod: {
					cardRespondable(card, player) {
						if (player.storage._huaquan_forced_shan !== undefined && card.name === "shan" && card.cardid !== player.storage._huaquan_forced_shan) {
							return false;
						}
					},
					cardEnabled2(card, player) {
						if (player.storage._huaquan_forced_shan !== undefined && card.name === "shan" && card.cardid !== player.storage._huaquan_forced_shan) {
							return false;
						}
					},
				},
			},
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			if (!target || !target.isIn()) return;
			if (player.countCards("h") === 0 || target.countCards("h") === 0) {
				game.log("划拳双方必须均有手牌");
				return;
			}
			let hq = player.storage._huaquan_state;
			if (!hq) {
				hq = { target, cardsSet: [], damageBonus: false, _shaDisabled: false };
				player.storage._huaquan_state = hq;
				target.storage._huaquan_state = hq;
			}
			if (!hq.onResolve) hq.onResolve = [];
			if (!hq.onCleanup) hq.onCleanup = [];
			if (!hq.onBeforeUse) hq.onBeforeUse = [];

			const playerResult = await player.chooseCard("h", true, "划拳：请扣置一张手牌")
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!playerResult.bool) { cleanup(); return; }
			const playerCard = playerResult.cards[0];
			const pName = playerCard.name;
			hq.playerCard = playerCard;
			hq.cardsSet.push({ name: pName, cardId: playerCard.cardid, owner: player, used: false });
			await player.addToExpansion([playerCard], "give");

			const targetResult = await target.chooseCard("h", true, "划拳：请扣置一张手牌")
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!targetResult.bool) { cleanup(); return; }
			const targetCard = targetResult.cards[0];
			const tName = targetCard.name;
			hq.targetCard = targetCard;
			hq.cardsSet.push({ name: tName, cardId: targetCard.cardid, owner: target, used: false });
			await target.addToExpansion([targetCard], "give");

			const pShaTargetShan = pName === "sha" && tName === "shan";
			const tShaPlayerShan = tName === "sha" && pName === "shan";

			if (pShaTargetShan || tShaPlayerShan) {
				const shaUser = pShaTargetShan ? player : target;
				const shanUser = pShaTargetShan ? target : player;
				const shaCard = pShaTargetShan ? hq.playerCard : hq.targetCard;
				const shanCard = pShaTargetShan ? hq.targetCard : hq.playerCard;

				for (const fn of hq.onBeforeUse) await fn(hq, player, target);

				if (!hq._shaDisabled) {
					hq.cardsSet.forEach(c => c.used = true);

					await shaUser.gain([shaCard], "nodelay");
					await shanUser.gain([shanCard], "nodelay");

					game.log(shaUser, "翻开了扣置的", shaCard);
					game.log(shanUser, "翻开了扣置的", shanCard);

					shanUser.storage._huaquan_forced_shan = shanCard.cardid;
					shanUser.addTempSkill("huaquan_forced_shan");

					const useEvent = shaUser.useCard(shaCard, shanUser, false);
					if (hq.damageBonus) useEvent.baseDamage = (useEvent.baseDamage || 1) + 1;
					await useEvent;

					delete shanUser.storage._huaquan_forced_shan;
					shanUser.removeSkill("huaquan_forced_shan");

					game.log(shanUser, "使用扣置闪响应了", shaUser, "的杀");
				}
			} else {
				const pCard = hq.playerCard;
				const tCard = hq.targetCard;
				const pCardCopy = { name: pCard.name, suit: pCard.suit, number: pCard.number };
				const tCardCopy = { name: tCard.name, suit: tCard.suit, number: tCard.number };

				game.log(player, "翻开了扣置的", pCardCopy);
				const playerCanUse = pName === "sha" || player.canUse(pName, target, false);
				if (playerCanUse) {
					if (pName === "sha") {
						for (const fn of hq.onBeforeUse) await fn(hq, player, target);
					}
					if (pName === "sha" && hq._shaDisabled) {
						game.log("浮风：", player, "的杀失效");
					} else {
						hq.cardsSet[0].used = true;
						const useEvent = player.useCard(pCardCopy, [target], false);
						if (pName === "sha" && tName !== "shan") useEvent.directHit = [target];
						if (hq.damageBonus && pName === "sha") useEvent.baseDamage = (useEvent.baseDamage || 1) + 1;
						await useEvent;
					}
				} else {
					game.log(player, "的扣置牌", pCardCopy, "无法对", target, "使用");
					hq._playerUnusable = true;
				}

				game.log(target, "翻开了扣置的", tCardCopy);
				const targetCanUse = tName === "sha" || target.canUse(tName, player, false);
				if (targetCanUse) {
					if (tName === "sha") {
						for (const fn of hq.onBeforeUse) await fn(hq, player, target);
					}
					if (tName === "sha" && hq._shaDisabled) {
						game.log("浮风：", target, "的杀失效");
					} else {
						hq.cardsSet[1].used = true;
						const useEvent = target.useCard(tCardCopy, [player], false);
						if (tName === "sha" && pName !== "shan") useEvent.directHit = [player];
						if (hq.damageBonus && tName === "sha") useEvent.baseDamage = (useEvent.baseDamage || 1) + 1;
						await useEvent;
					}
				} else {
					game.log(target, "的扣置牌", tCardCopy, "无法对", player, "使用");
					hq._targetUnusable = true;
				}

			}

			for (const fn of hq.onResolve) {
				await fn(hq, player, target);
			}

			const pRest = hq.playerCard;
			const tRest = hq.targetCard;
			if (pRest && get.position(pRest) === "x") player.loseToDiscardpile([pRest]);
			if (tRest && get.position(tRest) === "x") target.loseToDiscardpile([tRest]);

			delete player.storage._huaquan_state;
			delete target.storage._huaquan_state;

			for (const fn of hq.onCleanup) {
				await fn(hq, player, target);
			}

			function cleanup() {
				if (hq.onCleanup) {
					for (const fn of hq.onCleanup) {
						fn(hq, player, target);
					}
				}
				if (hq.playerCard && get.position(hq.playerCard) === "x") player.loseToDiscardpile([hq.playerCard]);
				if (hq.targetCard && get.position(hq.targetCard) === "x") target.loseToDiscardpile([hq.targetCard]);
				delete player.storage._huaquan_state;
				delete target.storage._huaquan_state;
			}
		},
		ai: {
			basic: { order: 1, useful: 0 },
		},
	},

	tihu: {
		trigger: { player: "phaseUseBegin", global: "phaseUseBegin" },
		filter(event, player) {
			if (event.player === player) return player.countCards("h") > 0 && game.hasPlayer(target => target !== player && target.countCards("h") > 0);
			return player.countCards("h") > 0;
		},
		async content(event, trigger, player) {
			let target;
			if (trigger.player === player) {
				const result = await player.chooseTarget("提壶：请选择一名其他角色划拳")
					.set("filterTarget", (card, p, target) => target !== p && target.countCards("h") > 0)
					.set("ai", target => get.attitude(player, target) < 0 ? 1 : 0)
					.forResult();
				if (!result.bool || !result.targets || !result.targets.length) return;
				target = result.targets[0];
			} else {
				target = trigger.player;
			}
			player.logSkill("tihu", target);
			const hq = { target, cardsSet: [], damageBonus: false };
			player.storage._huaquan_state = hq;
			target.storage._huaquan_state = hq;
			await player.useSkill("huaquan", [target]);
		},
		ai: {
			order: 6,
			result: { target: 1 },
		},
	},

	hankuang: {
		forced: true,
		locked: true,
		trigger: { global: "useSkill" },
		filter(event, player) {
			if (event.skill !== "huaquan") return false;
			const hq = player.storage._huaquan_state;
			if (!hq || hq._hankuang_hooked) return false;
			return hq.target === player || event.player === player;
		},
		async content(event, trigger, player) {
			const hq = player.storage._huaquan_state;
			hq._hankuang_hooked = true;
			const p = trigger.player;
			const t = hq.target;

			for (const s of [p, t]) {
				s.addSkill("hankuang_jiu");
				s.storage.jiu = 1;
				s.addSkill("jiu");
				if (lib.config.jiu_effect && !s.node.jiu) {
					s.node.jiu = ui.create.div(".playerjiu", s.node.avatar);
					s.node.jiu2 = ui.create.div(".playerjiu", s.node.avatar2);
				}
			}

			if (!hq.onResolve) hq.onResolve = [];
			hq.onResolve.push(async (hq, p, t) => {
				const noSha = !hq.cardsSet.some(c => c.name && c.name === "sha");
				if (noSha) {
					if (p.hasSkill("hankuang")) {
						p.logSkill("hankuang");
						await p.draw(1);
					}
					if (t.hasSkill("hankuang")) {
						t.logSkill("hankuang");
						await t.draw(1);
					}
				}
			});

			if (!hq.onCleanup) hq.onCleanup = [];
			hq.onCleanup.push((hq, p, t) => {
				p.removeSkill("hankuang_jiu");
				t.removeSkill("hankuang_jiu");
			});
		},
		subSkill: {
			jiu: {
				charlotte: true,
				trigger: { player: "useCardAfter" },
				filter(event, player) {
					return event.card && event.card.name === "sha";
				},
				forced: true,
				async content(event, trigger, player) {
					player.storage.jiu = 1;
					player.addSkill("jiu");
					if (lib.config.jiu_effect && !player.node.jiu) {
						player.node.jiu = ui.create.div(".playerjiu", player.node.avatar);
						player.node.jiu2 = ui.create.div(".playerjiu", player.node.avatar2);
					}
				},
				onremove(player) {
					player.removeSkill("jiu");
				},
			},
		},
		ai: {
			order: 7,
			result: { player: 1 },
			damageBonus: true,
			skillTagFilter(player, tag, arg) {
				if (tag === "damageBonus") return arg && arg.card && arg.card.name === "sha";
			},
		},
	},

	tingqiao: {
		forced: true,
		locked: true,
		trigger: { global: ["useCard", "respond"] },
		filter(event, player) {
			if (!event.card || event.card.name !== "shan") return false;
			if (!Array.isArray(event.respondTo)) return false;
			if (!event.respondTo[1] || event.respondTo[1].name !== "sha") return false;
			if (event.player !== player && event.respondTo[0] !== player) return false;
			return true;
		},
		async content(event, trigger, player) {
			player.logSkill("tingqiao");
			const shaSource = trigger.respondTo[0];
			const shaTarget = trigger.player;
			if (shaSource && shaSource.isIn() && shaTarget && shaTarget.isIn()) {
				const useEvent = shaTarget.useCard({ name: "sha", isCard: true }, shaSource, false);
				useEvent.directHit = [shaSource];
				await useEvent;
			}
			await player.draw();
		},
		ai: {
			order: 7,
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
						const t = result.targets[0];
						const hq = { target: t, cardsSet: [], damageBonus: false };
						player.storage._huaquan_state = hq;
						t.storage._huaquan_state = hq;
						await player.useSkill("huaquan", [t]);
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
		trigger: { global: "useSkill" },
		filter(event, player) {
			if (event.skill !== "huaquan") return false;
			const hq = player.storage._huaquan_state;
			if (!hq || hq._mengbu_hooked) return false;
			return hq.target === player || event.player === player;
		},
		firstDo: true,
		async content(event, trigger, player) {
			if (trigger && trigger.name === "useSkill" && trigger.skill === "huaquan") {
				const hq = player.storage._huaquan_state;
				if (!hq) return;
				hq._mengbu_hooked = true;
				if (!hq.onResolve) hq.onResolve = [];
				if (!hq.onCleanup) hq.onCleanup = [];
				hq.onResolve.push(async (hq, p, t) => {
					if (hq._playerUnusable && p.hasSkill("mengbu")) {
						p.logSkill("mengbu");
						await p.draw(2);
					}
					if (hq._targetUnusable && t.hasSkill("mengbu")) {
						t.logSkill("mengbu");
						await t.draw(2);
					}
				});
				hq.onCleanup.push(async (hq, p, t) => {
					if (p.hasSkill("mengbu")) await p.useSkill("mengbu");
					if (t.hasSkill("mengbu")) await t.useSkill("mengbu");
				});
				return;
			}
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
		trigger: { global: ["useCard", "useSkill"] },
		firstDo: true,
		filter(event, player) {
			return !player.storage._huaquan_state &&
				event.player !== player &&
				event.player.isIn() &&
				event.targets && event.targets.includes(player) &&
				player.countCards("h") > 0;
		},
		async content(event, trigger, player) {
			const t = trigger.player;
			const hq = { target: t, cardsSet: [], damageBonus: false };
			player.storage._huaquan_state = hq;
			t.storage._huaquan_state = hq;
			await player.useSkill("huaquan", [t]);
		},
		ai: {
			order: 7,
			result: { player: 1 },
		},
	},

	niren: {
		forced: true,
		locked: true,
		trigger: {
			source: "damageBegin4",
		},
		filter(event, player) {
			return event.player && event.player.hp < player.hp;
		},
		async content(event, trigger, player) {
			player.logSkill("niren", trigger.player);
			trigger.cancel();
			const target = trigger.player;
			const available = target.countCards("he");
			if (available > 0) {
				await player.discardPlayerCard(target, "he", true, Math.min(available, 2));
			}
		},
		group: ["niren_sha"],
		subSkill: {
			sha: {
				charlotte: true,
				trigger: { player: "useCard" },
				filter(event, player) {
					return event.card && event.card.name === "sha" && player.storage.niren_sha_round !== game.roundNumber;
				},
				forced: true,
				async content(event, trigger, player) {
					player.storage.niren_sha_round = game.roundNumber;
					trigger.baseDamage = (trigger.baseDamage || 1) + 1;
				},
			},
		},
		ai: {
			threaten: 1.2,
			damageBonus: true,
			skillTagFilter(player, tag, arg) {
				if (tag === "damageBonus") {
					return arg && arg.card && arg.card.name === "sha" && player.storage.niren_sha_round !== game.roundNumber;
				}
			},
		},
	},

	huoxin: {
		trigger: { global: "phaseUseBegin" },
		filter(event, player) {
			if (event.player === player) return false;
			if (player.countCards("h") === 0 || event.player.countCards("h") === 0) return false;
			return true;
		},
		async cost(event, trigger, player) {
			const result = await player
				.chooseBool("是否对" + get.translation(trigger.player) + "发动活心？")
				.set("ai", () => get.attitude(player, trigger.player) < 0)
				.forResult();
			event.result = { bool: result.bool };
		},
		async content(event, trigger, player) {
			player.logSkill("huoxin", trigger.player);
			const target = trigger.player;
			const damageBefore = {};
			for (const p of game.filterPlayer()) {
				damageBefore[p.playerid] = p.getHistory("damage").length;
			}
			const hq = { target, cardsSet: [], damageBonus: false, _huoxin_damageBefore: damageBefore };
			player.storage._huaquan_state = hq;
			target.storage._huaquan_state = hq;
			if (!hq.onResolve) hq.onResolve = [];
			if (!hq.onCleanup) hq.onCleanup = [];
			hq.onCleanup.push((hq, p, t) => {
				let damaged = false;
				for (const pl of game.filterPlayer()) {
					if (pl.getHistory("damage").length > (hq._huoxin_damageBefore[pl.playerid] || 0)) {
						damaged = true;
						break;
					}
				}
				if (!damaged && t.isIn()) {
					t.addTempSkill("huoxin_block", { player: "phaseAfter" });
				}
			});
			await player.useSkill("huaquan", [target]);
		},
		subSkill: {
			block: {
				charlotte: true,
				mod: {
					cardEnabled2(card, player) {
						if (card.name === "sha") return false;
					},
					cardRespondable(card, player) {
						if (card.name === "sha") return false;
					},
				},
			},
		},
		ai: {
			order: 6,
			result: { target: -1 },
		},
	},

	feiyu: {
		forced: true,
		locked: true,
		trigger: { global: "useSkill" },
		filter(event, player) {
			if (event.skill !== "huaquan") return false;
			const hq = player.storage._huaquan_state;
			if (!hq) return false;
			if (hq._feiyu_triggered && hq._feiyu_triggered.includes(player)) return false;
			return true;
		},
		firstDo: true,
		async content(event, trigger, player) {
			const hq = player.storage._huaquan_state;
			if (!hq._feiyu_triggered) hq._feiyu_triggered = [];
			hq._feiyu_triggered.push(player);

			if (player.hp === 1) {
				hq.damageBonus = true;
				const result = await player
					.chooseBool("飞御：是否摸两张牌？")
					.set("ai", () => true)
					.forResult();
				if (result.bool) {
					await player.draw(2);
				}
			}

			const feiyuOwner = player;
			if (!hq.onResolve) hq.onResolve = [];
			hq.onResolve.push(async (hq, hqInitiator, hqTarget) => {
				if (!feiyuOwner.isIn()) return;
				const isInitiator = feiyuOwner === hqInitiator;
				const myCard = isInitiator ? hq.playerCard : hq.targetCard;
				const opponent = isInitiator ? hqTarget : hqInitiator;
				const otherCard = isInitiator ? hq.targetCard : hq.playerCard;
				if (!myCard || !otherCard || !opponent.isIn()) return;
				if (typeof myCard.number !== "number" || typeof otherCard.number !== "number") return;
				if (myCard.number > otherCard.number) {
					feiyuOwner.logSkill("feiyu", opponent);
					await feiyuOwner.chooseToUse({
						filterCard(card, player) {
							if (get.itemtype(card) !== "card" || get.position(card) !== "h") return false;
							return card.name === "sha" && lib.filter.cardEnabled(card, player);
						},
						filterTarget(card, player, target) {
							return target === opponent;
						},
						prompt: "飞御：你可使用一张杀",
						selectCard: [1, 1],
						addCount: false,
					});
				}
			});
		},
		ai: {
			order: 5,
			result: { player: 1 },
		},
	},
};

export default skill;
