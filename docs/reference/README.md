---
schema_version: 1
id: reference-index
title: 核心参考文档
summary: 汇总 PalTools 当前稳定行为与长期工程规则，是 agent 的默认知识入口。
type: index
status: current
authority: canonical
domains: [product, paldex, breeding, data, cli, desktop, tooling]
topics: [requirements, architecture, interaction, storage, schema, pipeline, compliance, testing, operations]
platforms: [shared, web, electron, windows, node]
source_of_truth: [AGENTS.md, docs/_meta/wiki-contract.md, docs/_meta/wiki-schema.json]
related: [docs-home, decisions-index, tasks-index]
---

# 核心参考文档

本目录只保存已经由实现、测试、配置或 manifest 支撑的当前知识。页面中的 `source_of_truth` 指向事实入口；发生冲突时以这些来源为准。

| 页面 | 何时读取 |
| --- | --- |
| [产品需求](01-product-requirements.md) | 判断产品范围、用户行为、非功能要求和明确边界 |
| [数据来源与合规](02-data-and-compliance.md) | 修改来源、Schema、素材、抓取或分发规则 |
| [架构说明](03-architecture.md) | 理解模块边界、状态生命周期、CLI、Web 和 Electron |
| [实施路线图](04-roadmap.md) | 判断阶段状态、候选方向和长期不做事项 |
| [数据管线与命令](05-data-pipeline.md) | 同步、解析、构建、校验或使用离线 CLI 数据 |
| [PowerShell 指南](06-powershell-guide.md) | 编写 Windows 命令、管理服务和排查进程 |
| [快捷命令](07-quick-commands.md) | 将自然语言请求映射到仓库操作和验证边界 |
| [配种图领域模型](08-breeding-graph-domain.md) | 修改分层槽位、fork、关系、不变量、删除或持久化 |
| [配种图交互](09-breeding-graph-interaction.md) | 修改布局、画布模式、拖放、快捷键、侧栏或验收 |

新事实按 [Wiki 维护契约](../_meta/wiki-contract.md) 摄取和提升。任务计划留在 [`tasks/`](../tasks/README.md)，高影响决定见 [`decisions/`](../decisions/README.md)，历史过程进入 [`archive/`](../archive/README.md)。
