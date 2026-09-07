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
source_of_truth: [package.json, src, cli, pipeline/data, script/development/dev-provider.cjs, script/electron/main.cjs, script/electron/agent-gateway.cjs, script/electron/preload.cjs, script/package-mac.mjs]
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

src/domain/knowledge-contract.ts 集中定义证据、八个只读工具、结构化 `@` 引用、公开轨迹与 Zod 边界；存储、Agent 编排和 Provider 只依赖这层轻量契约。src/domain/knowledge.ts 只负责从图鉴、技能、被动和掉落目录建立小型加权文档索引、执行本地工具及裁剪结果。中文单字/二元词组与英文词元用于 BM25 风格评分，名称、编号、拼音和内部 ID 权重高于说明字段；帕鲁、技能和物品共用 src/domain/search.ts 缓存后的拼音/首字母别名，精确配种查询直接复用 src/domain/pals.ts 和紧凑配种索引。

知识索引在构造时缓存字段词频、字段长度和文档 ID 映射，查询阶段不再反复扫描字段 tokens；分词、BM25 公式、命中字段、排序与上限保持不变。当前数据的 736 组名称、编号、拼音、技能、掉落、重复词、分类/截断及无结果查询与优化前结果完全一致。7 轮交替测量中，260 次固定查询的中位耗时从 631.31ms 降至 121.11ms，索引构造从 46.88ms 增至 56.45ms；这是本机对照而非性能保证。固定夹具另保留精确评分与命中字段回归断言。

src/domain/provider-protocol.ts 是四种厂商协议请求转换、响应解析、流事件和用量契约的唯一纯实现。src/domain/provider-adapters.ts 仅在 Web 入口校验配置后调用它；构建脚本在确认协议源没有运行时依赖、平台 I/O 或外部导入后生成 build/electron/provider-protocol.cjs，Electron 主进程消费同一产物，并继续独占网络、密钥、URL、重定向、大小、超时、取消和 IPC 安全校验。src/domain/agent-runner.ts 先兼容执行旧消息中已有的显式工具引用，再用问题正文与对象引用预检索；没有旧式显式工具时，正文意图优先决定领域调用，否则把单帕鲁、2–4 只帕鲁、技能和物品依次映射到资料、比较、技能拥有者与掉落来源查询，最多派生四项。双亲意图在消息绑定阶段要求恰好两只帕鲁，使 UI 能在写入对话前保留草稿并提示修正；多个物品或技能意图逐个生成受限调用。完整的受限工具结果与证据摘要合并后进入最多六轮、累计八次模型追加调用的工具循环；仅检索模型也能消费本地派生结果，并忽略模型违规返回的工具请求。它不向模型暴露远程工具，也不采信模型自称的引用。

## 4. CLI 模块

cli 是独立于 React、DOM 和 Electron 的命令行模块，开发期经 tsx 复用 src/domain，构建期用 esbuild 打包为单个 Node ESM 文件。CLI 只读 public/data，不发起运行时网络请求。src/domain/runtime-data.ts 对 Schema v4 静态文件执行轻量 envelope 与关键字段检查，Web 的 fetch 和 CLI 的 fs 读取复用这一契约；来源、哈希、配方关系和完整记录仍只由 pipeline/data/validate.ts 深度验证。

命令包括 info、search、forward 和 reverse；全局支持 --json、--data-dir 与 PALTOOLS_DATA_DIR。退出码 0 表示成功、1 表示内部错误、2 表示参数或身份歧义、3 表示无结果、4 表示数据缺失或 Schema 不兼容。旧 plan validate 命令已随方案格式删除。

## 5. 前端与状态边界

