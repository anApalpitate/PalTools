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
platforms: [shared, web, electron, windows, mac, node]
source_of_truth: [package.json, src, cli, pipeline/data, script/electron/main.cjs, script/electron/agent-gateway.cjs, script/electron/preload.cjs, script/package-mac.mjs]
related: [product-requirements, data-compliance, data-pipeline, local-first-static-data, versioned-client-state, secure-electron-boundary, local-evidence-agent]
---

# 架构说明

## 1. 运行结构

paldb 公开 HTML 与素材、固定 PalCalc 快照由 pipeline/data 生成 public/data 和 public/generated。React UI 与 CLI 共同消费图鉴和配方领域查询；Web 构建输出到 build/web，Electron 只加载静态产物。

渲染层保持 contextIsolation、禁用 Node 集成并启用沙箱。唯一 preload 只暴露帕鲁助手的配置 CRUD、推理、取消和流事件订阅，不提供通用网络、文件或 shell 能力。Windows 便携包只保留中英文 Chromium 语言包；macOS Apple Silicon DMG 保留 Electron 原生 `en.lproj` 资源（应用 UI 本身使用包内中文文本）。`package:exe` 与 `package:mac` 分别负责 Web 构建、打包应用 smoke 和产物校验。macOS 当前产物不签名、不公证，仅用于本地开发验证。

## 2. 数据模块

- pipeline/data/paldb/client.ts：robots、缓存、节流、超时和重试。
- pipeline/data/paldb/parser.ts：列表、详情、技能、被动、掉落与素材解析。
- pipeline/data/build.ts：来源关联、空值处理、去重、无性别公式规范化和索引生成。
- pipeline/data/validate.ts：独立读取最终文件与原始快照验证，不能复用生成过程证明自身正确。

公共数据使用 Schema v4。breeding-index.json 通过帕鲁 ID 表、紧凑三元组配方、双亲索引和子代索引保存唯一配方；正反向索引值均为配方下标。

## 3. 领域层

src/domain/pals.ts 负责图鉴过滤、精确双亲查询、单亲配方展开与稳定排序、反向查询和紧凑配方解码。配种查询在该纯领域层从子代索引派生“只能自身 + 自身得到自身”的传说帕鲁集合，并统一完成传说配方过滤、身份编号排序和三个槽位的平均稀有度排序。src/domain/search.ts 使用随包离线分发的 pinyin-pro 统一生成中文名称的连续拼音和首字母别名，并处理纯数字图鉴号匹配。

src/domain/breeding-workspace.ts 是纯领域编排模块：定义关系快照、方案、偏好和导出契约，解析有效/失效关系，执行稳定循环检测、配方背包查询、无向连通分量、基础亲本/目标和拓扑步骤。src/domain/breeding-graph.ts 则独立定义图节点模式、可序列化节点/边契约、合并/实例建图算法及目标祖先投影；它只依赖配方领域类型，不依赖工作区、React、DOM、IndexedDB、ELK 或 Worker。每条配方在语义图中由无序亲本输入边、小型配方汇合点和唯一子代输出边组成；汇合点不是业务卡片。实例图还根据当前保留的依赖边为物种汇合节点派生 `source`、`result` 或 `intermediate`，目标投影后重新计算该角色，渲染层只据此绘制上下虚线分界。工作区将有效关系和连通分量单向传入图模块，ELK 布局与 React Flow 渲染直接消费图模块的公开契约，因此图语义、布局参数和画面渲染可以分别修改。图输入会先稳定排序关系并规范化两个亲本，不修改调用方数组；交换亲本 A/B 后仍生成相同节点、边和布局输入，持久化快照与导入身份校验仍保留原槽位。

src/domain/knowledge.ts 在运行时从已有图鉴、技能、被动和掉落目录建立小型加权文档索引，并将八个公开只读工具的 Zod 参数校验、结果裁剪、证据快照和应用内路由集中在同一纯领域服务。中文单字/二元词组与英文词元用于 BM25 风格评分，名称、编号、拼音和内部 ID 权重高于说明字段；精确配种查询直接复用 src/domain/pals.ts 和紧凑配种索引。

src/domain/provider-adapters.ts 把四种厂商协议映射到统一消息、工具、流事件和用量契约。src/domain/agent-runner.ts 先执行用户通过 `@` 指定的本地工具，再合并实体引用预检索、自动意图结果与完整的受限工具结果包，最后进入最多六轮、累计八次模型追加调用的工具循环；仅检索模型也能消费显式本地调用，并忽略模型违规返回的工具请求。它不向模型暴露远程工具，也不采信模型自称的引用。Provider 适配和 Agent 编排仍是无 DOM 的领域逻辑，实际网络由平台网关注入。

## 4. CLI 模块

cli 是独立于 React、DOM 和 Electron 的命令行模块，开发期经 tsx 复用 src/domain，构建期用 esbuild 打包为单个 Node ESM 文件。CLI 只读 public/data，不发起运行时网络请求。

