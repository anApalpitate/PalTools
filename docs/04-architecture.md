# 架构说明

## 1. 运行结构

```text
paldb 公开 HTML/素材 ─┐
                     ├─ pipeline/data ─> public/data + public/generated
PalCalc 固定快照 ─────┘                         │
                                               ▼
React UI ─> 图鉴/配方领域查询
    │
    ├─ localStorage：主题偏好、保留期内的旧键
    └─ IndexedDB：配种预设、方案、多对多关联与迁移元数据
```

Electron 只负责加载 Vite 的静态产物。自定义 `paltools://` 协议从包内提供 JSON 与媒体，渲染层保持 `contextIsolation`、禁用 Node 集成并启用沙箱。打包应用 smoke 检查当前 Schema/反向索引、主动技能、掉落图标和八主题设置页；已退场的代数上限不再作为发布断言。

Windows 便携包继续完整携带 Electron 运行时以保证离线可用，但只保留 `zh-CN` 和 `en-US` 两个 Chromium 语言包。仅在 Web 构建期使用、已被 Vite 写入前端 bundle 的库应放在 `devDependencies`，避免 electron-builder 将同一份 Node 包再次放入 ASAR。`package:exe` 会断言最终语言包集合，并输出产物的精确字节数和 SHA-256。

## 2. 数据模块

`pipeline/data/paldb/` 被拆分为：

- `client.ts`：robots、缓存、节流、超时、重试。
- `parser.ts`：列表、详情、技能、被动、掉落与素材解析。
- `assets.ts`：SHA-256 工具。
- `schema.ts`：原始边界 Schema。
- `sync.ts`：联网/离线同步入口。

`build.ts` 完成 paldb 与 PalCalc 关联、空值处理、技能/物品去重、无性别公式规范化和索引生成。`validate.ts` 独立读取最终文件与原始 PalCalc 快照，不能复用生成过程来“证明自己正确”。

## 3. 公共数据

- `pals.json`：Schema v4 图鉴记录。
- `elements.json`：10 个属性目录项，9 个来源图标。
- `work-suitabilities.json`：12 个工作适应性目录项和本地图标。
- `skills.json`：去重主动技能定义。
- `items.json`：去重掉落物定义与本地图标。
- `breeding-index.json`：唯一配方存储及双向引用。
- `manifest.json`：来源、版本、策略和计数。

配方不再同时输出完整对象数组，避免桌面包重复放大：

```ts
interface BreedingIndexPayloadV4 {
  schemaVersion: 4
  palIds: string[]
  recipes: Array<[parentAIndex: number, parentBIndex: number, childIndex: number]>
  recipesByPair: Record<string, number[]>
  parentsByChild: Record<string, number[]>
}
```

正向和反向索引的值都是 `recipes` 下标。校验要求每条配方在两个索引中各引用一次。

## 4. 领域层

`src/domain/pals.ts` 负责图鉴过滤、精确双亲查询、单亲配方展开/过滤/稳定排序、反向查询和紧凑配方解码。单亲展开只扫描紧凑配方一次，同种亲本配方不会重复，并按另一亲本、子代图鉴号及内部 ID 确定性排序。`src/domain/search.ts` 使用随包离线分发的 `pinyin-pro` 统一生成中文名称的连续拼音和首字母别名，并处理纯数字图鉴号匹配；图鉴与配种选择器不各自维护搜索规则。UI 不直接理解索引键。

`src/domain/breeding-graph.ts` 定义配种预设、方案、多对多关联、图节点、配种关系、视口和导出文件的 zod Schema，并提供无浏览器依赖的关系校验。校验覆盖唯一节点/关系 ID、引用完整性、两个独立亲本节点、每个子代至多一条生成关系、有向无环结构，以及可选的图鉴 ID 和静态配方索引一致性。

旧 `src/domain/breeding-path.ts` 和 `src/workers/breeding-path.worker.ts` 已随自动路径规划退场删除。正反向配方仍由 Schema v4 静态索引和 `src/domain/pals.ts` 提供。

## 5. 前端模块与状态边界

`src/App.tsx` 只负责应用壳、顶层导航、共享数据协调和错误状态。页面主体分别位于 `src/features/paldex/`、`src/features/breeding/` 和 `src/features/settings/`；帕鲁选择器、图片、属性徽章、工作适性图标和滚动活动 Hook 位于共享模块。数据加载、主题偏好及配种图仓储初始化由独立 Hook 管理，不引入路由、Context 或第三方状态库。

样式入口 `src/styles.css` 固定声明 `theme → base → shared → features → utilities` 层级。八套主题只定义语义令牌，业务组件不引用主题 ID；增加主题时需在注册表增加元数据，并在 `theme.css` 提供完整令牌块。工作适性按钮/徽章和配种卡片的边框、表面及渐变使用独立语义令牌，浅色与深色主题不共享硬编码底色。原全局样式已按基础、共享、图鉴、配种、详情和设置拆分，最终工具层只负责把历史组件声明映射到语义令牌。

应用版本以 `package.json` 为唯一发布来源，由 Vite 在构建期注入 `import.meta.env.VITE_APP_VERSION`；渲染层统一读取该变量，变量缺失或为空时明确显示“开发版”。数据集版本仍独立存放在包内 `manifest.json`，不与应用发布版本混用。

| 状态 | 生命周期 | 存储 |
| --- | --- | --- |
| 主题偏好 | 跨启动 | `paltools.theme.v1` |
| 配种预设、方案、关联 | 跨启动 | IndexedDB `paltools-breeding` v1 |
| 旧已有帕鲁 | 只读迁移源 | `paltools.path-starts.v1`，至少保留一个发布周期 |
| 旧代数配置 | 不再消费 | `paltools.admin-config.v1`，至少保留一个发布周期 |
| 图鉴和配方 | 数据集版本 | 包内静态 JSON |

主题偏好由 `src/theme/theme.ts` 解析和序列化，未知 ID 与损坏数据回退到 `forest`，并在 React 挂载前写入根元素 `data-theme`。`src/storage/breeding-graph-repository.ts` 通过 `presets`、`plans`、`plan-preset-links` 和 `metadata` 四个对象存储提供版本升级与事务边界；方案和关联可在同一事务中写入。首次初始化原子读取旧已有帕鲁集合并写入一个合法预设和迁移标记，同名时使用递增后缀，旧键不删除。

## 6. UI 与可访问性

- 图鉴详情在桌面为左右双栏，窄屏纵向排列。
- “帕鲁配种图”当前为稳定空状态；后续画布保持亲本在上、子代在下，并提供等价文本关系列表。
- 图片失败均使用本地占位；属性图标具有中文可访问名称。
- 主题卡片使用 `radiogroup`/`radio` 语义、循环方向键导航和非颜色选中标记。

## 7. 质量边界

Vitest 覆盖解析器、数据领域、配种图 Schema/关系约束、IndexedDB 仓储/迁移和组件交互；Playwright 做真实浏览器离线、键盘与响应式验收；Electron 包装后执行独立冒烟。