src/App.tsx 负责应用壳、顶层导航、共享数据协调和错误状态。useCatalogData 与 useBreedingIndex 都使用 idle/loading/success/error 状态、AbortController、请求序号和显式 retry；切页或卸载会取消请求并忽略过期结果，重试成功后清除旧错误。目录失败显示阻断恢复页；配种索引失败只在配种页阻断，图鉴详情和助手保留不依赖配方的能力并显示就地重试提示。src/lib/device.ts 在渲染入口根据 `userAgentData.mobile`、移动 UA 以及 iPadOS 的触控桌面 UA 提示移动设备不受支持；普通 Windows 触控设备和窄宽度桌面视口不被误判。移动设备只渲染平台提示，不挂载桌面应用、读取静态目录数据或打开功能页。页面主体位于 src/features/paldex、src/features/breeding、src/features/assistant 和 src/features/settings；共享选择器、图片和徽章位于组件模块。

src/lib/app-route.ts 定义轻量 hash 路由；URL 是工具页、图鉴详情、配种标签、反查目标、双亲参数和助手对话的导航真相。App 同步处理 push/replace、`hashchange` 与 `popstate`，非法路由回退到安全入口。hash 形式兼容 Web 与 Electron 的静态文件协议，无需修改 Electron pathname 映射；查询文本、分页、滚动位置和配种头像选中态不进入历史记录。

配种页维护正反向查询的临时输入，并通过 useBreedingWorkspace 编排持久工作区。所有写操作先在单一 IndexedDB 事务中提交，再发布 React 状态；失败时保留操作前状态并给出可恢复错误。查询输入不依赖工作区成功打开，IndexedDB 不可用或记录损坏时仍可查询，并提供重试、导入备份和确认重置入口。

工作区加载、普通修改、导入替换和重置共用一条有序队列。操作入队时绑定仓储生命周期，重试立即使旧回调和未开始操作失效，等待在途提交结束后才打开新仓储并重新加载；卸载也延后关闭连接。已开始的事务仍可完成，不承诺取消持久化，旧结果不会覆盖新界面。加载损坏后的替换/重置不依赖已有工作区快照；清空方案在队列执行时读取当前关系。

src/storage/breeding-workspace.ts 使用 Zod 校验导入边界，并将工作区规范化存入 `paltools-breeding-network`：metadata 保存 Schema、数据版本、当前方案和偏好，relations 以 recipeIndex 保存快照与背包成员状态，plans 保存方案元数据，planRelations 以 `[planId, recipeIndex]` 保存引用。无背包或方案引用的关系会被回收。应用仍在启动时请求删除旧 `paltools-breeding`，不迁移旧图数据。

src/storage/agent-storage.ts 将助手对话保存到独立的 `paltools-agent` IndexedDB：conversations、messages、evidence 与 traces 分表，所有读取经 Zod 边界校验。用户消息可选保存结构化工具和实体引用，不新增对象仓库，旧消息按无引用读取；证据保存回答时真正使用的快照与数据版本，公开轨迹区分预检索、自动意图、用户指定和模型追加调用。每条研究记录保存服务连接 `profileId` 和独立 `modelId`；旧记录缺少后者时先采用最近一次助手回复的型号，再回退到连接默认型号。配置删除不会使历史内容失效，连接或型号无法解析时只读历史并要求显式重绑。页面以路由、加载、生成和保存代次隔离过期异步结果，切换会话或卸载时中止旧请求。

助手追加回答先校验消息及全部证据/轨迹，再开启跨四个对象仓库的写事务；同步写入错误或事务失败均中止并等待回滚，不能留下部分回答或提前更新会话元信息。发送失败后的错误记录另有恢复边界，持续存储故障也会复位发送状态；首次建档失败会显示错误，尚未保存的问题可恢复且不覆盖用户刚输入的新草稿。

会话读取在同一只读事务内，按当前消息 ID 使用 evidence/traces 的现有索引获取相关记录；无关会话不扫描、不解析。`AgentRepository.close()` 幂等关闭连接并拒绝新操作，关闭前已接受的操作允许完成；`versionchange` 也主动释放连接。助手在 effect 中创建仓储，卸载时关闭并使旧加载、档案刷新、生成和保存结果失效，兼容 StrictMode 重挂载。数据库名称、版本和对象仓库保持兼容。

