---
schema_version: 1
id: local-first-static-data
title: 本地优先静态数据
summary: 决定把正式数据和素材编译进应用，使图鉴、配种和 CLI 核心能力运行时离线可用。
type: decision
status: current
authority: canonical
domains: [data, paldex, breeding, cli, desktop]
topics: [architecture, pipeline, compliance, packaging]
platforms: [shared, web, electron, node]
source_of_truth: [pipeline/data, public/data/manifest.json, src/hooks/useCatalogData.ts, script/electron/main.cjs]
related: [data-compliance, data-pipeline, architecture, secure-electron-boundary]
---

# 0001：本地优先静态数据

## 背景

图鉴和配种查询需要稳定、可验证且断网可用；直接在运行时请求 paldb 或其他第三方服务会引入可用性、Schema 漂移、合规和桌面打包风险。

## 决定

联网行为仅发生在显式数据同步阶段。管线固定并校验外部来源，生成 Schema v4 JSON 和本地素材；Web、Electron 与 CLI 运行时只读取包内数据，不热链接第三方资源，不读取或修改游戏文件。

## 后果

- 来源更新必须经过抓取约束、构建、独立校验和差异审阅，不能在 UI 中临时补数据。
- 桌面包体积包含静态数据、素材和 Electron 运行时，但核心功能不依赖网络。
- 数据集版本与应用版本独立；来源变化必须更新 manifest，而不是通过运行时接口掩盖差异。

## 替代条件

只有产品范围明确要求在线能力，并完成许可、隐私、失败降级、缓存和离线兼容设计后，才可提出替代本决策的 ADR。
