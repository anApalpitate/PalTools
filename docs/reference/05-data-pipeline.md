---
schema_version: 1
id: data-pipeline
title: 数据管线与命令
summary: 给出数据同步、离线解析、构建、校验和 CLI 数据使用的正式操作入口。
type: reference
status: current
authority: canonical
domains: [data, paldex, breeding, cli, tooling]
topics: [pipeline, schema, compliance, operations, testing]
platforms: [shared, windows, node]
source_of_truth: [package.json, pipeline/data, public/data/manifest.json, script/paltools.cmd]
related: [data-compliance, architecture, powershell-guide, quick-commands, local-first-static-data]
---

# 数据管线与命令

## 命令

```powershell
# 复用缓存，缺失时联网
npm run data:sync:pals

# 只使用缓存重新解析，绝不联网
npm run data:parse:pals

# 完整刷新公开页面与素材
npm run data:sync:pals -- --refresh

# 导入并校验固定 PalCalc 快照
npm run data:import:breeding

# 关联并生成 Schema v4 数据
npm run data:build

# 独立完整性、哈希、索引和覆盖率校验
npm run data:validate

# 顺序执行同步、导入、构建和校验
npm run data:sync
```

## CLI 离线数据

CLI 直接读取 `public/data` 的 Schema v4 JSON，不依赖运行时网络请求：

```powershell
npm run cli -- info
npm run cli -- search 皮皮鸡
npm run cli -- forward --parents SheepBall,PinkCat --json
npm run cli -- reverse --target ChickenPal --json
npm run cli -- plan validate plan.json
```

`--data-dir` 与 `PALTOOLS_DATA_DIR` 可覆盖数据目录；数据未生成或 Schema 版本不符时退出码为 4。构建单文件发行版：

```powershell
npm run cli:build
node build/cli/paltools.mjs --version
```

Windows 包装为 `script\paltools.cmd`。

## 目录

```text
data/raw/paldb/pages/   原始 HTML 缓存，不入库
data/raw/paldb/         解析后的来源中间数据，不作为 UI 接口
data/raw/palcalc/       固定来源快照
public/data/            Schema v4 生成数据
public/generated/       本机帕鲁、属性、工作适应性和掉落物图标
```

`public/data/recipes.json` 已移除。唯一配方内容位于紧凑 `breeding-index.json`，正反向索引只保存配方下标。

## 正式更新检查

每次升级来源必须先查看 robots 与许可证，再完整刷新并审阅差异。以下任一情况会失败：数量漂移、关键字段覆盖下降、技能重复定义冲突、伪 WebP、哈希错误、paldb/PalCalc 无法一对一关联、非预期双结果组合、索引重复或遗漏。

生成时间变化本身不是业务差异；评审应关注来源 revision、内容计数、字段和配方变化。
