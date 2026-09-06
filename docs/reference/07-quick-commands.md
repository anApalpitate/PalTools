---
schema_version: 1
id: quick-commands
title: 快捷命令
summary: 将常用自然语言请求映射到受仓库规则约束的实现、验证、Git 和发布操作。
type: reference
status: current
authority: canonical
domains: [tooling, desktop, data, cli]
topics: [operations, testing, packaging, release]
platforms: [shared, windows, mac, node, electron]
source_of_truth: [AGENTS.md, package.json, script]
related: [powershell-guide, release-workflow, data-pipeline, docs-home]
---

# 快捷命令（提示词 → 对应操作）

本文约定与 PalTools 仓库协作时常用的自然语言提示词。它们是沟通缩写，不是新的脚本命令；实际执行仍受 `AGENTS.md`、`package.json` 和仓库安全边界约束。

## 使用规则

- 提示词按语义匹配，不要求逐字一致；方括号表示需要替换的内容。
- `仅`、`不要`、`无需` 等限定词优先于默认流程，例如“仅制定计划，不修改代码”。
- 多个动作可用“并”组合，按从左到右的依赖顺序执行，例如“修复 BUG，并构建、更新 EXE”。
- 后续明确指令覆盖前面的快捷表达，但不会自动扩大到推送、创建标签或发布 GitHub Release。
- “无需过问”表示可在既定范围内采用合理默认值，不代表允许删除用户数据、覆盖无关改动或执行未明确要求的外部发布。

## 状态、清单与计划

| 提示词 | 对应操作 |
| --- | --- |
| `查看当前状态` | 读取当前分支、工作区改动和最近提交；只报告，不修改文件。 |
| `查看 BUG 清单和需求清单` | 读取当前 backlog，合并同类项并优先列出未完成 BUG；默认只报告。 |
| `制定 [事项] 计划` | 调查相关代码和文档，给出可执行步骤、依赖、风险与验收方式；默认不实施。 |
| `检查计划可行性` | 对照当前代码、数据和脚本验证计划中的假设，指出冲突、遗漏和更简单的实现。 |
| `审查当前改动` | 检查工作区 diff，优先报告正确性、回归、安全和测试缺口；不自动修复。 |
| `查看 agent 操作日志` | 读取 `output/agent-runs/` 当日 JSONL，按任务、阶段、结果和耗时汇总；默认不修改日志。 |

## 实现与修复

| 提示词 | 对应操作 |
| --- | --- |
| `修复 [BUG]` | 先复现或建立可重复断言，再做最小修复，执行相关定点测试；若属于较大改动，再完成完整交付门和文档收尾。 |
| `修复清单中现有 BUG` | 读取未完成 BUG，按优先级逐项修复；不自动实施标记为需求的新增功能。 |
| `按照计划执行` | 以最近明确确认的计划为边界实施、分层验证并更新相关文档；不重新扩展范围。 |
| `执行阶段 [N]` | 读取对应任务或需求文档，仅实施该阶段及其必要前置，不提前实现后续阶段。 |
| `更新文档` | 修改当前行为直接对应的参考文档和索引，运行 `npm.cmd run docs:lint` 和 diff whitespace 检查。 |

## 验证与构建

