# PalTools 文档索引

文档按生命周期分为三层：核心参考在 [`reference/`](reference/README.md)，临时任务在 [`tasks/`](tasks/README.md)，历史归档在 [`archive/`](archive/README.md)。agent 默认只读 `reference/`。

## 核心参考文档

| 文档 | 用途 |
| --- | --- |
| [01-product-requirements.md](reference/01-product-requirements.md) | 当前产品范围、用户场景和验收标准 |
| [02-data-and-compliance.md](reference/02-data-and-compliance.md) | 数据来源、快照、素材和合规边界 |
| [03-architecture.md](reference/03-architecture.md) | Schema v4、前端模块、配种图领域模型与状态边界 |
| [04-roadmap.md](reference/04-roadmap.md) | 已完成里程碑和下一阶段方向 |
| [05-data-pipeline.md](reference/05-data-pipeline.md) | 数据命令、缓存、构建、校验与更新流程 |
| [06-powershell-guide.md](reference/06-powershell-guide.md) | Windows/PowerShell 命令撰写、受管服务、进程定位与坑点 |
| [07-quick-commands.md](reference/07-quick-commands.md) | 常用自然语言提示词与对应仓库操作、验证和发布边界 |

## 进行中任务文档

| 文档 | 用途 |
| --- | --- |
| [01-future-feature-requirements.md](tasks/01-future-feature-requirements.md) | 未完成问题与需求 backlog；完成记录和验证历史见归档 |
| [02-breeding-graph-requirements.md](tasks/02-breeding-graph-requirements.md) | 已有帕鲁预设、多对多方案关联、获取目标帕鲁与可编辑配种图阶段需求 |

## 当前技术决策

- React 19 + TypeScript + Vite；Windows 桌面版使用 Electron 便携包。
- Node.js + TypeScript 数据工具；cheerio 解析 HTML，zod 校验边界数据。
- Schema v4 静态 JSON 与本地图片，运行时断网可用且不访问第三方接口。
- 自动路径规划、配种树 Worker 和代数上限设置已移除；“帕鲁配种图”当前提供稳定入口，按阶段建设。
- 前端按应用壳、图鉴、配种、设置、共享组件和职责单一 Hook 拆分；CSS 固定按主题、基础、共享、特性和工具层加载。
- 主题偏好继续使用版本化 `localStorage`；配种预设、方案及多对多关联使用版本化 IndexedDB。旧已有帕鲁键只读迁移且暂不删除，旧代数配置停止消费但暂不主动删除。
- 独立 CLI 模块与 Web/Electron 共用领域逻辑、Schema v4 和版本信息；开发入口为 `npm run cli`，单文件构建 `npm run cli:build` 输出 `build/cli/paltools.mjs`。
- Web 生产构建统一输出到 `build/web/`，不再使用 `dist/`。

## 当前明确不做

账号与云同步、存档修改、个体数量、蛋糕/孵化成本、被动继承概率推演、运行时遥测和默认联网更新。
