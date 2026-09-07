# PalTools Agent Instructions

本文件是仓库级执行约束。进入仓库后先读本文件，再按任务类型选择性阅读；不要从遍历整个仓库或加载大型生成数据开始。

## 0. 编码原则

编码遵循 Karpathy 的四项编码原则：

1. **编码前先思考**（Think Before Coding）——不要假设，不要隐藏困惑，把权衡摆出来。实现前明确陈述假设，不确定就问；有多种理解时列出选项；有更简单的方案就说出来；不清楚时停下说明困惑点。
2. **简单优先**（Simplicity First）——能解决问题的最少代码，不做投机性功能。不加未被要求的功能、抽象、“灵活性”或不可能场景的错误处理；能缩小的代码就重写。
3. **外科手术式修改**（Surgical Changes）——只改必须改的，只清理自己弄乱的。不“顺手改进”相邻代码或格式，不重构没坏的东西，匹配现有风格；发现死代码只提一句、不删除。
4. **目标驱动执行**（Goal-Driven Execution）——定义成功标准，循环直到验证通过。把“加个验证/修这个 bug/重构 X”转化为“写测试并让测试通过/用测试复现再修复/确保重构前后测试都通过”。

### 默认执行顺序

`最小调查与验收约束 → 实现及定点验证 → 集成审查与修复 → 按影响范围交付门 → 文档与提交`

- 实现前明确修改范围、关键接口/状态归属和可重复的成功断言；同一轮相似反馈合并成一个批次。
- 完整交付门前审查本次 diff 的跨模块边界：按涉及范围检查异步竞态、取消与失败恢复、持久化、敏感信息路径，以及 CSS 层级/焦点行为；为相关风险补负向测试，不把首次集成审查留到全部验证之后。
- 返工先回到最相关的定点测试，再按受影响范围补齐交付门；无关历史问题只报告，不顺手扩展实现。
- 命令覆盖与选择见 `docs/reference/07-quick-commands.md`；不要把“完整测试、类型检查、构建、浏览器、桌面、打包”机械展开为每次都独立重跑的命令清单。

## 1. 阅读入口与路由

### 所有任务先读

1. `AGENTS.md`：工作区、安全、验证和提交规则。
2. `package.json`：唯一可信的命令入口、Node 版本和打包配置。
3. `docs/README.md`：LLM Wiki 路由入口；按任务读取最少的 `docs/reference/`/`docs/decisions/` 页面及其 `source_of_truth`，默认不主动读 `docs/tasks/` 与 `docs/archive/`。
4. `git status --short` 和相关文件的 `git diff`：确认用户已有改动，避免覆盖共享工作区。

读取采用“路径/统计 → 明确文件的 diff → 对应函数与调用点”；优先 `rg` 定位，避免多文件全文拼接或超长 diff 截断后重复读取。完整读取强制入口与适用 skill 指令，其他文档按任务选取；已读且未变化的内容不重复加载。

中断后先核对当前状态与相关 diff，再从检查点继续。长任务检查点只保留已定接口、影响文件、已验证结果及对应代码状态、剩余问题和受管服务标识，不复制大段输出。

Node 基线为 `.nvmrc` 中的 Node 22；`package.json.engines` 要求至少 Node 22.12。

### 按任务类型继续读

| 任务 | 优先入口 | 通常还要读 |
| --- | --- | --- |
| 图鉴、筛选、详情、配种 UI | `src/App.tsx`、`src/styles.css` | `src/App.test.tsx`、`src/domain/types.ts` |
| 图鉴搜索、排序、配方查询 | `src/domain/pals.ts` | 对应 `*.test.ts`、`src/domain/types.ts` |
| 自动配种方案网、关系背包、方案工作区 | `src/domain/breeding-workspace.ts`、`src/features/breeding/SolutionWorkspace.tsx` | `src/storage/breeding-workspace.ts`、对应 `*.test.ts`、`docs/reference/01-product-requirements.md` |
| 主题/localStorage 配置 | `src/theme/theme.ts` | `src/theme/theme.test.ts`、`src/features/settings/SettingsPage.tsx`、`src/App.tsx` |
| paldb 抓取与素材 | `docs/reference/02-data-and-compliance.md`、`docs/reference/05-data-pipeline.md` | `pipeline/data/paldb/{client,parser,schema,sync}.ts` |
| 生成数据/Schema | `pipeline/data/config.ts`、`pipeline/data/build.ts`、`pipeline/data/validate.ts` | `src/domain/types.ts`、`public/data/manifest.json`、Electron smoke 断言 |
| Electron/EXE | `package.json`、`script/package-exe.ps1` | `script/electron/main.cjs`、准备下载脚本 |
| 正式发布、远程标签或 GitHub Release | `docs/reference/08-release-workflow.md` | `package.json`、平台打包脚本、`docs/reference/07-quick-commands.md` |
| 产品范围/未来需求 | `docs/reference/01-product-requirements.md` 或 `docs/tasks/todolist.md` | `docs/reference/04-roadmap.md`、对应任务文档 |
| Windows/PowerShell 命令、脚本与本地服务 | `docs/reference/06-powershell-guide.md` | `package.json`、`script/`、本文件第 2/7 节 |

