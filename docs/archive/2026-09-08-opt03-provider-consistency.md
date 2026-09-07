# OPT-03 原始待办记录

以下要求已完成，当前边界及测量见 [架构说明](../reference/03-architecture.md)。

### OPT-03：模型配置一致性

- 依据：[`agent-gateway.cjs`](../../script/electron/agent-gateway.cjs) 多个 IPC 入口分别 `readState → writeState`，`writeState` 直接覆盖目标 JSON，保存过程中先改 `sessionKeys` 再落盘；[`useProviderProfiles`](../../src/hooks/useProviderProfiles.ts) 的刷新没有过期结果隔离，重试不重新设置 loading。并发与磁盘失败风险尚未动态复现。
- 实施：集中现有配置更新路径，包含旧状态规范化及密钥重加密写回；序列化同进程更新，使用同目录临时文件和受控替换，不扩展为跨设备同步。维持脱敏、端点密钥作用域和开发者托管配置边界。
- 定点验收：并发保存不同配置、保存与删除/默认项变更交错、落盘失败、乱序加载和重试失败；失败后旧配置仍可读取，密钥与配置不串用，旧刷新不能覆盖新快照。增加本机假数据测试，不请求真实模型或读取开发者密钥。
