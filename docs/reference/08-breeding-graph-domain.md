---
schema_version: 1
id: breeding-graph-domain
title: 配种图领域模型
summary: 定义 v2 分层槽位方案、关系约束、节点插入、fork、子代生成、后代闭包删除和持久化边界。
type: reference
status: current
authority: canonical
domains: [breeding, product]
topics: [architecture, storage, schema, testing]
platforms: [shared, web, electron]
source_of_truth: [src/domain/breeding-graph.ts, src/domain/breeding-layered-graph.ts, src/domain/breeding-layered-graph.test.ts, src/storage/breeding-graph-repository.ts]
related: [breeding-graph-interaction, architecture, product-requirements, versioned-client-state]
---

# 配种图领域模型

配种图是按代数分层、按行内顺序排列的有向无环森林。领域结构不保存自由像素坐标；画布位置由 `layers`、关系和布局常量确定。同一帕鲁可以拥有多个节点实例，关系始终引用节点 ID 而不是 `palId`。

## v2 持久化结构

```ts
type BreedingGraphNodeV2 = {
  id: string
  palId: string
  source: 'manual' | 'fork' | 'child' | 'import' | 'paste'
  forkOf?: string
}

type BreedingLayerV2 = {
  nodeIds: string[]
}

type BreedingPlanV2 = {
  id: string
  schemaVersion: 2
  name: string
  layers: BreedingLayerV2[]
  nodes: BreedingGraphNodeV2[]
  relations: BreedingRelationV2[]
  viewport: GraphViewportV1
  createdAt: string
  updatedAt: string
}
```

`layers[].nodeIds` 是行号和行内顺序的唯一业务来源。节点不保存 `row` 或像素坐标；空槽位、插入热区、组合目标和 fork 预览都是根据当前方案派生的临时状态。

每条关系保存两个不同亲本节点、一个子代节点和精确 `recipeIndex`。配方索引用于对照当前静态数据验证两个 `palId` 和子代 `palId`，不能只凭展示名称重建关系。

## 必须保持的不变量

`validateBreedingPlanV2` 对任何候选结构执行完整校验：

- 节点 ID 和关系 ID 唯一，所有引用存在，每个节点恰好出现在一个非空层中。
- 两个亲本是同一行的相邻节点；子代位于亲本下一行。
- 每个子代最多拥有一条生成关系，每个节点最多参与一条下游关系；再次使用同一帕鲁实例前必须 fork。
- `forkOf` 指向现存来源节点；fork 只复制帕鲁身份，不复制上游关系。
- 关系与当前 `recipeIndex` 完全匹配，整个图不存在有向环。

组件和 Hook 不得绕过领域命令直接拼装部分结构。结构操作先基于当前快照计算完整候选，再校验并一次提交；失败候选不进入 React 状态、撤销历史或 IndexedDB。

## 插入与派生槽位

- 空方案派生一个 `empty` 槽位；第一次加入创建第 0 行和一个 `manual` 节点。
- 非空层在节点左右派生 `insert` 槽位。插入直接修改目标层的 `nodeIds` 顺序，已占用位置不是失败条件。
- 已经共同生成子代的相邻亲本之间是受保护间隙，不派生插入槽位。
- `combine` 槽位用于把节点拖向另一节点产生子代，不作为持久化空节点。

## fork 与子代生成

产生子代前先确认两个不同节点和精确配方：

- 同层、相邻且均未参与下游关系时，直接在下一行插入子代。
- 同层但不相邻，或任一节点已参与下游关系时，在合法插入槽位创建必要的 fork，使实际亲本同层相邻。
- 不同层时，以较深层为组合层，把较浅节点 fork 到该层；较深节点已被下游关系占用时也先 fork。
- fork 和子代节点使用新 ID；子代位置插入到下一行的稳定索引，随后执行完整 v2 校验。
- 无配方时不修改方案；多结果配方必须先选择具体 `recipeIndex`。

## 删除

删除使用后代闭包：从选中节点开始，递归加入所有受影响关系的子代，合并多选结果后一次删除节点与关系。删除不会影响上游亲本、兄弟分支或其他独立分支，也不会自动接线或生成替代配方。删除后过滤空层并保持幸存节点的相对顺序；全部节点删除后重新进入空图状态。

## 存储、导入与保存

- 方案存放于 IndexedDB `paltools-breeding` v2；数据库从 v1 升级时清空旧方案、旧关系和当前选择，不迁移自由坐标方案，并写入一次性提示。
- `presets`、`plan-preset-links` 和旧已有帕鲁键在兼容期内保留，但当前工作区不消费这些内容。
- `.paltools-plan.json` v2 导入先解析、重建 ID、处理名称冲突、按当前数据集重映射关系并整体校验；5 MiB、1,000 节点和 1,000 关系是硬上限。
- 导入使用单一 IndexedDB 事务新增方案和当前选择，不覆盖其他方案，不允许部分写入。
- 结构内容和视口使用独立修订号与串行保存循环；结构失败保留 dirty 与待保存修订供重试，旧快照不能覆盖更新快照。

## 验证入口

领域变更至少运行 `src/domain/breeding-layered-graph.test.ts`、`src/domain/breeding-graph.test.ts`、编辑器 Hook 测试、仓储测试和 TypeScript 检查。关系、Schema 或持久化变化还需覆盖真实配种图 UI 流程。
