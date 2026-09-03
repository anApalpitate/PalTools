<p align="center">
  <img src="public/app-icon-96.png" width="88" height="88" alt="PalTools 图标">
</p>

<h1 align="center">PalTools</h1>

<p align="center">
  把帕鲁资料、配种查询和路线整理，放进一个安静、快速、完全本地的桌面工作台。
</p>

<p align="center">
  <strong>300 个帕鲁</strong> · <strong>44,851 条配方</strong> · 离线可用 · 无需账号 · 不读取游戏存档
</p>

<p align="center">
  <a href="https://github.com/anApalpitate/PalTools/releases/latest"><strong>下载 Windows 便携版</strong></a>
  &nbsp;·&nbsp;
  <a href="#快速上手">快速上手</a>
  &nbsp;·&nbsp;
  <a href="docs/README.md">项目文档</a>
</p>

![PalTools 帕鲁图鉴界面](docs/assets/readme/paldex-overview.png)

## 从查资料，到走通一条配种路线

PalTools 是一款面向《幻兽帕鲁》玩家的非官方离线辅助工具。它不要求登录、不依赖在线服务，也不会触碰游戏存档；打开之后，就可以专心完成三件事：

| 查清一只帕鲁 | 找到一条配方 | 整理完整方案 |
| --- | --- | --- |
| 按名称、拼音、编号、属性、工作适性和能力数值检索 300 个帕鲁。 | 用任意亲本查询子代，或从目标帕鲁反查所有可用亲本组合。 | 把配方收藏进背包，组合为多个方案，并用步骤、关系或图形网查看。 |

所有查询都在本机完成。资料、主题和配种工作区保存在本地，断网后仍然可用。

## 一眼看清真正需要的资料

图鉴不是一张长名单，而是一套适合反复筛选和比较的资料工作台。

- 中文名、拼音首字母、英文名、图鉴编号、技能与掉落物均可搜索。
- 属性与工作适性可以组合筛选；战斗、生产和移动数值都能排序。
- 详情集中展示伙伴技能、主动技能、固有词条、工作能力、掉落概率和来源信息。
- 从详情可直接进入“获取目标帕鲁”，当前目标会自动带入配种工具。

![PalTools 帕鲁详情界面](docs/assets/readme/paldex-detail.png)

## 把配方变成可执行的方案

双亲查询和目标反查负责找到答案，配方背包与方案网负责把答案保存下来。

- 收藏任意精确配方，在一行五格工具栏中完成筛选、全选和排序。
- 建立默认方案或最多 20 个自定义方案；无效关系会保留说明，但不会混入可执行路线。
- 在步骤列表、关系列表和自动布局图形网之间切换，同一套关系始终保持一致。
- 工作区可完整导入、导出为 JSON，方便备份或在不同设备间迁移。

![PalTools 配种方案网界面](docs/assets/readme/breeding-workspace-compact.png)

## 为长期使用而设计

- **本地优先**：运行时不请求第三方服务，默认零遥测。
- **信息密度适中**：紧凑的“野外研究档案”界面，适合长时间阅读和快速扫描。
- **键盘友好**：筛选、选择器、弹窗和方案抽屉均提供清晰焦点与键盘操作。
- **七套主题**：森林夜色、珍珠白、石墨灰、晴空浅蓝、薰衣草霓虹、珊瑚莓果与深海薄荷。
- **桌面专用**：支持桌面浏览器、Windows x64 与 macOS Apple Silicon；手机和平板不在支持范围内。

## 快速上手

### Windows

前往 [GitHub Releases](https://github.com/anApalpitate/PalTools/releases/latest) 下载 `PalTools-0.1.1-win-x64.exe`。这是免安装便携版，下载后直接运行即可。

首次启动若出现 Windows 安全提示，请确认下载地址来自本仓库并核对文件名。PalTools 当前没有自动更新功能，新版本仍通过 Releases 发布。

### macOS Apple Silicon

macOS 版本目前尚未公开发布。开发者可以在 Apple Silicon Mac 上从 `mac-release` 分支构建未签名、未公证的本地 DMG；面向普通用户的版本会在完成真实设备验证、签名与公证后提供。

### 开始使用

1. 在“图鉴”里搜索帕鲁，点击卡片查看完整资料。
2. 在“配种”里选择“双亲查子代”或“获取目标帕鲁”。
3. 点击配方卡右上角的 `＋`，把需要的组合加入配方背包。
4. 打开“配种方案网”，将配方加入方案并选择步骤、关系或图形视图。

## 数据与使用边界

当前离线数据对应 Steam build `24181527`，包含 300 个帕鲁和 44,851 条无性别配种公式。游戏更新可能改变资料或配方，实际结果请以当前游戏版本为准。

PalTools 专注于资料查询与配种路线整理，目前不会读取或修改游戏存档，也不提供账号、云同步、个体库存、蛋糕/孵化成本或被动技能继承概率计算。

<details>
<summary><strong>开发者、CLI 与项目维护入口</strong></summary>

### 本地开发

需要 Node.js 22.12 或更高版本：

```powershell
npm.cmd ci
npm.cmd run dev
```

常用质量与构建命令：

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run package:exe
```

### 命令行查询

CLI 与桌面应用共用同一套离线数据和领域逻辑：

```powershell
npm.cmd run cli -- info
npm.cmd run cli -- search 皮皮鸡
npm.cmd run cli -- forward --parents SheepBall,PinkCat --json
npm.cmd run cli -- reverse --target ChickenPal --json
```

构建单文件 CLI：

```powershell
npm.cmd run cli:build
node build/cli/paltools.mjs --version
```

更完整的开发、数据、架构与发布说明统一收录在 [项目文档索引](docs/README.md)：

- [产品范围与行为](docs/reference/01-product-requirements.md)
- [架构与本机状态](docs/reference/03-architecture.md)
- [数据来源与合规](docs/reference/02-data-and-compliance.md)
- [常用命令](docs/reference/07-quick-commands.md)
- [正式发布流程](docs/reference/08-release-workflow.md)

</details>

## 免责声明

PalTools 是非官方粉丝工具，与 Pocketpair, Inc. 无关联。《幻兽帕鲁》的游戏名称、图像和商标归其各自权利人所有。
