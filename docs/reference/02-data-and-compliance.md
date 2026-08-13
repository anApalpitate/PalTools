---
schema_version: 1
id: data-compliance
title: 数据来源与合规
summary: 记录 paldb 与 PalCalc 来源、抓取边界、素材规则、Schema 规范和正式更新约束。
type: reference
status: current
authority: canonical
domains: [data, paldex, breeding, desktop]
topics: [compliance, schema, pipeline, packaging]
platforms: [shared, node, electron]
source_of_truth: [pipeline/data, data/paldb-aliases.json, public/data/manifest.json, script/electron/resources]
related: [product-requirements, architecture, data-pipeline, local-first-static-data]
---

# 数据来源与合规

## 1. 来源

### paldb

- 每次联网同步先读取 `https://paldb.cn/robots.txt`。
- 只请求允许访问的 `/pals`、299 个 `/pals/{slug}` 公开 HTML 和页面已引用的 WebP。
- 不访问 `/api/`，不自动调用配种页内部接口，也不额外抓取主动技能详情页。
- 公开详情页用于中文字段、伙伴技能、数值、主动技能卡、固有被动、掉落和素材地址。

### PalCalc

- 仓库：`https://github.com/tylercamp/palcalc`
- 版本：`v1.17.6`
- 提交：`8b7e2f779e47fddae16ddcb973e828ba20c02b80`
- `breeding.json` SHA-256：`1AF1E4D6B461599EC3B80A2195002337FF484ED3C28CE57E27DEF96138262EC2`
- 用于正式版配种矩阵、内部 ID、部分 paldb 未提供的移动参数和唯一合并条目。

## 2. 抓取约束

- 单并发、请求间隔至少 1 秒、15 秒超时、最多 3 次重试。
- 尊重 `Retry-After`，否则指数退避。
- 原始 HTML 缓存在忽略目录；默认复用，`--refresh` 显式刷新，`--offline` 禁止联网。
- robots 规则禁止、字段覆盖下降、重复定义冲突或 HTML 漂移时失败，不输出残缺正式数据。

## 3. 素材

- 帕鲁图、本地属性图标、工作适应性图标和掉落图标分别保存在 `public/generated/pals/`、`elements/`、`work-suitabilities/`、`items/`。
- 素材必须通过 HTTP 状态、Content-Type、WebP 文件头和 SHA-256 校验。
- 素材目录不入库，也不在运行时热链接；当前本地打包仅供用户自己使用。
- 公开分发前必须重新确认素材复制与再分发权利。
- “未知属性”使用自制问号占位，不冒充来源素材。

### 应用品牌图标

- PalTools 应用图标是本项目原创品牌资产，不来自 paldb、PalCalc、Pocketpair 或游戏文件。
- 2026-07-28 使用 Codex 内置 ImageGen 生成“P + 分支节点”母版；未使用具体帕鲁、帕鲁球、游戏素材、商标或第三方参考图。
- 生成结果先置于纯洋红色键背景，再用 ImageGen 技能附带的 `remove_chroma_key.py` 本地去背；透明母版保存为 `script/electron/resources/icon.png`。
- 从同一母版派生 Windows 多尺寸 `icon.ico`、96×96 顶栏图标和 32×32 favicon。所有文件随应用本地打包，运行时不请求外部服务。
- 当前 electron-builder 在根目录 `"type":"module"` 下调用仓库缓存内 CommonJS `icon-tool.js` 转换 PNG 时会误判为 ESM。Windows 构建显式使用预生成 ICO；macOS 打包把 electron-builder 缓存置于系统临时目录，使其可从 PNG 母版正常生成 ICNS。PNG 保留为可追溯母版。

主生成提示词：

```text
Use case: logo-brand
Asset type: Windows desktop app icon, browser favicon, and compact top-bar brand mark for PalTools
Primary request: create one original app icon built around a bold capital-P-shaped monogram formed by a simple breeding-route branch and three connected circular nodes
Scene/backdrop: place the entire icon on a perfectly flat solid #ff00ff chroma-key background for local background removal
Subject: a centered deep forest-green rounded-square badge containing a highly legible mint-green P-shaped route symbol; include one small warm-gold node or short branch accent
Style/medium: minimal flat vector-like brand mark, crisp geometric edges, strong silhouette, professional desktop utility icon
Composition/framing: centered square composition, balanced negative space, readable at 16x16 pixels
Color palette: badge #07110e and #0a1712, primary symbol #67e9ab, small accent #efc773, chroma-key background #ff00ff
Constraints: original design only; no Pal characters, creatures, Pal Sphere, eggs, game artwork, trademarks, words, extra letters, watermark, glow, shadows, 3D effects, fine lines, or tiny decorations
```

唯一一次针对性修正要求保留构图，仅将颜色限制为纯色、移除渐变和阴影并强化小尺寸边缘。最终产物仍存在极轻微生成色彩过渡，但轮廓、透明边缘和 16–32 px 可辨性通过验收。

## 4. Schema v4 规范化

PalCalc 原始文件中的两条性别限制记录仍会被校验，但正式索引移除所有性别字段，并将唯一特例规范为：

```text
Katress + Wixen → Katress Ignis
Katress + Wixen → Wixen Noct
```

最终仍为 44,851 条公式和 44,850 个无序组合。除该组合外，每个组合必须只有一个子代。

paldb 与固定 PalCalc 快照的名称差异由 [`data/paldb-aliases.json`](../../data/paldb-aliases.json) 显式维护，不能通过模糊匹配悄悄合并。当前 `Snock_Terra`（163B，金涡蜗）映射到 PalCalc 内部 ID `ElecSnail_Ground`；该固定快照中的英文展示名仍为 `Snock Lux`。

当前 paldb 掉落概率单元格会把等级范围和概率紧凑渲染（例如 `1–3100%`）。解析器将范围下限写入现有单值 `requiredLevel`，并保留末尾的概率百分比；数据模型不保存等级上限。

主动技能按来源 `/skills/{slug}` 去重。帕鲁专属的解锁等级、名称差异或攻击范围差异保存在引用层；技能其余不变量冲突会使构建失败。掉落物使用稳定素材 ID 与名称区分；多个条目可以合法共用同一图标文件。

没有直接 paldb 页面的合并条目使用 `null`；来源页明确没有内容时使用空数组。两者语义不得混用。

## 5. 快照与清单

manifest 固定记录 Schema、数据集版本、游戏 Build ID `24181527`、来源 revision、哈希、生成时间及以下计数：

- 300 个图鉴条目。
- 44,851 条公式、44,850 个亲本组合。
- 307 个主动技能、2,380 条技能引用。
- 51 条固有被动、1,643 条掉落。
- 116 个物品条目、115 个唯一物品图标。
- 12 个工作适应性图标。

校验不允许 `unknown`、`pending` 或未固定的正式来源进入 manifest。

## 6. 更新流程

1. 检查来源许可、robots 规则和固定版本。
2. `npm run data:sync:pals -- --refresh`
3. `npm run data:import:breeding`
4. `npm run data:build`
5. 审阅数量及差异；来源内容确实升级时再调整快照期望。
6. `npm run data:validate`
7. 执行完整测试、构建和离线桌面验收。

运行时不读取存档、不修改游戏文件、零热链接、零遥测。
