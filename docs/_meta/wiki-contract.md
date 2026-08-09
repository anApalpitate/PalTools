---
schema_version: 1
id: wiki-contract
title: LLM Wiki 维护契约
summary: 规定 PalTools 工程知识的摄取、查询、校验、提升、替代和归档流程。
type: meta
status: current
authority: canonical
domains: [tooling]
topics: [architecture, operations, testing]
platforms: [shared]
source_of_truth: [AGENTS.md, package.json, docs/_meta/wiki-schema.json]
related: [docs-home, reference-index, decisions-index, tasks-index]
---

# LLM Wiki 维护契约

PalTools 文档采用“事实来源 → 稳定 Wiki → agent 路由”三层模型。源码、测试、配置、manifest 和固定外部来源记录是事实来源；`reference/` 与 `decisions/` 是从事实来源提炼的当前工程知识；`AGENTS.md` 与 `docs/README.md` 负责让 agent 按任务读取最少的必要页面。

## 权威性

- `authority: canonical` 表示页面是该主题的当前文档入口，但事实冲突时仍以 `source_of_truth` 指向的源码、测试、配置或 manifest 为准。
- `authority: supporting` 表示页面用于计划、导航或补充说明，不能覆盖 canonical 页面。
- `archive/` 保存不可变的历史过程，不补 frontmatter，不作为当前实现与验收依据。
- Git 历史记录页面的变更时间；Wiki 不维护容易失真的“最后验证日期”。

## 页面元数据

`wiki-schema.json` 是字段、枚举和受控标签的唯一机器可读来源。所有 `archive/` 之外的 Wiki Markdown 页面都必须使用受限 YAML frontmatter：标量使用单行值，集合使用单行方括号数组。`id` 使用稳定、全局唯一的英文 kebab-case；正文和摘要使用中文；文件名保持英文语义名称。

标签用于多维检索，不代替生命周期字段：

- `domains` 表示产品问题域，例如 `paldex`、`breeding` 或 `data`。
- `topics` 表示知识关注点，例如 `architecture`、`storage` 或 `testing`。
- `platforms` 表示适用运行环境；跨平台规则使用 `shared`。
- `type`、`status`、`authority` 必须使用独立字段，不能伪装成自由标签。

## 维护操作

### Ingest

1. 先读取任务路由指定的 Wiki 页面，再检查其 `source_of_truth`。
2. 新事实必须来自已确认的源码、测试、配置、manifest 或明确的用户决策。
3. 未实现、未验证或仍在讨论的内容只进入 `tasks/`，不得直接写入 canonical 页面。

### Query

1. 从 `docs/README.md` 按任务类型选择入口。
2. 读取目标页面的摘要、标签、事实来源和 `related`，只展开解决当前任务所需页面。
3. 默认不读 `archive/`；只有追溯原因、旧行为或失败尝试时才进入归档。

### Lint

文档变更及长任务收尾必须运行 `npm.cmd run docs:lint`。校验覆盖 frontmatter、受控标签、唯一 ID、事实来源路径、关联 ID、索引覆盖和 Markdown 相对链接。`reference` 与 `decisions` 不得依赖 `tasks` 作为当前事实来源。

### Promote

任务完成并通过相关验证后，将长期有效的行为、不变量和操作方法整理进 `reference/`；高影响且需要保留权衡背景的决定进入 `decisions/`。更新相关索引和交叉链接后，把原任务记录原样移入 `archive/`。

### Supersede

当前知识发生替代时，直接修订 canonical 页面。只有仍需独立追踪替代关系的 Wiki 页面才保留并标记 `status: superseded`，同时通过 `related` 指向替代页；一般过程历史应移入归档。

### Archive

归档保留原始计划、验证记录、发布快照和复盘，不进行持续改写。`archive/README.md` 必须说明归档原因，并在存在当前替代页面时给出链接。

## 写入边界

- 不复制源码、生成 JSON 或外部快照到新的文档来源目录。
- 不引入自由标签；需要新标签时先修改 `wiki-schema.json`、契约说明和 lint 测试。
- 不因一次问答自动增加页面。优先修订现有主题页，只有主题边界明确且内容会被多个后续任务复用时才新建页面。
- 文档提升必须与实现验证处于同一任务闭环；不得把推测或计划写成已实现事实。
