# 配置与构建问题审计报告

**项目**: `D:\zzl\code\noname-main` (无名杀)  
**日期**: 2026-05-27  
**检查范围**: pnpm-workspace.yaml、各子包 package.json、vite.config.ts、tsconfig 链、scripts/ 构建脚本、.gitmodules

---

## 1. pnpm-workspace.yaml 配置

### ✅ 正确项
- `packages: [apps/*, packages/*, packages/extension/*]` 覆盖了所有子包。
- `onlyBuiltDependencies` 正确列出了需要原生构建的包（electron, esbuild 等）。

### ⚠️ 问题

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | **`packages/extension/*` 无实际扩展** | 🟡 中 | `packages/extension/` 目录下只有 `.gitignore`，没有任何子包。实际扩展通过模板初始化后直接构建到 `apps/core/extension/` 中。workspace 中声明了这个 glob 却无匹配项，虽不报错但造成架构迷惑。 |
| 2 | **`sharedWorkspaceLockfile: false`** | 🟡 中 | 每个子包各自维护 `pnpm-lock.yaml`（共 7 个独立锁文件）。这会导致跨包版本漂移，不同包可能锁定同一依赖的不同版本。如果是有意为之（加速 CI），需明确文档说明。 |

---

## 2. 子包 package.json 依赖分析

### ✅ 正确项
- workspace 内部依赖（`@noname/fs`、`@noname/jit`、`noname`）均使用 `workspace:*`，版本联动正确。
- 各包之间版本一致（如 vue `^3.5.28` 在 core 和 jit 中一致）。

### ⚠️ 问题

| # | 问题 | 所在包 | 严重度 | 说明 |
|---|------|--------|--------|------|
| 3 | **`tsx` 未在子包中声明** | fs, jit, server, mobile | 🔴 高 | 多个子包的 `scripts` 中使用 `tsx` 命令（如 `"dev": "tsx src/entry.ts"`），但 `tsx` 仅在根 `devDependencies` 中声明。依赖 pnpm hoisting 隐式可用，脆弱且违反依赖自声明原则。 |
| 4 | **`tsup` 未在子包中声明** | fs, server | 🟡 中 | `packages/fs` 和 `packages/server` 的 build 脚本使用 `tsup`，但未在各自 devDependencies 中声明。 |
| 5 | **`terser` 隐式依赖** | jit (via root) | 🟡 中 | `packages/jit/build.ts` 中 `minify: "terser"`，但 `terser` 只在根 `devDependencies` 中声明。如果将来 jit 被独立安装，构建会失败。 |
| 6 | **apps/mobile 缺少 build 脚本** | mobile | 🟡 中 | 只有 `sync` 和 `lint` 脚本，没有 `build`。按 `pnpm -r build` 等批量操作时会跳过该包。 |
| 7 | **apps/mobile 脚本中的 `&` 操作符** | mobile | 🟡 中 | `"sync": "cap sync & tsx afterSync.ts"` 在 Windows 上 `&` 是非阻塞并发，如果 `cap sync` 尚未完成就执行 `afterSync.ts`，可能导致错误。应使用 `&&` 串行执行。 |

---

## 3. vite.config.ts 配置

### ✅ 正确项
- `apps/core/vite.config.ts`: MPA 模式、相对路径 base、Vue 插件、代理配置均正确。
- `apps/electron/vite.config.ts`: Electron 主进程/预加载脚本配置正确。
- 扩展模板 vite 配置：lib 模式 + `preserveModules` 正确。

### ⚠️ 问题

| # | 问题 | 位置 | 严重度 | 说明 |
|---|------|------|--------|------|
| 8 | **Dev 与 Build 使用不同 Vite 配置** | apps/core | 🟡 中 | `vite.config.ts` 仅用于 `pnpm dev`（开发服务器），实际构建由 `apps/core/scripts/build.ts` 通过 `build({...})` 编程式调用，配置不共享。修改构建行为需要同时关注两处，容易遗漏。 |
| 9 | **扩展模板外部化 `noname` 和 `vue`** | extension-template | 🟢 低 | 这是正确做法——扩展作为独立包构建，运行时依赖由宿主提供。但需确保宿主版本与模板中 `workspace:*` 声明的版本兼容。 |

---

## 4. tsconfig 文件链

### ✅ 正确项
- 根 `tsconfig.json` → `apps/core/tsconfig.json` → `apps/core/tsconfig.types.json`，继承链清晰。
- `lib: ["dom", "WebWorker", "ESNext"]` 适合浏览器 + Worker 环境。

### ⚠️ 问题