模型配置使用 V2 服务连接结构：连接保存地址、传输、认证、超时、请求头与默认型号，`models` 保存显示开关、能力/状态元数据和逐型号参数。`src/domain/provider-catalog.ts` 是随应用发布的静态目录；加载已有 V2 时只追加新目录型号且默认隐藏，不覆盖用户设置。V1 每行独立转换并保留原 ID、型号和参数，不合并同服务商连接；Web 成功转换后原位写回，解析或转换失败时保留原 localStorage 数据。Web 的模型配置元数据存于 localStorage，但 API Key 仅存在模块内存；Electron 的配置元数据写入 userData，密钥通过 `safeStorage` 异步加密，系统加密不可用时退回不落盘的进程会话。src/lib/provider-service.ts 将密钥作用域绑定到连接的地址、传输协议和认证方式：这些字段变化且未同时提供新密钥时，Web 内存密钥与传给 Electron 安全网关的旧密钥均被清除。发送前的数据披露授权另按配置 ID、传输协议和规范化地址分域，端点变化后不会沿用旧授权。

Electron 配置读取/规范化、保存、删除、默认项变更及密钥重加密共用同进程队列。持久化先独占写入同目录随机临时文件，再替换目标文件；失败保留旧文件，成功后才同步提交会话密钥与默认项。推理只在队列内取得一致的配置/密钥快照，网络请求在队列外执行；排队期间仍可取消，替换请求的旧回调不能注销新请求。`useProviderProfiles` 每次刷新进入加载状态，只有最新请求可发布快照或错误，卸载和 StrictMode 重挂载会使旧结果失效。

未打包且非 smoke 的 Electron 启动会让主进程按 `script/development/dev-provider.cjs` 的严格两字段契约读取仓库外开发者 API 文件；当前默认路径为 `D:\aLCYYDS\IDM下载\开发者api.md`，也可用 `PALTOOLS_DEV_API_PATH` 指向另一份本机文件。文件只允许 `API Key:<值>` 与 `模型：<DeepSeek 模型 ID>` 两个非空字段。主进程把该 V1 输入转换成只含文件指定型号的 V2 托管连接；配置只读，密钥只存于主进程 `sessionKeys`，renderer 只能获得脱敏元数据，目录中的其他型号保持隐藏且不能开启。主进程对保存和旧状态中的 profile 执行白名单重建，丢弃未知字段；请求传入的 `modelId` 必须属于已保存连接，renderer 不能借此覆盖地址或认证。Provider HTTP、协议解析和开发文件错误只返回固定分类或无敏感内容的提示。默认文件缺失静默回退到用户配置，显式路径缺失或格式错误可重试且不阻断已保存配置。`package.json.build.files` 不包含 `script/development`，打包与 smoke 分支在加载模块前关闭该能力。

四种 Provider 协议在当前工具调用链内暂存服务商要求的续传上下文：OpenAI Chat 的 reasoning 字段、Responses 输出项、Anthropic thinking 签名块和 Gemini thought signature 部件会随对应助手工具调用回传。该上下文不会进入 IndexedDB、公开轨迹或界面；下一轮普通问答只从已保存消息生成带角色的文字历史，避免伪造缺失的协议字段。

`AssistantPage` 在外层判断模型配置的加载状态和数量，仅在加载完成且存在配置时挂载 `AssistantWorkbench`。配置为空时只显示设置引导，不创建知识服务或读取对话档案；App 同时暂停助手需要的配种索引加载并隐藏其失败提示。最后一个配置被删除后，工作台卸载会取消生成并使旧异步结果失效，IndexedDB 历史不删除。原记录引用的配置失效但仍有其他配置时，继续使用工作台内的只读与显式重绑定流程。

