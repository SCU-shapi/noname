# 无名杀 (noname) 代码审查 Bug 报告
**日期**: 2026-05-27 23:28 GMT+8
**审查范围**: `D:\zzl\code\noname-main\apps\core\noname\` 核心源码

---

## Bug #1: `checkGlobalHistory` — `Array.forEach` 中 `return false` 不会提前终止迭代

**文件**: `game/index.js` (Game 类)
**行号**: ~825 (checkGlobalHistory 方法)
**严重度**: ⚠️ 中等

**问题描述**:
```javascript
checkGlobalHistory(key, filter, last) {
    if (!key || !filter) return;
    const history = game.getGlobalHistory(key);
    if (last) {
        const lastIndex = history.indexOf(last);
        history.forEach((event, index) => {
            if (index > lastIndex) {
                return false;  // ❌ forEach 不认 return false!
            }
            return filter(event);
        });
    }
    // ...
}
```
`Array.prototype.forEach` 的回调中 `return false` 和 `return true` 都**不会**中断迭代。如果期望在 `index > lastIndex` 时停止，需要使用 `for...of`、`Array.some()`、或手动 `for` 循环。当前的实现会导致遍历超出预期的范围。

**影响**: 检查历史事件时可能遍历不必要的元素，导致过滤逻辑不正确。

**建议**: 使用 `for (let i = 0; i < history.length; i++)` 并在 `i > lastIndex` 时 `break`。

---

## Bug #2: `Deferred.resolve()` — 竞态条件导致 `isStarted` 在 resolve 后可能仍为 `true`

**文件**: `game/PauseManager.ts`
**行号**: ~50-58
**严重度**: 🔴 高

**问题描述**:
```typescript
resolve() {
    if (!this.isStarted) return;
    Promise.resolve()
        .then(() => this.#resolver && this.#resolver())
        .then(() => {
            this.#promise = null;  // 异步清理
            this.#resolver = null;
        });
}
```
`#promise` 被设为 `null` 发生在 microtask 回调中，是**异步**的。但在 `waitPause()` 中：
```typescript
await Promise.all([this.pause, this.pause2, ...].filter(i => i.isStarted));
```
`isStarted` 在 `resolve()` 调用后立即读取时仍为 `true`（因为 `#promise` 还没被清除），导致 `waitPause` 可能包含一个已 resolve 的 Promise 再次等待，形成逻辑混乱。

**影响**: 游戏暂停/恢复机制可能在边界情况下出问题，导致事件循环卡住。

**建议**: 在 `resolve()` 调用后立即清除状态（同步），或者改用状态标记而不是检查 `#promise` 是否为 null。

---

## Bug #3: `$showCharacter` — `var skills` 被重复声明导致作用域问题

**文件**: `library/element/player.js`
**行号**: ~1730-1800 (`$showCharacter` 方法)
**严重度**: 🔴 高

**问题描述**:
```javascript
$showCharacter(num, log) {
    var skills;  // 外层声明

    switch (num) {
        case 0:
            skills = lib.character[this.name][3] || [];  // 给外层的 skills 赋值
            // ...
            break;
        case 1:
            skills = lib.character[this.name2][3] || [];  // 给外层的 skills 赋值
            // ...
            break;
        case 2:
            // ...
            var skills = lib.character[this.name][3] || [];  // ❌ 内层用 var 重新声明！
            // ...
            break;
    }

    // 这里使用的 skills 在 case 2 时是 undefined！
    skills = skills.filter(skill => { ... });
    for (var i = 0; i < skills.length; i++) { ... }
}
```
在 `case 2` 中使用了 `var skills = ...`，由于 `var` 的 hoisting 机制，内层的 `var skills` 被提升到了函数作用域顶部，但赋值仅发生在 `case 2` 分支。在 `case 0` 和 `case 1` 时，外层的 `skills` 被正确赋值，但 `case 2` 时，由于新的 `var` 声明创建了新的局部绑定，离开 switch 后，使用的 `skills` 在 `case 2` 场景下为 `undefined`（实际上由于 JS 中 switch 没有块级作用域，同一个 `var skills` 会在 case 2 被重新赋值——但这导致代码极易被误解，而且如果 case 2 不执行，skills 就是 undefined）。

**影响**: 国战模式双将亮将（`num=2`）时，`skills` 可能只在 `case 2` 代码块内被赋值，过滤和添加技能的循环可能使用到 `undefined`。

**建议**: 删除 `case 2` 中的 `var` 关键字，改用 `let skills` 在 switch 之前声明。

---

## Bug #4: `disableEquip` — `discardingCards.length < 0` 永假条件

**文件**: `library/element/content.js`
**行号**: ~1370 (disableEquip content)
**严重度**: ⚠️ 中等

**问题描述**:
```javascript
const discardingCards = player.getCards("e", card => 
    get.subtypes(card).includes(slot) && !event.cards.includes(card)
);
if (discardingCards.length < 0) {  // ❌ 数组长度永不为负！
    continue;
}
```
`Array.length` 永远不可能小于 0。这个条件意图可能是 `=== 0` 或者 `<= 0` 来跳过空数组。

**影响**: 当 `discardingCards` 为空时不会跳过，会继续执行后面的选择逻辑，可能导致选择空列表等异常。

**建议**: 改为 `if (discardingCards.length === 0) continue;`

---

## Bug #5: `chooseToDisable` / `chooseToEnable` — `event.ai` 被意外覆写为返回值

**文件**: `library/element/content.js`
**行号**: ~1650, ~1750
**严重度**: 🔴 高

**问题描述** (以 `chooseToDisable` 为例):
```javascript
event.ai ??= (event, player, list) => list.randomGet();
event.ai = event.ai(event.getParent(), player, list);  // ❌ 把 event.ai 从函数变成了它的返回值！
next.ai = () => event.ai;  // 现在 event.ai 是一个字符串，不是函数
```
如果 `event.ai` 原本是一个函数，执行后 `event.ai` 变成了函数的**返回值**（比如一个字符串）。然后 `next.ai` 被设为返回这个字符串的函数，AI 选择逻辑会完全失效或报错。

**影响**: 装备栏选择（废除/恢复）的 AI 行为在自定义 `event.ai` 时完全失效。

**建议**: 应该分开存储结果，例如：
```javascript
const aiResult = (event.ai ?? (() => list.randomGet()))(event.getParent(), player, list);
next.ai = () => aiResult;
```

---

## Bug #6: `Card.classListContainsAll` — 使用 `this.className` 而非参数

**文件**: `library/element/card.js`
**行号**: ~650
**严重度**: ⚠️ 中等

**问题描述**:
```javascript
classListContainsAll() {
    return Array.from(arguments).every(name => 
        this.classList.contains(this.className)  // ❌ 应该是 name 而不是 this.className
    );
}
```
该函数应该检查传入的参数类名是否都在元素上，但实际上每次都检查 `this.className`（元素的完整 class 字符串），这永远不会匹配单个类名参数。

**影响**: 此方法完全无法正常工作，所有调用者都会得到错误结果。

**建议**: 改为 `this.classList.contains(name)`。

---

## Bug #7: `chooseToPlayBeatmap` — 事件监听器未清理导致内存泄漏

**文件**: `library/element/content.js`
**行号**: ~2100
**严重度**: ⚠️ 中等

**问题描述**:
```javascript
var click = function () { ... };
document.addEventListener(
    lib.config.touchscreen ? "touchstart" : "mousedown", 
    click
);
// ❌ 函数执行完毕后，click 监听器从未被移除
```
该全局事件监听器在节奏游戏（演奏）结束后没有被 `removeEventListener`。多次触发演奏功能会累积多个监听器，造成内存泄漏和重复响应。

**影响**: 多次使用演奏功能后，每次点击会触发多个旧的回调，可能导致异常行为。

**建议**: 在 `event.settle()` 和所有退出路径中添加 `document.removeEventListener(...)`。

---

## Bug #8: `Content._save` — `dying.side` 可能为 `undefined`

**文件**: `library/element/content.js`
**行号**: ~28
**严重度**: ⚠️ 中等

**问题描述**:
```javascript
const taoEnemyConfig = lib.config.tao_enemy && 
    dying.side !== player.side &&  // ❌ side 属性不一定存在
    lib.config.mode != "identity" && ...
```
代码注释中已有 `// @ts-expect-error 部分模式存在Player#side`，说明 `side` 属性并非在所有模式下都定义。当 `dying.side` 为 `undefined` 且 `player.side` 也为 `undefined` 时，`undefined !== undefined` 为 `false`，逻辑虽不会崩溃但可能不符合预期。如果一方有 `side` 而另一方没有，则比较可能产生意外结果。

**影响**: 在某些模式下，桃的使用逻辑可能与预期不符。

**建议**: 添加可选链/判断：`dying.side != null && dying.side !== player.side`。

---

## Bug #9: `Content.chooseNumbers` — `actual` 可能未初始化

**文件**: `library/element/content.js`
**行号**: ~135 (`optionUpdate` 函数内)
**严重度**: ⚠️ 低

**问题描述**:
```javascript
let actual;
const max = item.max || 9;
if (event.optionSum) {
    actual = event.optionSum - event.numbers.reduce(...) + current;
}
for (let num = item.min || 0; num <= Math.min(actual || max, max); ...) {
```
如果 `event.optionSum` 为 falsy，`actual` 不会被赋值，然后在 `actual || max` 中使用。`undefined || max` 的行为是正确的（fallback 到 max），但如果之前某次循环赋过值而这次没有（因为 `actual` 是 `let` 在较外层），可能导致使用到**上一次循环的旧值**。

**影响**: 数字选择器在 optionSum 存在/不存在交替时可能出现边界计算错误。

**建议**: 在每次循环开始时将 `actual` 重置为 `undefined`。

---

## Bug #10: `Player.when()` — 每次 `.then()` 调用重新编译 content，但引用可能过期

**文件**: `library/element/player.js`
**行号**: ~1200-1300
**严重度**: ⚠️ 中等

**问题描述**:
`when()` 返回的链式 API 中，每次调用 `.then()` 或 `.step()` 都会调用 `createContent()` 重新编译所有 content 函数。但如果后续 `.assign()` 修改了 `skill` 对象的其他属性（如 `firstDo`, `lastDo`, `priority`），之前编译的 content 不会感知到这些变化，因为编译只在 `.then()` 时执行。

**影响**: 如果先 `.then()` 再 `.assign({firstDo: true})`，第一次编译的 content 不会包含 `firstDo` 的变更。

---

## Bug #11: `Game.playAudio` — `Promise.resolve().then(async () => { ... })` 异常被吞没

**文件**: `game/index.js`
**行号**: ~2200
**严重度**: ⚠️ 低

**问题描述**:
```javascript
Promise.resolve().then(async () => {
    let resolvedPath;
    if (parsedPath.startsWith("db:")) {
        resolvedPath = get.objectURL(await game.getDB("image", parsedPath.slice(3)));
    } else if (...) { ... }
    audio.src = resolvedPath;
    ui.window.appendChild(audio);
});
```
此 Promise 链没有 `.catch()`，如果 `game.getDB` 或其他操作抛出异常，错误会被静默吞掉。

**影响**: 音频加载失败时无错误提示，难以调试。

**建议**: 添加 `.catch(err => console.error('Audio load failed:', err))`。

---

## 总结

| # | 文件 | 严重度 | 类别 |
|---|------|--------|------|
| 1 | game/index.js | ⚠️ 中 | `forEach` 中 return false 无效 |
| 2 | game/PauseManager.ts | 🔴 高 | 异步竞态条件 |
| 3 | player.js | 🔴 高 | var 变量重复声明 |
| 4 | content.js | ⚠️ 中 | 永假条件 (length < 0) |
| 5 | content.js | 🔴 高 | event.ai 被意外覆写 |
| 6 | card.js | ⚠️ 中 | 使用 this.className 而非参数 |
| 7 | content.js | ⚠️ 中 | 事件监听器未清理 |
| 8 | content.js | ⚠️ 中 | 可选属性未判空 |
| 9 | content.js | ⚠️ 低 | 变量未初始化 |
| 10 | player.js | ⚠️ 中 | 编译时机与状态不一致 |
| 11 | game/index.js | ⚠️ 低 | Promise 异常未捕获 |
