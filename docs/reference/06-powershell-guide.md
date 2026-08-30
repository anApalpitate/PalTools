---
schema_version: 1
id: powershell-guide
title: PowerShell 命令撰写指南
summary: 规定 Windows 命令编码、受管服务、长任务、进程定位和常见故障处理方式。
type: reference
status: current
authority: canonical
domains: [tooling, desktop]
topics: [operations, testing, packaging]
platforms: [windows, node, electron]
source_of_truth: [AGENTS.md, package.json, script]
related: [quick-commands, data-pipeline, secure-electron-boundary]
---

# PowerShell 命令撰写指南

适用范围：本仓库内所有由 agent 或脚本执行的 PowerShell 命令，同时覆盖 PowerShell 5.1（`powershell.exe`，打包脚本实际入口）与 PowerShell 7（开发环境）。本文件是 `AGENTS.md` 中 Windows/PowerShell 相关规则的权威展开，`AGENTS.md` 只保留强制要点。

常用自然语言操作入口见 [`07-quick-commands.md`](07-quick-commands.md)。

## 1. 编码与解释器

- Windows PowerShell 5.1 不保证按 UTF-8 解码无 BOM 的 `.ps1`。脚本运行时消息/异常优先 ASCII，或明确保存 UTF-8 BOM。
- PowerShell 7 能解析不代表 `package.json` 中的 `powershell.exe` 能解析；打包脚本必须用实际入口验证。
- 读取中文文档/源码时显式指定编码：`Get-Content -Raw -Encoding UTF8`；控制台乱码先设 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。
- Windows 自动化优先显式调用 `npm.cmd`，避免 PowerShell 执行策略误选 `npm.ps1`。

## 2. 本地服务必须受管

### 禁止分离启动

- 禁止用 `start /b`、`Start-Process`、`cmd /c start`、`nohup` 或等价方式分离 Vite/preview/watch/打包服务。
- 根因：`Start-Process`/`[System.Diagnostics.Process]::Start` 不重定向输出时，子进程继承父进程的 stdout/stderr 管道句柄；父命令要等管道 EOF 才认为结束，服务不退出就表现为“空转”直到超时。`CreateNoWindow` 只隐藏窗口、不切断句柄继承，还会掩盖启动错误。

### 正确做法：前台受管（cell_id）

- 以前台执行机制启动，要求返回可管理的 `cell_id`（`Script running with cell ID ...`）；记录 `cell_id`，用 wait 读取增量输出。
- 不要因为一次没有新输出就启动第二个服务；每次 wait 要有界，持续工作期间至少每 60 秒向用户更新一次。
- 浏览器检查完成或失败后，用同一个 `cell_id` 显式 terminate；随后检查精确端口和 readiness URL 确认失活。
- 中断恢复时先查默认端口（Vite 通常为 5173）和已有受管 cell，确认无服务后才能重启。
- 验证记录必须同时写明“服务成功启动”和“端口/URL 已确认停止”。

仓库内没有分离启动的例外；外部环境的服务编排不属于本指南，也不提供可复制脚本，避免与受管 cell 流程混淆。

## 3. 长命令、超时与增量输出

- 长命令不要用超大单次 timeout 猜测状态。让执行返回 cell，短 wait 查看增量输出；确认在推进后继续等待。
- `Start-Process` 还可能因环境中同时存在 `Path`/`PATH` 触发字典冲突；本仓库禁止用它启动长期服务。
- 完整 Vitest 默认最多使用 4 个 worker。当前 20 逻辑核心环境中，214 项测试的对照运行由 41.37 秒降到 13.24 秒，最终默认 reporter 的完整交付运行为 16.40 秒；不要在没有重新基准测试的情况下移除上限，也不要用跳过测试换取速度。
- `package:exe` 不再在 `build:exe:web` 前单独重复 `data:validate`；`build` 本身已经覆盖数据校验和类型检查。
- `package:exe` 使用 .NET `SHA256` API 计算产物摘要，不依赖部分 PowerShell 5.1 环境中可能未加载的 `Get-FileHash`。摘要逻辑发生变化时必须用实际 `powershell.exe` 完成整套打包门。

### Electron 打包前预检

修改 Electron 导航、协议消费或 smoke DOM 断言时，先运行：

```powershell
npm.cmd run verify:electron
```

该命令执行 Web 构建并直接以源码 Electron 入口运行同一套隐藏 smoke，不生成 EXE，可在进入 electron-builder 前发现路由、数据和 DOM 断言回归。正式发布仍必须运行 `npm.cmd run package:exe`，并以打包后的真实应用 smoke 为最终结果。

## 4. Playwright CLI 的项目缓存

真实浏览器回归使用 Playwright CLI 时，npm 临时包与浏览器不能落到受限的用户缓存目录。首次准备或缓存缺失时，在仓库根目录运行一次以下命令；两个目录均已被 Git 忽略，可跨后续任务复用：

```powershell
$env:PALTOOLS_NPM_CACHE = Join-Path (Get-Location) '.npm-cache'
$env:npm_config_cache = $env:PALTOOLS_NPM_CACHE
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.playwright-browsers'
$env:PWTEST_DAEMON_SESSION_DIR = Join-Path (Get-Location) '.playwright-cli\daemon'
npx.cmd --yes --package @playwright/cli playwright-cli install-browser chromium
```

同一终端中的后续浏览器命令保留这四个环境变量，并使用命名 session。`PWTEST_DAEMON_SESSION_DIR` 将 CLI 会话状态留在仓库的忽略目录，避免受限环境写入用户 `LocalAppData`；显式指定 `--browser chromium`，避免误用未安装的系统 Chrome。例如：

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=ui-review open http://127.0.0.1:5173/ --browser chromium --headed
npx.cmd --yes --package @playwright/cli playwright-cli -s=ui-review snapshot
```

浏览器检查先完成全部相关交互与多个视口，再关闭 session 和 Vite 服务；不要为每条视觉反馈重新安装 CLI、浏览器或启动服务。

## 5. 进程定位与终止

- 锁定日志无法删除或端口被占时，用内容、mtime、监听端口、可执行路径和启动时间定位准确进程；只终止已验证 PID。
- 只能通过端口解析 PID（`Get-NetTCPConnection -State Listen -LocalPort <port>` → `OwningProcess`），核验可执行路径/启动时间确属本仓库后终止；禁止按进程名批量杀 `node`。
- 本仓库服务一律用受管 cell 生命周期管理，进程定位只用于残留端口/锁文件的兜底清理。

## 6. 检索与数据检查

- `rg.exe` 在受限环境中可能 Access denied；退化为 `Get-ChildItem -Recurse -File` + `Select-String`，不要因此停止调查。
- 生成 JSON 多为单行，`git diff` 会显示整行变化。优先检查 manifest、Schema 版本、记录数、哈希和验证器结果，不要把整份 JSON 加载进上下文。
- `data:parse:pals` 即使离线也要解析约 299 个页面，可能耗时数分钟；只在 parser 或原始缓存变化后运行一次。缺少新素材时离线解析会明确失败，此时联网同步一次素材，再回到离线构建/校验。

## 7. 服务异常排查

- Vite/HMR 服务异常断开后，页面可能保留旧 UI 但后续 fetch 失败；浏览器报错前先检查 readiness URL 和精确端口。
