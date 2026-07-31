# PalTools Agent Instructions

本文件是仓库级执行约束。进入仓库后先读本文件，再按任务类型选择性阅读；不要从遍历整个仓库或加载大型生成数据开始。

## 1. 阅读入口与路由

### 所有任务先读

1. `AGENTS.md`：工作区、安全、验证和提交规则。
2. `package.json`：唯一可信的命令入口、Node 版本和打包配置。
3. `docs/README.md`：文档索引；只继续读取与当前任务直接相关的文档。
4. `git status --short` 和相关文件的 `git diff`：确认用户已有改动，避免覆盖共享工作区。

Node 基线为 `.nvmrc` 中的 Node 22；`package.json.engines` 要求至少 Node 22.12。

### 按任务类型继续读

| 任务 | 优先入口 | 通常还要读 |
| --- | --- | --- |
| 图鉴、筛选、详情、配种 UI | `src/App.tsx`、`src/styles.css` | `src/App.test.tsx`、`src/domain/types.ts` |
| 图鉴搜索、排序、配方查询 | `src/domain/pals.ts` | 对应 `*.test.ts`、`src/domain/types.ts` |
| 配种路径算法/Worker | `src/domain/breeding-path.ts` | `breeding-path.test.ts`、Worker、架构文档 |
| localStorage/管理员配置 | `src/domain/config.ts` | `config.test.ts`、`App.tsx` |
| paldb 抓取与素材 | `docs/02-data-and-compliance.md`、`docs/05-data-pipeline.md` | `pipeline/data/paldb/{client,parser,schema,sync}.ts` |
| 生成数据/Schema | `pipeline/data/config.ts`、`pipeline/data/build.ts`、`pipeline/data/validate.ts` | `src/domain/types.ts`、`public/data/manifest.json`、Electron smoke 断言 |
| Electron/EXE | `package.json`、`script/package-exe.ps1` | `script/electron/main.cjs`、准备下载脚本 |
| 产品范围/未来需求 | `docs/01-product-requirements.md` 或对应需求文档 | `docs/04-roadmap.md`、未来需求清单 |

### 默认不用读

- 不要直接打开完整的 `public/data/breeding-index.json`、`pals.json` 或全部 `data/raw/paldb/pages/*.html`；它们体积大且多数是单行/重复内容。先读 Schema、manifest、计数和一个代表性样本。
- UI/CSS 小改不用读 `pipeline/data`、Electron 打包脚本、PalCalc 原始快照。
- 数据解析改动不用先读全部 UI；只需确认公共类型和实际消费点。
- 历史阶段文档不是当前行为的唯一真相；当前代码、`package.json`、manifest 和验证器优先。
- `build/`、`output/`、`.playwright-cli/`、`*.tsbuildinfo` 是中间产物，不作为源码阅读入口。
- `node_modules/` 永远不是代码检索入口。

如果文档中的 Schema 版本或计数与 `pipeline/data/config.ts`、`public/data/manifest.json` 不一致，以代码和 manifest 为准，并在本次改动涉及该主题时顺手修正文档。

## 2. 基本命令

在仓库根目录运行。Windows 自动化优先显式调用 `npm.cmd`，避免 PowerShell 执行策略误选 `npm.ps1`。

```powershell
# 安装（锁文件必须保持一致）
npm.cmd ci

# 开发
npm.cmd run dev
npm.cmd run preview

# 快速验证
npm.cmd run typecheck
npm.cmd test -- src/domain/pals.test.ts
npm.cmd test -- src/App.test.tsx

# 完整 Web 验证
npm.cmd test
npm.cmd run data:validate
npm.cmd run build

# 数据流水线
npm.cmd run data:parse:pals   # 只用已有缓存，断网可跑
npm.cmd run data:sync:pals    # 联网同步 paldb；不要为普通 UI 改动运行
npm.cmd run data:import:breeding
npm.cmd run data:build
npm.cmd run data:sync         # 全量联网同步 + 构建 + 校验，成本最高

# Windows 便携版发布门
npm.cmd run package:exe
```

