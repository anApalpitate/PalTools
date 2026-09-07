# OPT-06 原始待办记录

以下要求已完成，当前行为和测量结论见 [架构说明](../reference/03-architecture.md)。

### OPT-06：本地检索计算复用

- 依据：[`LocalKnowledgeService.search`](../../src/domain/knowledge.ts) 对每个查询词在字段 tokens 中反复 filter 计数，`evidenceForEntity` 对非帕鲁实体线性查找文档；这些信息可在现有索引建立时一次计算。
- 定点验收：使用固定的名称、编号、拼音、技能、掉落与无结果查询集，对比排序、分数、matchedFields 与截断规则；分别测量建索引和重复查询的成本。沿用离线轻量检索，不改变召回策略，不增加外部服务。