| 提示词 | 对应操作 |
| --- | --- |
| `快速校验` | 按改动类型运行最相关的定点测试，并执行 TypeScript 检查；不打包 EXE。 |
| `完整校验` | 执行 `npm.cmd test` + `npm.cmd run build`；build 已包含数据校验与 TypeScript，不另行重复。需要浏览器或桌面回归时按下方覆盖表选择入口。 |
| `校验 Node 脚本` | 执行 `npm.cmd run typecheck` 检查 `pipeline/data/`、`script/` 等目录中的 TypeScript；再执行 `npm.cmd run check:node-scripts` 对当前关键 CJS/MJS 入口逐个运行 `node --check`。语法检查不替代相关单测或 Electron smoke。 |
| `校验文档` | 先运行 `npm.cmd run docs:lint:test`，再运行 `npm.cmd run docs:lint`；不执行 Web 构建或数据同步。 |
| `校验数据` | 执行 `npm.cmd run data:validate`；不抓取或重建来源数据。 |
| `生成配种方案测试样例` | 执行 `npm.cmd run samples:breeding-workspaces`，从当前 manifest 和紧凑配种索引确定性生成 4 个可导入工作区及说明；输出仅写入被 Git 忽略的 `.tmp/breeding-workspace-samples/`，并完成 Schema、引用、DAG、有效关系和拓扑指标校验。 |
| `更新数据` | 执行完整联网数据同步 `npm.cmd run data:sync`，包括抓取、导入、生成和校验；这是高成本操作，只在明确要求时执行。 |
| `build` / `构建` | 执行 `npm.cmd run build`，产物写入 `build/web/`；不生成 EXE。 |
| `浏览器回归` | 执行 `npm.cmd run test:browser`；命令会构建 production 资源、复用仓库内 Chromium、启动命名 Playwright CLI 会话与受管 preview，覆盖四档视口、七主题、离线查询、弹窗/抽屉和 Worker 图形网，并在成功或失败后关闭会话与端口。截图与结果写入被忽略的 `output/playwright/browser-regression/`。 |
| `校验模型协议共用产物` | 执行 `npm.cmd run test:electron-provider-protocol`，生成经过依赖边界检查的桌面 CJS，并用固定数据核对 OpenAI Responses、OpenAI Chat、Anthropic Messages 与 Gemini 四种协议；不访问真实厂商。 |
| `桌面 smoke 预检` | 执行 `npm.cmd run verify:electron`，构建 Web 并以源码 Electron 入口运行隐藏 smoke；不打包 EXE。 |
| `构建 CLI` | 执行 `npm.cmd run cli:build`，生成 `build/cli/paltools.mjs`，并至少检查 `--version` 或目标命令。 |
| `记录 agent 阶段` | 用 `npm.cmd run agent:log -- --task <任务> --phase <阶段> --event <结果>` 追加一条阶段摘要；结束事件自动计算耗时，可用 `--duration-sec` 覆盖，且不记录密钥或完整输出。 |

### 验证覆盖与选择

先完成实现、定点测试与集成审查，再选择覆盖当前改动的交付入口。下表描述现有脚本，不是要求从上到下全部运行；命令均通过 `npm.cmd run <名称>` 调用，完整 Vitest 使用 `npm.cmd test`。

| 入口 | 已包含 | 不替代 |
| --- | --- | --- |
| `build` | `package.json` 声明的契约测试、`data:validate`、`tsc -b`、Vite 生产构建 | 完整 Vitest、浏览器回归、Electron smoke |
| `test:browser` | 完整 build、真实浏览器回归、受管服务与会话清理 | 完整 Vitest、Electron smoke；标准脚本未覆盖的新交互仍需专项断言 |
| `verify:electron` | 完整 build、源码 Electron 隐藏 smoke | 完整 Vitest、浏览器回归、真实打包应用 smoke |
| `package:exe` | 完整 Vitest、完整 build、electron-builder、真实打包应用 smoke | 必要的浏览器回归，以及 Electron 导航/协议消费/smoke 改动所需的源码预检 |

- 普通 Web：`npm.cmd test` + `npm.cmd run build`。需要标准浏览器回归时，把后者换为 `npm.cmd run test:browser`；只需源码 Electron smoke 时换为 `npm.cmd run verify:electron`。
- 同时涉及浏览器与桌面边界时，两类回归都必须执行。当前入口各自重建 Web，尚无输入指纹校验或跳过构建选项；不要猜测 `--skip-build`、手工绕过入口，或以旧 `build/web/` 的存在判定已验证。
- EXE 交付由 `package:exe` 统一执行其已包含的门，不在最终打包前机械重跑独立的完整测试、typecheck、数据校验和 build。为尽早定位失败运行的定点检查，以及必要的浏览器/源码 smoke 仍保留。
- 代码、配置、依赖或数据在验证后变化，应重跑受影响的验证；文档文字变化只补文档检查。同一输入已有明确成功记录时，不因交付清单中再次出现该步骤就重跑。共享工作区需核对未提交改动，不能仅凭 HEAD 相同复用结果。
- 一次交付由一个协调者统一安排全量门；不得并发执行会清理或写入同一 `build/` 产物的命令。只有任务已允许并行协作时，才划分文件/接口责任并分别运行定点检查；本文不自动授权启动其他 agent。

### 执行记录与失败定位

- 命令结果保留退出码、耗时、通过/失败摘要与日志路径；完整输出按需保留在忽略目录，避免将整份脚本或超长日志反复送入上下文。失败时读取对应片段，不隐去错误或把输出截断当成成功。
- 区分断言失败、测试夹具/就绪问题和工具环境失败。先检查实际错误与服务 readiness，再在最小层复现；不因命令引号、超时或环境限制反复重跑整套门，也不降低权限或安全边界来换取通过。
- 日志阶段及真实计时要求见 `AGENTS.md`。现有 `agent:log` 只记录手动阶段边界，不自动计时命令，也不能分离模型处理、等待与返工耗时；报告时注明缺失与重叠，不把粗粒度日志转成精确占比。

