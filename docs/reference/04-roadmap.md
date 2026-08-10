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

## 阶段 5：自动配种方案网（已完成）

REQ-003 已交付配方背包、默认与自定义方案、DAG 循环约束、失效关系保留、稳定文本步骤、无序亲本 React Flow/ELK Worker 图形网、虚拟化关系列表、规范化 IndexedDB 与完整工作区导入导出。查询入口、方案页和桌面 smoke 共用同一 `recipeIndex` 身份边界；旧手工配种图数据库仍只删除、不迁移。

2026-08-10 桌面交付复核已通过完整测试、数据校验、类型检查、文档 lint、生产构建、四个桌面视口、七套主题和打包应用 smoke。便携版产物为 `PalTools-0.1.0-win-x64.exe`（88,369,403 字节，SHA-256 `B3C1AAC36C4A2BE2087E716120D0DE165EE1A59E59C69E96B2E4C314A0B27DBF`）。

## 当前阶段

当前没有已确认的产品开发需求。新增能力先进入 Todolist 并完成需求确认，再写入实施路线图。

其后候选方向包括栖息地、掉落来源反查、主动技能反查、只读存档导入和被动继承规划；未进入待办前不视为承诺。

## 长期不做

存档修改、账号系统、云同步、广告、默认遥测和未经确认的素材公开再分发。
