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