命令包括 info、search、forward 和 reverse；全局支持 --json、--data-dir 与 PALTOOLS_DATA_DIR。退出码 0 表示成功、1 表示内部错误、2 表示参数或身份歧义、3 表示无结果、4 表示数据缺失或 Schema 不兼容。旧 plan validate 命令已随方案格式删除。

## 5. 前端与状态边界

src/App.tsx 负责应用壳、顶层导航、共享数据协调和错误状态。src/lib/device.ts 在渲染入口根据 `userAgentData.mobile`、移动 UA 以及 iPadOS 的触控桌面 UA 提示移动设备不受支持；普通 Windows 触控设备和窄宽度桌面视口不被误判。移动设备只渲染平台提示，不挂载桌面应用、读取静态目录数据或打开功能页。页面主体位于 src/features/paldex、src/features/breeding、src/features/assistant 和 src/features/settings；共享选择器、图片和徽章位于组件模块。

src/lib/app-route.ts 定义轻量 hash 路由；URL 是工具页、图鉴详情、配种标签、反查目标、双亲参数和助手对话的导航真相。App 同步处理 push/replace、`hashchange` 与 `popstate`，非法路由回退到安全入口。hash 形式兼容 Web 与 Electron 的静态文件协议，无需修改 Electron pathname 映射；查询文本、分页、滚动位置和配种头像选中态不进入历史记录。

配种页维护正反向查询的临时输入，并通过 useBreedingWorkspace 编排持久工作区。所有写操作先在单一 IndexedDB 事务中提交，再发布 React 状态；失败时保留操作前状态并给出可恢复错误。查询输入不依赖工作区成功打开，IndexedDB 不可用或记录损坏时仍可查询，并提供重试、导入备份和确认重置入口。

src/storage/breeding-workspace.ts 使用 Zod 校验导入边界，并将工作区规范化存入 `paltools-breeding-network`：metadata 保存 Schema、数据版本、当前方案和偏好，relations 以 recipeIndex 保存快照与背包成员状态，plans 保存方案元数据，planRelations 以 `[planId, recipeIndex]` 保存引用。无背包或方案引用的关系会被回收。应用仍在启动时请求删除旧 `paltools-breeding`，不迁移旧图数据。

src/storage/agent-storage.ts 将助手对话保存到独立的 `paltools-agent` IndexedDB：conversations、messages、evidence 与 traces 分表，所有读取经 Zod 边界校验。用户消息可选保存结构化工具和实体引用，不新增对象仓库，旧消息按无引用读取；证据保存回答时真正使用的快照与数据版本，公开轨迹区分预检索、自动意图、用户指定和模型追加调用。配置只保存引用，配置删除不会使历史内容失效。Web 的模型配置元数据存于 localStorage，但 API Key 仅存在模块内存；Electron 的配置元数据写入 userData，密钥通过 `safeStorage` 异步加密，系统加密不可用时退回不落盘的进程会话。src/lib/provider-service.ts 将密钥作用域绑定到配置的地址、传输协议和认证方式：这些字段变化且未同时提供新密钥时，Web 内存密钥与传给 Electron 安全网关的旧密钥均被清除。发送前的数据披露授权另按配置 ID、传输协议和规范化地址分域，端点变化后不会沿用旧授权。

| 状态 | 生命周期 | 存储 |
| --- | --- | --- |
| 主题偏好 | 跨启动 | paltools.theme.v1 |
| 旧代数配置 | 不再消费 | paltools.admin-config.v1，保留期内不主动清理 |
| 图鉴和配方 | 数据集版本 | 包内静态 JSON |
| 配方背包、方案与偏好 | 跨启动、Schema v1 | paltools-breeding-network IndexedDB |
| 助手对话、消息、证据与公开轨迹 | 跨启动、Schema v1 | paltools-agent IndexedDB |
| Web 模型配置元数据 | 跨启动、Schema v1 | paltools.agent-profiles.v1 localStorage |
| Web API Key | 当前页面 | JS 模块内存，不落盘 |
| Electron 模型配置与加密 API Key | 跨启动或当前进程 | userData/agent-providers.json + safeStorage；不可加密时仅内存 |
| 旧配种图方案 | 已退场 | 启动时删除 paltools-breeding IndexedDB |

样式入口 src/styles.css 固定声明 theme、base、shared、features、utilities 层级。七套主题集中定义结构、文字、强调、警告、危险、焦点和稀有度语义令牌；共享层另定义控件、面板和弹窗三级圆角。业务组件不引用主题 ID，也不保存主题专属颜色字面量。主题单元测试校验令牌完整性、对比度、预览色归属及组件样式无调色板硬编码。

## 6. UI 与可访问性

