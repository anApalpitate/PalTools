---
schema_version: 1
id: tasks-index
title: 临时任务文档
summary: 索引仍在进行的计划、阻塞和未完成需求，完成后必须提升并归档。
type: index
status: current
authority: supporting
domains: [product, tooling]
topics: [requirements, operations]
platforms: [shared]
source_of_truth: [docs/_meta/wiki-contract.md, docs/reference/04-roadmap.md]
related: [docs-home, tasks-backlog, reference-index]
---

# 临时任务文档

本目录只保存进行中的任务。任务页可以描述目标、范围、验证结果、待办和阻塞，但不能覆盖 [`reference/`](../reference/README.md) 或 [`decisions/`](../decisions/README.md) 中的当前知识。

规则：

- 文件名使用 `YYYY-MM-DD-<任务名>.md` 或稳定的任务清单名称。
- 任务完成并通过验证后，将可复用结论提升到参考或决策页，原始过程移入 [`archive/`](../archive/README.md)。
- agent 默认只读当前任务对应文件，不把其他任务记录当作当前事实。

## 当前任务

| 页面 | 状态 |
| --- | --- |
| [PalTools Todolist](todolist.md) | 当前仅剩的未完成问题、需求变更与实施顺序 |