### 默认不用读

- 不要直接打开完整的 `public/data/breeding-index.json`、`pals.json` 或全部 `data/raw/paldb/pages/*.html`；它们体积大且多数是单行/重复内容。先读 Schema、manifest、计数和一个代表性样本。
- UI/CSS 小改不用读 `pipeline/data`、Electron 打包脚本、PalCalc 原始快照。
- 数据解析改动不用先读全部 UI；只需确认公共类型和实际消费点。
- 历史阶段文档不是当前行为的唯一真相；当前代码、`package.json`、manifest 和验证器优先。仅在需求梳理或计划任务时读取 `docs/tasks/todolist.md`；它不覆盖当前行为。
- `build/`、`output/`、`.playwright-cli/`、`*.tsbuildinfo` 是中间产物，不作为源码阅读入口。
- `node_modules/` 永远不是代码检索入口。
- `docs/archive/` 默认不读，只有追溯历史时才读；`docs/tasks/` 只读当前任务对应文件。

如果文档中的 Schema 版本或计数与 `pipeline/data/config.ts`、`public/data/manifest.json` 不一致，以代码和 manifest 为准，并在本次改动涉及该主题时顺手修正文档。

### LLM Wiki 维护

- Wiki 契约见 `docs/_meta/wiki-contract.md`，字段和受控标签唯一来源见 `docs/_meta/wiki-schema.json`；禁止自行发明标签或把未验证计划写入 canonical 页面。
- `docs/reference/` 保存已由源码、测试、配置或 manifest 支撑的当前知识；跨模块且需要保留背景与后果的高影响决定放 `docs/decisions/`。
- `docs/tasks/` 保存进行中事项；`docs/tasks/todolist.md` 是记录已确认、尚未启动需求的唯一稳定 backlog 例外。实现完成并通过相关验证后，agent 必须把长期知识提升到 reference/decision，更新索引与关联，再将原任务记录原样移入 `docs/archive/`。
- 文档变更和长任务收尾必须运行 `npm.cmd run docs:lint`；当前事实仍以 frontmatter 的 `source_of_truth` 指向的代码与数据为准。

## 2. 基本命令

在仓库根目录运行。Windows 自动化优先显式调用 `npm.cmd`，避免 PowerShell 执行策略误选 `npm.ps1`。

```powershell
# 安装（锁文件必须保持一致）
npm.cmd ci

# 开发
npm.cmd run dev
npm.cmd run preview

# 快速验证
npm.cmd run test:plan           # 解释工作区改动选中的测试与原因
npm.cmd run test:changes        # 受影响测试与必要静态/契约检查
npm.cmd run typecheck
npm.cmd test -- src/domain/pals.test.ts
npm.cmd test -- src/App.test.tsx

# 完整 Web 验证
npm.cmd test
npm.cmd run build

# Electron 源码 smoke 预检（构建 Web，但不打包 EXE）
npm.cmd run verify:electron

# 数据流水线（命令与语义详见 docs/reference/05-data-pipeline.md）
npm.cmd run data:sync         # 全量联网同步 + 构建 + 校验，成本最高；不要为普通 UI 改动运行

# Windows 便携版发布门
npm.cmd run package:exe
```

`package:exe` 已包含完整测试、Web 构建、electron-builder 和真实打包应用的隐藏 smoke；成功必须以脚本显式零退出码为准，不以“生成了 EXE”或 Web build 成功代替。

`build` 包含 `package.json` 声明的契约测试、`data:validate`、`tsc -b` 与 Vite 构建；`test:browser` 和 `verify:electron` 都会调用它，不在这些入口前额外跑同一份 build。同时需要浏览器与源码桌面检查时用 `npm.cmd run verify -- --browser --electron`，在同一受管流程中验证输入和产物指纹后共用构建；独立命令仍自足，不跨运行缓存。命令组合见快捷命令文档。`test` 固定最多 4 个 worker，不在没有测量的情况下提高并行度。修改 Electron 导航、协议消费或 smoke DOM 断言时，仍先完成源码 Electron smoke，通过后再进入 `package:exe`。

