# PalTools 文档索引

主目录只保留当前仍需查阅的规范、架构、操作说明和待办。已完成阶段的实施记录与发布记录统一放在 [`archive/`](archive/README.md)。

## 当前文档

| 文档 | 用途 |
| --- | --- |
| [01-product-requirements.md](01-product-requirements.md) | 当前产品范围、用户场景和验收标准 |
| [03-data-and-compliance.md](03-data-and-compliance.md) | 数据来源、快照、素材和合规边界 |
| [04-architecture.md](04-architecture.md) | Schema v4、模块、索引、Worker 与状态边界 |
| [05-roadmap.md](05-roadmap.md) | 已完成里程碑和下一阶段方向 |
| [06-phase-1-data-pipeline.md](06-phase-1-data-pipeline.md) | 数据命令、缓存、构建、校验与更新流程 |
| [10-paldex-detail-bugs.md](10-paldex-detail-bugs.md) | 图鉴、筛选、配种界面与应用图标修复记录 |
| [11-future-feature-requirements.md](11-future-feature-requirements.md) | 尚未进入实施阶段的功能需求 |

## 当前技术决策

- React 19 + TypeScript + Vite；Windows 桌面版使用 Electron 便携包。
- Node.js + TypeScript 数据工具；cheerio 解析 HTML，zod 校验边界数据。
- Schema v4 静态 JSON 与本地图片，运行时断网可用且不访问第三方接口。
- 路径计算放入 Web Worker；图形树由 `@xyflow/react` 渲染，并提供等价文本步骤。
- 少量用户状态使用 `localStorage`：已明确保存的帕鲁和管理员上限；临时起点只存在于当前会话。

## 当前明确不做

账号与云同步、存档修改、个体数量、蛋糕/孵化成本、被动继承概率推演、运行时遥测和默认联网更新。
