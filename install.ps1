# Eile installer for Windows: downloads cms.exe for this machine's processor from the GitHub release,
# checks it against SHA256SUMS and puts it into %LOCALAPPDATA%\Programs\Eile, with the second name eile.exe
# next to it. No administrator rights are needed (docs/adr/0049-windows.md).
#
#   irm https://github.com/__REPO__/releases/latest/download/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://github.com/__REPO__/releases/latest/download/install.ps1))) -Version v0.2.0
#
# Environment variables, as in install.sh:
#   CMS_VERSION          release tag, e.g. v0.2.0; the latest by default
#   CMS_INSTALL_DIR      where cms.exe goes
#   CMS_NO_MODIFY_PATH   1: do not add the directory to the user PATH
#   CMS_REPO             owner/name of the GitHub repository; a release writes its own
#   CMS_DOWNLOAD_URL     your own address of the release files (a mirror, file:// for testing)
#
# The whole file is ASCII, comments included, so the messages are in English (unlike install.sh):
# Windows PowerShell 5.1 decodes `irm` output as ISO-8859-1 and a file without a BOM in the ANSI code page,
# and UTF-8 Cyrillic turns into quote and control characters there. cms itself then speaks the system
# language. tests/install-ps1.test.ts keeps the file ASCII.
#
# Everything is inside one function, called at the end: `iex` runs the script in the user's session, so
# preferences such as $ErrorActionPreference change only inside it, and `exit` happens only when the
# script runs as a file: in a PowerShell window it would close the window.

param(
  [Alias('Version')] [string] $CmsVersion = $env:CMS_VERSION,
  [Alias('InstallDir')] [string] $CmsInstallDir = $env:CMS_INSTALL_DIR
)

