const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, 'character');
const factions = fs.readdirSync(DIR).filter(f => fs.statSync(path.join(DIR, f)).isDirectory());

// ====== FRAMEWORK REFERENCE DATA ======
// Extracted from noname/library/element/content.js
const VALID_EVENTS = new Set([
  // Phase events
  'phaseBegin', 'phaseBeginStart', 'phaseZhunbei', 'phaseJudge', 'phaseDraw', 'phaseUse', 'phaseDiscard', 'phaseJieshu',
  'phaseEnd', 'phaseAfter', 'phaseChange', 'phaseLoop',
  // Phase sub-events (level 1-4 filters)
  'phaseDrawBegin1', 'phaseDrawBegin2', 'phaseUseBegin', 'phaseJieshuBegin',
  // Card use
  'useCard', 'useCard1', 'useCard2', 'useCardAfter', 'useCardBefore',
  'useCardToTarget', 'useCardToTargeted', 'useCardToPlayered',
  'useCardToBegin', 'useCardToAfter',
  // Response
  'respond', 'respondAfter',
  // Damage
  'damageBefore', 'damageAfter', 'damageEnd', 'damageSource', 'damageBegin2', 'damageBegin3', 'damageBegin4',
  // Recover / LoseHp
  'recoverAfter', 'loseHp', 'loseHpAfter',
  // Dying / Death
  'dying', 'dyingAfter', 'dieBefore', 'dieAfter', 'die',
  // Gain / Lose
  'gainAfter', 'gainBegin', 'loseAfter', 'loseEnd',
  'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter',
  // Turn over
  'turnOverAfter', 'turnOverBefore',
  // Change
  'changeHp', 'changeHujia',
  // Round
  'roundStart', 'roundEnd', 'roundBegin',
  // Game
  'gameStart', 'gameDrawEnd',
  // Choose
  'chooseToUseBegin', 'chooseToRespondBegin', 'chooseToDiscardBegin',
  'chooseToCompareBegin', 'chooseCardBegin', 'chooseTargetBegin',
  'chooseButtonBegin', 'chooseControlBegin', 'chooseBoolBegin',
  // Misc
  'phaseZhunbeiCancelled', 'phaseUseSkipped', 'phaseDrawSkipped', 'phaseSkipped',
  'eventNeutralized', 'wuguRemained',
  // More events found in framework usage
  'judgeBefore', 'judge', 'judgeAfter', 'phaseJudge',
  'equip', 'loseEquip',
  'damageBegin1', // older versions, confirmed working
  'useSkillAfter',
]);

// Mod function signatures (from Skill.d.ts)
const MOD_SIGNATURES = {
  targetInRange: 3,   // (card, player, target)
  targetEnabled: 4,   // (card, player, target, now)
  cardEnabled: 2,     // (card, player)
  cardEnabled2: 2,    // (card, player)
  cardUsable: 3,      // (card, player, num)
  cardname: 3,        // (card, player, currentname)  [some versions: (card, player, name)]
  cardsuit: 3,        // (card, player, suit)
  cardnumber: 3,      // (card, player, num)
  cardnature: 3,      // (card, player, currentnature)
  suit: 2,            // (card, suit)
  cardUsableTarget: 4,// (card, player, target, result)
  globalTo: 3,        // (from, to, distance)
  globalFrom: 3,      // (from, to, distance)
  attackRange: 2,     // (player, num)
  playerEnabled: 3,   // (card, player, target)
  maxHandcard: 2,     // (player, num)
  selectTarget: 3,    // (card, player, range)
  aiValue: 3,         // (player, card, num)
  aiOrder: 3,         // (player, card, num)
  inRange: 3,         // (from, to, current)
  cardSavable: 4,     // (card, player, target, result)
  cardDiscardable: 4, // (card, player, eventName, result)
  canBeDiscarded: 5,
  canBeGained: 5,
  canBeReplaced: 4,
  cardGiftable: 4,
  cardRecastable: 4,
  cardRespondable: 3,
  wuxieRespondable: 5,
  wuxieEnabled: 5,
  wuxieJudgeEnabled: 4,
  wuxieJudgeRespondable: 4,
  judge: 2,
  ignoredHandcard: 2,
  targetInNext: 4,
};