### 本地服务必须受管

完整撰写指南见 `docs/reference/06-powershell-guide.md`。此处只保留强制要点：
- 禁止用 `start /b`、`Start-Process`、`cmd /c start`、`nohup` 或等价方式分离 Vite/preview/watch/打包服务。
- 启动前检查目标端口和已有受管 `cell_id`；同一仓库、同一用途只保留一个已核验的实例。
- 以前台受管方式启动并记录 `cell_id`，有界读取输出；结束后用同一 `cell_id` terminate 并确认端口/URL 已失活。只能终止已按端口和路径核验的 PID，禁止按进程名批量杀 `node`。

## 3. 架构边界

### UI 与领域

- `src/domain/*` 保持纯逻辑，不依赖 React、DOM、localStorage 或网络；排序、过滤、配方解码和配方关系校验优先放领域层并写单元测试。
- `App.tsx` 负责状态编排和展示，不在组件里重新实现数据解析、紧凑索引或配方关系规则。
- 图形树始终保留等价文本步骤；不能只保证 React Flow 画布可用。
- 新交互必须具备键盘与 ARIA 语义。自定义 combobox 至少覆盖展开、过滤、方向键、Enter、Escape、外部点击和滚动到高亮项。

### 数据与生成物

- `data/raw/` 是来源快照，`public/generated/` 是本地运行需要的来源素材；二者被 Git 忽略，但不是可随意清理的临时目录。
- `public/data/*.json` 是 `pipeline/data/build.ts` 的生成物，禁止手工编辑；改 Schema/来源映射后更新流水线并重新生成。
- `pipeline/data/validate.ts` 必须独立读取最终产物和来源快照进行验证，不能复用生成函数来“证明自己正确”；生成/校验分工见 `docs/reference/03-architecture.md` 和 `docs/reference/05-data-pipeline.md`。
- 抓取合规（robots、请求间隔、超时、重试、来源 URL 与 SHA-256）、素材合法性、paldb/PalCalc 冲突校验与运行时离线规则见 `docs/reference/02-data-and-compliance.md`。

### Electron 与本机状态

- 不降低 Electron 安全设置（`contextIsolation`、sandbox、自定义协议路径校验、Node integration）与 localStorage 版本化、容错解析、过滤不存在帕鲁 ID 的规则；细节与键表见 `docs/reference/03-architecture.md`。
- 不把账号、云同步、游戏存档读写、遥测或默认联网更新带入普通功能改动；这些超出当前产品边界（见 `docs/README.md`“当前明确不做”）。
- 已拥有帕鲁和临时起点的生命周期不同：前者需明确保存到本机，后者只在当前会话存在。

## 4. 禁区与高风险模块

除非任务明确涉及，否则不要修改以下内容；确需修改时必须说明理由并提高验证等级：

- `script/electron/main.cjs` 的安全开关、自定义协议和 smoke 逻辑。
- `script/package-exe.ps1` 的清理范围、缓存路径和发布产物定位。任何递归删除都必须解析绝对路径并验证仍位于仓库指定子目录。
- paldb 抓取/素材合规与 PalCalc 配方规范化、完整性断言（robots/节流/重试、44,851 条配方/44,850 个亲本组合及更新流程见 `docs/reference/02-data-and-compliance.md`）。
- 已退场的管理员代数配置不得恢复消费；兼容期内保留旧 localStorage 数据且不主动清理。现行 key/schemaVersion 键表见 `docs/reference/03-architecture.md`。
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
| React 交互 | 对应组件测试；涉及 App 编排时加 `src/App.test.tsx`；随后 typecheck |
| CSS/响应式 | 相关组件测试 + typecheck；批次稳定后由浏览器回归入口完成生产 build 与尺寸检查 |
| paldb parser/schema | `pipeline/data/paldb.test.ts` + typecheck |
| 数据 build/validate | 对应数据测试 + `data:build` + `data:validate` |
| Electron/打包 | 前述相关测试 + `verify:electron`，通过后才进入 `package:exe` |

Vitest 可用 `npm.cmd test -- <file>` 定点执行。避免在实现过程中反复跑完整 jsdom 测试集；冷启动可能明显慢于单文件。

### UI 源码弱校验

- 对 React UI、CSS、响应式或可访问性改动，在相关定点测试前使用已安装的 `web-design-guidelines` skill 审计本次改动涉及的文件；只传入明确的文件或 pattern，不对全仓库反复审计。
- 该 skill 只做源码级预检，用于尽早发现语义、焦点、动画、文本溢出和图片尺寸等高置信问题。修复与当前任务相关的明确缺陷；与本地 Electron 离线边界、现有产品需求冲突或不适用的建议，记录原因后可不处理。
- 此项为弱校验：不适用于非 UI 改动，发现项不要求清零，也不替代相关组件测试、生产 build 或本节及第 6 节要求的 Playwright 真实浏览器回归。

