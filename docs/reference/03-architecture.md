---
schema_version: 1
id: architecture
title: 架构说明
summary: 描述数据管线、领域层、Web、CLI、Electron 和本机状态之间的当前边界。
type: reference
status: current
authority: canonical
domains: [product, paldex, breeding, data, cli, desktop, tooling]
topics: [architecture, storage, schema, pipeline, packaging, testing]
platforms: [shared, web, electron, windows, node]
source_of_truth: [package.json, src, cli, pipeline/data, script/electron/main.cjs]
related: [product-requirements, data-compliance, data-pipeline, local-first-static-data, versioned-client-state, secure-electron-boundary]
---

# 架构说明

## 1. 运行结构

paldb 公开 HTML 与素材、固定 PalCalc 快照由 pipeline/data 生成 public/data 和 public/generated。React UI 与 CLI 共同消费图鉴和配方领域查询；Web 构建输出到 build/web，Electron 只加载静态产物。

渲染层保持 contextIsolation、禁用 Node 集成并启用沙箱。便携包只保留中英文 Chromium 语言包，package:exe 负责 Web 构建、打包应用 smoke、产物大小和 SHA-256。

## 2. 数据模块

- pipeline/data/paldb/client.ts：robots、缓存、节流、超时和重试。
- pipeline/data/paldb/parser.ts：列表、详情、技能、被动、掉落与素材解析。
- pipeline/data/build.ts：来源关联、空值处理、去重、无性别公式规范化和索引生成。
- pipeline/data/validate.ts：独立读取最终文件与原始快照验证，不能复用生成过程证明自身正确。

公共数据使用 Schema v4。breeding-index.json 通过帕鲁 ID 表、紧凑三元组配方、双亲索引和子代索引保存唯一配方；正反向索引值均为配方下标。

## 3. 领域层

src/domain/pals.ts 负责图鉴过滤、精确双亲查询、单亲配方展开与稳定排序、反向查询和紧凑配方解码。配种查询在该纯领域层从子代索引派生“只能自身 + 自身得到自身”的传说帕鲁集合，并统一完成传说配方过滤、身份编号排序和三个槽位的平均稀有度排序。src/domain/search.ts 使用随包离线分发的 pinyin-pro 统一生成中文名称的连续拼音和首字母别名，并处理纯数字图鉴号匹配。

src/domain/breeding-workspace.ts 是纯领域模块：定义关系快照、方案、偏好和导出契约，解析有效/失效关系，执行稳定循环检测、配方背包查询、无向连通分量、基础亲本/目标、拓扑步骤以及合并/实例图输入。它不依赖 React、DOM、IndexedDB 或 Worker。图输入会先按稳定 ID 规范化两个亲本，因此交换亲本 A/B 后仍生成相同节点、边和布局输入；持久化快照与导入身份校验仍保留原槽位。

## 4. CLI 模块

cli 是独立于 React、DOM 和 Electron 的命令行模块，开发期经 tsx 复用 src/domain，构建期用 esbuild 打包为单个 Node ESM 文件。CLI 只读 public/data，不发起运行时网络请求。

命令包括 info、search、forward 和 reverse；全局支持 --json、--data-dir 与 PALTOOLS_DATA_DIR。退出码 0 表示成功、1 表示内部错误、2 表示参数或身份歧义、3 表示无结果、4 表示数据缺失或 Schema 不兼容。旧 plan validate 命令已随方案格式删除。

## 5. 前端与状态边界

src/App.tsx 负责应用壳、顶层导航、共享数据协调和错误状态。src/lib/device.ts 在渲染入口根据 `userAgentData.mobile`、移动 UA 以及 iPadOS 的触控桌面 UA 提示移动设备不受支持；普通 Windows 触控设备和窄宽度桌面视口不被误判。移动设备只渲染平台提示，不挂载桌面应用、读取静态目录数据或打开功能页。页面主体位于 src/features/paldex、src/features/breeding 和 src/features/settings；共享选择器、图片和徽章位于组件模块。