// Valid addTempSkill expiry strings
const VALID_EXPIRY = new Set([
  'phaseBegin', 'phaseBeginStart', 'phaseAfter', 'phaseEnd',
  'phaseUseBegin', 'phaseUseAfter', 'phaseJieshuAfter',
  'phaseDrawAfter', 'phaseDiscardAfter',
  'roundStart',
]);

// Async player methods that need await
const PLAYER_ASYNC = new Set([
  'turnOver', 'recover', 'loseHp', 'loseMaxHp', 'gainMaxHp',
  'draw', 'damage', 'die', 'rest', 'restEnd',
  'gain', 'gainPlayerCard',
  'chooseToGive',
  'discard', 'discardPlayerCard',
  'useCard', 'respond',
]);

// ====== LOAD ALL DATA ======
const META = new Set([
  'trigger','filter','content','cost','mod','enable','usable','limited','forced','locked',
  'juexingji','zhuSkill','zhugong','ai','group','subSkill','onremove',
  'selectTarget','filterTarget','filterCard','viewAs','viewAsFilter',
  'selectCard','position','discard','lose','mark','intro','derivation',
  'audio','prompt','check','logTarget','direct','silent',
  'firstDo','lastDo','frequent','popup','init','inherit','sourceSkill','charlotte','marktext',
  'pasts','targetprompt','multitarget','multiline','onuse','onLose','ondisable','delay',
  'logv','noSelect','filterOk','allowChooseAll','complexSelect',
  'respondSha','respondShan','keepSkill','preHidden','hiddenSkill','priority',
  'skillAnimation','animationColor','forceDie','includeOut','forceOut',
  'nofrequent','maixie','maixie_hp','maixie_defend','neg','halfneg',
  'nohujia','noe','noh','fireAttack','damageBonus','threaten',
  'available','mode','forbid','duplicatePrefix','unique','forceunique',
  'markcount','audioname','audioname2','audioname','audioname2',
  'onuse','name','sex','group','hp','skills','isZhugong',
  'juexingji','limited','zhugong','zhuSkill',
]);

const allSkills = {};    // name -> { faction, line, body }
const allChars = {};     // name -> { faction, skills: [] }
const allTranslates = {}; // faction -> Set<key>

