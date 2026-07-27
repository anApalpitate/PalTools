# PalTools 文档索引

| 文档 | 说明 |
| --- | --- |
| [01-product-requirements.md](01-product-requirements.md) | 当前产品范围、用户场景和验收标准 |
| [02-feasibility-and-stack.md](02-feasibility-and-stack.md) | 技术组合与可行性分析 |
| [03-data-and-compliance.md](03-data-and-compliance.md) | 数据来源、快照、素材和合规边界 |
| [04-architecture.md](04-architecture.md) | Schema v3、模块、索引、Worker 与状态边界 |
| [05-roadmap.md](05-roadmap.md) | 已完成里程碑及后续候选 |
| [06-phase-1-data-pipeline.md](06-phase-1-data-pipeline.md) | 数据命令、缓存、构建、校验与更新流程 |
| [07-phase-2-paldex-enhancement.md](07-phase-2-paldex-enhancement.md) | 属性图标、详细数值与模块化爬虫 |
| [08-next-phase-recommendations.md](08-next-phase-recommendations.md) | 第四阶段功能建议与风险排序 |
| [09-phase-3-breeding-planner-and-paldex-content.md](09-phase-3-breeding-planner-and-paldex-content.md) | 第三阶段反向配种、路径算法、技能/掉落和管理员配置 |

## 当前技术决策

- React 19 + TypeScript + Vite；Windows 桌面版使用 Electron 便携包。
- Node.js + TypeScript 数据工具；cheerio 解析 HTML，zod 校验边界数据。
- Schema v3 静态 JSON 与本地图片，运行时断网可用且不访问第三方接口。
- 路径计算放入 Web Worker；图形树由 `@xyflow/react` 渲染，并提供等价文本步骤。
- 少量用户状态使用 `localStorage`：已拥有帕鲁和管理员上限；临时起点只存在于当前会话。

## 当前明确不做

账号与云同步、存档修改、个体数量、蛋糕/孵化成本、被动继承概率推演、运行时遥测和默认联网更新。
