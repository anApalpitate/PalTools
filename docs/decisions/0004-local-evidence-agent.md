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
source_of_truth: [src/domain/knowledge-contract.ts, src/domain/knowledge.ts, src/domain/agent-runner.ts, src/domain/provider-catalog.ts, src/domain/provider-protocol.ts, src/domain/provider-adapters.ts, src/features/assistant/AssistantPage.tsx, src/storage/agent-storage.ts, src/lib/provider-service.ts, script/build-electron-provider-protocol.mjs, script/development/dev-provider.cjs, script/electron/agent-gateway.cjs, script/electron/preload.cjs]
related: [architecture, product-requirements, local-first-static-data, versioned-client-state, secure-electron-boundary]
---

# 本地证据查询 Agent

## 背景

PalTools 的核心价值来自可离线复现的图鉴与配种数据。直接让通用模型凭记忆回答会引入版本错配、不可核对的事实和厂商绑定；为数百条资料另建向量数据库或远程 Embedding 又会扩大包体、成本与网络依赖。桌面端还必须在不把通用网络能力交给 renderer 的前提下保存用户自备密钥。

## 决定

助手以已有静态数据在运行时构建字段加权的轻量索引，配种查询继续使用紧凑领域索引。工具、证据、轨迹与结构化引用由独立轻量契约定义，存储层不再经过检索实现。Agent 内部保留八个只读本地工具，但新消息的 `@` UI 只选择帕鲁、主动技能和掉落物对象：单帕鲁映射到资料、2–4 只帕鲁合并为比较、技能映射到拥有者、物品映射到掉落来源，正文的明确领域意图优先；派生调用按对象选择顺序执行并限制为四项。双亲意图必须恰好引用两只帕鲁，超过两只时在发送前保留草稿与引用并提示移除多余对象；同轮引用多个物品或技能时逐项执行，不静默忽略后续对象。旧消息的显式工具引用继续可显示和重生成。完整的受限结果与证据摘要共同进入模型上下文，因此不依赖厂商工具调用能力。游戏事实无本地依据时拒答，模型自称的引用不进入证据账本。四种协议由单一纯实现适配到统一消息、工具、SSE 流事件和用量契约，不启用厂商网页搜索、代码执行或远程工具。

平台层只实现传输与密钥边界：V2 配置把服务连接与多个型号分开，连接持有地址、认证、密钥作用域和默认型号，各型号持有显示状态与独立参数。Web API Key 仅在页面内存；Electron preload 只暴露配置、推理、取消和事件订阅，主进程从已保存连接解析所选型号并校验归属，renderer 不能覆盖 URL 或认证。主进程同时校验保留字段、超时、重定向、响应大小与并发，并使用 `safeStorage` 加密密钥。纯 Provider 协议经依赖审计后构建为桌面 CJS，主进程不再维护另一份协议分支，但网络与安全校验不会进入共享产物。若系统加密不可用，密钥只在当前进程使用。未打包且非 smoke 的 Electron 可从仓库外两字段文件加载只读开发托管配置；密钥只在主进程内存，profile 输入/旧状态按白名单重建，远端错误不回传原文，开发读取模块不进入发布包。密钥不跨服务地址、传输协议或认证方式复用，端点变化也会使既有数据披露授权失效。对话、结构化 `@` 引用、实际证据快照和公开工具轨迹进入独立版本化 IndexedDB；对话增加独立 `modelId`，旧记录与旧 profile 在读取边界兼容转换。助手发送框切换型号时原子更新当前对话的连接和型号；路由、生成与保存均使用代次门禁，离开会话会取消旧请求并忽略迟到结果。协议要求的 reasoning、签名与 Responses 输出项只在当前工具调用链暂存和回传，不写入对话档案或界面。

## 后果

原有图鉴和配种在无网络、无模型配置时保持完整；回答可回溯到具体本地数据版本与应用内页面。新建连接呈现 OpenAI、Anthropic、Gemini、DeepSeek、智谱 GLM 中国内地、通义千问中国内地、Kimi、OpenRouter、Ollama 和自定义接口，并由随应用更新的静态目录提供少量常用型号；旧模板配置仍按原传输参数工作。用户一次配置服务商密钥后，可以管理显示型号、自定义 ID 与各型号参数；模型选择器按连接分组并随当前研究记录持久保存。用户需要自备兼容 API，并承担该厂商的费用、可用性、CORS 与隐私政策；Web 能力可能受浏览器策略限制。视觉能力只作标签提示，当前仍仅支持文字输入。开发者托管配置不是产品默认凭据，只存在于满足本机开发边界的启动；未签名 macOS 包升级后可能再次请求钥匙串授权，不能用明文保存规避。

运行时索引不是语义向量搜索，对高度抽象或错别字严重的问题召回有限；确定性、低成本与可测试性优先于开放域召回。对话不自动删除，用户通过单条删除或全部清空管理本机历史。

## 替代条件

只有在本地索引的金标准问题集持续无法满足产品目标，且离线体积、Embedding 许可、迁移与隐私成本均得到明确接受时，才重新评估向量索引。只有具备等价的 URL/密钥/工具隔离和证据约束时，才考虑新的传输协议或远程检索能力。
