---
schema_version: 1
id: tasks-backlog
title: PalTools Todolist
summary: 仅保存尚未完成的产品问题和需求，不承担已实现行为的权威说明。
type: task
status: current
authority: supporting
domains: [product]
topics: [requirements]
platforms: [shared]
source_of_truth: [docs/reference/01-product-requirements.md, docs/reference/04-roadmap.md]
related: [tasks-index, roadmap]
---

# PalTools Todolist

## 当前待办

| 编号 | 类型 | 优先级 | 项目 | 下一步 |
| --- | --- | --- | --- | --- |
| REQ-003 | 功能需求 | 高 | 用户从查询结果中收集配方，系统自动构建配种方案网 | 完成[简要需求说明](2026-08-09-breeding-solution-network-requirements.md)中的待确认决策后细化验收与数据模型 |

REQ-001 已取消，不再实施。REQ-002 已完成：旧手工配种图及其方案数据、导入导出和 CLI 校验能力均已移除，应用启动时直接删除旧版配种图数据库。REQ-003 尚未实现，不得提前写入 canonical 页面。
