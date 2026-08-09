---
schema_version: 1
id: docs-home
title: PalTools 文档索引
summary: 按任务意图把 agent 路由到最小必要的参考、决策、任务或历史页面。
type: index
status: current
authority: canonical
domains: [tooling, product]
topics: [architecture, requirements, operations]
platforms: [shared]
source_of_truth: [AGENTS.md, package.json, docs/_meta/wiki-schema.json]
related: [wiki-contract, reference-index, decisions-index, tasks-index]
---

# PalTools 文档索引

PalTools 文档采用轻量 LLM Wiki：源码、测试、配置和 manifest 是事实来源；[`reference/`](reference/README.md) 与 [`decisions/`](decisions/README.md) 保存经过验证的长期知识；[`tasks/`](tasks/README.md) 只保存进行中事项；[`archive/`](archive/README.md) 保留历史过程。维护规则见 [LLM Wiki 维护契约](_meta/wiki-contract.md)，受控字段与标签见 [`wiki-schema.json`](_meta/wiki-schema.json)。

## 按任务选择入口

| 任务意图 | 首选页面 | 需要时继续读 |
| --- | --- | --- |
| 产品范围、图鉴、配种查询 | [产品需求](reference/01-product-requirements.md) | [路线图](reference/04-roadmap.md) |
| 正向与反向配种查询 | [产品需求](reference/01-product-requirements.md) | [架构说明](reference/03-architecture.md) |
| 尚未实现的自动方案网 | [配种方案网需求](tasks/2026-08-10-breeding-solution-network-requirements.md) | [Todolist](tasks/todolist.md) |
| 数据来源、Schema 或抓取合规 | [数据来源与合规](reference/02-data-and-compliance.md) | [数据管线](reference/05-data-pipeline.md) |
| CLI、Web 或 Electron 架构 | [架构说明](reference/03-architecture.md) | [架构决策](decisions/README.md) |
| Windows 命令、服务或打包 | [PowerShell 指南](reference/06-powershell-guide.md) | [快捷命令](reference/07-quick-commands.md) |
| 未完成需求 | [Todolist](tasks/todolist.md) | [任务索引](tasks/README.md) |
| 追溯旧方案或发布记录 | [历史索引](archive/README.md) | 只读目标归档文件 |

## 知识层入口

- [核心参考索引](reference/README.md)：当前产品、架构、数据和操作规则。
- [架构决策索引](decisions/README.md)：需要保留背景与后果的高影响决定。
- [任务索引](tasks/README.md)：当前计划、阻塞和未完成事项。
- [历史索引](archive/README.md)：已完成或被替代的过程材料，不作为当前事实。

## 当前明确不做

账号与云同步、存档修改、个体数量、蛋糕/孵化成本、被动继承概率推演、运行时遥测和默认联网更新。
