[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath(
  (Join-Path -Path $PSScriptRoot -ChildPath '..')
)
$buildRoot = [System.IO.Path]::GetFullPath(
  (Join-Path -Path $repoRoot -ChildPath 'build')
)
$expectedPrefix = $repoRoot.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar

if (
  -not $buildRoot.StartsWith(
    $expectedPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  ) -or
  [System.IO.Path]::GetFileName($buildRoot) -ne 'build'
) {
  throw "拒绝清理非预期的构建目录：$buildRoot"
}

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source

Write-Host 'PalTools EXE 一键打包' -ForegroundColor Cyan
Write-Host "项目目录：$repoRoot"
Write-Host "构建产物：$buildRoot"
Write-Host "Node 版本：$(& $node --version)"

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$cleanTargets = @(
  [System.IO.Path]::GetFullPath((Join-Path $buildRoot 'web')),
  [System.IO.Path]::GetFullPath((Join-Path $buildRoot 'release'))
)

Write-Host '正在清理旧的 build/web 与 build/release 产物……'
foreach ($target in $cleanTargets) {
  if (
    -not $target.StartsWith(
      $expectedPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    [System.IO.Path]::GetDirectoryName($target) -ne $buildRoot -or
    [System.IO.Path]::GetFileName($target) -notin @('web', 'release')
  ) {
    throw "拒绝清理非预期的产物目录：$target"
  }

  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

$env:ELECTRON_CACHE = Join-Path $buildRoot 'cache\electron'
$env:ELECTRON_BUILDER_CACHE = Join-Path $buildRoot 'cache\electron-builder'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

function Invoke-NpmScript {
  param([Parameter(Mandatory = $true)][string]$Name)

  Write-Host "`n> npm run $Name" -ForegroundColor Yellow
  & $npm run $Name
  if ($LASTEXITCODE -ne 0) {
    throw "npm run $Name 执行失败，退出码：$LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  $electronVersion = (
    & $node -p "require('./node_modules/electron/package.json').version"
  ).Trim()
  if (-not $electronVersion) {
    throw '无法确定当前安装的 Electron 版本'
  }

  $cacheRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $buildRoot 'cache')
  )
  $electronDist = [System.IO.Path]::GetFullPath(
    (Join-Path $cacheRoot 'electron-dist-win32-x64')
  )
  $electronVersionFile = Join-Path $electronDist 'paltools-version.txt'
  $expectedCachePrefix = $cacheRoot.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar

  $cachedVersion = $null
  if (Test-Path -LiteralPath $electronVersionFile -PathType Leaf) {
    $cachedVersion = (
      [System.IO.File]::ReadAllText($electronVersionFile)
    ).Trim()
  }

  if (
    -not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe') -PathType Leaf) -or
    $cachedVersion -ne $electronVersion
  ) {
    if (
      -not $electronDist.StartsWith(
        $expectedCachePrefix,
        [System.StringComparison]::OrdinalIgnoreCase
      ) -or
      [System.IO.Path]::GetFileName($electronDist) -ne 'electron-dist-win32-x64'
    ) {
      throw "拒绝重建非预期的 Electron 缓存目录：$electronDist"
    }

    if (Test-Path -LiteralPath $electronDist) {
      Remove-Item -LiteralPath $electronDist -Recurse -Force
    }

    $electronDownloadCache = Join-Path $cacheRoot 'electron-download'
    $electronTemp = Join-Path $cacheRoot 'electron-temp'
    New-Item -ItemType Directory -Path $electronDownloadCache -Force | Out-Null
    New-Item -ItemType Directory -Path $electronTemp -Force | Out-Null

    Write-Host "正在准备 Electron $electronVersion 运行时……" -ForegroundColor Yellow
    $archiveName = "electron-v$electronVersion-win32-x64.zip"
    $electronZip = Join-Path $electronDownloadCache $archiveName
    if (-not (Test-Path -LiteralPath $electronZip -PathType Leaf)) {
      $defaultElectronCache = Join-Path $env:LOCALAPPDATA 'electron\Cache'
      $defaultArchive = @(
        Get-ChildItem `
          -LiteralPath $defaultElectronCache `
          -Recurse `
          -Filter $archiveName `
          -File `
          -ErrorAction SilentlyContinue
      ) | Select-Object -First 1

      if ($null -ne $defaultArchive) {
        Copy-Item `
          -LiteralPath $defaultArchive.FullName `
          -Destination $electronZip
      }
    }

    if (-not (Test-Path -LiteralPath $electronZip -PathType Leaf)) {
      $downloadOutput = @(
        & $node `
          (Join-Path $repoRoot 'script\prepare-electron-download.mjs') `
          $electronVersion `
          $electronDownloadCache `
          $electronTemp
      )
      if ($LASTEXITCODE -ne 0 -or $downloadOutput.Count -eq 0) {
        throw 'Electron 下载准备失败'
      }
      $electronZip = $downloadOutput[-1].Trim()
    }

    if (-not (Test-Path -LiteralPath $electronZip -PathType Leaf)) {
      throw "缺少 Electron 压缩包：$electronZip"
    }

    New-Item -ItemType Directory -Path $electronDist -Force | Out-Null
    Expand-Archive `
      -LiteralPath $electronZip `
      -DestinationPath $electronDist `
      -Force
    if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe') -PathType Leaf)) {
      throw '准备完成的 Electron 运行时不完整'
    }
    [System.IO.File]::WriteAllText(
      $electronVersionFile,
      $electronVersion,
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  Invoke-NpmScript -Name 'data:validate'
  Invoke-NpmScript -Name 'test'
  Invoke-NpmScript -Name 'build:exe:web'
  Invoke-NpmScript -Name 'package:electron'

  $smokeExe = Join-Path $buildRoot 'release\win-unpacked\PalTools.exe'
  if (-not (Test-Path -LiteralPath $smokeExe -PathType Leaf)) {
    throw "缺少用于冒烟测试的已打包程序：$smokeExe"
  }

  Write-Host "`n> 已打包应用冒烟测试" -ForegroundColor Yellow
  $env:PALTOOLS_SMOKE_TEST = '1'
  try {
    $smokeProcess = Start-Process `
      -FilePath $smokeExe `
      -ArgumentList '--paltools-smoke-test' `
      -WindowStyle Hidden `
      -PassThru
    if (-not $smokeProcess.WaitForExit(30000)) {
      Stop-Process -Id $smokeProcess.Id -Force -ErrorAction SilentlyContinue
      throw '已打包应用冒烟测试超过 30 秒'
    }
    if ($smokeProcess.ExitCode -ne 0) {
      throw "已打包应用冒烟测试失败，退出码：$($smokeProcess.ExitCode)"
    }
  }
  finally {
    Remove-Item Env:\PALTOOLS_SMOKE_TEST -ErrorAction SilentlyContinue
  }
  Write-Host '已打包应用通过 Schema v3、反向索引、主动技能、掉落图标和默认上限冒烟检查。'

  $executables = @(
    Get-ChildItem -LiteralPath (Join-Path $buildRoot 'release') `
      -Filter '*.exe' `
      -File `
      -ErrorAction Stop
  )

  if ($executables.Count -eq 0) {
    throw 'electron-builder 未在 build/release 中生成 EXE'
  }

  Write-Host "`n打包完成：" -ForegroundColor Green
  foreach ($executable in $executables) {
    $sizeMb = [Math]::Round($executable.Length / 1MB, 1)
    Write-Host "  $($executable.FullName) ($sizeMb MB)" -ForegroundColor Green
  }
}
finally {
  Pop-Location
}
