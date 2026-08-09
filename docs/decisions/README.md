---
schema_version: 1
id: decisions-index
title: 架构决策
summary: 索引需要保留背景、决定与后果的高影响 PalTools 工程决策。
type: index
status: current
authority: canonical
domains: [product, data, desktop, tooling]
topics: [architecture, storage, compliance, packaging]
platforms: [shared, electron, windows, node]
source_of_truth: [docs/_meta/wiki-contract.md, docs/reference/03-architecture.md]
related: [docs-home, reference-index]
---

# 架构决策

本目录只记录会长期约束多个模块、且需要保留背景与后果的决定。实现细节仍由 [`reference/`](../reference/README.md) 和 frontmatter 中的 `source_of_truth` 说明；普通实现选择不单独建立 ADR。

| 决策 | 状态 | 影响 |
| --- | --- | --- |
| [0001：本地优先静态数据](0001-local-first-static-data.md) | current | 数据、Web、CLI、Electron、合规 |
| [0002：版本化客户端状态](0002-versioned-client-state.md) | current | 主题、旧功能数据清理和迁移边界 |
| [0003：Electron 安全边界](0003-secure-electron-boundary.md) | current | 桌面加载、导航、自定义协议和打包 smoke |

新决策采用“背景 / 决定 / 后果 / 替代条件”四段式。决定被替代时更新状态和 `related`，并保留原页供追溯。
