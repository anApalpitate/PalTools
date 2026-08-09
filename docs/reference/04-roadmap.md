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

2026-08-01 曾完成可编辑分层槽位配种图、方案自动保存、导入导出、撤销重做、会话配方标记、HTML/SVG 视口和图标工具栏。完整过程保存在历史归档中。

2026-08-10 按 REQ-002 完整移除上述功能：

- 删除 Web 入口、画布、编辑器、布局、快捷键、专用样式和测试；
- 删除方案 Schema、IndexedDB 仓储、导入导出与 CLI 方案校验；
- 删除查询卡片的会话标记；
- 不迁移旧数据，应用启动时直接请求删除旧配种图数据库；
- 保留双亲查子代、目标子代反查和 Schema v4 静态配方索引。

REQ-001 获取难度评价系统已取消，不再实施。

## 当前阶段：自动配种方案网（待确认）

唯一当前产品待办为 REQ-003：用户从正向或反向查询结果中收集精确配方，系统由关系集合自动构建高可见方案网和等价文本步骤。该功能尚未实现，范围和验收以 [配种方案网简要需求](../tasks/2026-08-09-breeding-solution-network-requirements.md) 为准。

其后候选方向包括栖息地、掉落来源反查、主动技能反查、只读存档导入和被动继承规划；未进入待办前不视为承诺。

## 长期不做

存档修改、账号系统、云同步、广告、默认遥测和未经确认的素材公开再分发。
