---
schema_version: 1
id: secure-electron-boundary
title: Electron 安全边界
summary: 决定以隔离、沙箱和受限自定义协议加载包内 Web 产物，并拒绝渲染层任意导航与 Node 访问。
type: decision
status: current
authority: canonical
domains: [desktop, tooling]
topics: [architecture, packaging, testing, operations]
platforms: [electron, windows, mac, node]
source_of_truth: [script/development/dev-provider.cjs, script/electron/main.cjs, script/electron/agent-gateway.cjs, script/electron/preload.cjs, script/test-dev-provider.cjs, script/package-exe.ps1, script/package-mac.mjs, package.json]
related: [architecture, powershell-guide, local-first-static-data]
---

# 0003：Electron 安全边界

## 背景

便携桌面版需要加载包内静态 JSON 与媒体，同时不得让渲染层获得文件系统或 Node 权限，也不能通过路径穿越或任意导航离开应用边界。

## 决定

生产窗口使用 `contextIsolation: true`、`nodeIntegration: false` 和沙箱。`paltools://` 自定义协议只解析 `build/web` 下的规范化路径，拒绝越界路径；HTTP(S) 链接只能交给系统外部浏览器，窗口内导航被阻止。只有隔离用户目录的 Windows 或 macOS 打包 smoke 模式为自动化兼容临时关闭沙箱。

模型网关只接受窄 IPC 接口。主进程以字段白名单重建 renderer 输入与磁盘旧 profile，禁止未知字段或明文密钥混入元数据；远端 HTTP 和协议异常只返回固定错误分类，不转发厂商响应详情。未打包、非 smoke 的开发启动可以从仓库外文件加载一个只读托管模型，密钥只进入主进程会话内存。默认文件缺失时静默禁用，格式错误脱敏显示且允许下次调用重试；打包和 smoke 在动态加载前关闭该分支，`package.json.build.files` 也不包含开发读取模块。

## 后果

- 前端不能依赖 Electron 或 Node API，Web 与桌面共用同一静态构建。
- 自定义协议、安全开关、导航处理和 smoke 断言属于高风险模块；Windows 改动后必须执行 `package:exe`，macOS 改动后必须执行 `package:mac`。
- Web build 成功不能替代打包应用 smoke；发布产物必须记录文件名、大小和 SHA-256。
- 发布包不得包含 `script/development`，也不得通过环境变量、命令行或已加载的会话状态恢复开发者托管配置；对应契约测试只使用合成密钥。

## 替代条件

任何需要 preload、IPC 或新协议能力的功能都必须先定义最小权限接口、路径校验和桌面级回归，再通过新的 ADR 修订本边界。