`package:exe` 已包含 Web 构建、electron-builder 和真实打包应用的隐藏 smoke；成功必须以脚本显式零退出码为准，不以“生成了 EXE”或 Web build 成功代替。

### 本地服务必须受管

- 禁止用 `start /b`、`Start-Process`、`cmd /c start`、`nohup` 或等价方式分离 Vite/preview/watch/打包服务。
- 以前台执行机制启动，并要求其返回可管理的 `cell_id`（`Script running with cell ID ...`）。
- 记录 `cell_id`，用 wait 读取增量输出；不要因为一次没有新输出就启动第二个服务。
- 每次 wait 要有界；持续工作期间至少每 60 秒向用户更新一次。
- 浏览器检查完成或失败后，用同一个 `cell_id` 显式 terminate。
- Windows 下 terminate 后还要检查精确端口和 readiness URL。若仍有监听，只能通过该端口解析 PID，核验路径/启动时间确属本仓库后终止该 PID；禁止按进程名批量杀 `node`。
- 中断恢复时先查默认端口（Vite 通常为 5173）和已有受管 cell，确认无服务后才能重启。
- 验证记录必须同时写明“服务成功启动”和“端口/URL 已确认停止”。

## 3. 架构边界

### UI、领域与 Worker

- `src/domain/*` 保持纯逻辑，不依赖 React、DOM、localStorage 或网络；排序、过滤、配方解码和路径算法优先放领域层并写单元测试。
- `App.tsx` 负责状态编排和展示，不在组件里重新实现数据解析、紧凑索引规则或路径算法。
- Worker 消息必须可结构化克隆并带请求编号；快速切换条件时必须终止旧 Worker 或忽略旧响应，避免竞态。
- 图形树始终保留等价文本步骤；不能只保证 React Flow 画布可用。
- 新交互必须具备键盘与 ARIA 语义。自定义 combobox 至少覆盖展开、过滤、方向键、Enter、Escape、外部点击和滚动到高亮项。

### 数据与生成物

- `data/raw/` 是来源快照，`public/generated/` 是本地运行需要的来源素材；二者被 Git 忽略，但不是可随意清理的临时目录。
- `public/data/*.json` 是 `pipeline/data/build.ts` 的生成物，禁止手工编辑；改 Schema/来源映射后更新流水线并重新生成。
- `pipeline/data/validate.ts` 必须独立读取最终产物和来源快照进行验证，不能复用生成函数来“证明自己正确”。
- 联网抓取必须继续遵守 robots、请求间隔、超时、重试、来源 URL 与 SHA-256 记录；不要绕过客户端直接并发扫站。
- paldb 和 PalCalc 的名称、ID、配方与素材映射必须显式校验冲突，不能静默采用最后一条。
- 运行时保持离线：React/Electron 页面只读取包内 JSON 和素材，不新增第三方运行时请求。

### Electron 与本机状态

- 不降低 `contextIsolation`、sandbox、自定义协议路径校验和 Node integration 安全设置。
- 不把账号、云同步、游戏存档读写、遥测或默认联网更新带入普通功能改动；这些超出当前产品边界。
- localStorage 值必须版本化、容错解析，并过滤不存在的帕鲁 ID；不要直接信任存储内容。
- 已拥有帕鲁和临时起点的生命周期不同：前者需明确保存到本机，后者只在当前会话存在。

## 4. 禁区与高风险模块

除非任务明确涉及，否则不要修改以下内容；确需修改时必须说明理由并提高验证等级：

- `script/electron/main.cjs` 的安全开关、自定义协议和 smoke 逻辑。
- `script/package-exe.ps1` 的清理范围、缓存路径和发布产物定位。任何递归删除都必须解析绝对路径并验证仍位于仓库指定子目录。
- `src/domain/breeding-path.ts` 的无环约束、确定性排序和代数语义。
- PalCalc 特殊配方规范化、44,851 条配方/44,850 个亲本组合等完整性断言。
- paldb robots/节流/重试和素材合法性检查。
- 管理员代数硬上限、localStorage key/schemaVersion。
- `package-lock.json`、版本号、tag 和发布文件名；无依赖或发布需求时不要触碰。

绝对禁止：

