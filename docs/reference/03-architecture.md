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
    └─ IndexedDB：配种方案、工作区选择与兼容期旧对象存储
CLI ──────> 图鉴/配方领域查询
```

Web 构建统一输出到 `build/web/`；Electron 只负责加载该静态产物。自定义 `paltools://` 协议从包内提供 JSON 与媒体，渲染层保持 `contextIsolation`、禁用 Node 集成并启用沙箱。打包应用 smoke 检查当前 Schema/反向索引、主动技能、掉落图标和七主题设置页；已退场的代数上限不再作为发布断言。

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

`src/domain/breeding-graph.ts` 定义兼容期旧预设/关联、方案、图节点、配种关系、视口和导出文件的 zod Schema，并提供无浏览器依赖的关系校验。校验覆盖唯一节点/关系 ID、引用完整性、两个独立亲本节点、每个子代至多一条生成关系、有向无环结构，以及可选的图鉴 ID 和静态配方索引一致性。`src/domain/breeding-plan-portability.ts` 负责 `.paltools-plan.json` 的纯解析与序列化、5 MiB/1,000 节点/1,000 关系限制、全部 ID 重建、名称避让和基于当前配方索引的关系重映射；解析或校验失败不会产生仓储写入。

旧 `src/domain/breeding-path.ts` 和 `src/workers/breeding-path.worker.ts` 已随自动路径规划退场删除。正反向配方仍由 Schema v4 静态索引和 `src/domain/pals.ts` 提供。

## 5. CLI 模块

`cli/` 是独立于 React/DOM/Electron 的命令行模块，开发期经 `tsx` 复用 `src/domain/*`，构建期用 esbuild 打包为单个 Node ESM 文件 `build/cli/paltools.mjs`。CLI 只读 `public/data` 的 Schema v4 JSON，不发起运行时网络请求；`--data-dir` 和 `PALTOOLS_DATA_DIR` 可覆盖数据目录。

命令包括 `info`、`search [query]`、`forward --parents A,B`、`reverse --target C` 和 `plan validate <file>`；`--json` 输出稳定 JSON。数据命令按 Command 模式组织在 `cli/commands/`，每个命令一个 handler，`cli/run.ts` 只负责参数解析、数据装配和注册表分派。退出码 0 成功、1 方案校验/内部错误、2 参数或身份歧义、3 无结果、4 数据缺失或 Schema 不兼容。Windows 使用 `script/paltools.cmd` 包装，macOS/Linux 直接运行 `build/cli/paltools.mjs`。

## 6. 前端模块与状态边界

`src/App.tsx` 只负责应用壳、顶层导航、共享数据协调和错误状态。页面主体分别位于 `src/features/paldex/`、`src/features/breeding/` 和 `src/features/settings/`；帕鲁选择器、图片、属性徽章、工作适性图标和滚动活动 Hook 位于共享模块。数据加载、主题偏好及配种图仓储初始化由独立 Hook 管理，不引入路由、Context 或第三方状态库。配种图资源生命周期和原子方案导入由 `useBreedingGraphWorkspace` 管理，节点、关系、选择、视口及每方案最多 100 条当前会话撤销历史由独立 `useBreedingPlanEditor` 管理；所有候选图变更先经过纯领域命令和 `validateBreedingPlan`，再通过仓储事务提交。结构内容使用修订号和 500ms 防抖保存，视口使用独立修订号在稳定 1 秒后保存；两类写入共用串行保存循环，显式 `flush()` 持续到最新修订写入，旧快照不能覆盖保存中产生的新变更。

正向精确双亲、单亲展开和目标反查统一消费带 `recipeIndex` 的配方匹配结果。应用级 `useMarkedBreedingRecipes` 维护有序、去重的会话标记，不写入 localStorage、IndexedDB 或导出文件；查询卡片和配种图右侧栏通过同一 toggle 动作同步。节点目标查询仍通过页面级返回上下文返回原方案；从加入侧栏创建节点后，编辑器发布一次性待显示节点 ID，画布使用纯视口函数做保持缩放的最小平移并确认消费。

