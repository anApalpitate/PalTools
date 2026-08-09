---
schema_version: 1
id: versioned-client-state
title: 版本化客户端状态
summary: 决定按生命周期使用版本化客户端状态，以规范化 IndexedDB 保存配种工作区，并明确清除已退场数据。
type: decision
status: current
authority: canonical
domains: [product, desktop]
topics: [architecture, storage, schema]
platforms: [web, electron]
source_of_truth: [src/theme/theme.ts, src/App.tsx, src/domain/breeding-workspace.ts, src/storage/breeding-workspace.ts]
related: [architecture, product-requirements]
---

# 0002：版本化客户端状态

## 背景

主题偏好、已退场功能的数据和静态数据具有不同生命周期。把它们混入同一存储或静默解释旧结构，会导致损坏数据和不可验证迁移。

## 决定

简单偏好使用带版本号的 localStorage key。当前主题键为 `paltools.theme.v1`。

配种方案网使用独立 `paltools-breeding-network` IndexedDB 和工作区 Schema v1。数据库按 metadata、relations、plans、planRelations 规范化保存；关系以稳定 recipeIndex 为身份，同时保存加入时三元组、数据版本和时间快照。所有相关对象仓在同一事务写入，提交成功后才发布 UI 状态。导入必须先完成 Zod、唯一性、引用、数量和 DAG 校验，再以单事务整体替换。

手工配种图已完整退场，应用启动时仍请求删除旧 `paltools-breeding` IndexedDB，不读取、备份或迁移其中的数据；新旧数据库名称明确分离。

## 后果

- 所有读取必须容错解析，未知或损坏偏好回退到安全默认值。
- Schema 或 key 变化必须同时更新领域类型、测试、产品与架构文档。
- 旧代数配置仍处于兼容保留期；旧配种图数据库不在保留范围。
- 数据集更新不重绑定已保存关系：recipeIndex 不存在或三元组变化时保留快照并标记失效；失效关系可导出和移除，但不参与新方案计算。
- 从背包移除但仍被方案引用的快照继续保留；全部引用消失后才清理关系注册表。

## 替代条件

未来新增复杂客户端状态时，必须先定义生命周期、版本边界和退场策略；只有转换无歧义、可回滚并具有迁移测试时，才允许自动迁移。
