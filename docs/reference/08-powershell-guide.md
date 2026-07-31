# PowerShell 命令撰写指南

适用范围：本仓库内所有由 agent 或脚本执行的 PowerShell 命令，同时覆盖 PowerShell 5.1（`powershell.exe`，打包脚本实际入口）与 PowerShell 7（开发环境）。本文件是 `AGENTS.md` 中 Windows/PowerShell 相关规则的权威展开，`AGENTS.md` 只保留强制要点。

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

### 仅在仓库外确有分离需求时

- 必须把 stdout/stderr 重定向到文件，不能继承父管道；否则命令会空转到超时。
- 用有界轮询探测就绪（端口/readiness），不要固定 sleep；失败时读退出码与 stderr 定位（例如 build 缺失、`--strictPort` 端口占用）。
- 杀旧进程按端口解析 PID 并核验路径/启动时间，禁止硬编码 PID。

参考脚本（分离启动 + 就绪轮询）：

```powershell
$repo = (Get-Location).Path
# 1) 按端口解析旧进程并核验路径，不硬编码 PID
$old = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue |
       Select-Object -First 1 -ExpandProperty OwningProcess
if ($old) {
  $p = Get-Process -Id $old -ErrorAction SilentlyContinue
  if ($p -and $p.Path -like "$repo*") { Stop-Process -Id $old -Force }
}
# 2) 重定向输出到文件，避免子进程继承管道导致命令空转
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = (Get-Command node.exe).Source
$psi.WorkingDirectory = $repo
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($psi)
$outTask = $process.StandardOutput.ReadToEndAsync()  # 异步排空，防止缓冲写满阻塞
$errTask = $process.StandardError.ReadToEndAsync()
# 3) 有界轮询就绪；失败时暴露退出码和 stderr
$ready = $false
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) { break }
  if (Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue) { $ready = $true; break }
  Start-Sleep -Milliseconds 300
}
[pscustomobject]@{
  Id       = $process.Id
  Ready    = $ready
  Exited   = $process.HasExited
  ExitCode = if ($process.HasExited) { $process.ExitCode } else { $null }
  Stderr   = if ($process.HasExited) { $errTask.Result } else { $null }
}
```

## 3. 长命令、超时与增量输出

- 长命令不要用超大单次 timeout 猜测状态。让执行返回 cell，短 wait 查看增量输出；确认在推进后继续等待。
- `Start-Process` 还可能因环境中同时存在 `Path`/`PATH` 触发字典冲突；本仓库禁止用它启动长期服务。

## 4. 进程定位与终止

- 锁定日志无法删除或端口被占时，用内容、mtime、监听端口、可执行路径和启动时间定位准确进程；只终止已验证 PID。
- 只能通过端口解析 PID（`Get-NetTCPConnection -State Listen -LocalPort <port>` → `OwningProcess`），核验可执行路径/启动时间确属本仓库后终止；禁止按进程名批量杀 `node`。
- 本仓库服务一律用受管 cell 生命周期管理，进程定位只用于残留端口/锁文件的兜底清理。

## 5. 检索与数据检查

- `rg.exe` 在受限环境中可能 Access denied；退化为 `Get-ChildItem -Recurse -File` + `Select-String`，不要因此停止调查。
- 生成 JSON 多为单行，`git diff` 会显示整行变化。优先检查 manifest、Schema 版本、记录数、哈希和验证器结果，不要把整份 JSON 加载进上下文。
- `data:parse:pals` 即使离线也要解析约 299 个页面，可能耗时数分钟；只在 parser 或原始缓存变化后运行一次。缺少新素材时离线解析会明确失败，此时联网同步一次素材，再回到离线构建/校验。

## 6. 服务异常排查

- Vite/HMR 服务异常断开后，页面可能保留旧 UI 但后续 fetch 失败；浏览器报错前先检查 readiness URL 和精确端口。