助手工作台的请求、仓储、会话加载、模型保存与各代次由 `useAssistantConversation` 统一持有；`useAssistantComposer` 管理草稿、对象选择和键盘逻辑。`AssistantPage` 保留配置引导、布局和抽屉焦点，发送框、对象引用、消息、档案与证据分别展示。历史消息、档案和证据组件使用稳定输入与 memo，文本增量只更新当前回答；停止、授权、模型保存及持久化仍经过原有会话编排。删除记录的延迟回调核对当前路由，不将后来打开的其他记录导航为空白页。

`AssistantPage.performance.test.tsx` 以 80 条历史消息、20 条档案和 30 个逐次提交的文本事件固定行为。本机单次前后对照中，流式窗口内历史内容读取从 4,800 次、档案标题读取从 1,800 次、日期格式化从 600 次均降为 0；提交仍为 30 次，Profiler 累计 actualDuration 从 184.572 ms 降为 37.818 ms。默认回归断言隔离读取、逐块文本及最终内容与保存次数，不对环境敏感的毫秒值设硬门槛；可设置 `PALTOOLS_ASSISTANT_PERF_REPORT` 为文件标签，将当前测量写入忽略的 `output/agent-runs/`。

开发者真实连接验证与合成凭据契约测试分开进行：仅在用户要求时，通过本机文件加载器、桌面网关和共用协议发送不含业务数据的最小请求，输出 HTTP 状态、耗时和脱敏结果。2026-09-07 对文件所配 `deepseek-v4-flash` 的手动请求返回 HTTP 200 与 `OK`，耗时约 0.7 秒；此结果只说明当次连接成功，真实凭据与请求不加入自动测试或发布输入。

| 状态 | 生命周期 | 存储 |
| --- | --- | --- |
| 主题偏好 | 跨启动 | paltools.theme.v1 |
| 旧代数配置 | 不再消费 | paltools.admin-config.v1，保留期内不主动清理 |
| 图鉴和配方 | 数据集版本 | 包内静态 JSON |
| 配方背包、方案与偏好 | 跨启动、Schema v1 | paltools-breeding-network IndexedDB |
| 助手对话、消息、证据与公开轨迹 | 跨启动、Schema v1 | paltools-agent IndexedDB |
| Web 模型配置元数据 | 跨启动、存储键 v1 / profile Schema v2 | paltools.agent-profiles.v1 localStorage |
| Web API Key | 当前页面 | JS 模块内存，不落盘 |
| Electron 模型配置与加密 API Key | 跨启动或当前进程 | userData/agent-providers.json + safeStorage；不可加密时仅内存 |
| 未打包 Electron 开发者托管模型 | 当前进程 | 仓库外开发者 API 文件 → 主进程内存；renderer、Web 与发布包不可读取 |
| 旧配种图方案 | 已退场 | 启动时删除 paltools-breeding IndexedDB |

样式入口 src/styles.css 固定声明 theme、base、shared、features、utilities 层级。配种样式在同一 features 层内按共享基线、查询、工作区、React Flow 厂商样式和图形覆盖的顺序导入 breeding.css、breeding-query.css、breeding-workspace.css 与 breeding-graph.css。七套主题集中定义结构、文字、强调、警告、危险、焦点和稀有度语义令牌；共享层另定义控件、面板和弹窗三级圆角。业务组件不引用主题 ID，也不保存主题专属颜色字面量。主题单元测试校验令牌完整性、对比度、预览色归属及组件样式无调色板硬编码。

## 6. UI 与可访问性

