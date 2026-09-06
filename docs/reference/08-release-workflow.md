---
schema_version: 1
id: release-workflow
title: 正式发布工作流
summary: 规定 PalTools 版本对齐、双平台打包、mac-release 同步、GitHub Release 发布和远端核验流程。
type: reference
status: current
authority: canonical
domains: [tooling, desktop]
topics: [packaging, release, testing, operations]
platforms: [shared, windows, mac, electron]
source_of_truth: [AGENTS.md, package.json, script/package-exe.ps1, script/package-mac.mjs]
related: [quick-commands, powershell-guide, docs-home, reference-index]
---

# 正式发布工作流

本页是 PalTools 本地打包、远程分支、标签和 GitHub Release 的当前操作规范。一次发布只有在版本、提交、标签、Release 标题、资产文件名和发布说明全部一致，并且每个实际发布的平台都通过真实打包应用 smoke 后才算完成。

## 1. 发布不变量

- 推送提交、创建标签和发布 GitHub Release 都需要用户明确授权；“构建”或“更新本地 EXE”不自动包含远程发布。
- 新版本号不明确时先确认。禁止复用或移动已经发布的标签，也不覆盖已有 Release 资产来伪装新版本。
- `main` 是发布源码主线；`mac-release` 是同一发布提交的 macOS 构建入口，不是独立开发分支。发布时两者必须指向同一提交。
- Windows 与 macOS 产物必须使用相同应用版本和相同可执行源码。打包后若 `package.json`、`build/web` 输入、Electron 入口或运行时数据发生变化，对应平台必须重新打包。
- 只有通过各自真实应用 smoke 的资产才允许上传。Web build 成功、另一平台通过或文件生成成功都不能替代本平台 smoke。
- macOS DMG 当前未签名、未公证。默认只用于开发验证；面向用户分发前需要用户明确接受该限制，或先完成 Apple Developer 签名与公证。
- 未打包 Electron 可读取的本机开发者模型配置不是发布输入；Windows 与 macOS 包都不得包含 `script/development` 或任何开发者 API Key。构建契约测试只使用合成凭据。
- 发布过程不得暂存、重置或覆盖共享工作区中的无关改动；始终显式列出提交路径，禁止 `git add .`。

## 2. 发布前检查

在仓库根目录确认 Node.js 22、GitHub CLI 登录状态、远程差异和目标版本占用情况。以下变量仅为示例，执行时替换版本号：

```powershell
$releaseVersion = '<version>'
$releaseTag = "v$releaseVersion"

node --version
gh auth status
git fetch origin --prune
git status --short --branch
git log --oneline origin/main..HEAD
git ls-remote --heads origin refs/heads/main refs/heads/mac-release
git ls-remote --tags origin "refs/tags/$releaseTag"
gh release view $releaseTag --json tagName,name,isDraft,isPrerelease,url
```

预期结果：

- 工作区中的无关修改已识别并明确排除。
- 本地 `main` 已包含本次要发布的功能，且能安全快进远程 `main`。
- 新版本的远程标签和 Release 均不存在。
- 如果 `origin/mac-release` 已存在，它必须是 `main` 的祖先；否则停止并人工处理分歧，禁止强推。

检查既有 `mac-release` 是否可快进：

```powershell
git merge-base --is-ancestor origin/mac-release main
if ($LASTEXITCODE -ne 0) { throw 'origin/mac-release cannot fast-forward to main' }
```

远程尚无 `mac-release` 时跳过祖先检查。

## 3. 对齐版本与发布说明

先同步会进入应用或面向用户的版本信息：

- `package.json` 的 `version`。
- `package-lock.json` 顶层版本和根包版本。
- README 中面向用户的 Windows 下载文件名。
- 直接断言应用版本的测试夹具；不要误改依赖包版本或只作为通用测试数据的旧版本字符串。

先用定点测试捕获版本注入遗漏，再进入高成本打包门：

```powershell
npm.cmd test -- src/App.test.tsx
```

检查版本差异后，只暂存这些准备文件，运行 `git diff --cached --check`，创建形如 `release: prepare v<version>` 的准备提交。后续平台产物必须基于该提交中相同的应用输入构建。

各平台打包成功后，再新增或更新 `docs/archive/` 中的发布快照和索引。快照记录主要更新、验证结果、各资产的精确字节数、SHA-256 与平台限制；不得预填未验证的哈希或 smoke 结果。

提交前执行：

```powershell
npm.cmd run docs:lint
git diff --check
git status --short
git diff
```

只暂存发布快照和索引，创建最终文档提交。若准备提交之后只改了不会进入应用包的文档，可将最终 `HEAD` 作为发布提交；若任何应用源码、运行时数据、`package.json`、Electron 入口或构建配置发生变化，必须重新运行受影响平台的完整发布门。

## 4. Windows 发布门

Windows x64 便携版只能在 Windows 主机通过以下入口构建：

```powershell
npm.cmd run package:exe
```

脚本会限定清理 `build/web` 与 `build/release`，随后依次执行：

1. 完整 Vitest。
2. 合成凭据的开发者 Provider 边界测试、四协议契约、数据校验、TypeScript 和 Vite 生产构建。
3. electron-builder Windows x64 portable 打包。
4. 已打包 `PalTools.exe` 的隐藏 smoke。
5. Electron 语言包、打包文件边界及最终 EXE 大小、SHA-256 输出；`script/development` 不得出现在发布包中。

必须以脚本零退出码为成功。之后独立复核：

```powershell
$windowsArtifact = "build\release\PalTools-$releaseVersion-win-x64.exe"
Get-Item -LiteralPath $windowsArtifact | Select-Object FullName,Length,LastWriteTime
Get-FileHash -LiteralPath $windowsArtifact -Algorithm SHA256
```