- `git reset --hard`、无授权的 `git checkout --`、批量删除或覆盖用户改动。
- 手工修补生成 JSON 以让测试“变绿”。
- 把 `data/raw/`、`public/generated/`、`node_modules/` 当作例行清理对象。
- 用 Web build 成功替代桌面包 smoke。
- 为 CSS/文案修改重复执行全量联网同步或 EXE 打包。

## 5. 验证策略

验证应分层推进：先窄后宽，失败时停在最便宜且最相关的一层修复，不要每改一行都重跑发布门。

一般不以多模态手段（如直接查看或识别截图）作为验收依据；视觉与布局结论以 DOM 几何、计算样式、溢出、破图、console 和可重复断言为准。截图仍保留在 `output/playwright/` 供人工核对，模型侧的“看图”只允许作为辅助定位，不作为最终通过标准。

### 开发中的最小闭环

| 改动 | 先跑 |
| --- | --- |
| 纯文档 | 链接/路径检查、`git diff --check` |
| 领域逻辑 | 对应 `*.test.ts` + `npm.cmd run typecheck` |
| React 交互 | `src/App.test.tsx` + `npm.cmd run typecheck` |
| CSS/响应式 | 相关组件测试 + 生产 build；之后做浏览器尺寸检查 |
| paldb parser/schema | `pipeline/data/paldb.test.ts` + typecheck |
| 数据 build/validate | 对应数据测试 + `data:build` + `data:validate` |
| Worker/路径 | `breeding-path.test.ts` + typecheck + 真实路径 UI 流程 |
| Electron/打包 | 前述相关测试，通过后才进入 `package:exe` |

Vitest 可用 `npm.cmd test -- <file>` 定点执行。避免在实现过程中反复跑完整 jsdom 测试集；冷启动可能明显慢于单文件。

### 交付门

- 普通代码交付：相关定点测试、`npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run data:validate`、`npm.cmd run build`。
- 仅文档改动：不要求全套代码测试，但必须检查文档链接、diff whitespace 和状态。
- Schema 版本变化：更新以下所有位置后再跑完整交付门：
  - 数据版本常量与原始/公共 zod Schema；
  - `src/domain/types.ts` 边界类型；
  - 所有生成 payload、manifest、紧凑 breeding index；
  - UI 版本标签、测试 fixture；
  - Electron 打包 smoke 断言；
  - 当前架构/数据文档。
- 正式发布或用户明确要求 EXE：按“定点测试 → 完整测试 → 数据校验/typecheck → Web build → package → 打包应用 smoke”顺序执行。记录 EXE 精确文件名、字节数和 SHA-256。

不要重复做高成本步骤：样式修正后无需重新抓 299 个页面；公共 JSON 未变化时无需重跑数据同步；只有发布门才打包。

### 长任务完成后的文档收尾（必须）

- “长任务”包括跨多个实现步骤或模块的改动，以及涉及数据流水线、Schema、架构边界、发布/打包、真实浏览器回归或多阶段验证的任务。
- 长任务在最终交付和提交前必须检查 `docs/README.md`、README 及直接相关的当前文档，并更新已经发生变化的行为、接口/Schema、操作命令、验证结果、已知限制和后续事项；不得只在聊天或提交信息中留下这些信息。
- 优先修订、合并既有文档，不要机械地为每个任务新建总结文档。已完成且只剩历史查阅价值的计划、过程记录和发布记录移入 `docs/archive/`，同时维护文档索引。
- 即使代码行为没有改变，长时间验证、打包或发布任务也要把可复用的结论、产物信息和异常处理经验写回对应文档。若审查后确实没有任何持久信息需要更新，最终交付中必须明确记录“已完成文档审查，无需更新”及原因。
- 文档收尾完成后再执行适合文档改动的链接/路径检查和 `git diff --check`；不要仅因文字更新重复运行无关的全量数据同步或 EXE 打包。

## 6. 浏览器回归

响应式、弹窗、滚动、素材或主要交互变化必须使用 Playwright 真实浏览器检查：

