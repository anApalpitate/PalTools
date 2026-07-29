# 架构说明

## 1. 运行结构

```text
paldb 公开 HTML/素材 ─┐
                     ├─ pipeline/data ─> public/data + public/generated
PalCalc 固定快照 ─────┘                         │
                                               ▼
React UI ─> 领域查询 ─> Web Worker 路径算法 ─> React Flow / 文本步骤
    │
    └─ localStorage：已拥有种类、主题偏好、高级设置
```

Electron 只负责加载 Vite 的静态产物。自定义 `paltools://` 协议从包内提供 JSON 与媒体，渲染层保持 `contextIsolation`、禁用 Node 集成并启用沙箱。

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

`src/domain/pals.ts` 负责图鉴过滤、正向查询、反向查询和紧凑配方解码。`src/domain/search.ts` 使用随包离线分发的 `pinyin-pro` 统一生成中文名称的连续拼音和首字母别名，并处理纯数字图鉴号匹配；图鉴与配种选择器不各自维护搜索规则。UI 不直接理解索引键。

`src/domain/breeding-path.ts` 是无浏览器依赖的纯算法：

- 最少代数采用逐层动态规划。
- 指定 N 代使用精确深度可达性表，再按确定顺序回溯构树。
- 构树时携带当前根到节点的祖先集合，排除同一路径重复帕鲁。
- 候选依次比较代数、配种节点数、不同中间帕鲁数和配方字典序。
- 每个节点保存满足同代与无环约束的替代配方。

`src/workers/breeding-path.worker.ts` 只接收可序列化数据和请求编号。UI 终止旧 Worker 或丢弃旧编号结果，避免快速修改表单时发生竞态。

## 5. 前端模块与状态边界

`src/App.tsx` 只负责应用壳、顶层导航、共享数据协调、错误状态和离开保护。页面主体分别位于 `src/features/paldex/`、`src/features/breeding/` 和 `src/features/settings/`；帕鲁选择器、图片、属性徽章、工作适性图标和滚动活动 Hook 位于共享模块。数据加载、主题偏好、应用配置及已拥有帕鲁由独立 Hook 管理，不引入路由、Context 或第三方状态库。

样式入口 `src/styles.css` 固定声明 `theme → base → shared → features → utilities` 层级。五套主题只定义语义令牌，业务组件不引用主题 ID；增加主题时需在注册表增加元数据，并在 `theme.css` 提供完整令牌块。原全局样式已按基础、共享、图鉴、配种、详情和设置拆分，最终工具层只负责把历史组件声明映射到语义令牌。

应用版本以 `package.json` 为唯一发布来源，由 Vite 在构建期注入 `import.meta.env.VITE_APP_VERSION`；渲染层统一读取该变量，变量缺失或为空时明确显示“开发版”。数据集版本仍独立存放在包内 `manifest.json`，不与应用发布版本混用。

| 状态 | 生命周期 | 存储 |
| --- | --- | --- |
| 已拥有帕鲁种类 | 跨启动 | `paltools.path-starts.v1` |
| 临时起点 | 当前应用会话 | React 内存 |
| 主题偏好 | 跨启动 | `paltools.theme.v1` |
| 高级设置 | 跨启动 | `paltools.admin-config.v1` |
| 当前路径结果/选中节点 | 当前页面 | React 内存 |
| 图鉴和配方 | 数据集版本 | 包内静态 JSON |

主题偏好由 `src/theme/theme.ts` 解析和序列化，未知 ID 与损坏数据回退到 `forest`，并在 React 挂载前写入根元素 `data-theme`。高级设置损坏时由领域解析器回退为默认值 6，并保留“发生过恢复”的标记供 UI 提示。硬上限 12 在领域层和界面层同时约束。

## 6. UI 与可访问性

- 图鉴详情在桌面为左右双栏，窄屏纵向排列。
- 路径树自上而下：目标根节点、各代亲本、第 0 代起点。
- React Flow 仅允许平移、缩放、适应视图和节点选择，用户不能创建或删除边。
- 每个节点包含图片、中文名、图鉴号、代数与来源状态。
- 图形画布之外始终提供文本步骤列表。
- 图片失败均使用本地占位；属性图标具有中文可访问名称。
- 主题卡片使用 `radiogroup`/`radio` 语义、循环方向键导航和非颜色选中标记。

## 7. 质量边界

Vitest 覆盖解析器、数据领域、路径算法、配置恢复和组件交互；Playwright 做真实浏览器离线、键盘、响应式和画布验收；Electron 包装后执行独立冒烟。