function Install-Eile {
  param([string] $Version, [string] $InstallDir)

  $ErrorActionPreference = 'Stop'
  # The progress bar slows Invoke-WebRequest down many times over in Windows PowerShell 5.1.
  $ProgressPreference = 'SilentlyContinue'
  $repo = if ($env:CMS_REPO) { $env:CMS_REPO } else { '__REPO__' }

  function Write-Line([string] $Text, [string] $Color) {
    if ($Color -and -not $env:NO_COLOR) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
  }
  function Write-Step([string] $Text) { Write-Line "-> $Text" 'DarkGray' }
  function Write-Warn([string] $Text) { Write-Line "! $Text" 'Yellow' }

  # The machine's processor, not the process's: x64 PowerShell under emulation on ARM sees AMD64, and the
  # native build is faster.
  function Get-Target {
    $type = ''
    try { $type = [string] (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop).SystemType } catch { }
    if (-not $type) {
      $type = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    }
    if ($type -match 'ARM64') { return 'windows-arm64' }
    if ($type -match 'x64|AMD64') { return 'windows-x64' }
    throw "the $type processor is not supported: x64 or arm64 only"
  }

  # https and file:// only, like `curl --proto '=https,file'` in install.sh: over http anyone on the way
  # could replace both the binary and its checksum. Three tries, like `curl --retry 3`: a release can fail
  # to answer for a few seconds right after it is published.
  function Get-ReleaseFile([string] $Url, [string] $OutFile) {
    if ($Url -like 'file:*') {
      Copy-Item -LiteralPath ([Uri] $Url).LocalPath -Destination $OutFile -Force
      return
    }
    for ($try = 1; ; $try++) {
      try {
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
        return
      } catch {
        if ($try -ge 3) { throw }
        Start-Sleep -Seconds (2 * $try)
      }
    }
  }

  # SHA256 and unpacking through .NET, not Get-FileHash and Expand-Archive: those live in script modules,
  # and Windows PowerShell 5.1 started from PowerShell 7 inherits its PSModulePath and does not load them.
  function Get-Sha256([string] $Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $sha.Dispose(); $stream.Dispose() }
  }

  function Expand-Zip([string] $Archive, [string] $Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Destination)
  }

  # The checksum of a file from SHA256SUMS: lines `<hex>  <name>` or `<hex> *<name>`.
  function Get-Checksum([string] $Sums, [string] $Name) {
    foreach ($line in Get-Content -LiteralPath $Sums) {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and ($parts[1] -eq $Name -or $parts[1] -eq "*$Name")) { return $parts[0] }
    }
    return $null
  }

  # A trial run before the replacement: an incompatible system does not leave you without a working cms.
  # The answer is the version line or $null.
  function Invoke-Version([string] $Exe) {
    $ErrorActionPreference = 'Continue'
    try {
      $out = (& $Exe version 2>&1 | Out-String).Trim()
      if ($LASTEXITCODE -eq 0) { return $out }
    } catch { }
    return $null
  }

  # Windows does not let a running .exe be deleted, but lets it be renamed: it moves aside as
  # `.<name>.<guid>.trash`, and the next installation or cms update removes it.
  function Move-Aside([string] $Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
      Remove-Item -LiteralPath $Path -Force
    } catch {
      $trash = '.{0}.{1}.trash' -f (Split-Path -Leaf $Path), [guid]::NewGuid().ToString('N')
      Rename-Item -LiteralPath $Path -NewName $trash
    }
  }

  function Clear-Trash([string] $Dir) {
    Get-ChildItem -LiteralPath $Dir -Force -Filter '*.trash' |
      Where-Object { $_.Name -like '.cms.*' -or $_.Name -like '.eile.*' } |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
  }

  # eile.exe is ours if it is an Eile build or the same file as cms.exe (a hard link); someone else's
  # eile.exe stays untouched.
  function Test-OwnAlias([string] $Alias, [string] $Bin) {
    if (-not (Test-Path -LiteralPath $Alias)) { return $false }
    if ((Get-Item -LiteralPath $Alias).VersionInfo.ProductName -eq 'Eile') { return $true }
    if (-not (Test-Path -LiteralPath $Bin)) { return $false }
    return (Get-Sha256 $Alias) -eq (Get-Sha256 $Bin)
  }

  function Test-OnPath([string] $Dir, [string] $PathList) {
    foreach ($entry in ($PathList -split ';')) {
      if ($entry -and $entry.TrimEnd('\') -eq $Dir.TrimEnd('\')) { return $true }
    }
    return $false
  }

  # The user PATH is edited in the registry as is, without expanding %USERPROFILE% and the like:
  # [Environment]::SetEnvironmentVariable would write the expanded value back as REG_SZ. The answer is
  # whether the directory was added.
  function Add-UserPath([string] $Dir) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
    try {
      $raw = [string] $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      if (Test-OnPath $Dir $raw) { return $false }
      $value = if ($raw) { $raw.TrimEnd(';') + ';' + $Dir } else { $Dir }
      $key.SetValue('Path', $value, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    } finally {
      $key.Close()
    }
    # WM_SETTINGCHANGE, so that new windows see the PATH: .NET broadcasts it on any change of a user variable.
    [Environment]::SetEnvironmentVariable('CMS_INSTALL_PING', $null, 'User')
    return $true
  }

  $tmp = $null
  try {
    if ($PSVersionTable.PSVersion.Major -lt 5) { throw 'PowerShell 5.1 or newer is needed' }
    if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'install.ps1 is for Windows; on Linux and macOS use install.sh' }

    if (-not $Version) { $Version = 'latest' }
    if ($Version -ne 'latest' -and -not $Version.StartsWith('v')) { $Version = "v$Version" }

    if ($env:CMS_DOWNLOAD_URL) {
      $base = $env:CMS_DOWNLOAD_URL.TrimEnd('/')
    } elseif ($repo -notlike '*/*') {
      # A release writes owner/name instead of the placeholder; comparing with the placeholder itself would not
      # work, as the release would replace it here too.
      throw 'this installer is not from a release: set the repository, e.g. $env:CMS_REPO = "owner/name"'
    } elseif ($Version -eq 'latest') {
      $base = "https://github.com/$repo/releases/latest/download"
    } else {
      $base = "https://github.com/$repo/releases/download/$Version"
    }
    if ($base -notmatch '^(https|file):') { throw "release files only over https or from file://, not $base" }
    if ($base -like 'https:*') {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    }

    $target = Get-Target
    $file = "cms-$target.zip"
    $dir = if ($InstallDir) { $InstallDir } else { Join-Path $env:LOCALAPPDATA 'Programs\Eile' }
    $dir = [IO.Path]::GetFullPath($dir)
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('eile-install-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null

    Write-Step "downloading $file ($Version)"
    $archive = Join-Path $tmp $file
    $sums = Join-Path $tmp 'SHA256SUMS'
    # The reason goes along: a bare "download failed" cannot tell a missing file from a network error.
    try { Get-ReleaseFile "$base/$file" $archive } catch { throw "download failed: $base/$file ($($_.Exception.Message))" }
    try { Get-ReleaseFile "$base/SHA256SUMS" $sums } catch { throw "download failed: $base/SHA256SUMS ($($_.Exception.Message))" }

    $expected = Get-Checksum $sums $file
    if (-not $expected) { throw "SHA256SUMS has no $file" }
    if ((Get-Sha256 $archive) -ne $expected) {
      throw "the checksum of $file does not match: the file is damaged or replaced"
    }

    Expand-Zip $archive (Join-Path $tmp 'unpacked')
    $fresh = Join-Path $tmp 'unpacked\cms.exe'
    if (-not (Test-Path -LiteralPath $fresh)) { throw "$file has no cms.exe" }
    $about = Invoke-Version $fresh
    if (-not $about) { throw 'the downloaded cms.exe does not run on this system' }

    $bin = Join-Path $dir 'cms.exe'
    $old = Join-Path $dir 'cms.old.exe'
    $alias = Join-Path $dir 'eile.exe'
    $part = Join-Path $dir ('.cms.new.{0}.exe' -f $PID)
    try {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      Copy-Item -LiteralPath $fresh -Destination $part -Force
    } catch {
      throw "no write access to ${dir}: set CMS_INSTALL_DIR"
    }
    Clear-Trash $dir
    $ownAlias = Test-OwnAlias $alias $bin

    # As in cms update: a running cms.exe cannot be overwritten but can be renamed, so the previous one
    # becomes cms.old.exe and the new one takes its place. If that fails, the previous one comes back.
    if (Test-Path -LiteralPath $bin) {
      Move-Aside $old
      Move-Item -LiteralPath $bin -Destination $old
    }
    try {
      Move-Item -LiteralPath $part -Destination $bin
    } catch {
      if ((Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $bin)) { Move-Item -LiteralPath $old -Destination $bin }
      Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue
      throw
    }

    # The second name is a hard link: a symbolic link needs administrator rights or developer mode. The link
    # holds on to the previous file, so it is made again on every installation and by cms update.
    $names = @('cms')
    if ((Test-Path -LiteralPath $alias) -and -not $ownAlias) {
      Write-Warn "$alias exists and is not Eile: the second name eile was not created"
    } else {
      try {
        Move-Aside $alias
        New-Item -ItemType HardLink -Path $alias -Target $bin | Out-Null
        $names += 'eile'
      } catch {
        Write-Warn "the second name eile.exe was not created: $($_.Exception.Message)"
      }
    }

    $also = if ($names -contains 'eile') { ', also as eile' } else { '' }
    Write-Line "OK $about installed: $bin$also" 'Green'

    if (-not (Test-OnPath $dir $env:Path)) {
      if ($env:CMS_NO_MODIFY_PATH -eq '1') {
        Write-Warn "$dir is not in PATH: add it yourself"
      } else {
        $null = Add-UserPath $dir
        # `irm | iex` runs in this very window: cms works here at once, new windows take PATH from the registry.
        $env:Path = "$env:Path;$dir"
        Write-Step "added $dir to PATH for this user: open a new terminal if cms is not found"
      }
    }
    foreach ($name in $names) {
      $found = Get-Command "$name.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($found -and $found.Path -ne (Join-Path $dir "$name.exe")) {
        Write-Warn "another $name comes first in PATH: $($found.Path)"
      }
    }

    Write-Host ''
    Write-Host 'Next:'
    Write-Host '  cms new blog --db site.db   a ready-made site: blog, portfolio, company, showcase, shop'
    Write-Host '  cms --db site.db            the site at http://localhost:8080, the manager at /manager'
    Write-Host '  cms help                    all commands'
    Write-Host ''
    Write-Host 'To update, run cms update or this installer again and restart a running server.'
    return $true
  } catch {
    Write-Line "error: $($_.Exception.Message)" 'Red'
    return $false
  } finally {
    if ($tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

$CmsInstalled = Install-Eile -Version $CmsVersion -InstallDir $CmsInstallDir
if (($CmsInstalled | Select-Object -Last 1) -ne $true -and $PSCommandPath) { exit 1 }