### UI 反馈批次

- 同一轮用户给出的视觉、间距、文案或按钮细节，应先合并成一个实现批次；批次内仅按需要运行对应组件测试与 typecheck，确认后再运行一次完整交付门。
- 不要为每个 CSS 小改重复运行 `data:validate`、完整测试或 build；也不要在下一轮用户反馈到来前提前启动第二次验证。
- 同一轮需要浏览器回归的多个细节复用同一个受管 Vite 服务和命名 Playwright session；在所有尺寸与交互断言完成后统一关闭。

### 交付门

- 普通迭代默认先用 `npm.cmd run test:plan` 查看依赖消费者与选择理由，再执行 `npm.cmd run test:changes`；交付用 `npm.cmd run test:changes -- --delivery` 增加受影响的生产构建、浏览器场景、CLI 或 Electron smoke。共享配置、共享运行时契约、未知文件或无法解析的依赖会扩大范围；不能手工删掉保守回退选中的消费者。显式 `--files` 只用于已核对完整范围的定点复验，不能代替工作区变更调查。
- 不再要求每次普通交付机械运行完整测试；正式发布或明确要求完整校验仍运行全部。验证后输入未变的已通过步骤不重复；修复后先重跑失败项及受影响项。浏览器和桌面回归均被选中时由 `verify` 共用构建并依次执行，不互相替代；构建复用边界见快捷命令文档。
- 仅文档改动：不要求全套代码测试，但必须检查文档链接、diff whitespace 和状态。
- Wiki 结构、frontmatter 或文档校验器改动：先运行文档 lint 单元测试和 `npm.cmd run docs:lint`，再按是否涉及可执行代码决定后续交付门。
- Schema 版本变化：更新以下所有位置后再跑完整交付门：
  - 数据版本常量与原始/公共 zod Schema；
  - `src/domain/types.ts` 边界类型；
  - 所有生成 payload、manifest、紧凑 breeding index；
  - UI 版本标签、测试 fixture；
  - Electron 打包 smoke 断言；
  - 当前架构/数据文档。
- 正式发布或用户明确要求 EXE：定点测试及必要的浏览器/源码 smoke 后运行 `package:exe`，由其串行完成完整测试 → 数据校验/typecheck/Web build → package → 打包应用 smoke；不在其前机械重复独立的完整测试与 build。记录 EXE 精确文件名、字节数和 SHA-256。

不要重复做高成本步骤：样式修正后无需重新抓 299 个页面；公共 JSON 未变化时无需重跑数据同步；只有发布门才打包。

### 长任务完成后的文档收尾（必须）

- “长任务”包括跨多个实现步骤或模块的改动，以及涉及数据流水线、Schema、架构边界、发布/打包、真实浏览器回归或多阶段验证的任务。
- 长任务在最终交付和提交前必须检查 `docs/README.md`、README 及直接相关的当前文档，并更新已经发生变化的行为、接口/Schema、操作命令、验证结果、已知限制和后续事项；不得只在聊天或提交信息中留下这些信息。
- 优先修订、合并既有文档，不要机械地为每个任务新建总结文档。进行中任务记录先放 `docs/tasks/`；完成后的长期结论并入 `docs/reference/`，只剩历史查阅价值的计划、过程记录和发布记录移入 `docs/archive/`，同时维护文档索引。
- 即使代码行为没有改变，长时间验证、打包或发布任务也要把可复用的结论、产物信息和异常处理经验写回对应文档。若审查后确实没有任何持久信息需要更新，最终交付中必须明确记录“已完成文档审查，无需更新”及原因。
- 文档收尾完成后再执行适合文档改动的链接/路径检查和 `git diff --check`；不要仅因文字更新重复运行无关的全量数据同步或 EXE 打包。

### Agent 操作日志