样式入口 `src/styles.css` 固定声明 `theme → base → shared → features → utilities` 层级。七套主题只定义语义令牌，业务组件不引用主题 ID；增加主题时需在注册表增加元数据，并在 `theme.css` 提供完整令牌块。配种图工具栏另有表面、图标、边框、悬停、激活、禁用和危险操作令牌，由每套主题完整声明。工作适性按钮/徽章和配种卡片的边框、表面及渐变使用独立语义令牌，浅色与深色主题不共享硬编码底色。

应用版本以 `package.json` 为唯一发布来源，由 Vite 在构建期注入 `import.meta.env.VITE_APP_VERSION`；渲染层统一读取该变量，变量缺失或为空时明确显示“开发版”。数据集版本仍独立存放在包内 `manifest.json`，不与应用发布版本混用。

| 状态 | 生命周期 | 存储 |
| --- | --- | --- |
| 主题偏好 | 跨启动 | `paltools.theme.v1` |
| 配种方案、节点、关系和视口 | 跨启动 | IndexedDB `paltools-breeding` v1 |
| 已标记配方 | 当前应用会话 | React 内存状态，刷新或重启后清空 |
| 旧预设、关联和已有帕鲁 | 不再消费 | IndexedDB 旧对象存储与 `paltools.path-starts.v1`，兼容期内保留 |
| 旧代数配置 | 不再消费 | `paltools.admin-config.v1`，至少保留一个发布周期 |
| 图鉴和配方 | 数据集版本 | 包内静态 JSON |

主题偏好由 `src/theme/theme.ts` 解析和序列化，未知 ID（包括已退场的 `amber`）与损坏数据回退到 `forest`，并在 React 挂载前写入根元素 `data-theme`。`src/storage/breeding-graph-repository.ts` 继续保留 `presets`、`plans`、`plan-preset-links` 和 `metadata` 四个 IndexedDB v1 对象存储以兼容既有数据，但运行时工作区只读取和写入方案及当前方案选择，不再迁移、展示或关联预设。方案导入使用单一事务新增方案及工作区元数据，不覆盖既有方案。

## 7. UI 与可访问性

- 图鉴详情在桌面为左右双栏，窄屏纵向排列。
- “帕鲁配种图”使用轻量 HTML 节点层、单一 SVG 连线层和统一 CSS 变换层展示无性别配种森林；每条领域关系对应两个亲本指向一个子代的可视边，并提供等价文本关系列表。内置确定性分层布局按弱连通分量和最长亲代路径分层，缓存未变化组件，并将节点写入稳定槽位。
- 视口平移和滚轮缩放通过 `requestAnimationFrame` 直接更新变换层，交互结束后才提交钳制到 `0.2–1.5` 的最终视口；节点和连线按可见区域加 overscan 裁剪。视口提交不更新时间戳、不进入结构撤销或离开确认。配种图进入时由应用壳锁定顶栏以下的剩余视口；“加入帕鲁”采用覆盖式侧栏，关闭后不保留布局列，右侧栏以标签页承载会话标记配方和当前方案文本关系。
- “加入帕鲁”资源按钮、图标工具栏、画布节点和弹窗均提供键盘路径与可访问名称；拖放不是唯一添加方式，弹窗支持 Escape、初始聚焦和状态消息。
- 图片失败均使用本地占位；属性图标具有中文可访问名称。
- 主题卡片使用 `radiogroup`/`radio` 语义、循环方向键导航和非颜色选中标记。

## 8. 质量边界

Vitest 覆盖解析器、数据领域、配种图 Schema/关系约束、IndexedDB 仓储/迁移和组件交互；Playwright 做真实浏览器离线、键盘与响应式验收；Electron 包装后执行独立冒烟。
