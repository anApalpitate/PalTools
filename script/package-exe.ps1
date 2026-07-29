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
  throw "Refusing to clean unexpected build directory: $buildRoot"
}

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source

Write-Host 'PalTools EXE packaging' -ForegroundColor Cyan
Write-Host "Repository: $repoRoot"
Write-Host "Build output: $buildRoot"
Write-Host "Node version: $(& $node --version)"

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$cleanTargets = @(
  [System.IO.Path]::GetFullPath((Join-Path $buildRoot 'web')),
  [System.IO.Path]::GetFullPath((Join-Path $buildRoot 'release'))
)

Write-Host 'Cleaning previous build/web and build/release artifacts...'
foreach ($target in $cleanTargets) {
  if (
    -not $target.StartsWith(
      $expectedPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    [System.IO.Path]::GetDirectoryName($target) -ne $buildRoot -or
    [System.IO.Path]::GetFileName($target) -notin @('web', 'release')
  ) {
    throw "Refusing to clean unexpected artifact directory: $target"
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
    throw "npm run $Name failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  $electronVersion = (
    & $node -p "require('./node_modules/electron/package.json').version"
  ).Trim()
  if (-not $electronVersion) {
    throw 'Unable to determine the installed Electron version'
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
      throw "Refusing to rebuild unexpected Electron cache directory: $electronDist"
    }

    if (Test-Path -LiteralPath $electronDist) {
      Remove-Item -LiteralPath $electronDist -Recurse -Force
    }

    $electronDownloadCache = Join-Path $cacheRoot 'electron-download'
    $electronTemp = Join-Path $cacheRoot 'electron-temp'
    New-Item -ItemType Directory -Path $electronDownloadCache -Force | Out-Null
    New-Item -ItemType Directory -Path $electronTemp -Force | Out-Null

    Write-Host "Preparing Electron $electronVersion runtime..." -ForegroundColor Yellow
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
        throw 'Electron download preparation failed'
      }
      $electronZip = $downloadOutput[-1].Trim()
    }

    if (-not (Test-Path -LiteralPath $electronZip -PathType Leaf)) {
      throw "Missing Electron archive: $electronZip"
    }

    New-Item -ItemType Directory -Path $electronDist -Force | Out-Null
    Expand-Archive `
      -LiteralPath $electronZip `
      -DestinationPath $electronDist `
      -Force
    if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe') -PathType Leaf)) {
      throw 'Prepared Electron runtime is incomplete'
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
    throw "Missing packaged application for smoke testing: $smokeExe"
  }

  Write-Host "`n> Packaged application smoke test" -ForegroundColor Yellow
  $env:PALTOOLS_SMOKE_TEST = '1'
  try {
    $smokeProcess = Start-Process `
      -FilePath $smokeExe `
      -ArgumentList '--paltools-smoke-test' `
      -WindowStyle Hidden `
      -PassThru
    if (-not $smokeProcess.WaitForExit(30000)) {
      Stop-Process -Id $smokeProcess.Id -Force -ErrorAction SilentlyContinue
      throw 'Packaged application smoke test exceeded 30 seconds'
    }
    if ($smokeProcess.ExitCode -ne 0) {
      throw "Packaged application smoke test failed with exit code $($smokeProcess.ExitCode)"
    }
  }
  finally {
    Remove-Item Env:\PALTOOLS_SMOKE_TEST -ErrorAction SilentlyContinue
  }
  Write-Host 'Packaged application passed schema, reverse-index, active-skill, drop-icon, and default-limit smoke checks.'

  $localeDirectory = Join-Path $buildRoot 'release\win-unpacked\locales'
  $expectedLocales = @('en-US.pak', 'zh-CN.pak')
  $actualLocales = @(
    Get-ChildItem -LiteralPath $localeDirectory -Filter '*.pak' -File |
      Sort-Object -Property Name |
      Select-Object -ExpandProperty Name
  )
  $localeDifference = @(
    Compare-Object `
      -ReferenceObject $expectedLocales `
      -DifferenceObject $actualLocales
  )
  if ($localeDifference.Count -ne 0) {
    throw "Unexpected Electron locale set: $($actualLocales -join ', ')"
  }
  Write-Host "Electron locales: $($actualLocales -join ', ')"

  $executables = @(
    Get-ChildItem -LiteralPath (Join-Path $buildRoot 'release') `
      -Filter '*.exe' `
      -File `
      -ErrorAction Stop
  )

  if ($executables.Count -eq 0) {
    throw 'electron-builder did not produce an EXE in build/release'
  }

  Write-Host "`nPackaging complete:" -ForegroundColor Green
  foreach ($executable in $executables) {
    $sizeMb = [Math]::Round($executable.Length / 1MB, 1)
    $sha256 = (Get-FileHash -LiteralPath $executable.FullName -Algorithm SHA256).Hash
    Write-Host "  $($executable.FullName)" -ForegroundColor Green
    Write-Host "    Bytes: $($executable.Length)" -ForegroundColor Green
    Write-Host "    Size: $sizeMb MB" -ForegroundColor Green
    Write-Host "    SHA-256: $sha256" -ForegroundColor Green
  }
}
finally {
  Pop-Location
}