- 多阶段编码任务在 `output/agent-runs/YYYY-MM-DD.jsonl` 记录 `investigate`、`plan`、`implement`、`verify`、`docs`、`commit` 的开始与结束/结果；只记录阶段边界、失败和高成本操作，不为每次检索或读取文件写日志。
- 用 `npm.cmd run agent:log -- --task <任务> --phase <阶段> --event <start|pause|resume|done|pass|fail|skip>` 追加记录。等待时 `pause --wait-kind <tool|user|approval|service|interruption>`，恢复时 `resume`；高成本命令用匹配的 `--step`，恢复时带 `--result pass|fail|skip`，重试用 `--attempt`。独立命令也可用带 `--step` 的 start/pass/fail，且不改变父阶段。关键命令和影响文件可重复使用 `--command`、`--file`。
- `start` 必须在阶段实际开始时记录；漏记时用 `--note` 标明耗时未知，不事后连续补 start/done 制造伪耗时。只有存在可靠计时证据时才覆盖耗时；审查、等待、环境失败和返工写入现有阶段的 `--note`，不要传入脚本不支持的新 phase。并行或父子阶段可能重叠，不能相加，也不能把整个 verify 阶段当成测试命令耗时。
- 日志只记录摘要，严禁写入密钥、令牌、完整用户内容、环境变量值或大段命令输出；`output/` 已被 Git 忽略，不提交常规运行日志。正式发布或需要长期保留的结论仍写入对应文档。
- 收尾运行 `npm.cmd run agent:report -- --task <任务>` 检查未闭合阶段、命令、失败重试与可信度。活跃时间按区间并集计算，不能累加并行阶段；命令耗时可用可靠计时结果 `--duration-sec` 覆盖，等待区间仍按真实时间戳保留。旧日志只能提供较粗的估计，未记录等待的活跃时间不等于模型纯处理时间。

## 6. 浏览器回归

响应式、弹窗、滚动、素材或主要交互变化必须使用 Playwright 真实浏览器检查：

- 使用受管本地服务和命名 Playwright session；截图仅放 `output/playwright/`。
- 第一次使用 CLI 前，把 npm 临时包缓存和浏览器安装路径固定在仓库忽略目录 `.npm-cache/` 与 `.playwright-browsers/`；安装 Chromium 一次后复用，不要让每个任务重新下载或写入受限的用户目录。具体 PowerShell 命令见 `docs/reference/06-powershell-guide.md`。
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
- 覆盖消费新数据的主流程：图鉴筛选/排序、详情技能滚动和正反向配种，而不是只打开首页。
- HMR 写样式时可能短暂出现资源 `ERR_CONNECTION_RESET` 或黑帧；先确认服务 readiness、等待页面稳定并重新 snapshot，再判断是否是代码错误。不要把一次过渡截图当成最终验收。
- 检查结束必须关闭 Playwright session，终止受管服务，并确认端口和 URL 都已失活。

## 7. Windows 与 PowerShell 坑点

完整清单与命令示例见 `docs/reference/06-powershell-guide.md`。不可妥协项：
- PowerShell 5.1 不保证按 UTF-8 解码无 BOM 的 `.ps1`：脚本消息/异常优先 ASCII，或明确保存 UTF-8 BOM。
- `package.json` 调用的打包脚本必须以实际入口 `powershell.exe` 验证；PowerShell 7 能解析不代表其能解析。
- 长命令不用超大单次 timeout 猜测状态：让执行返回 cell，短 wait 查看增量输出；确认在推进后继续等待。

## 8. 共享工作区、清理与 Git

- 现有 modified/untracked 文件都视为用户工作。编辑已修改文件前先读相关 diff；不重置、不丢弃、不顺手格式化无关文件。
- 改动只覆盖当前问题。遇到重叠无法安全合并时停止并说明。
- 可重建中间产物包括 `build/`、`output/`、`.playwright-cli/`、`.npm-cache/`、`*.tsbuildinfo`；清理前仍需验证绝对路径。
- 删除文档前先查 `docs/README.md`，保留仍有用的需求、架构、合规、路线图和后续阶段说明。
- 锁定日志/残留进程定位与终止方法见 `docs/reference/06-powershell-guide.md`；只终止已验证 PID，禁止按进程名批量杀 `node`。

提交前：

1. `git status --short`，区分本次工作和用户已有工作。
2. 检查相关 `git diff`，只 stage 明确路径；工作区混杂时禁止 `git add .`。
3. `git diff --cached --check`。
4. 提交后用 `git status --short` 和 `git show --stat --oneline HEAD` 核验。
5. 若仅因签名密钥不可用导致提交失败，可单次使用 `git -c commit.gpgsign=false commit ...`；不得全局关闭签名。

当一个较大的任务完成、相关验证通过且改动范围已确认后，应自动创建一次 Git commit。提交只包含本次任务的明确改动；除非用户另行要求，不自动 push 或发布 Release。

发布时保持 package version、tag、产物文件名、Release 标题和说明一致。推送后验证远端 branch/tag；发布后确认 Release 非 draft/prerelease，所有资产为 uploaded，远端大小与本地 SHA-256 一致。