配种页维护正反向查询的临时输入，并通过 useBreedingWorkspace 编排持久工作区。所有写操作先在单一 IndexedDB 事务中提交，再发布 React 状态；失败时保留操作前状态并给出可恢复错误。查询输入不依赖工作区成功打开，IndexedDB 不可用或记录损坏时仍可查询，并提供重试、导入备份和确认重置入口。

src/storage/breeding-workspace.ts 使用 Zod 校验导入边界，并将工作区规范化存入 `paltools-breeding-network`：metadata 保存 Schema、数据版本、当前方案和偏好，relations 以 recipeIndex 保存快照与背包成员状态，plans 保存方案元数据，planRelations 以 `[planId, recipeIndex]` 保存引用。无背包或方案引用的关系会被回收。应用仍在启动时请求删除旧 `paltools-breeding`，不迁移旧图数据。

| 状态 | 生命周期 | 存储 |
| --- | --- | --- |
| 主题偏好 | 跨启动 | paltools.theme.v1 |
| 旧代数配置 | 不再消费 | paltools.admin-config.v1，保留期内不主动清理 |
| 图鉴和配方 | 数据集版本 | 包内静态 JSON |
| 配方背包、方案与偏好 | 跨启动、Schema v1 | paltools-breeding-network IndexedDB |
| 旧配种图方案 | 已退场 | 启动时删除 paltools-breeding IndexedDB |

样式入口 src/styles.css 固定声明 theme、base、shared、features、utilities 层级。七套主题集中定义结构、文字、强调、警告、危险和稀有度语义令牌，业务组件不引用主题 ID，也不保存主题专属颜色字面量。主题单元测试校验令牌完整性、对比度、预览色归属及组件样式无调色板硬编码。

## 6. UI 与可访问性

- 图鉴详情在桌面为左右双栏，较窄桌面视口纵向排列；移动设备由应用入口统一阻断。
- 配种页以三个标签切换双亲查子代、获取目标帕鲁和配种方案网。查询卡共享即时背包状态，页面切换不清空查询或收藏；两类查询分别保存空涡龙“排除传说”和捣蛋猫“排除同种”头像开关，共享编号/平均稀有度及正倒方向排序和图形化稀有度展示。头像开关、斜杠、传说边框和查询卡 `＋/✓` 收藏按钮只消费主题语义令牌，并提供悬停说明、`aria-pressed` 或可访问名称。
- 方案网桌面使用独立配方背包侧栏，窄屏改为带焦点圈定、Escape 关闭和焦点恢复的抽屉。步骤、图形和关系列表共享同一派生关系集合；背包项把本地头像横向排列、名称置于头像下方，并在右下元信息行显示方案状态与配方编号。
- 图形网使用只读 React Flow；领域层不生成配方操作节点：合并模式由帕鲁节点和无序亲本直连边组成，实例模式由统一标记为“亲本”的实例、子代实例和同种帕鲁汇合点组成。普通亲本边共用 `parent` 角色和主题强调色，同种亲本边使用 `parents` 角色；稳定的 `actionAnchor` 只让每条配方的一条边显示移除入口。所有帕鲁节点显示本地头像。ELK layered 布局通过独立 Worker 执行，使用规范化稳定输入、固定从左到右选项和整数坐标。递增请求 ID 丢弃过期响应，React 不持久化坐标。React Flow 的节点、边、标签、连接点、背景和控制按钮通过其 CSS 变量映射到 PalTools 主题令牌，不使用库默认调色板。
- 配方背包和方案关系列表通过 TanStack Virtual 固定行高虚拟化，并提供列表总量、位置和键盘滚动语义。
- 帕鲁选择器支持过滤、方向键、Enter、Escape、外部点击和滚动到高亮项。
- 图片失败使用本地占位；属性图标具有中文可访问名称。
- 主题卡片使用 radiogroup 与 radio 语义、循环方向键导航和非颜色选中标记。

## 7. 质量边界

Vitest 覆盖解析器、数据领域、CLI、工作区仓储、ELK 确定性和组件交互；Playwright 做真实浏览器离线、键盘、Worker 图形网和响应式验收；Electron 包装后验证新 IndexedDB 可写及刷新恢复。Electron 安全开关、自定义协议校验和 Node 集成设置未因方案网改变。
