---
schema_version: 1
id: versioned-client-state
title: 版本化客户端状态
summary: 决定按生命周期使用版本化客户端状态，并在功能退场时明确清除不再支持的数据。
type: decision
status: current
authority: canonical
domains: [product, desktop]
topics: [architecture, storage, schema]
platforms: [web, electron]
source_of_truth: [src/theme/theme.ts, src/App.tsx]
related: [architecture, product-requirements]
---

# 0002：版本化客户端状态

## 背景

主题偏好、已退场功能的数据和静态数据具有不同生命周期。把它们混入同一存储或静默解释旧结构，会导致损坏数据和不可验证迁移。

## 决定

简单偏好使用带版本号的 localStorage key。当前主题键为 `paltools.theme.v1`。手工配种图已完整退场，应用启动时请求删除旧 `paltools-breeding` IndexedDB，不读取、备份或迁移其中的数据。

## 后果

- 所有读取必须容错解析，未知或损坏偏好回退到安全默认值。
- Schema 或 key 变化必须同时更新领域类型、测试、产品与架构文档。
- 旧代数配置仍处于兼容保留期；旧配种图数据库不在保留范围。

## 替代条件

未来新增复杂客户端状态时，必须先定义生命周期、版本边界和退场策略；只有转换无歧义、可回滚并具有迁移测试时，才允许自动迁移。