## EXE 与本地发布产物

| 提示词 | 对应操作 |
| --- | --- |
| `打包 EXE` | 执行正式发布门 `npm.cmd run package:exe`；必须以 Web 构建、electron-builder 和真实打包应用 smoke 全部零退出码为成功。 |
| `打包 macOS DMG` | 在 Apple Silicon Mac 上执行 `npm run package:mac`；需要已恢复 `data/raw/` 快照与 `public/generated/` 素材。该门以单 worker 运行完整测试，避免 CPU 密集型图布局的并行调度波动；随后还必须通过 Web 构建、electron-builder 和真实打包应用 smoke。产物为未签名、未公证的本地开发 DMG。 |
| `更新本地 release 目录的 EXE` | 重新执行 `package:exe`，用当前源码替换 `build/release/` 中同版本便携 EXE，并报告精确文件名、字节数和 SHA-256；不推送、不创建远程 Release。 |
| `修复并更新 EXE` | 完成修复、定点测试、集成审查及必要的浏览器/源码 smoke 后执行 `package:exe`，由它完成剩余完整交付门；不会用旧 Web 构建直接覆盖 EXE。 |
| `检查 EXE` | 读取本地产物信息并复核文件名、版本、大小、SHA-256 和可用的 smoke 记录；默认不重新打包。 |

## Git 与远程发布

| 提示词 | 对应操作 |
| --- | --- |
| `提交当前改动` | 检查 diff，只暂存本次任务明确涉及的文件，运行 `git diff --cached --check` 后创建一个本地提交；不推送。 |
| `提交并推送` | 完成本地提交后推送当前分支，并核验远端分支；不自动创建标签或 Release。 |
| `推送当前分支` | 推送当前分支已有提交，不改写历史，不创建 PR、标签或 Release。 |
| `发布版本` | 按[正式发布工作流](08-release-workflow.md)对齐版本、分支、标签、平台资产和发布说明，完成各平台发布门后创建并核验远程 Release；版本或平台目标不明确时必须先确认。 |
| `不提交` / `不推送` / `不打包` | 明确禁止对应动作，即使它通常属于完整流程。 |

## 常用组合示例

| 提示词 | 实际流程 |
| --- | --- |
| `修复清单中现有 BUG，完整校验，不打包` | 修复 BUG → 定点测试 → 集成审查 → `npm.cmd test` + `npm.cmd run build`（需要回归时按覆盖表替换 build）→ 文档收尾；不执行 `package:exe`。 |
| `执行阶段 2，提交当前改动` | 只实施阶段 2 → 分层验证 → 更新相关文档 → 选择性暂存并本地提交。 |
| `更新本地 release 目录的 EXE` | 确认工作区和当前提交 → 执行 `package:exe` → smoke → 记录 EXE 大小与 SHA-256；不推送。 |
| `修改 Electron smoke，并打包 EXE` | 定点测试 → `verify:electron` 快速预检 → `package:exe` 真实打包应用 smoke；不重复单独执行 `data:validate`。 |
| `运行标准浏览器回归` | 执行 `npm.cmd run test:browser` → 核对命令零退出码与 `output/playwright/browser-regression/result.txt` → 确认命令已关闭 session、终止服务并验证端口失活。 |
| `生成额外配种方案测试样例` | 运行样例生成器 → 按 `.tmp/breeding-workspace-samples/README.md` 依次导入 4 个样例 → 对标准浏览器回归未覆盖的深链、分支汇合、多分量和大型折叠方案做专项检查 → 关闭 session、终止服务并确认端口失活。 |
| `查看需求清单，仅制定下一阶段计划` | 读取 backlog 和相关参考文档 → 合并同类项 → 输出计划；不修改代码或文档。 |

## 相关入口

- 仓库执行约束：[`../../AGENTS.md`](../../AGENTS.md)
- 可用 npm 命令：[`../../package.json`](../../package.json)
- PowerShell 与受管服务：[`06-powershell-guide.md`](06-powershell-guide.md)
- 版本、双平台打包与远程发布：[`08-release-workflow.md`](08-release-workflow.md)
- 数据同步与校验：[`05-data-pipeline.md`](05-data-pipeline.md)
