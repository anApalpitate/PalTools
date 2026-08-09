---
schema_version: 1
id: versioned-client-state
title: 版本化客户端状态
summary: 决定按生命周期使用版本化 localStorage 与 IndexedDB，并对不兼容方案采用明确清除而非猜测迁移。
type: decision
status: current
authority: canonical
domains: [product, breeding, desktop]
topics: [architecture, storage, schema]
platforms: [web, electron]
source_of_truth: [src/theme/theme.ts, src/domain/breeding-graph.ts, src/storage/breeding-graph-repository.ts, src/hooks/useBreedingGraphWorkspace.ts]
related: [architecture, breeding-graph-domain, product-requirements]
---

# 0002：版本化客户端状态

## 背景

主题偏好、配种方案、会话标记和静态数据具有不同生命周期。把它们混入同一存储或静默解释旧结构，会导致损坏数据、过期身份和不可验证迁移。

## 决定

简单偏好使用带版本号的 localStorage key，复杂方案使用版本化 IndexedDB 和边界 Schema。当前主题键为 `paltools.theme.v1`，配种方案存放于 `paltools-breeding` v2；会话配方标记只保存在 React 内存。v1 自由坐标方案无法可靠映射到 v2 分层槽位，因此升级时原子清除旧方案、关系和当前选择并显示一次性提示，不猜测迁移。

## 后果

- 所有读取必须容错解析，未知或损坏偏好回退到安全默认值。
- Schema 或 key 变化必须同时更新领域类型、仓储、测试、产品与架构文档。
- 停止消费的旧预设、关联、已有帕鲁和代数配置在兼容期内保留，除非后续决策明确清理。

## 替代条件

只有存在可证明无歧义、可回滚并具有迁移测试的转换规则时，才允许对未来不兼容方案执行自动迁移。
