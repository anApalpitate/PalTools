---
schema_version: 1
id: roadmap
title: 实施路线图
summary: 汇总已经完成的产品阶段、当前待办入口和长期不做事项。
type: reference
status: current
authority: canonical
domains: [product, paldex, breeding, data, cli, desktop]
topics: [requirements, release]
platforms: [shared, web, electron, windows, node]
source_of_truth: [README.md, docs/archive/README.md, package.json]
related: [product-requirements, tasks-backlog]
---

# 实施路线图

## 阶段 0：环境与需求（已完成）

React、TypeScript、Vite、Vitest、离线静态数据和基础文档。

## 阶段 1：图鉴与完整配种矩阵（已完成）

299 个 paldb 页面、本地帕鲁图、44,851 条固定正式版配方、双亲查询与 Electron 一键打包。

## 阶段 2：图鉴详细数值与展示（已完成）

本地属性图标、伙伴技能说明、详细战斗、生产和移动数值、数值筛选、图形配种公式和模块化离线爬虫。

## 阶段 3：反向配种与内容增强（已完成）

Schema v4 紧凑正反向索引、目标子代反查、分页和全结果搜索，以及主动技能、固有被动、掉落物和本地图标均已交付。同期曾实现自动路径规划，后来由手工配种图替代。

## 阶段 4：手工配种图（历史完成，现已退场）

2026-08-10 按 REQ-002 移除可编辑配种图及其数据、导入导出与 CLI 支持；应用只删除旧数据库，不迁移旧方案。双亲查子代、目标反查和 Schema v4 静态索引继续保留。过程见[历史需求](../archive/2026-08-01-breeding-slot-tree-requirements.md)与[历史逻辑](../archive/2026-08-01-layered-slot-graph-logic.md)。

REQ-001 获取难度评价系统已取消，不再实施。

## 阶段 5：自动配种方案网（已完成）

REQ-003 已交付配方背包、方案、DAG 约束、文本步骤、图形网、规范化 IndexedDB 与工作区导入导出。当前行为见[产品需求](01-product-requirements.md)、[架构说明](03-architecture.md)和[客户端状态决策](../decisions/0002-versioned-client-state.md)；交付验证与产物快照见[历史记录](../archive/07-completed-requirements-and-verification.md)。

## 当前阶段

当前没有已确认的产品开发需求。新增能力先进入 Todolist 并完成需求确认，再写入实施路线图。

其后候选方向包括栖息地、掉落来源反查、主动技能反查、只读存档导入和被动继承规划；未进入待办前不视为承诺。

## 长期不做

存档修改、账号系统、云同步、广告、默认遥测和未经确认的素材公开再分发。