- 应用壳使用紧凑顶栏、档案式页标题和高密度工作区；顶栏导航复用 24×24 线性 SVG，并通过 `aria-current` 标记当前页。跳转主内容链接在键盘聚焦时显示。
- 图鉴宽屏使用最小 260px 的自动填充网格，1440px 视口为五列；配种查询区最大宽度 1240px。页面横向溢出由布局本身消除，body 只作为最终横向边界，不替代内部滚动区。
- 图鉴详情在桌面为左右双栏，较窄桌面视口纵向排列；移动设备由应用入口统一阻断。
- 图鉴详情打开后焦点进入关闭按钮，Tab/Shift+Tab 在弹窗内循环；Escape、按钮或背景关闭后恢复触发卡片焦点。背景 body 保持滚动锁，左右内容区分别拥有滚轮滚动和 overscroll containment。
- 配种页以三个 URL 控制的标签切换双亲查子代、获取目标帕鲁和配种方案网。查询卡共享即时背包状态；两类查询分别保存“排除传说”和“排除自交”文字过滤状态，共享编号/平均稀有度及正倒方向排序和图形化稀有度展示。文字过滤、方向图标、传说边框和查询卡 `＋/✓` 收藏按钮只消费主题语义令牌，并提供按压语义、悬停说明或可访问名称。
- `BreedingPalAvatar` 复用本地图片组件，并以可交互按钮或只读预览两种模式统一配种头像。提示浮层通过 portal 挂载到 body 并使用 fixed 定位；交互头像的选中键由视图范围、配方编号和槽位组成，第二次激活才请求图鉴导航。图形网只消费预览模式。
- 方案网桌面使用可完全折叠的配方背包侧栏，折叠状态仅存在于组件生命周期且不写入 IndexedDB；800px 及以下改为带焦点圈定、Escape 关闭和焦点恢复的抽屉。侧栏折叠、展开和抽屉开关共用具名 SVG 图标按钮，断点或展开状态改变时重新测量虚拟列表。步骤、图形和关系列表共享同一派生关系集合；背包项把本地头像横向排列、名称置于头像下方，并在右下元信息行显示方案状态与配方编号。背包工具栏以五列网格固定单行展示全选、未入方案、默认开启的排除自交、排序字段和方向，每项复用主题语义色的内联 SVG 图标、短标签、按压状态与完整可访问名称。步骤及关系列表共享角色卡片公式，使用放大头像与非颜色角色标记。
- 图形网使用只读 React Flow。合并模式由帕鲁节点与小型配方汇合点组成，实例模式额外包含统一标记为“亲本”的实例、子代实例和物种汇合节点；配方汇合点只提供三元关系语义和布线路由，不显示为操作卡片。普通配方使用两个 `parentInput` 和一个 `offspringOutput`，同种亲本输入带 `multiplicity: 2`；唯一输出边显示配方编号与移除入口。所有帕鲁节点显示本地头像。ELK layered 布局通过独立 Worker 执行，固定从上到下并使用正交路由；布局层保留 ELK 的节点坐标、线路拐点和标签坐标，再按实际画布宽度稳定装箱连通分量。递增请求 ID 丢弃过期响应，React 不持久化坐标，也不重新推测线路。React Flow 的节点、边、标签、隐藏连接点、背景和控制按钮通过 PalTools 主题令牌着色，不使用库默认调色板。
- 配方背包和方案关系列表通过 TanStack Virtual 固定行高虚拟化，并提供列表总量、位置和键盘滚动语义。
- `npm.cmd run samples:breeding-workspaces` 从当前 manifest 与紧凑配种索引确定性生成 20 代深链、分支汇合、多目标多分量和 120 条大型方案；写入被忽略的 `.tmp/` 前后均复用生产导入解析、关系解析、DAG 和派生图校验。
- 帕鲁选择器支持过滤、方向键、Enter、Escape、外部点击和滚动到高亮项。
- 图片失败使用本地占位；属性图标具有中文可访问名称。
- 主题卡片使用 radiogroup 与 radio 语义、循环方向键导航和非颜色选中标记。
- 助手宽屏以档案列表、对话和证据三栏呈现，页面标题、模型状态和响应式侧栏开关收拢到对话会话栏，使工作台按 `100dvh` 近满高显示；中等宽度隐藏证据栏，窄桌面改为左右抽屉。对话主体使用主题不透明纯色表面，回答和证据卡继续用同一编号脊线关联。抽屉具备焦点圈定、Escape 关闭、关闭态焦点隔离和焦点恢复；流式回答与 `@` 选择状态通过可访问 live region 宣告。公开轨迹只显示调用来源、工具名称、参数摘要、命中数和耗时。
- 空、加载、错误、禁用、危险、悬停、按压、选中与焦点状态复用语义令牌；加载占位只使用 opacity 脉冲，其他交互动效只过渡 transform/opacity，并在 reduced-motion 下归零。

## 7. 质量边界

Vitest 覆盖解析器、数据领域、CLI、工作区仓储、知识检索、Provider 契约、Agent 编排、ELK 确定性和组件交互；Playwright 做真实浏览器离线、键盘、Worker 图形网和响应式验收；Electron smoke 验证 preload、助手路由、配置往返以及现有 IndexedDB 可写与刷新恢复，不请求真实厂商。Electron 安全开关、自定义协议校验和 Node 集成设置未因助手改变。

配种图形网的浏览器回归固定覆盖 1440×900、1152×720、1366×768 和 800×720：断言亲本、配方汇合点、输出标签和子代的纵向顺序，适应视图不放大到 1 倍以上，无页面横向溢出、破图、控制台错误或第三方请求，并逐一核验七套主题的汇合点、输入边、输出边和标签颜色。