| # | 问题 | 位置 | 严重度 | 说明 |
|---|------|------|--------|------|
| 10 | **子包无独立 tsconfig** | fs, jit, server, electron, mobile | 🟡 中 | 这些包没有自己的 `tsconfig.json`。虽然 tsup/vite 可独立处理 TS 编译，但 IDE 类型检查会回退到根 tsconfig（`target: ESNext, module: ESNext`），对 Node.js 包（fs/server）可能不合适。 |
| 11 | **`paths` 仅在 IDE 中生效** | apps/core | 🟢 低 | `tsconfig.json` 中 `paths: {"@/*": ["./noname/*"]}` 仅用于 tsc 类型检查，Vite 通过 `resolve.alias` 独立处理路径映射。两套配置需保持同步。 |
| 12 | **`preserveSymlinks: false` 冗余** | apps/core/tsconfig.types.json | 🟢 低 | `preserveSymlinks` 默认为 `false`，显式设置不必要但无害。 |

---

## 5. scripts/ 构建脚本

### ✅ 正确项
- `initExtension.ts`: 结构良好，参数解析完善，有错误处理。
- `build.ts` (apps/core): 使用编程式 Vite build API，武将包分离构建逻辑清晰。

### ⚠️ 问题

| # | 问题 | 文件 | 严重度 | 说明 |
|---|------|------|--------|------|
| 13 | **`spawnSync` 未检查退出码** | scripts/build.ts | 🔴 高 | `spawnSync("pnpm -F noname... build", ...)` 后未检查 `result.status`。如果构建失败，脚本继续执行并尝试复制不存在的 `apps/core/dist`，导致令人困惑的错误。 |
| 14 | **子进程无清理（孤儿进程）** | scripts/dev.ts | 🔴 高 | `spawn()` 返回的 ChildProcess 未被存储。按 Ctrl+C 终止 dev 脚本后，3 个子进程（fs dev、extension watch、vite dev）会继续运行，占用端口。需在进程退出时 `kill()`。 |
| 15 | **硬编码相对路径** | scripts/generateTestPack.ts | 🔴 高 | `fs.readFileSync("apps/core/game/asset.json")` 等路径假设 CWD 是项目根目录。从其他目录运行会失败。应参考 `initExtension.ts` 使用 `path.resolve(import.meta.dirname, "..")`。 |
| 16 | **`phantom.js` 是死代码** | scripts/phantom.js | 🟡 中 | 注释标有"年久失修"，使用已废弃的 PhantomJS API，且项目为 ESM 但它用 `require()`。应删除或移到归档目录。 |
| 17 | **混用同步/异步 I/O** | scripts/generateTestPack.ts | 🟢 低 | 顶层 `await fs.promises.cp()` 与 `fs.readdirSync()` / `fs.readFileSync()` 混用。虽不报错，但不一致。 |

---

## 6. .gitmodules

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 18 | **`.gitmodules` 为空文件（0 字节）** | 🔴 高 | 文件存在但内容为空。通常 `.gitmodules` 用于定义 Git 子模块。如果项目曾经使用子模块（如 `packages/extension` 下的扩展），则子模块配置已丢失/清空，会导致 `git submodule update --init` 无操作。需确认是 (a) 有意清空还是 (b) 配置丢失。如果是 (a)，建议直接删除该文件以避免混淆。 |

---

## 问题汇总（按严重度）

### 🔴 高严重度（3 项）
1. **#13** scripts/build.ts: `spawnSync` 不检查退出码——构建失败静默继续
2. **#14** scripts/dev.ts: 子进程未清理——Ctrl+C 后端口被占用
3. **#18** `.gitmodules` 为空——子模块配置缺失/丢失

### 🟡 中严重度（9 项）
4. **#3** 多个子包未声明 `tsx` 依赖
5. **#4** fs/server 未声明 `tsup` 依赖
6. **#5** jit 隐式依赖 `terser`
7. **#1** `packages/extension/*` 无实际子包
8. **#2** `sharedWorkspaceLockfile: false` 导致锁文件分散
9. **#6** mobile 缺少 build 脚本
10. **#7** mobile sync 脚本应使用 `&&` 而非 `&`
11. **#8** vite.config.ts 与构建脚本配置分离
12. **#10** 子包缺少独立 tsconfig

### 🟢 低严重度（4 项）
13. **#11** paths 配置仅在 tsc 生效
14. **#16** phantom.js 死代码
15. **#17** 混用同步/异步 I/O
16. **#12** preserveSymlinks 冗余

---

## 建议优先修复顺序

1. 修复 `scripts/build.ts` 的 exit code 检查（#13）——直接影响 CI/CD
2. 修复 `scripts/dev.ts` 的进程清理（#14）——直接影响开发体验
3. 确认 `.gitmodules` 状态，删除或恢复（#18）
4. 在 fs、jit、server 的 devDependencies 中补充 `tsx` / `tsup` / `terser`（#3, #4, #5）
5. 修复 `scripts/generateTestPack.ts` 路径问题（#15）