不要因为脚本后段失败但目录中已经出现 EXE 就继续发布。

## 5. macOS 发布门

macOS Apple Silicon DMG 必须在 Apple Silicon macOS 主机从 `mac-release` 构建。准备提交通过 Windows 发布门后，先在获得远程推送授权的前提下把该提交安全快进到 `mac-release`，但此时不创建标签或 Release：

```powershell
$artifactSourceCommit = git rev-parse HEAD
git push origin "${artifactSourceCommit}:refs/heads/mac-release"
```

然后在 Mac 主机执行：

```bash
release_version='<version>'
git switch mac-release
git pull --ff-only
node --version
npm ci
npm run package:mac
```

运行前必须恢复本机 `data/raw/palcalc/breeding.json` 和 `public/generated/`；它们被 Git 忽略，不能通过把原始快照或来源素材提交到仓库来绕过。`package:mac` 会：

1. 以单 worker 运行完整测试。
2. 执行数据校验、TypeScript 和 Web 生产构建。
3. 生成 arm64 应用与 `PalTools-<version>-mac-arm64.dmg`。
4. 检查应用结构、Electron locale，并运行已打包应用 smoke。
5. 输出 DMG 的 SHA-256。

构建前后都记录 `git rev-parse HEAD`，它必须等于准备发布的 `main` 提交。独立复核产物：

```bash
mac_artifact="build/release/PalTools-${release_version}-mac-arm64.dmg"
stat -f '%N %z bytes' "$mac_artifact"
shasum -a 256 "$mac_artifact"
```

## 6. 同步 `main` 与 `mac-release`

完成发布提交并确认远程没有并发变化后，先推送 `main`，再让远程 `mac-release` 快进到完全相同的提交：

```powershell
git push origin main
$releaseCommit = git rev-parse HEAD
git push origin "${releaseCommit}:refs/heads/mac-release"
```

第二条命令可创建尚不存在的分支，也可安全快进已有分支；非快进时会失败。失败后停止调查，禁止添加 `--force`。如需本地跟踪分支，只在它不存在时执行：

```powershell
git branch mac-release $releaseCommit
git branch --set-upstream-to=origin/mac-release mac-release
```

macOS 专属修复先合入 `main` 并完成相关验证，再重新同步 `mac-release`；不要直接在 `mac-release` 上形成长期分叉。

## 7. 标签与 GitHub Release

远程 `main` 和 `mac-release` 对齐后创建带说明的标签并推送：

```powershell
git tag -a $releaseTag -m "PalTools $releaseTag" $releaseCommit
git push origin $releaseTag
```

默认先创建草稿 Release，避免多平台资产尚未齐全时对外显示半成品：

```powershell
$releaseNotes = "docs\archive\<release-record>.md"
gh release create $releaseTag --repo anApalpitate/PalTools --title "PalTools $releaseTag" --notes-file $releaseNotes --verify-tag --draft
gh release upload $releaseTag $windowsArtifact --repo anApalpitate/PalTools
```

macOS 已通过发布门且明确允许分发时，再从持有 DMG 的 Mac 主机上传：

```bash
gh release upload "$releaseTag" "$mac_artifact" --repo anApalpitate/PalTools
```

两个平台都要求发布时，必须等两项资产均上传并复核后才发布草稿。macOS 因缺少真实主机、smoke、签名授权或公证而暂缓时，只有在用户明确同意 Windows-only Release 后才能省略 DMG；发布说明和历史快照必须写明原因，并保持 `mac-release` 指向同一发布提交。

确认草稿内容正确后发布并设为 Latest：

```powershell
gh release edit $releaseTag --repo anApalpitate/PalTools --draft=false --latest
```

不要使用 `gh release upload --clobber` 覆盖资产；该选项会先删除远端同名文件，上传失败时原资产不可恢复。资产错误或需要替换时先停止并取得明确授权。

## 8. 发布后核验

发布后同时检查 Git 引用、Release 状态和远端资产：

```powershell
gh release view $releaseTag --repo anApalpitate/PalTools --json name,tagName,isDraft,isPrerelease,publishedAt,targetCommitish,assets,url
gh release list --repo anApalpitate/PalTools --limit 3
git ls-remote --heads origin refs/heads/main refs/heads/mac-release
git rev-list -n 1 $releaseTag
git rev-parse origin/main
git rev-parse origin/mac-release
git status --short --branch
```

验收标准：

- Release 标题为 `PalTools v<version>`，标签、`package.json` 和资产文件名使用同一版本。
- 正式发布为非 draft、非 prerelease；计划作为当前稳定版时标记为 Latest。
- 每项资产状态为 `uploaded`，远端 `size` 与本地字节数一致，远端 `digest` 与本地 SHA-256 一致。
- 标签、远程 `main` 和远程 `mac-release` 都解析到预期发布提交。
- 本地只剩发布前已经识别的用户改动，没有打包或发布过程造成的意外源码修改。

## 9. 失败与恢复

- 发布门失败：停在失败层修复，先跑最相关的定点测试，再从头重跑该平台完整发布门。
- 标签或 Release 已存在：停止并核对版本选择，不删除、不移动标签，也不覆盖远端资产。
- 推送认证失败：修复 GitHub 凭据后重试同一非破坏性推送，不改写提交历史。
- 草稿资产上传失败：保留草稿，核对已上传资产后只补传缺失文件；不要发布不完整草稿。
- 已发布 Release 出错：先报告远端现状和影响范围，取得用户授权后再编辑、撤下或补充，不自动删除公开资产。

已验证的具体发布结果保存在[历史索引](../archive/README.md)，例如 [`v0.1.1` 发布快照](../archive/2026-09-04-release-v0.1.1.md)；历史数值不覆盖本页流程。