- 应用壳使用紧凑顶栏、档案式页标题和高密度工作区；顶栏导航复用 24×24 线性 SVG，并通过 `aria-current` 标记当前页。跳转主内容链接在键盘聚焦时显示。
- 图鉴宽屏使用最小 260px 的自动填充网格，1440px 视口为五列；配种查询区最大宽度 1240px。页面横向溢出由布局本身消除，body 只作为最终横向边界，不替代内部滚动区。
- 图鉴详情在桌面为左右双栏，较窄桌面视口纵向排列；移动设备由应用入口统一阻断。
- 图鉴页只编排筛选、排序和选中态，详情内容由 PalDetailDialog 承担；配种页把正向、反向和查询选项拆为独立面板，SolutionWorkspace 把关系背包与共享配方流拆为展示组件，父级继续持有跨面板状态和领域派生。
- 图鉴详情打开后焦点进入关闭按钮，Tab/Shift+Tab 在弹窗内循环；Escape、按钮或背景关闭后恢复触发卡片焦点。详情、确认弹窗和窄屏背包复用支持嵌套的焦点圈定与引用计数 body 滚动锁，左右内容区分别拥有滚轮滚动和 overscroll containment。
- 配种页以三个 URL 控制的标签切换双亲查子代、获取目标帕鲁和配种方案网。查询卡共享即时背包状态；两类查询分别保存“排除传说”和“排除自交”文字过滤状态，共享编号/平均稀有度及正倒方向排序和图形化稀有度展示。文字过滤、方向图标、传说边框和查询卡 `＋/✓` 收藏按钮只消费主题语义令牌，并提供按压语义、悬停说明或可访问名称。
- `BreedingPalAvatar` 复用本地图片组件，并以可交互按钮或只读预览两种模式统一配种头像。提示浮层通过 portal 挂载到 body 并使用 fixed 定位；交互头像的选中键由视图范围、配方编号和槽位组成，第二次激活才请求图鉴导航。图形网只消费预览模式。
- 方案网桌面使用可完全折叠的配方背包侧栏，折叠状态仅存在于组件生命周期且不写入 IndexedDB；800px 及以下改为带焦点圈定、Escape 关闭和焦点恢复的抽屉。侧栏折叠、展开和抽屉开关共用具名 SVG 图标按钮，断点或展开状态改变时重新测量虚拟列表。步骤、图形和关系列表共享同一派生关系集合；背包项把本地头像横向排列、名称置于头像下方，并在右下元信息行显示方案状态与配方编号。背包工具栏以五列网格固定单行展示全选、未入方案、默认开启的排除自交、排序字段和方向，每项复用主题语义色的内联 SVG 图标、短标签、按压状态与完整可访问名称。步骤及关系列表共享角色卡片公式，使用放大头像与非颜色角色标记。
- 图形网使用只读 React Flow。合并模式由帕鲁节点与小型配方汇合点组成，实例模式额外包含统一标记为“亲本”的实例、子代实例和物种汇合节点；配方汇合点只提供三元关系语义和布线路由，不显示为操作卡片。普通配方使用两个 `parentInput` 和一个 `offspringOutput`，同种亲本输入带 `multiplicity: 2`；唯一输出边显示配方编号与移除入口。所有帕鲁节点显示本地头像。ELK layered 布局通过独立 Worker 执行，固定从上到下并使用正交路由；布局层保留 ELK 的节点坐标、线路拐点和标签坐标，再按实际画布宽度稳定装箱连通分量。递增请求 ID 丢弃过期响应，React 不持久化坐标，也不重新推测线路。React Flow 的节点、边、标签、隐藏连接点、背景和控制按钮通过 PalTools 主题令牌着色，不使用库默认调色板。
- 配方背包和方案关系列表通过 TanStack Virtual 固定行高虚拟化，并提供列表总量、位置和键盘滚动语义。
- `npm.cmd run samples:breeding-workspaces` 从当前 manifest 与紧凑配种索引确定性生成 20 代深链、分支汇合、多目标多分量和 120 条大型方案；写入被忽略的 `.tmp/` 前后均复用生产导入解析、关系解析、DAG 和派生图校验。
- 帕鲁选择器支持过滤、方向键、Enter、Escape、外部点击和滚动到高亮项。
- 图片失败使用本地占位；属性图标具有中文可访问名称。
- 主题卡片使用 radiogroup 与 radio 语义、循环方向键导航和非颜色选中标记。
- 设置页保持服务商、名称、密钥和默认型号的紧凑基础表单；“管理模型”使用可滚动档案条目、显示开关、能力/发布状态标签与逐型号参数折叠区，连接协议和地址位于高级区。长模型 ID 截断显示但保留完整表单值，窄视口改为两列卡片排列；原生控件、折叠摘要与型号按钮都提供可见键盘焦点。
- 助手宽屏以档案列表、对话和证据三栏呈现，页面标题、模型状态和响应式侧栏开关收拢到对话会话栏，使工作台按 `100dvh` 近满高显示；中等宽度隐藏证据栏，窄桌面改为左右抽屉。对话主体使用主题不透明纯色表面，回答和证据卡继续用同一编号脊线关联。圆角发送框集成对象 `@` 入口、按连接分组的研究记录级模型切换和发送/停止操作；隐藏但仍被当前记录引用的型号保留标记。对象列表复用本地帕鲁与物品图像，快捷键提示仅在输入框聚焦时挂载并建立可访问说明关系。抽屉具备焦点圈定、Escape 关闭、关闭态焦点隔离和焦点恢复；流式回答与 `@` 选择状态通过可访问 live region 宣告。公开轨迹只显示调用来源、工具名称、参数摘要、命中数和耗时。
- src/components/HoverTooltip.tsx 通过事件委托为带 `data-tooltip` 的解释性按钮提供统一 portal 提示：细指针悬停延迟显示，键盘聚焦立即显示并临时维护 `aria-describedby`，点击、滚动、窗口变化、Escape、目标移除或文案变化时同步收起或刷新；触控后的合成焦点被抑制。空、加载、错误、禁用、危险、悬停、按压、选中与焦点状态复用语义令牌；按钮悬停只改变边框、表面、阴影、颜色或轻微滤镜，不移动布局，并在非细指针与 reduced-motion 环境下保持稳定。

