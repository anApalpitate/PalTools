# OPT-01 原始待办记录

以下要求已完成，当前边界见 [架构说明](../reference/03-architecture.md)。

### OPT-01：助手存储原子性与失败恢复

- 依据：[`appendMessage`](../../src/storage/agent-storage.ts) 在 `messages.put` 后才逐项校验证据和轨迹；校验抛错时没有统一中止事务。[助手发送流程](../../src/features/assistant/AssistantPage.tsx)在异常分支再次调用 `appendMessage`，该调用失败没有单独恢复路径。
- 已复现：以独立 `fake-indexeddb` 工厂调用生产仓储，传入合法消息和非法证据，结果为调用拒绝、消息数 1、证据数 0。探针只使用内存数据库，未访问用户数据；这证明部分写入风险，不代表常规合法回答必然失败。
- 定点验收：非法首条/后续证据、非法轨迹、事务中止与配额失败均不能留下半条回答或提前更新会话元信息；持续存储失败时发送状态复位，无未处理 Promise 拒绝。覆盖仓储测试与助手组件测试。
