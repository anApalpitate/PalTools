# 2026-08-31 本地 EXE 更新记录

本次只更新仓库本地 `build/release/` 目录中的 Windows x64 便携包，不修改版本号，不创建标签、推送或远程 Release。源码基线为提交 `2dc51ba`，应用版本保持 `0.1.0`。

## 产物

- 文件：`PalTools-0.1.0-win-x64.exe`
- 字节数：`88,376,012`
- 显示大小：84.3 MB
- SHA-256：`312DDB6CA0B9D8BC8852D5B51FC85F50FA154795AAE661D6982D8634AC659E64`
- Electron 语言包：`en-US.pak`、`zh-CN.pak`

## 发布门结果

- Vitest：22 个测试文件、214 项测试通过。
- 数据校验：300 个帕鲁、44,851 条无性别配方、44,850 个亲本组合、307 个主动技能、116 个掉落物条目和 115 个掉落物图标通过。
- TypeScript 与 Vite 生产构建通过；保留既有的大 chunk 警告。
- electron-builder 生成 Windows x64 portable 包。
- 真实打包应用通过 Schema、反向索引、主动技能、掉落图标、主题设置和配种工作区 smoke。
- 独立复核文件大小和 SHA-256 后，确认无 PalTools smoke 残留进程。

## 过程结论

旧便携包仍在运行时会锁定目标 EXE。更新前应按完整路径和进程树核验占用者，只关闭该旧版 PalTools 及其 Electron 子进程，再确认文件可独占打开；禁止按进程名批量终止。

首次打包已通过真实应用 smoke，但实际 `powershell.exe` 环境没有加载 `Get-FileHash`，导致发布门在输出摘要时以 1 退出。`script/package-exe.ps1` 已改用 .NET `SHA256` API；修正后的完整发布门再次运行并以 0 退出。
