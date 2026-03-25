# Run in PowerShell if `adb` is not recognized (adds Android SDK platform-tools for this session).
# Permanent PATH: Settings → Environment Variables → User Path → add:
#   %LOCALAPPDATA%\Android\Sdk\platform-tools

$platformTools = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
if (Test-Path (Join-Path $platformTools "adb.exe")) {
  $env:Path = "$platformTools;$env:Path"
  Write-Host "OK: adb is on PATH for this session: $platformTools"
  & adb version
} else {
  Write-Error "adb.exe not found at $platformTools — install Android SDK Platform-Tools."
  exit 1
}
