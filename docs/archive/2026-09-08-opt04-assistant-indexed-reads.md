# OPT-04 原始待办记录

以下要求已完成，当前边界及测量见 [架构说明](../reference/03-architecture.md)。

### OPT-04：会话读取范围与连接生命周期

- 依据：[`loadConversation`](../../src/storage/agent-storage.ts) 已按 conversationId 读取消息，但对 evidence/traces 使用全表 `getAll` 后过滤，现有 messageId 索引仅在删除等路径使用；AgentRepository 在构造时打开数据库，没有 close 接口，助手在渲染期创建仓储。
- 实施：在同一只读事务中按当前消息 ID 发起索引请求；仓储创建、关闭与组件生命周期协调，处理 StrictMode 重挂载和 versionchange，不改变持久化格式。
- 定点验收：多会话样例下结果与原实现一致，读取量随当前会话增长而非全库增长；无关会话的记录不进入当前会话解析；反复进入/离开助手、关闭与读取交错不泄漏连接或破坏在途操作。