for (const faction of factions) {
  const skillPath = path.join(DIR, faction, 'skill.js');
  const charPath = path.join(DIR, faction, 'character.js');
  const transPath = path.join(DIR, faction, 'translate.js');

  if (fs.existsSync(skillPath)) {
    const text = fs.readFileSync(skillPath, 'utf8');
    const lines = text.split('\n');
    // Track brace depth to only extract depth==1 keys (top-level skills)
     let globalDepth = 0;
     const topKeys = [];
     for (let i = 0; i < lines.length; i++) {
       const line = lines[i];
       const opens = (line.match(/\{/g) || []).length;
       const closes = (line.match(/\}/g) || []).length;
       const m = line.match(/^\s+(\w+):\s*\{/);
       if (m && globalDepth === 1 && !META.has(m[1]) && !m[1].startsWith('_')) {
         topKeys.push({ name: m[1], line: i });
       }
       globalDepth += opens - closes;
     }
     for (let ki = 0; ki < topKeys.length; ki++) {
       const { name, line: start } = topKeys[ki];
       const end = ki + 1 < topKeys.length ? topKeys[ki + 1].line : lines.length;
       allSkills[name] = { faction, line: start + 1, body: lines.slice(start, end).join('\n') };
     }
  }

  if (fs.existsSync(charPath)) {
    const text = fs.readFileSync(charPath, 'utf8');
    const charRegex = /^\s+(\w+):\s*\{/gm;
    let m, prevName = null, prevIdx = 0;
    while ((m = charRegex.exec(text)) !== null) {
      if (prevName && !META.has(prevName)) {
        const block = text.slice(prevIdx, m.index);
        const skMatch = block.match(/skills:\s*\[([^\]]*)\]/);
        if (skMatch) {
          allChars[prevName] = {
            faction,
            skills: skMatch[1].replace(/['"]/g,'').split(',').map(s=>s.trim()).filter(Boolean),
          };
        }
      }
      prevName = m[1]; prevIdx = m.index;
    }
    if (prevName && !META.has(prevName)) {
      const block = text.slice(prevIdx);
      const skMatch = block.match(/skills:\s*\[([^\]]*)\]/);
      if (skMatch) {
        allChars[prevName] = {
          faction,
          skills: skMatch[1].replace(/['"]/g,'').split(',').map(s=>s.trim()).filter(Boolean),
        };
      }
    }
  }

  if (fs.existsSync(transPath)) {
    const text = fs.readFileSync(transPath, 'utf8');
    const keyRegex = /^\s+(\w+):\s*"/gm;
    allTranslates[faction] = new Set();
    let tm;
    while ((tm = keyRegex.exec(text)) !== null) allTranslates[faction].add(tm[1]);
  }
}

let errors = [];
let warnings = [];
let infos = [];

const e = (loc, msg) => errors.push(`${loc}  ${msg}`);
const w = (loc, msg) => warnings.push(`${loc}  ${msg}`);
const i = (loc, msg) => infos.push(`${loc}  ${msg}`);

// ====== BUILD SKILL REFERENCE DATABASE ======
// For each skill, find its subSkills
const subSkills = new Map(); // parentSkill -> { name: body }
for (const [name, info] of Object.entries(allSkills)) {
  const b = info.body;
  // Try to extract subSkill block
  const subMatch = b.match(/subSkill:\s*\{([\s\S]*)\}/);
  if (subMatch) {
    const subBlock = subMatch[1];
    const subMap = {};
    const subRegex = /^\s+(\w+):\s*\{/gm;
    let sm;
    while ((sm = subRegex.exec(subBlock)) !== null) {
      subMap[sm[1]] = true;
    }
    subSkills.set(name, subMap);
  }
}

// ====== CHECKS ======
console.log('='.repeat(60));
console.log('  哈包技能全面分析');
console.log('='.repeat(60));
console.log(`  技能: ${Object.keys(allSkills).length}  角色: ${Object.keys(allChars).length}  阵营: ${factions.length}`);
console.log('');

for (const [name, info] of Object.entries(allSkills)) {
  const b = info.body;
  const loc = `${info.faction}/${name}:${info.line}`;

  // ── 1. EVENT NAME VALIDATION ──
  if (/trigger\s*:/.test(b)) {
    const trigBlock = b.match(/trigger\s*:\s*\{([^}]+)\}/);
    if (trigBlock) {
      const evtNames = trigBlock[1].matchAll(/"(\w+)"/g);
      for (const ev of evtNames) {
        const evt = ev[1];
        if (!VALID_EVENTS.has(evt) && !evt.endsWith('Begin') && !evt.endsWith('End')) {
          // Allow: phaseXxxBegin, phaseXxxEnd, anythingAfter, anythingBefore, anythingCancelled
          if (!/\w+(?:After1?|Before1?|Cancelled|Skipped|End|Begin)$/.test(evt)) {
            w(loc, `事件 "${evt}" 不在已知标准事件列表中，可能不存在`);
          }
        }
      }
    }
  }

  // ── 2. KNOWN BAD EVENT NAMES ──
  for (const bad of ['loseHpBegin', 'phaseBefore', 'phaseZhunbeiEnd']) {
    if (b.includes(`"${bad}"`)) e(loc, `事件 "${bad}" 在框架中不存在`);
  }

  // ── 3. MOD CHECK ──
  for (const badMod of ['cardcolor', 'cardtype']) {
    if (new RegExp(`"${badMod}"\\s*[:(]`).test(b)) {
      e(loc, `mod "${badMod}" 在框架中不存在`);
    }
  }

  // ── 4. PROPERTY NAME CHECK ──
  if (/^\s+zhugong\s*:/.test(b)) e(loc, 'zhugong 不存在，应为 zhuSkill: true');

  // ── 5. CARD NAME REFERENCE CHECK ──
  if (/wugufengdeng/.test(b)) e(loc, 'wugufengdeng 应为 wugu');

  // ── 6. API CHECK ──
  if (/get\.cards\(["']d["']\)/.test(b)) e(loc, 'get.cards("d") 应为 get.discardPile()');

  // ── 7. MISSING AWAIT ──
  const methodCalls = b.matchAll(/(?<!\.)(\w+)\.(\w+)\(/g);
  for (const mc of methodCalls) {
    const obj = mc[1], method = mc[2];
    if (['player', 'target', 'source', 'other', 'p', 'current', 'currentPlayer', 'defender', 'attacker', 'baji'].includes(obj)) {
      if (PLAYER_ASYNC.has(method)) {
        // Check if this specific call is awaited
        const callStr = `${obj}.${method}(`;
        const idx = b.indexOf(callStr, mc.index - 10);
        if (idx > 0) {
          const before = b.slice(Math.max(0, idx - 7), idx);
          if (!/await\s+$/.test(before)) {
            w(loc, `${obj}.${method}() 可能缺少 await`);
          }
        }
      }
    }
  }

  // ── 8. INVALID ENABLE VALUES ──
  const enableMatch = b.match(/enable:\s*\[?([^\]]*?)\]?/);
  if (enableMatch && !/trigger/.test(b)) {
    const vals = enableMatch[1].replace(/["']/g, '').split(',').map(s => s.trim());
    for (const v of vals) {
      if (v === 'phaseBegin' || /phaseDrawBegin/.test(v) || /phaseDrawEnd/.test(v)) {
        e(loc, `enable: "${v}" 无效，应改为 trigger`);
      }
    }
  }

  // ── 9. SUB-SKILL REFERENCE CHECK ──
  const tsRefs = [...b.matchAll(/addTempSkill\(["'](\w+)["']/g)];
  for (const ref of tsRefs) {
    const sk = ref[1];
    if (!allSkills[sk] && !subSkills.get(name)?.[sk]) {
      // Check if it's a subSkill of this skill
      const subMatch = b.match(new RegExp(`"${sk}"\\s*:`));
      if (!subMatch) {
        // Check if defined in any skill's subSkill
        let found = false;
        for (const [pname, subs] of subSkills) {
          if (subs[sk]) { found = true; break; }
        }
        if (!found) w(loc, `addTempSkill("${sk}") 引用未定义技能`);
      }
    }
  }

  // ── 10. CHOOSETOGIVE MISSING FORCED ──
  if (/chooseToGive\(/.test(b) && !/chooseToGive\([^,]+,\s*"[^"]*",\s*(?:true|false)/.test(b)) {
    w(loc, 'chooseToGive 缺少第三个参数 forced=true/false');
  }

  // ── 11. TARGETINRANGE ON WRONG PLAYER ──
  // targetInRange must be on the card USER, not on the target
  if (/targetInRange\s*\(/.test(b) && /addTempSkill\(/.test(b)) {
    // This skill adds tempSkill with targetInRange - check who it's added to
    const addToMatch = b.match(/(\w+)\.addTempSkill\(/g);
    for (const atm of addToMatch || []) {
      const who = atm.replace('.addTempSkill(', '');
      if (who === 'target') {
        w(loc, `targetInRange mod 挂在 target 身上不会被框架检查，应挂在卡牌使用者身上`);
      }
    }
  }

  // ── 12. TARGETENABLED ON WRONG PLAYER ──
  // targetEnabled(card, player, target) — `target` is the skill owner (the one being targeted)
  // So if skill is on target person, that's correct
  // But if "player" (card user) is checked against, need to verify
  if (/targetEnabled\s*\(/.test(b) && /addTempSkill\(/.test(b)) {
    // Just note it for manual review
  }

  // ── 13. CHOOSECARD WITH TRUE (FORCED) ──
  if (/chooseCard\([^,]*,\s*true/.test(b) && !/chooseCard\([^,]*,\s*true,/.test(b)) {
    w(loc, 'chooseCard 第二个参数 true 强制选牌，玩家无法取消');
  }

  // ── 14. CHOOSEBOOL AS ONLY COST ──
  // if cost only has chooseBool, that's fine

  // ── 15. FILTER WITH event.name MISMATCH ──
  // Check if filter checks event.name for a value that can never match the trigger
  const triggerEvt = b.match(/trigger\s*:\s*\{[^}]*\}/);
  const filterNameCheck = b.match(/event\.name\s*[!=]==\s*"(\w+)"/g);
  if (triggerEvt && filterNameCheck) {
    const trigText = triggerEvt[0];
    for (const fnc of filterNameCheck) {
      const fn = fnc.match(/"(\w+)"/)[1];
      if (!trigText.includes(fn) && !trigText.includes('phaseBegin') && fn !== 'phaseZhunbei' && fn !== 'phaseUse') {
        // Could be legitimate if trigger is phaseBegin and filter checks phaseZhunbei/phaseUse — but those won't match!
        if (trigText.includes('phaseBegin') && (fn === 'phaseZhunbei' || fn === 'phaseUse')) {
          e(loc, `filter 检查 event.name === "${fn}"，但 trigger 是 phaseBegin（event.name 永远是 "phaseBegin"）`);
        }
      }
    }
  }

  // ── 16. DIRECTHIT USAGE ──
  if (/(\w+)\.directHit\.add\(/.test(b) && !/trigger\.directHit\.add/.test(b)) {
    w(loc, 'directHit.add 应调用 trigger.directHit.add(target) 而非其他对象');
  }

  // ── 17. LOGSKILL WITH WRONG PARAMETERS ──
  // player.logSkill("skillname", target) — should be correct

  // ── 18. USESKILL REFERENCE ──
  const usRefs = [...b.matchAll(/useSkill\(["'](\w+)["']\)/g)];
  for (const ref of usRefs) {
    if (!allSkills[ref[1]]) {
      let found = false;
      for (const [pname] of Object.entries(allSkills)) {
        if (pname === ref[1]) { found = true; break; }
      }
      if (!found) w(loc, `useSkill("${ref[1]}") 引用未知技能`);
    }
  }

  // ── 19. ADD TEMP SKILL EXPIRY CHECK ──
  const atsRefs = [...b.matchAll(/addTempSkill\(["'](\w+)["'],\s*"(\w+)"\)/g)];
  for (const ref of atsRefs) {
    const expiry = ref[2];
    if (!VALID_EXPIRY.has(expiry) && !expiry.endsWith('After') && !expiry.endsWith('End')) {
      w(loc, `addTempSkill expiry "${expiry}" 可能无效`);
    }
  }

  // ── 20. MOD FUNCTION SIGNATURE CHECK (disabled - too many false positives)
  // Different framework versions have different signatures

}

// ====== CROSS-FILE CHECKS ======

// Characters reference valid skills
for (const [charName, ci] of Object.entries(allChars)) {
  for (const sk of ci.skills) {
    if (!allSkills[sk]) e(`${ci.faction}/${charName}`, `引用不存在的技能 "${sk}"`);
  }
}

// All skills have translations
for (const [name, info] of Object.entries(allSkills)) {
  const trans = allTranslates[info.faction];
  if (trans && !trans.has(name) && !trans.has(name + '_info')) {
    // Skip internal helper skills (starting with _ or ending with _block/_effect etc)
    if (!name.startsWith('_') && !name.endsWith('_block') && !name.endsWith('_effect') && !name.endsWith('_active')) {
      w(name, `translate.js 中缺少 "${name}" 的翻译`);
    }
  }
}

// Skills with zhuSkill should be on isZhugong characters (weak check)
for (const [name, info] of Object.entries(allSkills)) {
  if (/zhuSkill\s*:\s*true/.test(info.body)) {
    let usedByZhu = false;
    for (const [cname, ci] of Object.entries(allChars)) {
      if (ci.skills.includes(name) && ci.faction === info.faction) {
        // Check if character has isZhugong in character.js
        const charPath = path.join(DIR, info.faction, 'character.js');
        if (fs.existsSync(charPath)) {
          const charText = fs.readFileSync(charPath, 'utf8');
          const charBlock = charText.match(new RegExp(`${cname}:\\s*\\{[^}]+\\}`));
          if (charBlock && charBlock[0].includes('isZhugong')) {
            usedByZhu = true;
          }
        }
        break;
      }
    }
    if (!usedByZhu) {
      w(name, '标记了 zhuSkill: true 但对应角色可能不是主公（缺少 isZhugong）');
    }
  }
}

// ====== FILE INTEGRITY ======
for (const faction of factions) {
  for (const suffix of ['skill.js', 'character.js', 'translate.js']) {
    const fp = path.join(DIR, faction, suffix);
    if (fs.existsSync(fp)) {
      const c = fs.readFileSync(fp, 'utf8');
      const o = (c.match(/\{/g) || []).length;
      const cl = (c.match(/\}/g) || []).length;
      if (o !== cl) e(`${faction}/${suffix}`, `大括号不匹配 {${o}}${cl}`);
    }
  }
}

// ====== SUMMARY ======
console.log(`\n${'='.repeat(60)}`);
if (errors.length) {
  console.log(`\n🔴 错误 (${errors.length}): 需要修复`);
  errors.forEach(x => console.log('  ' + x));
}
if (warnings.length) {
  console.log(`\n🟡 警告 (${warnings.length}): 建议检查`);
  warnings.forEach(x => console.log('  ' + x));
}
if (!errors.length && !warnings.length) {
  console.log('\n✅ 未发现任何问题');
} else if (!errors.length) {
  console.log('\n✅ 无严重错误，只有建议检查的警告');
}
console.log('');
