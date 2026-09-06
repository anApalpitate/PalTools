---
schema_version: 1
id: local-evidence-agent
title: 本地证据查询 Agent
summary: 决定以确定性本地检索约束模型事实，并按平台隔离模型网络与密钥。
type: decision
status: current
authority: canonical
domains: [product, data, desktop]
topics: [architecture, storage, compliance]
platforms: [shared, web, electron, windows, mac]
source_of_truth: [src/domain/knowledge-contract.ts, src/domain/knowledge.ts, src/domain/agent-runner.ts, src/domain/provider-protocol.ts, src/domain/provider-adapters.ts, src/storage/agent-storage.ts, src/lib/provider-service.ts, script/build-electron-provider-protocol.mjs, script/electron/agent-gateway.cjs, script/electron/preload.cjs]
related: [architecture, product-requirements, local-first-static-data, versioned-client-state, secure-electron-boundary]
---

# 本地证据查询 Agent

## 背景

PalTools 的核心价值来自可离线复现的图鉴与配种数据。直接让通用模型凭记忆回答会引入版本错配、不可核对的事实和厂商绑定；为数百条资料另建向量数据库或远程 Embedding 又会扩大包体、成本与网络依赖。桌面端还必须在不把通用网络能力交给 renderer 的前提下保存用户自备密钥。

## 决定

助手以已有静态数据在运行时构建字段加权的轻量索引，配种查询继续使用紧凑领域索引。工具、证据、轨迹与结构化引用由独立轻量契约定义，存储层不再经过检索实现。Agent 在每轮模型调用前提供本地证据，并只公开八个只读本地工具；用户可用结构化 `@` 引用显式选择工具、帕鲁、主动技能和掉落物。显式工具按选择顺序在本机执行，完整的受限结果与证据摘要共同进入模型上下文，因此不依赖厂商工具调用能力。游戏事实无本地依据时拒答，模型自称的引用不进入证据账本。四种协议由单一纯实现适配到统一消息、工具、SSE 流事件和用量契约，不启用厂商网页搜索、代码执行或远程工具。

平台层只实现传输与密钥边界：Web API Key 仅在页面内存；Electron preload 只暴露配置、推理、取消和事件订阅，主进程校验 URL、保留字段、超时、重定向、响应大小与并发，并使用 `safeStorage` 加密密钥。纯 Provider 协议经依赖审计后构建为桌面 CJS，主进程不再维护另一份协议分支，但网络与安全校验不会进入共享产物。若系统加密不可用，密钥只在当前进程使用。密钥不跨服务地址、传输协议或认证方式复用，端点变化也会使既有数据披露授权失效。对话、结构化 `@` 引用、实际证据快照和公开工具轨迹进入独立版本化 IndexedDB；引用作为消息的可选字段向后兼容，不触发对象仓库迁移。

## 后果

原有图鉴和配种在无网络、无模型配置时保持完整；回答可回溯到具体本地数据版本与应用内页面。新建配置只呈现 OpenAI、Anthropic、Gemini、DeepSeek、通义千问中国内地、Kimi、OpenRouter、Ollama 和自定义接口，旧模板配置仍按原传输参数工作。用户需要自备兼容 API，并承担该厂商的费用、可用性、CORS 与隐私政策；Web 能力可能受浏览器策略限制。未签名 macOS 包升级后可能再次请求钥匙串授权，不能用明文保存规避。

运行时索引不是语义向量搜索，对高度抽象或错别字严重的问题召回有限；确定性、低成本与可测试性优先于开放域召回。对话不自动删除，用户通过单条删除或全部清空管理本机历史。

## 替代条件

只有在本地索引的金标准问题集持续无法满足产品目标，且离线体积、Embedding 许可、迁移与隐私成本均得到明确接受时，才重新评估向量索引。只有具备等价的 URL/密钥/工具隔离和证据约束时，才考虑新的传输协议或远程检索能力。