- 使用受管本地服务和命名 Playwright session；截图仅放 `output/playwright/`。
- 至少覆盖：
  - 桌面基线 1440×900；
  - 125% 缩放的有效视口（以 1440×900 基线时检查 1152×720）；
  - 1366×768；
  - 一个窄屏或低高度 fallback。
- 不只截图，还要检查：
  - `document.body`、弹窗和内部滚动区的实际 `overflow`；
  - `scrollWidth <= clientWidth`，无意外横向滚动；
  - 图片 `naturalWidth > 0`，工作适应性/属性/帕鲁素材无破图；
  - console error/warning；
  - 无第三方运行时请求；
  - 键盘导航、滚轮和触控板对应的容器确实可滚动。
- 覆盖消费新数据的主流程：图鉴筛选/排序、详情技能滚动、正反向配种、路径规划、已拥有保存，而不是只打开首页。
- HMR 写样式时可能短暂出现资源 `ERR_CONNECTION_RESET` 或黑帧；先确认服务 readiness、等待页面稳定并重新 snapshot，再判断是否是代码错误。不要把一次过渡截图当成最终验收。
- 检查结束必须关闭 Playwright session，终止受管服务，并确认端口和 URL 都已失活。

## 7. Windows 与 PowerShell 坑点

- Windows PowerShell 5.1 不保证按 UTF-8 解码无 BOM 的 `.ps1`。脚本运行时消息/异常优先 ASCII，或明确保存 UTF-8 BOM。
- PowerShell 7 能解析不代表 `package.json` 中的 `powershell.exe` 能解析；打包脚本必须用实际入口验证。
- `rg.exe` 在受限环境中可能 Access denied；退化为 `Get-ChildItem -Recurse -File` + `Select-String`，不要因此停止调查。
- `Start-Process` 还可能因环境中同时存在 `Path`/`PATH` 触发字典冲突；本仓库本来就禁止用它启动长期服务。
- 长命令不要用超大单次 timeout 猜测状态。让执行返回 cell，短 wait 查看增量输出；确认在推进后继续等待。
- 生成 JSON 多为单行，`git diff` 会显示整行变化。优先检查 manifest、Schema 版本、记录数、哈希和验证器结果，不要把整份 JSON 加载进上下文。
- `data:parse:pals` 即使离线也要解析约 299 个页面，可能耗时数分钟；只在 parser 或原始缓存变化后运行一次。缺少新素材时离线解析会明确失败，此时联网同步一次素材，再回到离线构建/校验。
- Vite/HMR 服务异常断开后，页面可能保留旧 UI 但后续 fetch 失败；浏览器报错前先检查 readiness URL 和精确端口。

## 8. 共享工作区、清理与 Git

- 现有 modified/untracked 文件都视为用户工作。编辑已修改文件前先读相关 diff；不重置、不丢弃、不顺手格式化无关文件。
- 改动只覆盖当前问题。遇到重叠无法安全合并时停止并说明。
- 可重建中间产物包括 `build/`、`output/`、`.playwright-cli/`、`.npm-cache/`、`*.tsbuildinfo`；清理前仍需验证绝对路径。
- 删除文档前先查 `docs/README.md`，保留仍有用的需求、架构、合规、路线图和后续阶段说明。
- 锁定日志无法删除时，用内容、mtime、监听端口、可执行路径和启动时间定位准确进程；只终止已验证 PID。

提交前：

1. `git status --short`，区分本次工作和用户已有工作。
2. 检查相关 `git diff`，只 stage 明确路径；工作区混杂时禁止 `git add .`。
3. `git diff --cached --check`。
4. 提交后用 `git status --short` 和 `git show --stat --oneline HEAD` 核验。
5. 若仅因签名密钥不可用导致提交失败，可单次使用 `git -c commit.gpgsign=false commit ...`；不得全局关闭签名。

当一个较大的任务完成、相关验证通过且改动范围已确认后，应自动创建一次 Git commit。提交只包含本次任务的明确改动；除非用户另行要求，不自动 push 或发布 Release。

发布时保持 package version、tag、产物文件名、Release 标题和说明一致。推送后验证远端 branch/tag；发布后确认 Release 非 draft/prerelease，所有资产为 uploaded，远端大小与本地 SHA-256 一致。
