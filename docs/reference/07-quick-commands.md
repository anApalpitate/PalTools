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
related: [powershell-guide, data-pipeline, docs-home]
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
| `完整校验` | 依次执行完整测试、TypeScript、数据校验和 Web 生产构建。 |
| `校验文档` | 先运行 `npm.cmd run docs:lint:test`，再运行 `npm.cmd run docs:lint`；不执行 Web 构建或数据同步。 |
| `校验数据` | 执行 `npm.cmd run data:validate`；不抓取或重建来源数据。 |
| `生成配种方案测试样例` | 执行 `npm.cmd run samples:breeding-workspaces`，从当前 manifest 和紧凑配种索引确定性生成 4 个可导入工作区及说明；输出仅写入被 Git 忽略的 `.tmp/breeding-workspace-samples/`，并完成 Schema、引用、DAG、有效关系和拓扑指标校验。 |
| `更新数据` | 执行完整联网数据同步 `npm.cmd run data:sync`，包括抓取、导入、生成和校验；这是高成本操作，只在明确要求时执行。 |
| `build` / `构建` | 执行 `npm.cmd run build`，产物写入 `build/web/`；不生成 EXE。 |
| `浏览器回归` | 使用受管预览服务和 Playwright 覆盖规定视口与关键流程，检查几何、溢出、破图、控制台和第三方请求，结束后关闭会话与端口。 |
| `构建 CLI` | 执行 `npm.cmd run cli:build`，生成 `build/cli/paltools.mjs`，并至少检查 `--version` 或目标命令。 |

## EXE 与本地发布产物

| 提示词 | 对应操作 |
| --- | --- |
| `打包 EXE` | 执行正式发布门 `npm.cmd run package:exe`；必须以 Web 构建、electron-builder 和真实打包应用 smoke 全部零退出码为成功。 |
| `打包 macOS DMG` | 在 Apple Silicon Mac 上执行 `npm run package:mac`；需要已恢复 `data/raw/` 快照与 `public/generated/` 素材。该门以单 worker 运行完整测试，避免 CPU 密集型图布局的并行调度波动；随后还必须通过 Web 构建、electron-builder 和真实打包应用 smoke。产物为未签名、未公证的本地开发 DMG。 |
| `更新本地 release 目录的 EXE` | 重新执行 `package:exe`，用当前源码替换 `build/release/` 中同版本便携 EXE，并报告精确文件名、字节数和 SHA-256；不推送、不创建远程 Release。 |
| `修复并更新 EXE` | 完成修复和代码交付门后再执行 `package:exe`；不会用旧 Web 构建直接覆盖 EXE。 |
| `检查 EXE` | 读取本地产物信息并复核文件名、版本、大小、SHA-256 和可用的 smoke 记录；默认不重新打包。 |

## Git 与远程发布

| 提示词 | 对应操作 |
| --- | --- |
| `提交当前改动` | 检查 diff，只暂存本次任务明确涉及的文件，运行 `git diff --cached --check` 后创建一个本地提交；不推送。 |
| `提交并推送` | 完成本地提交后推送当前分支，并核验远端分支；不自动创建标签或 Release。 |
| `推送当前分支` | 推送当前分支已有提交，不改写历史，不创建 PR、标签或 Release。 |
| `发布版本` | 对齐 `package.json` 版本、标签、EXE 文件名和发布说明，完成发布门后创建并核验远程 Release；版本或目标不明确时必须先确认。 |
| `不提交` / `不推送` / `不打包` | 明确禁止对应动作，即使它通常属于完整流程。 |

## 常用组合示例

| 提示词 | 实际流程 |
| --- | --- |
| `修复清单中现有 BUG，完整校验，不打包` | 修复 BUG → 定点测试 → 完整测试/typecheck/data validate/Web build → 文档收尾；不执行 `package:exe`。 |
| `执行阶段 2，提交当前改动` | 只实施阶段 2 → 分层验证 → 更新相关文档 → 选择性暂存并本地提交。 |
| `更新本地 release 目录的 EXE` | 确认工作区和当前提交 → 执行 `package:exe` → smoke → 记录 EXE 大小与 SHA-256；不推送。 |
| `生成配种方案测试样例并浏览器回归` | 运行样例生成器 → 按 `.tmp/breeding-workspace-samples/README.md` 依次导入 4 个样例 → 在同一受管服务与 Playwright session 中检查深链、分支汇合、多分量和大型折叠方案 → 关闭 session、终止服务并确认端口失活。 |
| `查看需求清单，仅制定下一阶段计划` | 读取 backlog 和相关参考文档 → 合并同类项 → 输出计划；不修改代码或文档。 |

## 相关入口

- 仓库执行约束：[`../../AGENTS.md`](../../AGENTS.md)
- 可用 npm 命令：[`../../package.json`](../../package.json)
- PowerShell 与受管服务：[`06-powershell-guide.md`](06-powershell-guide.md)
- 数据同步与校验：[`05-data-pipeline.md`](05-data-pipeline.md)
