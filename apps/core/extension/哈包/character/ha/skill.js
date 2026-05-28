import { lib, game, ui, get, ai, _status } from "../../main/utils.js";

/** @type { importCharacterConfig['skill'] } */
const skill = {
	// 游击 - 当你使用或打出基本牌后，可以重铸自己一张牌
	youji: {
		audio: 2, // 技能音频数量
		// 触发时机：当玩家使用或打出卡牌之后
		trigger: {
			player: ["useCardAfter", "respondAfter"],
		},
		frequent:true,
		// 过滤条件：检查是否有基本牌且玩家有手牌或装备区的牌
		filter(event, player) {
			return event.card && get.type(event.card) == "basic" && player.countCards("he") > 0;
		},
		// 技能效果内容
		async content(event, trigger, player) {
			// 让玩家选择一张手牌或装备区的牌进行重铸（可选，可取消）
			const result = await player.chooseCard("he", "游击：选择一张牌进行重铸（取消则不发动）").set("ai", card => {
				// AI评估：价值越低的牌越优先重铸
				return 6 - get.value(card);
			}).forResult();
			// 如果玩家选择了牌，则执行重铸
			if (result.bool && result.cards?.length) {
				await player.recast(result.cards);
			}
		},
		// AI配置
		ai: {
			order: 5,
			result: {
				player(player) {
					// 基本牌使用后重铸的收益评估
					if (player.countCards('he') <= 1) return 0; // 牌太少不划算
					return 0.8; // 中等收益
				}
			},
			effect: {
				player(card, player) {
					// 判断是否应该发动技能
					if (get.type(card) !== 'basic') return 0;
					// 低价值牌更应该重铸
					const lowValueCards = player.getCards('he', c => get.value(c) < 4);
					return lowValueCards.length > 0 ? 1 : 0.3;
				}
			}
		},
	},
	// 肃纪 - 出牌阶段限一次，你可以观看任意一名角色的手牌，重铸其中任意数量的牌。该技能使用时不会触发其他任何技能的效果。
	suji: {
		audio: 2, // 技能音频数量
		enable: "phaseUse", // 在出牌阶段发动
		usable: 1, // 每回合限用一次
		// 目标过滤：只能选择有手牌的角色（包括自己）
		filterTarget(card, player, target) {
			return target.countCards("h") > 0;
		},
		// 技能效果内容
		async content(event, trigger, player) {
			const target = event.target; // 获取技能目标
			player.logSkill("suji"); // 记录技能使用日志
			
			// 获取目标的所有手牌
			const handCards = target.getCards("h");
			if (handCards.length === 0) {
				return; // 如果没有手牌，直接返回
			}
			
			// 让玩家选择要重铸的牌（可见手牌，可选择0到多张）
			const result = await player.choosePlayerCard({
				target, // 目标角色
				position: "h", // 选择手牌区的牌
				visible: true, // 手牌可见（可以看到牌面）
				selectButton: [0, Infinity], // 可以选择0到无限张牌
				prompt: `肃纪：选择${get.translation(target)}的手牌进行重铸（可选多张）`, // 提示文本
				filterButton: card => target.canRecast(card), // 过滤：只能选择可以重铸的牌
				allowChooseAll: true, // 允许全选
			}).forResult();
			
			// 如果选择了牌，则执行重铸
			if (result.cards?.length) {
				// 重铸选中的牌，传入null参数确保不触发其他技能效果
				await target.recast(result.cards, null, null);
			}
		},
		// AI配置
		ai: {
			order: 6,
			result: {
				target(player, target) {
					// 对敌人使用收益高，对队友收益低
					const att = get.attitude(player, target);
					if (att < 0) return 2; // 敌人：高收益
					if (att > 0) return -1.5; // 队友：负收益（破坏队友手牌）
					return 0.5; // 中立：轻微收益
				}
			},
			chooseTarget: {
				filter(card, player, target) {
					return target.countCards('h') > 0;
				},
				select(target) {
					const player = get.player();
					const att = get.attitude(player, target);
					// 优先选择敌人或中立角色
					if (att < 0) return 10;
					if (att === 0) return 5;
					return 1; // 尽量避免对队友使用
				}
			},
			chooseButton: {
				filter(button, player) {
					// 优先重铸高价值牌（对敌人）或低价值牌（对自己）
					const card = button.link;
					const target = get.event().target;
					const att = get.attitude(player, target);
					
					if (att < 0) {
						// 对敌人：重铸其高价值牌
						return get.value(card, target) > 3;
					} else {
						// 对自己/队友：重铸低价值牌
						return get.value(card, target) < 3;
					}
				},
				check(button) {
					const card = button.link;
					const target = get.event().target;
					const att = get.attitude(get.player(), target);
					
					if (att < 0) {
						// 对敌人：价值越高越优先
						return get.value(card, target);
					} else {
						// 对自己/队友：价值越低越优先
						return 6 - get.value(card, target);
					}
				}
			}
		},
	},
	// 问答 - 觉醒技,当你的血量降到3以下时立即发动,从你开始依次选择一项:1、指定一名手牌数大于自己的角色,视为对其使用一张杀,并弃置其一张牌;2、指定一名手牌数不大于自己的角色,获得其一张牌。随后所有角色获得技能皮豆。若你为主公,可在自己回合开始阶段直接发动。
	wenda: {
		audio: 2,
		skillAnimation: true,           // 显示觉醒动画
		animationColor: "fire",         // 火焰色觉醒动画
		juexingji: true,                // 官方觉醒技标记
		forced: true,                  // 非强制发动(主公可选择,但掉血时强制)
		trigger: {
			player: ["changeHp", "phaseBegin"],  // 监听血量变化和回合开始两个事件
		},
		filter(event, player) {
			// 检查是否已觉醒(防止重复触发)
			if (player.storage.wenda === true) {
				return false;
			}
			
			// 血量降到3以下时强制觉醒
			if (event.name === 'changeHp' && player.hp < 3) {
				this.forced = true; // 强制觉醒
				return true;
			}
			
			// 主公在回合开始时可以主动觉醒
			if (event.name === 'phase' && player.isZhu) {
				this.forced = false; // 取消强制,允许觉醒
				return true;
			}
			
			return false;
		},
		async content(event, trigger, player) {
			// 播放觉醒动画
			player.awakenSkill('wenda');
			
			// 获取所有存活角色并按座位排序（从当前玩家开始依次执行）
			const orderedPlayers = game.players.filter(p => p.isIn()).sortBySeat();
			
			// 辅助函数:执行选择
			async function executeChoice(currentPlayer, optionIndex, greaterTargets, notGreaterTargets) {
				if (optionIndex === 0 && greaterTargets.length > 0) {
					// 选项1:指定手牌数大于自己的角色,视为对其使用杀,并弃置其一张牌
					const targetResult = await currentPlayer.chooseTarget(
						'问答:请选择一名手牌数大于你的角色',
						1,
						1,
						true
					).set('filterTarget', (card, player, target) => {
						return greaterTargets.includes(target);
					}).set('ai', target => {
						const sha = { name: 'sha', isCard: true };
						return get.effect(target, sha, currentPlayer, currentPlayer);
					}).forResult();
					
					if (targetResult.bool && targetResult.targets && targetResult.targets.length > 0) {
						const target = targetResult.targets[0];
						currentPlayer.logSkill('wenda', target);
						
						// 视为使用杀
						const sha = { name: 'sha', isCard: true };
						if (currentPlayer.canUse(sha, target, false)) {
							await currentPlayer.useCard(sha, target, false);
						}
						
						// 弃置目标一张牌
						if (target.countDiscardableCards(currentPlayer, 'he')) {
							await currentPlayer.discardPlayerCard(target, 'he', true);
						}
					}
				} else if (optionIndex === 1 && notGreaterTargets.length > 0) {
					// 选项2:指定手牌数不大于自己的角色,获得其一张牌
					const targetResult = await currentPlayer.chooseTarget(
						'问答:请选择一名手牌数不大于你的角色',
						1,
						1,
						true
					).set('filterTarget', (card, player, target) => {
						return notGreaterTargets.includes(target);
					}).set('ai', target => {
						return get.attitude(currentPlayer, target);
					}).forResult();
					
					if (targetResult.bool && targetResult.targets && targetResult.targets.length > 0) {
						const target = targetResult.targets[0];
						currentPlayer.logSkill('wenda', target);
						
						// 获得目标一张牌
						if (target.countCards('he') > 0) {
							await currentPlayer.gainPlayerCard(target, 'he', true);
						}
					}
				}
			}
			
			// 所有角色依次选择
			for (const currentPlayer of orderedPlayers) {
				if (!currentPlayer.isIn()) continue;
				
				// 计算当前角色的手牌数
				const currentHandCount = currentPlayer.countCards('h');
				
				// 查找符合条件的目标
				const greaterTargets = game.players.filter(target => 
					target.isIn() && target !== currentPlayer && target.countCards('h') > currentHandCount
				);
				const notGreaterTargets = game.players.filter(target => 
					target.isIn() && target !== currentPlayer && target.countCards('h') <= currentHandCount
				);
				
				// 如果两个选项都没有可选目标,跳过该角色
				if (greaterTargets.length === 0 && notGreaterTargets.length === 0) {
					continue;
				}
				
				// 构建选择列表
				const choiceList = [];
				if (greaterTargets.length > 0) {
					choiceList.push('指定一名手牌数大于自己的角色,视为对其使用一张杀,并弃置其一张牌');
				}
				if (notGreaterTargets.length > 0) {
					choiceList.push('指定一名手牌数不大于自己的角色,获得其一张牌');
				}
				
				// 如果只有一个选项,直接执行
				if (choiceList.length === 1) {
					// 修复:根据实际可用的选项确定索引
					const optionIndex = greaterTargets.length > 0 ? 0 : 1;
					await executeChoice(currentPlayer, optionIndex, greaterTargets, notGreaterTargets);
				} else {
					// 让玩家选择
					const result = await currentPlayer.chooseControl(...choiceList.map((_, i) => `选项${i + 1}`))
						.set('prompt', '问答:请选择一项')
						.set('choiceList', choiceList)
						.forResult();
					const optionIndex = result.control === '选项1' ? 0 : 1;
					await executeChoice(currentPlayer, optionIndex, greaterTargets, notGreaterTargets);
				}
			}
			
			// 所有角色获得皮豆技能
			for (const p of game.players) {
				if (p.isIn() && !p.hasSkill('pidou')) {
					p.addSkills('pidou');
				}
			}
		},
		// AI配置
		ai: {
			order: 9,
			result: {
				player: 3, // 觉醒技高收益
			},
			threaten(player, target) {
				// 综合评估威胁度
				let threat = 0.5;
				// 血量低时威胁增加
				if (target.hp <= 2) threat += 0.5;
				// 手牌少时威胁增加（容易被针对）
				if (target.countCards('h') <= 2) threat += 0.3;
				// 有防御牌时威胁降低
				if (target.countCards('h', c => ['shan', 'tao'].includes(get.name(c))) > 0) {
					threat -= 0.2;
				}
				return Math.max(0.1, threat);
			},
			maixie: true,
			// 选项选择AI
			chooseControl: {
				check(control, player) {
					const event = get.event();
					const greaterTargets = event.greaterTargets || [];
					const notGreaterTargets = event.notGreaterTargets || [];
					
					// 评估选项1的收益（杀+弃牌）
					let option1Value = 0;
					if (greaterTargets.length > 0) {
						option1Value = greaterTargets.reduce((sum, t) => {
							const att = get.attitude(player, t);
							if (att < 0) {
								// 对敌人：杀+弃牌是高收益
								return sum + 2.5;
							}
							return sum - 1; // 对队友是负收益
						}, 0) / greaterTargets.length;
					}
					
					// 评估选项2的收益（获得牌）
					let option2Value = 0;
					if (notGreaterTargets.length > 0) {
						option2Value = notGreaterTargets.reduce((sum, t) => {
							const att = get.attitude(player, t);
							const cardValue = t.countCards('he') * 0.8; // 预估牌价值
							if (att < 0) {
								// 从敌人获得牌：高收益
								return sum + cardValue + 1;
							} else if (att > 0) {
								// 从队友获得牌：中等收益（团队增益）
								return sum + cardValue * 0.6;
							}
							return sum + cardValue * 0.8;
						}, 0) / notGreaterTargets.length;
					}
					
					// 比较两个选项
					if (control === '选项1') {
						return option1Value - option2Value;
					} else {
						return option2Value - option1Value;
					}
				}
			}
		}
	},
	// 皮豆 - 出牌阶段限一次，指定任意一名玩家博弈，声明该角色所有红色/黑色牌点数总和更大，失败的角色失去一点体力并可以立即使用一次肃纪，因皮豆而陷入濒死的角色回复一点体力。
	pidou: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filterTarget(card, player, target) {
			return true; // 可以选择任意一名玩家作为目标
		},
		async content(event, trigger, player) {
			const target = event.target;
			player.logSkill("pidou", target);
			
			// 询问玩家选择红色还是黑色
			const colorResult = await player.chooseControl(["red", "black"]).set("prompt", "皮豆：请选择声明的颜色").forResult();
			const chosenColor = colorResult.control;
			
			// 计算目标角色红/黑牌的点数总和
			const cards = target.getCards("he");
			let pointSum = 0;
			
			cards.forEach(card => {
				if (get.color(card) === chosenColor) {
					const number = get.number(card) || 0;
					pointSum += number;
				}
			});
			
			// 计算另一颜色的点数总和
			const oppositeColor = chosenColor === "red" ? "black" : "red";
			let oppositePointSum = 0;
			
			cards.forEach(card => {
				if (get.color(card) === oppositeColor) {
					const number = get.number(card) || 0;
					oppositePointSum += number;
				}
			});
			
			// 判断谁的点数更大
			const playerWins = pointSum > oppositePointSum;
			
			// 记录失败者
			const loser = playerWins ? target : player;
			
			// 标记这是由 pidou 技能导致的失去体力
			event.pidou_loser = loser;
			
			if (playerWins) {
				player.popup("胜利");
				game.log(player, "在皮豆博弈中获胜");
				// 失败者失去一点体力
				await loser.loseHp();
				// 失败者选择一名角色发动肃纪
				const loserChooseTarget = await loser.chooseTarget("皮豆：请选择一名角色发动肃纪", true).forResult();
				if (loserChooseTarget.bool && loserChooseTarget.targets && loserChooseTarget.targets.length > 0) {
					await loser.useSkill('suji', loserChooseTarget.targets);
				}
			} else {
				player.popup("失败");
				game.log(target, "在皮豆博弈中获胜");
				// 玩家失去一点体力
				await loser.loseHp();
				// 玩家选择一名角色发动肃纪
				const loserChooseTarget = await loser.chooseTarget("皮豆：请选择一名角色发动肃纪", true).forResult();
				if (loserChooseTarget.bool && loserChooseTarget.targets && loserChooseTarget.targets.length > 0) {
					await loser.useSkill('suji', loserChooseTarget.targets);
				}
			}
			
			delete event.pidou_loser;
		},
		group: ["pidou_recover"],
		ai: {
			order: 7,
			result: {
				target(player, target) {
					// 综合评估目标
					const att = get.attitude(player, target);
					
					// 计算红黑牌分布
					const cards = target.getCards('he');
					let redSum = 0, blackSum = 0;
					cards.forEach(card => {
						const num = get.number(card) || 0;
						if (get.color(card) === 'red') redSum += num;
						else blackSum += num;
					});
					
					// 判断哪边点数更大
					const maxSum = Math.max(redSum, blackSum);
					const minSum = Math.min(redSum, blackSum);
					const diff = maxSum - minSum;
					
					// 成功率评估
					const successRate = diff > 0 ? 0.7 : 0.5;
					
					if (att < 0) {
						// 对敌人：希望对方失败
						// 如果点数差距大，成功率高，收益高
						return successRate * 2.5;
					} else if (att > 0) {
						// 对队友：谨慎使用
						// 如果成功率低，可能害了队友
						return successRate < 0.6 ? -2 : 0.5;
					}
					
					// 中立角色：看收益
					return successRate * 1.5;
				}
			},
			// 颜色选择AI
			chooseControl: {
				check(control, player) {
					const event = get.event();
					const target = event.target;
					const cards = target.getCards('he');
					
					let redSum = 0, blackSum = 0;
					cards.forEach(card => {
						const num = get.number(card) || 0;
						if (get.color(card) === 'red') redSum += num;
						else blackSum += num;
					});
					
					const att = get.attitude(player, target);
					
					if (control === 'red') {
						// 选择红色
						if (att < 0) {
							// 对敌人：选择点数小的颜色，让对方容易输
							return redSum < blackSum ? 2 : 0.5;
						} else {
							// 对队友：选择点数大的颜色，让自己容易赢
							return redSum > blackSum ? 2 : 0.5;
						}
					} else {
						// 选择黑色
						if (att < 0) {
							return blackSum < redSum ? 2 : 0.5;
						} else {
							return blackSum > redSum ? 2 : 0.5;
						}
					}
				}
			}
		}
	},
	pidou_recover: {
		trigger: {
			global: "dying"
		},
		forced: true,
		filter(event, player) {
			// 检查是否是当前 pidou 技能导致的濒死
			const parentEvent = event.getParent("pidou");
			return parentEvent && parentEvent.pidou_loser === event.player;
		},
		async content(event, trigger, player) {
			game.log(trigger.player, "因皮豆陷入濒死，回复一点体力");
			await trigger.player.recover(1);
		}
	},
	// 从众 - 回合外每回合限一次，当有牌于本次回合外不是第一次被使用后，你可以弃置一张手牌，视为使用者再次使用一张相同的牌
	congzhong: {
		audio: 2,
		// 使用 useCardAfter，确保牌结算完成之后再触发
		trigger: { global: "useCardAfter" },
		filter(event, player) {
			// 1. 必须在回合外
			if (_status.currentPhase === player) {
				return false;
			}
			
			// 1.5. 必须是实体卡牌（有 cardid），虚拟牌不触发
			if (!event.card || !event.card.cardid) {
				return false;
			}
			
			// 2. 必须有手牌可以弃置
			if (!player.countCards("h")) {
				return false;
			}
			
			// 3. 每回合限一次：检查本回合是否已经发动过
			if (player.storage.congzhong_triggered) {
				return false;
			}
			
			// 4. 排除由从众自身生成的虚拟卡牌（防止递归）
			// 此标记在content中设置，本技能生成的useCard事件不会再次触发
			if (player.storage._congzhong_generating) {
				return false;
			}
			
			// 5. 检查该卡牌在本次回合外是否不是第一次被使用
			const cardName = get.name(event.card);
			const triggerPlayer = event.player;
			const roundKey = `congzhong_round_${game.roundNumber}`;
			
			if (!player.storage.congzhong_used) {
				player.storage.congzhong_used = {};
			}
			if (!player.storage.congzhong_used[roundKey]) {
				player.storage.congzhong_used[roundKey] = {};
			}
			// 全局计数：不区分触发玩家，只按牌名统计
			const usedCount = player.storage.congzhong_used[roundKey][cardName] || 0;
			
			// 只有当该牌在本次回合外不是第一次使用时才能发动
			// usedCount>1时本次就是第2次使用
			return usedCount > 1;
		},
		check(event, player) {
			// AI判断：对敌人使用多一次伤害牌有利，对队友使用增益牌有利
			const triggerPlayer = event.player;
			const att = get.attitude(player, triggerPlayer);
			const card = event.card;
			if (!card) return false;
			
			// 对敌人：如果是伤害牌，多让敌人用一次不一定有利（可能是杀自己队友）
			// 简单策略：对队友用增益牌发动，对敌人用伤害牌不发动
			if (get.tag(card, "damage") || get.tag(card, "loseHp")) {
				return att > 0; // 队友用伤害牌，帮队友多输出
			}
			if (get.tag(card, "recover") || get.tag(card, "draw")) {
				return att >= 0; // 增益牌就发动
			}
			return false;
		},
		async content(event, trigger, player) {
			const cardName = get.name(trigger.card);
			const triggerPlayer = trigger.player;
			
			// 选择弃置一张手牌
			const result = await player.chooseToDiscard("he", "从众：是否弃置一张手牌，令" + get.translation(triggerPlayer) + "视为再次使用" + get.translation(trigger.card) + "？").set("ai", card => {
				return 7 - get.value(card);
			}).forResult();
			
			if (result.bool) {
				// 标记本回合已发动过从众（每回合限一次）
				player.storage.congzhong_triggered = true;
				// 标记用于群起技能：上个回合外发动过从众
				player.storage._qunqi_flag = true;
				player.logSkill("congzhong", triggerPlayer);
				
				// 创建相同的虚拟卡牌并让原使用者使用，添加 isCard 标记让系统识别为可用的卡牌
				const newCard = game.createCard({
					name: cardName,
					suit: trigger.card.suit,
					number: trigger.card.number
				});
				
				// 设置临时标记防止递归
				player.storage._congzhong_generating = true;
				
				// 让原使用者重新选择目标并使用该卡牌（不消耗次数）
				// 先查找所有合法目标
				const validTargets = game.filterPlayer(target => triggerPlayer.canUse(newCard, target));
				
				if (validTargets.length === 0) {
					// 无合法目标，直接使用（如桃、无中生有等）
					await triggerPlayer.useCard(newCard, null, false);
				} else if (validTargets.length === 1 && get.tag(newCard, "multitarget")) {
					// 群体目标牌（如南蛮、万箭），直接对所有合法目标使用
					await triggerPlayer.useCard(newCard, validTargets, false);
				} else {
					// 单体目标牌，让使用者选择目标
					const targetResult = await triggerPlayer.chooseTarget(
						"从众：请为" + get.translation(cardName) + "选择目标",
						function(card, player, target) {
							return player.canUse(newCard, target);
						}
					).set("ai", target => {
						return get.effect(target, newCard, triggerPlayer, triggerPlayer);
					}).forResult();
					
					if (targetResult.bool && targetResult.targets && targetResult.targets.length > 0) {
						await triggerPlayer.useCard(newCard, targetResult.targets, false);
					}
				}
				
				// 清除临时标记
				delete player.storage._congzhong_generating;
			}
		},
		group: ["congzhong_record", "congzhong_reset"],
		subSkill: {
			record: {
				// 在 useCard 时机就记录，确保比主技能（useCardAfter）先执行
				trigger: { global: "useCard" },
				silent: true,
				forced: true,
				priority: 10,
				filter(event, player) {
					// 只记录实体卡牌（虚拟牌不计）
					if (!event.card || !event.card.cardid) {
						return false;
					}
					// 只在回合外记录
					if (_status.currentPhase === player) {
						return false;
					}
					// 不记录由从众本身生成的虚拟卡牌（防止计数上的递归）
					if (player.storage._congzhong_generating) {
						return false;
					}
					return true;
				},
				content(event, trigger, player) {
					const cardName = get.name(trigger.card);
					const triggerPlayer = trigger.player;
					const roundKey = `congzhong_round_${game.roundNumber}`;
					
					if (!player.storage.congzhong_used) {
						player.storage.congzhong_used = {};
					}
					if (!player.storage.congzhong_used[roundKey]) {
						player.storage.congzhong_used[roundKey] = {};
					}
					// 全局计数：按牌名统计，不区分触发玩家
									player.storage.congzhong_used[roundKey][cardName] = 
										(player.storage.congzhong_used[roundKey][cardName] || 0) + 1;
				}
			},
			reset: {
				trigger: { global: "roundStart" },
				silent: true,
				forced: true,
				priority: 10,
				content(event, trigger, player) {
					// 重置每回合触发限制
					delete player.storage.congzhong_triggered;
					
					// 清理旧轮次的记录（保留最近一轮）
					if (!player.storage.congzhong_used) {
						player.storage.congzhong_used = {};
					}
					const keys = Object.keys(player.storage.congzhong_used);
					keys.forEach(key => {
						if (key !== `congzhong_round_${game.roundNumber}`) {
							delete player.storage.congzhong_used[key];
						}
					});
					
					// 注意：_qunqi_flag 的转移已移至 qunqi_reset 的 phaseZhunbeiBegin 中处理
					// 确保在自己回合开始时才做，避免其他角色 roundStart 干扰
				}
			}
		},
		ai: {
			order: 6,
			threaten: 1.5,
			result: {
				target(player, target) {
					const att = get.attitude(player, target);
					if (att < 0) {
						return -2;
					}
					return 1;
				}
			},
			effect: {
				target(card, player, target) {
					if (get.tag(card, "damage") || get.tag(card, "decreaseHp")) {
						return get.attitude(player, target) > 0 ? 0.5 : -0.5;
					}
					return 0;
				}
			}
		}
	},
	// 群起 - 你的回合内，若你于上个回合外发动过技能从众，你可使其他角色自愿弃置共计两张牌，视为你使用一张你于本回合上次使用过的牌。
	// 回合内使用牌后触发，只有实体卡牌才能触发，群起第二次发动的牌是虚拟牌使用完毕后不能再次触发群起
	qunqi: {
		audio: 2,
		trigger: { player: "useCardAfter" },
		frequent: true,
		filter(event, player) {
			if (!event.card || !event.card.cardid) {
				return false;
			}
			
			if (!player.storage._previous_qunqi_flag) {
				return false;
			}
			
			if (!player.storage._qunqi_lastCardName) {
				return false;
			}
			
			return true;
		},
		check(event, player) {
			const lastCardName = player.storage._qunqi_lastCardName;
			if (!lastCardName) return false;
			const cardInfo = get.cardInfo(lastCardName);
			if (cardInfo && cardInfo.ai && cardInfo.ai.basic) {
				return cardInfo.ai.basic > 0;
			}
			return true;
		},
		async content(event, trigger, player) {
			const lastCardName = player.storage._qunqi_lastCardName;
			
			player.logSkill("qunqi");
			
			let totalDiscarded = 0;
			const otherPlayers = game.players.filter(p => p.isIn() && p !== player).sortBySeat();
			
			for (const other of otherPlayers) {
				if (totalDiscarded >= 2) break;
				if (other.countCards("he") === 0) continue;
				
				const maxCanDiscard = Math.min(2 - totalDiscarded, other.countCards("he"));
				const prompt = "群起（" + get.translation(lastCardName) + "）：是否自愿弃置" + (maxCanDiscard > 1 ? "1~" + maxCanDiscard : "1") + "张牌？（共已弃" + totalDiscarded + "张，还需" + (2 - totalDiscarded) + "张）";
				
				const boolResult = await other.chooseBool(prompt).forResult();
				if (!boolResult.bool) continue;
				
				let discardCount = 1;
				if (maxCanDiscard > 1) {
					const controlResult = await other.chooseControl()
						.set("choiceList", ["弃置1张", "弃置2张"])
						.set("prompt", prompt)
						.forResult();
					discardCount = controlResult.index === 0 ? 1 : 2;
				}
				
				const discardPrompt = discardCount > 1 ? "群起：请选择" + discardCount + "张要弃置的牌" : "群起：请选择要弃置的牌";
				const discardResult = await other.chooseToDiscard("he", discardCount)
					.set("prompt", discardPrompt)
					.set("ai", card => 6 - get.value(card))
					.forResult();
				
				if (discardResult.bool && discardResult.cards && discardResult.cards.length) {
					await other.discard(discardResult.cards);
					totalDiscarded += discardResult.cards.length;
					game.log(other, "自愿弃置了" + discardResult.cards.length + "张牌");
				}
			}
			
			if (totalDiscarded >= 2) {
				const virtualCard = {
					name: lastCardName,
					suit: player.storage._qunqi_lastSuit || "none",
					number: player.storage._qunqi_lastNumber || 0,
					isCard: true
				};
				
				const validTargets = game.filterPlayer(target => player.canUse(virtualCard, target));
				
				if (validTargets.length === 0) {
					await player.useCard(virtualCard, null, false);
				} else if (get.tag(virtualCard, "multitarget")) {
					await player.useCard(virtualCard, validTargets, false);
				} else {
					const targetResult = await player.chooseTarget(
						"群起：请为" + get.translation(lastCardName) + "选择目标",
						function(card, player, target) {
							return player.canUse(virtualCard, target);
						}
					).set("ai", target => {
						return get.effect(target, virtualCard, player, player);
					}).forResult();
					
					if (targetResult.bool && targetResult.targets && targetResult.targets.length > 0) {
						await player.useCard(virtualCard, targetResult.targets, false);
					}
				}
			} else {
				game.log("群起失败：未收集到2张弃牌");
			}
		},
		group: ["qunqi_record", "qunqi_reset"],
		subSkill: {
			record: {
				trigger: { player: "useCard" },
				silent: true,
				forced: true,
				priority: 10,
				filter(event, player) {
					if (!event.card || !event.card.cardid) {
						return false;
					}
					if (_status.currentPhase !== player) {
						return false;
					}
					return true;
				},
				content(event, trigger, player) {
					player.storage._qunqi_lastCardName = get.name(trigger.card);
					player.storage._qunqi_lastSuit = trigger.card.suit;
					player.storage._qunqi_lastNumber = trigger.card.number;
				}
			},
			reset: {
				trigger: { player: "phaseZhunbeiBegin" },
				silent: true,
				forced: true,
				priority: 10,
				content(event, trigger, player) {
					// 检查上个回合外是否发动过从众（_qunqi_flag 由从众的 content 设置）
					if (player.storage._qunqi_flag) {
						player.storage._previous_qunqi_flag = true;
					} else {
						delete player.storage._previous_qunqi_flag;
					}
					// 清空回合外标记
					delete player.storage._qunqi_flag;
					
					delete player.storage._qunqi_lastCardName;
					delete player.storage._qunqi_lastSuit;
					delete player.storage._qunqi_lastNumber;
				}
			}
		},
		ai: {
			order: 6,
			result: {
				player(player) {
					const cardName = player.storage._qunqi_lastCardName;
					if (!cardName) return 0;
					const cardInfo = get.cardInfo(cardName);
					if (cardInfo && cardInfo.ai && cardInfo.ai.basic) {
						return cardInfo.ai.basic * 1.5;
					}
					return 1;
				}
			}
		}
	},
	// 空灵 - 锁定技，你的锦囊牌均视为闪，装备牌均视为杀。弃牌阶段弃牌后，你弃置场上一张牌。
	kongling: {
		audio: 2,
		forced: true,
		locked: true,
		group: ["kongling_mod", "kongling_discard", "kongling_record"],
		subSkill: {
			mod: {
				forced: true,
				locked: true,
				mod: {
					cardname(card, player) {
						const type = lib.card[card.name]?.type;
						if (type === "trick" || type === "delay") {
							return "shan";
						}
						if (type === "equip") {
							return "sha";
						}
					},
				},
				ai: {
					respondShan: true,
					respondSha: true,
					skillTagFilter(player, tag) {
						if (tag === "respondShan") {
							return player.countCards("hs", card => {
								const type = lib.card[card.name]?.type;
								return type === "trick" || type === "delay";
							}) > 0;
						}
						if (tag === "respondSha") {
							return player.countCards("hs", card => lib.card[card.name]?.type === "equip") > 0;
						}
					},
				},
			},
			record: {
				trigger: { player: "phaseDiscardBegin" },
				silent: true,
				content(event, trigger, player) {
					player.storage._kongling_needsDiscard = player.needsToDiscard() > 0;
				},
			},
			discard: {
				forced: true,
				locked: true,
				trigger: {
					player: "phaseDiscardAfter",
				},
				filter(event, player) {
					if (!player.storage._kongling_needsDiscard) return false;
					delete player.storage._kongling_needsDiscard;
					return game.hasPlayer(target => target !== player && target.countCards("hej") > 0);
				},
				async content(event, trigger, player) {
					const targets = game.filterPlayer(target => target !== player && target.countCards("hej") > 0);
					if (targets.length === 0) return;
					
					const result = await player.chooseTarget(
						"空灵：请选择一名角色，弃置其场上一张牌",
						true,
						(card, player, target) => targets.includes(target)
					).set("ai", target => {
						const att = get.attitude(player, target);
						return -att;
					}).forResult();
					
					if (result.bool && result.targets?.length) {
						player.logSkill("kongling", result.targets[0]);
						await player.discardPlayerCard(result.targets[0], "hej", true);
					}
				},
			},
		},
	},
	// 九阴 - 锁定技，你与其他角色相互之间距离始终为1。
	jiuyin: {
		audio: 2,
		forced: true,
		locked: true,
		mod: {
			globalFrom(from, to, distance) {
				return 1;
			},
			globalTo(from, to, distance) {
				return 1;
			},
		},
	},
	// 双搏 - 你使用或打出实体杀/闪后，可视为额外使用一张杀。
	shuangbo: {
		audio: 2,
		frequent: true,
		trigger: {
			player: ["useCardAfter", "respondAfter"],
		},
		filter(event, player) {
			const card = event.card;
			if (!card) return false;
			if (!["sha", "shan"].includes(card.name)) return false;
			if (!card.cards || !card.cards.length) return false;
			if (get.is.convertedCard(card)) return false;
			return true;
		},
		async content(event, trigger, player) {
			const sha = { name: "sha", isCard: true };
			const result = await player.chooseTarget(
				"双搏：请选择一名角色（视为使用一张杀），或点取消",
				(card, player, target) => player.canUse(sha, target, false)
			).set("ai", target => {
				return get.effect(target, sha, player, player);
			}).forResult();
			if (result.bool && result.targets?.length) {
				player.logSkill("shuangbo", result.targets[0]);
				await player.useCard(sha, result.targets[0], false);
			}
		},
		ai: {
			order: 3,
			result: {
				player: 1,
			},
		},
	},
	// 纵横 - 出牌阶段限一次，你可以弃置一张手牌并指定一名角色：若你与其的距离大于1，你摸三张牌，其摸一张牌；否则，弃置其一张牌。
	zongheng: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filterCard: true,
		selectCard: 1,
		position: "h",
		filterTarget(card, player, target) {
			return target !== player;
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			await player.discard(event.cards);
			player.logSkill("zongheng", target);

			const dist = get.distance(player, target);
			if (dist > 1) {
				await player.draw(3);
				await target.draw(1);
			} else {
				if (target.countCards("hej") > 0) {
					await player.discardPlayerCard(target, "hej", true);
				}
			}
		},
		ai: {
			order: 6,
			result: {
				target(player, target) {
					const att = get.attitude(player, target);
					const dist = get.distance(player, target);
					if (dist > 1) {
						return 2;
					}
					if (att < 0 && target.countCards("hej") > 0) {
						return 1.5;
					}
					return -1;
				},
			},
		},
	},
	// 下线 - 当你成为杀的目标时，可以弃置一张手牌，并令杀的使用者摸一张牌，然后此杀无效。
	xiaxian: {
		audio: 2,
		frequent: true,
		trigger: {
			target: "useCardToTargeted",
		},
		filter(event, player) {
			return event.card && event.card.name === "sha" && event.player !== player && player.countCards("h") > 0;
		},
		async content(event, trigger, player) {
			const source = trigger.player;
			const result = await player.chooseToDiscard("h", "下线：是否弃置一张手牌，令" + get.translation(source) + "摸一张牌并使此杀无效？").set("ai", card => {
				return 7 - get.value(card);
			}).forResult();
			if (result.bool) {
				player.logSkill("xiaxian", source);
				await source.draw(1);
				trigger.getParent().targets.remove(player);
				game.log(trigger.card, "对", player, "无效");
			}
		},
		ai: {
			threaten: 0.8,
		},
	},
	// 自闭 - 锁定技，当你血量少于3时，与其他角色相互计算距离额外+1。
	zibi: {
		audio: 2,
		forced: true,
		locked: true,
		mod: {
			globalFrom(from, to, distance) {
				if (from.hp < 3) {
					return distance + 1;
				}
			},
			globalTo(from, to, distance) {
				if (to.hp < 3) {
					return distance + 1;
				}
			},
		},
	},
	// 葵花 - 锁定技，当你使用杀指定目标后，翻开牌堆顶一张牌作为逆置于武将牌上。若此逆颜色唯一，则你发动阳流，否则发动池阴。当你集齐七种点数的逆后，你失去葵花并获得散功。
	kuihua: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: { player: "useCardToTargeted" },
		filter(event, player) {
			return event.card && event.card.name === "sha" && event.targets && event.targets.length > 0;
		},
		marktext: "逆",
		intro: {
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("kuihua");
				if (cards.length) {
					dialog.addSmall(cards);
				} else {
					return "暂无逆";
				}
			},
			content(storage, player) {
				const cards = player.getExpansions("kuihua");
				const points = new Set(cards.map(c => get.number(c)).filter(n => typeof n === "number"));
				return "已集" + points.size + "/7种点数";
			},
		},
		onremove(player) {
			const cards = player.getExpansions("kuihua");
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		group: [],
		async content(event, trigger, player) {
			const target = trigger.targets[0];
			const cards = get.cards(1);
			if (!cards || !cards.length) return;
			const card = cards[0];

			const next = player.addToExpansion(card, player, "give");
			next.gaintag.add("kuihua");
			await next;

			const niCards = player.getExpansions("kuihua");
			const cardColor = get.color(card);
			const sameColorCount = niCards.filter(c => get.color(c) === cardColor).length;

			player.storage._kuihua_target = target;
			player.storage._kuihua_trigger = trigger;
			if (sameColorCount <= 1) {
				await player.useSkill("yangliu", target);
			} else {
				await player.useSkill("chiyin", target);
			}
			delete player.storage._kuihua_target;
			delete player.storage._kuihua_trigger;

			const updatedNiCards = player.getExpansions("kuihua");
			const uniquePoints = new Set(updatedNiCards.map(c => get.number(c)).filter(n => typeof n === "number"));
			if (uniquePoints.size >= 7) {
				player.removeSkill("kuihua");
				player.addSkills("sangong");
			}
		},
	},
	yangliu: {
		audio: 2,
		filterTarget: true,
		async content(event, trigger, player) {
			const target = player.storage._kuihua_target;
			if (!target) return;
			player.logSkill("yangliu", target);
			const useTrigger = player.storage._kuihua_trigger;

			const selfNum = Math.min(2, player.countCards("he"));
			const targetNum = Math.min(2, target.countCards("he"));
			if (selfNum > 0) {
				await player.chooseToDiscard("he", selfNum, true);
			}
			if (targetNum > 0) {
				await player.discardPlayerCard(target, "he", targetNum, true);
			}
			if (useTrigger) {
				player.storage._yangliu_card = useTrigger.card;
				player.addTempSkill("yangliu_effect");
			}
		},
		ai: {
			damageBonus: true,
			result: {
				target(player, target) {
					return get.damageEffect(target, player, player) > 0 ? 2 : -1;
				},
			},
		},
	},
	chiyin: {
		audio: 2,
		filterTarget: true,
		async content(event, trigger, player) {
			const target = player.storage._kuihua_target;
			if (!target) return;
			player.logSkill("chiyin", target);
			const useTrigger = player.storage._kuihua_trigger;

			if (useTrigger) {
				useTrigger.directHit.add(target);
			}
			if (target.countCards("he") > 0) {
				await player.gainPlayerCard(target, "he", true);
			}
		},
		ai: {
			result: {
				target(player, target) {
					return get.attitude(player, target) < 0 ? 2 : -1;
				},
			},
		},
	},
	yangliu_effect: {
		charlotte: true,
		trigger: { source: "damageBegin" },
		filter(event, player) {
			return event.card === player.storage._yangliu_card;
		},
		forced: true,
		async content(event, trigger, player) {
			trigger.num++;
		},
		ai: {
			damageBonus: true,
		},
	},
	sangong: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: { player: "phaseDrawBegin2" },
		filter(event, player) {
			return !event.numFixed;
		},
		async content(event, trigger, player) {
			trigger.num--;
		},
	},
	mofo: {
		audio: 2,
		frequent: true,
		trigger: { global: ["useCardToTargeted", "damageBegin1"] },
		filter(event, player) {
			if (player.storage.mofo_triggered) return false;
			if (event.name === "useCardToTargeted") {
				if (!event.card || event.card.name !== "sha") return false;
				if (!event.targets || !event.targets.length) return false;
				return player.countCards("h", card => get.color(card) === "red") > 0;
			}
			return player.countCards("h", card => get.color(card) === "black") > 0;
		},
		async content(event, trigger, player) {
			let targetChar, neededColor;
			if (trigger.name === "useCardToTargeted") {
				targetChar = trigger.targets[0];
				neededColor = "red";
			} else {
				targetChar = trigger.player;
				neededColor = "black";
			}

			const colorName = neededColor === "red" ? "红色" : "黑色";
			const discardResult = await player.chooseToDiscard("h", "魔佛：是否弃置一张" + colorName + "手牌？")
				.set("filterCard", card => get.color(card) === neededColor)
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!discardResult.bool) return;

			player.storage.mofo_triggered = true;
			player.logSkill("mofo", targetChar);

			const alivePlayers = game.filterPlayer(p => true);
			const maxCards = Math.max(...alivePlayers.map(p => p.countCards("h")));
			const maxPlayers = alivePlayers.filter(p => p.countCards("h") === maxCards && p !== targetChar && p.countCards("h") > 0);
			if (maxPlayers.length > 0) {
				let stealTarget;
				if (maxPlayers.length === 1) {
					stealTarget = maxPlayers[0];
				} else {
					const choice = await targetChar.chooseTarget("魔佛：请选择获得一名手牌最多玩家的手牌")
						.set("filterTarget", (card, player, target) => maxPlayers.includes(target))
						.set("ai", target => get.attitude(targetChar, target))
						.forResult();
					if (!choice.bool || !choice.targets?.length) return;
					stealTarget = choice.targets[0];
				}
				if (stealTarget && stealTarget.countCards("h") > 0) {
					await targetChar.gainPlayerCard(stealTarget, "h", true);
				}
			}

			if (trigger.name === "useCardToTargeted") {
				targetChar.storage._mofo_shaTrigger = trigger;
				await targetChar.useSkill("luanxia");
				delete targetChar.storage._mofo_shaTrigger;
			} else {
				await targetChar.useSkill("wuyi");
			}
		},
		group: ["mofo_reset"],
		subSkill: {
			reset: {
				trigger: { global: "phaseZhunbeiBegin" },
				silent: true,
				forced: true,
				content() {
					delete player.storage.mofo_triggered;
				},
			},
		},
		ai: {
			order: 7,
			result: {
				player: 1,
			},
		},
	},
	luanxia: {
		audio: 2,
		async content(event, trigger, player) {
			const shaTrigger = player.storage._mofo_shaTrigger;
			if (!shaTrigger) return;

			const cards = get.cards(1);
			if (!cards || !cards.length) return;
			const card = cards[0];
			const X = get.number(card);
			player.logSkill("luanxia");
			player.popup(get.translation(card));
			game.log(player, "翻开了牌堆底牌", card);
			await game.cardsDiscard(card);

			if (typeof X !== "number" || X <= 0) return;

			const slashUser = shaTrigger.player;
			const allPlayers = game.filterPlayer(p => true).sortBySeat();
			const userIndex = allPlayers.indexOf(slashUser);
			if (userIndex < 0) return;
			const newTargetIndex = (userIndex + X) % allPlayers.length;
			const newTarget = allPlayers[newTargetIndex];

			const useEvent = shaTrigger.getParent();
			if (!useEvent || !useEvent.targets) return;
			const oldTargets = [...useEvent.targets];
			const isUnchanged = oldTargets.includes(newTarget);

			useEvent.targets.length = 0;
			useEvent.targets.push(newTarget);
			game.log("杀的目标转移至", newTarget);

			const isXiayi = get.rawName2(newTarget) === "侠医" || (newTarget.name && newTarget.name.includes("xiayi"));

			if (isUnchanged || isXiayi) {
				game.log("乱侠：目标不变或为侠医，此杀伤害+1");
				if (useEvent.card) {
					useEvent.card.storage._luanxia_card = useEvent.card;
				}
				player.storage._luanxia_card = useEvent.card;
				player.addTempSkill("luanxia_effect");
			}
		},
		ai: {
			result: {
				player: 0.5,
			},
		},
	},
	luanxia_effect: {
		charlotte: true,
		trigger: { global: "damageBegin1" },
		filter(event, player) {
			return event.card === player.storage._luanxia_card;
		},
		forced: true,
		async content(event, trigger, player) {
			trigger.num++;
		},
		ai: {
			damageBonus: true,
		},
	},
	wuyi: {
		audio: 2,
		marktext: "毒",
		intro: {
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("wuyi");
				if (cards.length) {
					dialog.addSmall(cards);
				} else {
					return "暂无毒";
				}
			},
			content(storage, player) {
				const cards = player.getExpansions("wuyi");
				return "共有" + get.cnNumber(cards.length) + "张毒";
			},
		},
		onremove(player) {
			const cards = player.getExpansions("wuyi");
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		async content(event, trigger, player) {
			const cards = get.cards(1);
			if (!cards || !cards.length) return;
			const card = cards[0];

			const next = player.addToExpansion(card, player, "give");
			next.gaintag.add("wuyi");
			await next;

			player.logSkill("wuyi");
			game.log(player, "将", card, "作为毒置于武将牌上");

			if (!player.hasSkill("miaodu")) {
				player.addSkills("miaodu");
			}

			const suit = get.suit(card);
			if (suit !== "heart") {
				await player.recover(1);
			}

			const existingPoisonCards = player.getExpansions("wuyi");
			const cardNumber = get.number(card);
			const samePointCards = existingPoisonCards.filter(c => c !== card && get.number(c) === cardNumber);
			if (samePointCards.length > 0) {
				await player.loseHp(2);
			}
		},
		ai: {
			result: {
				player: 0.3,
			},
		},
	},
	miaodu: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return game.dead.some(p => {
				const name = get.rawName2(p) || "";
				return name === "任我哈" || (p.name && p.name.includes("renwoha"));
			});
		},
		async content(event, trigger, player) {
			player.logSkill("miaodu");
			await player.useSkill("wuyi");
		},
		ai: {
			order: 5,
			result: {
				player: 1,
			},
		},
	},
	chouxiang: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: {
			player: "loseAfter",
		},
		filter(event, player) {
			if (player == _status.currentPhase && !player.storage._gongyou_exchanging) return false;
			if (event.hs && event.hs.length > 0) return true;
			if (!event.getl) return false;
			const evt = event.getl(player);
			return evt && evt.hs && evt.hs.length > 0;
		},
		async content(event, trigger, player) {
			let num = trigger.hs ? trigger.hs.length : 0;
			if (!num && trigger.getl) {
				const evt = trigger.getl(player);
				num = evt && evt.hs ? evt.hs.length : 0;
			}
			if (num > 0) {
				player.addMark("chouxiang", num);
			}
		},
		marktext: "象",
		intro: {
			name: "象",
			content: "mark",
		},
		ai: {
			maixie: true,
			maixie_hp: true,
		},
	},
	gongyou: {
		audio: 2,
		forced: true,
		locked: true,
		trigger: {
			player: ["phaseBegin", "phaseAfter"],
		},
		filter(event, player, name) {
			return name === "phaseBegin" || name === "phaseAfter";
		},
		async content(event, trigger, player) {
			const isBlack = event.triggername === "phaseBegin";
			const color = isBlack ? "black" : "red";
			const colorName = isBlack ? "黑色" : "红色";
			const phaseLabel = isBlack ? "回合开始" : "回合结束";

			const targets = game.filterPlayer(current => current != player);
			if (!targets.length) return;

			const result = await player.chooseTarget(
				`公有·${phaseLabel}：请选择一名角色交换${colorName}手牌`,
				true,
				(card, player, target) => targets.includes(target)
			).set("ai", target => {
				const att = get.attitude(player, target);
				const myCards = player.countCards("h", card => get.color(card) === color);
				const theirCards = target.countCards("h", card => get.color(card) === color);
				if (att < 0 && theirCards > myCards) return -1;
				if (att > 0 && myCards > theirCards) return 1;
				return att > 0 ? 0.5 : -0.5;
			}).forResult();

			if (result.bool && result.targets?.length) {
				const target = result.targets[0];
				player.logSkill("gongyou", target);
				const myCards = player.getCards("h", card => get.color(card) === color);
				const theirCards = target.getCards("h", card => get.color(card) === color);
				if (myCards.length || theirCards.length) {
					if (!isBlack) player.storage._gongyou_exchanging = true;
					await player.swapHandcards(target, myCards, theirCards);
					if (!isBlack) delete player.storage._gongyou_exchanging;
				}
			}
		},
		ai: {
			threaten: 0.5,
		},
	},
	zhengpai: {
		audio: 2,
		group: ["zhengpai_discard", "zhengpai_draw", "zhengpai_gain", "zhengpai_hujia", "zhengpai_recover", "zhengpai_damage", "zhengpai_loseHp"],
		subSkill: {
			discard: {
				audio: "zhengpai",
				trigger: {
					player: ["chooseToDiscardBegin", "discardPlayerCardBegin"],
					target: "discardPlayerCardBegin",
				},
				filter(event, player) {
					return player.countMark("chouxiang") >= 1;
				},
				async cost(event, trigger, player) {
					const choices = ["弃置1枚象，使弃牌数-1", "弃置1枚象，使弃牌数+1", "取消"];
					const result = await player.chooseControl(choices).set("prompt", "正派·弃牌：请选择（消耗1象）").set("ai", () => {
						const triggerevt = _status.event.getTrigger();
						if (triggerevt.name === "chooseToDiscard") {
							if (triggerevt.player === player) return 0;
						}
						return triggerevt.player !== player ? 0 : 1;
					}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 1);
					player.logSkill("zhengpai");
					const isPlus = event.cost_data.control.includes("+1");
					if (trigger.name === "chooseToDiscard") {
						const range = trigger.selectCard;
						if (isPlus) {
							range[0] = Math.min(range[0] + 1, range[1] + 1);
							range[1] += 1;
						} else {
							range[0] = Math.max(range[0] - 1, 0);
							range[1] = Math.max(range[1] - 1, 0);
							if (range[1] === 0) trigger.changeToZero();
						}
					} else if (trigger.name === "discardPlayerCard") {
						const range = get.select(trigger.selectButton);
						if (isPlus) {
							trigger.selectButton = [range[0], range[1] + 1];
						} else {
							const newMax = Math.max(0, range[1] - 1);
							trigger.selectButton = [Math.max(0, range[0] - 1), newMax];
							if (newMax === 0) trigger.finish();
						}
					}
				},
			},
			draw: {
				audio: "zhengpai",
				trigger: {
					player: "drawBegin",
				},
				filter(event, player) {
					return !event.numFixed && player.countMark("chouxiang") >= 2;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseControl(["弃置2枚象，使摸牌数-1", "弃置2枚象，使摸牌数+1", "取消"])
						.set("prompt", "正派·摸牌：请选择（消耗2象）")
						.set("ai", () => {
							return player.needsToDiscard() > 2 ? 0 : 1;
						}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 2);
					player.logSkill("zhengpai");
					trigger.num += event.cost_data.control.includes("+1") ? 1 : -1;
					if (trigger.num <= 0) {
						trigger.num = 0;
						trigger.changeToZero();
					}
				},
			},
			gain: {
				audio: "zhengpai",
				trigger: {
					player: "gainPlayerCardBegin",
					target: "gainPlayerCardBegin",
				},
				filter(event, player) {
					if (player.countMark("chouxiang") < 3) return false;
					if (event.player === player) return event.target && event.target != player;
					return true;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseControl(["弃置3枚象，使获得牌数-1", "弃置3枚象，使获得牌数+1", "取消"])
						.set("prompt", "正派·获得牌：请选择（消耗3象）")
						.set("ai", () => {
							const other = trigger.player === player ? trigger.target : trigger.player;
							return other && get.attitude(player, other) > 0 ? 0 : 1;
						}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 3);
					player.logSkill("zhengpai");
					const isPlus = event.cost_data.control.includes("+1");
					const range = get.select(trigger.selectButton);
					if (isPlus) {
						trigger.selectButton = [range[0], range[1] + 1];
					} else {
						const newMax = Math.max(0, range[1] - 1);
						trigger.selectButton = [Math.max(0, range[0] - 1), newMax];
						if (newMax === 0) trigger.finish();
					}
				},
			},
			hujia: {
				audio: "zhengpai",
				trigger: {
					player: "changeHujiaBegin",
				},
				filter(event, player) {
					return event.num > 0 && player.countMark("chouxiang") >= 4;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseControl(["弃置4枚象，使获得护盾数-1", "弃置4枚象，使获得护盾数+1", "取消"])
						.set("prompt", "正派·获得护盾：请选择（消耗4象）")
						.set("ai", () => {
							return 1;
						}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 4);
					player.logSkill("zhengpai");
					trigger.num += event.cost_data.control.includes("+1") ? 1 : -1;
					if (trigger.num <= 0) {
						trigger.num = 0;
						trigger.changeToZero();
					}
				},
			},
			recover: {
				audio: "zhengpai",
				trigger: {
					player: "recoverBegin",
				},
				filter(event, player) {
					return player.countMark("chouxiang") >= 5;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseControl(["弃置5枚象，使回复数-1", "弃置5枚象，使回复数+1", "取消"])
						.set("prompt", "正派·回复体力：请选择（消耗5象）")
						.set("ai", () => {
							return 1;
						}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 5);
					player.logSkill("zhengpai");
					trigger.num += event.cost_data.control.includes("+1") ? 1 : -1;
					if (trigger.num <= 0) {
						trigger.num = 0;
						trigger.changeToZero();
					}
				},
			},
			damage: {
				audio: "zhengpai",
				trigger: {
					player: "damageBegin1",
					source: "damageBegin1",
				},
				filter(event, player) {
					return player.countMark("chouxiang") >= 6;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseControl(["弃置6枚象，使伤害数-1", "弃置6枚象，使伤害数+1", "取消"])
						.set("prompt", "正派·受到伤害：请选择（消耗6象）")
						.set("ai", () => {
							if (trigger.player === player) return 0;
							return trigger.player !== player ? 1 : 0;
						}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 6);
					player.logSkill("zhengpai");
					trigger.num += event.cost_data.control.includes("+1") ? 1 : -1;
					if (trigger.num <= 0) {
						trigger.num = 0;
						trigger.changeToZero();
					}
				},
			},
			loseHp: {
				audio: "zhengpai",
				trigger: {
					player: "loseHp",
				},
				filter(event, player) {
					return player.countMark("chouxiang") >= 7;
				},
				async cost(event, trigger, player) {
					const result = await player.chooseControl(["弃置7枚象，使失去体力数-1", "弃置7枚象，使失去体力数+1", "取消"])
						.set("prompt", "正派·失去体力：请选择（消耗7象）")
						.set("ai", () => {
							return 0;
						}).forResult();
					if (result && result.control && result.control !== "取消") {
						event.result = {
							bool: true,
							cost_data: { control: result.control },
						};
					}
				},
				async content(event, trigger, player) {
					player.removeMark("chouxiang", 7);
					player.logSkill("zhengpai");
					trigger.num += event.cost_data.control.includes("+1") ? 1 : -1;
					if (trigger.num <= 0) {
						trigger.num = 0;
						trigger.changeToZero();
					}
				},
			},
		},
		ai: {
			order: 8,
			result: {
				player: 0.5,
			},
		},
	},
};

export default skill;
