# PalTools

面向《幻兽帕鲁》的本地、离线优先辅助工具。当前第三阶段已经提供：

- 300 个来源并集条目的图鉴搜索、属性/工作适性/数值筛选和本地图片。
- 伙伴技能、主动技能、固有被动、掉落物及完整数值详情。
- 双亲查子代与目标子代反查全部亲本；全部公式均按无性别公式处理。
- “已拥有”和“临时起点”两套起点集合，以及最少代数、指定 N 代配种树。
- React Flow 离线路径画布、文本步骤、节点替代配方和本地管理员配置。
- Schema v3 紧凑双向索引：44,851 条公式覆盖 44,850 个无序亲本组合。

PalTools 是非官方粉丝工具，与 Pocketpair, Inc. 无关联。游戏名称、图像和商标归其权利人所有。

## 快速开始

要求 Node.js 22.12+ 和 npm 10+。

```powershell
npm install
npm run data:sync
npm run dev
```

已有完整本地缓存时，可只重新解析公开页面：

```powershell
npm run data:parse:pals
npm run data:build
npm run data:validate
```

常用质量命令：

```powershell
npm test
npm run typecheck
npm run data:validate
npm run build
```

## 一键打包 Windows EXE

```powershell
npm run package:exe
```

脚本会校验 Schema v3 数据、运行测试、构建 Web 资源、生成 Electron 便携版并执行离线冒烟测试。中间产物统一位于 `build/`，最终文件位于：

```text
build/release/PalTools-0.1.0-win-x64.exe
```

冒烟测试会确认 300 个图鉴条目、属性图标、反向索引、主动技能卡、掉落图标和管理员默认上限 6 均可从包内离线加载。

## 数据边界

- paldb：只读取 `robots.txt` 允许的公开 HTML 与页面引用素材，不访问 `/api/`。
- PalCalc：固定 `v1.17.6` / `8b7e2f779e47fddae16ddcb973e828ba20c02b80`。
- 图片只保存于本机忽略目录，不提交仓库；运行时不热链接、不遥测。
- 不读取或修改游戏存档，也不推演被动继承概率。

完整需求、架构、数据治理与第三阶段算法说明见 [docs/README.md](docs/README.md)。