## 7. 质量边界

Vitest 覆盖解析器、运行时数据契约、CLI、工作区仓储、知识检索、Provider 契约、Agent 编排、ELK 确定性和组件交互。`npm.cmd run test:dev-provider` 只用合成凭据验证开发文件解析、缺失/损坏恢复、IPC profile 清洗、错误脱敏及 Web/打包/smoke 排除；`npm.cmd run test:electron-provider-protocol` 从纯协议源生成桌面 CJS 并对四种传输执行无真实网络的 Node 契约测试。`check:node-scripts` 独立语法检查关键 CJS/MJS，TypeScript Node 工程则实际覆盖 pipeline/data、script、cli 与领域依赖。`npm.cmd run test:browser` 使用仓库缓存、命名 Playwright CLI 会话和受管 production preview，完成真实浏览器离线、键盘、Worker 图形网、助手模型持久化、对象 `@`、统一 Tooltip 和响应式验收并可靠清理服务。Electron smoke 验证 preload、助手路由、配置往返以及现有 IndexedDB 可写与刷新恢复，不请求真实厂商。

浏览器回归固定覆盖 1440×900、1152×720、1366×768 和 800×720；助手额外覆盖 760×680 与 540×680：断言页面无横向溢出或破图、离线检索可用、七套主题令牌完整、助手发送框与 `@` 浮层不被裁切、关闭抽屉不可聚焦、详情与窄屏背包焦点/滚动锁正确、没有控制台错误或第三方请求。配种图形网另断言实际创建 Worker，亲本、配方汇合点和子代保持纵向顺序，唯一输出标签存在，适应视图不放大到 1 倍以上。

助手配置引导与模型设置另覆盖三档桌面基线与 540×360 低高度视口：检查无工作台挂载、无横向溢出、滚轮滚动、键盘进入设置、预设默认型号和长自定义 ID，以及保存首个配置和删除最后一个配置后的即时切换。浏览器入口必须解析 CLI 返回的最终结果并确认 `status: passed`，不能只依据零退出码；原生确认框会提前中断 `run-code`，合成配置删除场景在页面内确认并由随后的 reload 恢复原生确认。Electron smoke 在写入合成模型配置前断言独立配置引导页，再验证网关配置与流式往返。
