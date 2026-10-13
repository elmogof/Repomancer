# Manages the "Git Manager" logon task: it starts the app's server, hidden, every time you sign in
# to Windows, running as your own user (so terminals, editors and your git credentials work).
#   install   build the client, create or update the task and start it
#   uninstall stop and remove the task and the Start menu shortcut
#   start | stop | restart | status
# Options for testing a second copy: -TaskName, -Port, -ConfigHome
param(
  [Parameter(Position = 0)][ValidateSet('install', 'uninstall', 'start', 'stop', 'restart', 'status')][string]$Command = 'status',
  [string]$TaskName = 'Git Manager',
  [int]$Port = 0,
  [string]$ConfigHome = ''
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$appPort = if ($Port) { $Port } elseif ($env:PORT) { [int]$env:PORT } else { 4000 }
$url = "http://localhost:$appPort"
# The server listens on 127.0.0.1 only; checking "localhost" would wait for the IPv6 attempt to time out.
$probe = "http://127.0.0.1:$appPort/"
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) "$TaskName.url"

function Get-Task { Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
function Test-Up {
  try { Invoke-WebRequest $probe -UseBasicParsing -TimeoutSec 2 | Out-Null; $true } catch { $false }
}
function Wait-Up {
  for ($i = 0; $i -lt 30; $i++) { if (Test-Up) { return $true }; Start-Sleep -Milliseconds 500 }
  $false
}
function Show-Status {
  $task = Get-Task
  if (-not $task) { Write-Host "Task '$TaskName' is not installed."; return }
  Write-Host "Task '$TaskName': $($task.State)"
  if (Test-Up) { Write-Host "App running at $url" } else { Write-Host "App is not responding at $url (log: server.log in your .git-manager folder)" }
}
function Build-Client {
  Write-Host 'Building the client...'
  Push-Location $root
  try { npm run build --silent; if ($LASTEXITCODE) { throw 'Client build failed' } } finally { Pop-Location }
}
function Start-App {
  Start-ScheduledTask -TaskName $TaskName
  if (Wait-Up) { Write-Host "Git Manager is running at $url" } else { Write-Warning "Started, but $url does not respond yet. Check server.log in your .git-manager folder." }
}
function Stop-App {
  $running = (Get-Task).State -eq 'Running'
  if ($running) { Stop-ScheduledTask -TaskName $TaskName }
  # Stopping the task only ends conhost: also end this project's launcher and the server it started.
  $launch = Join-Path $root 'scripts\startup\launch.mjs'
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
  $launchers = @($procs | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($launch) })
  $ids = @($launchers.ProcessId) + @($procs | Where-Object { $launchers.ProcessId -contains $_.ParentProcessId } | ForEach-Object ProcessId)
  foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  if ($running -or $ids.Count) { Write-Host 'Stopped.' } else { Write-Host 'Not running.' }
}

switch ($Command) {
  'install' {
    $node = (Get-Command node -ErrorAction Stop).Source
    Build-Client
    $launch = "`"$node`" `"$root\scripts\startup\launch.mjs`""
    if ($Port) { $launch += " --port $Port" }
    if ($ConfigHome) { $launch += " --home `"$ConfigHome`"" }
    # conhost --headless runs node without a console window.
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\conhost.exe" -Argument "--headless $launch" -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
      -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    if (Get-Task) { Stop-App; Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
      -Description "Starts the Git Manager server ($url) when you sign in. Project: $root" | Out-Null
    Set-Content -Path $shortcut -Value "[InternetShortcut]`r`nURL=$url/`r`n" -Encoding ASCII
    Write-Host "Task '$TaskName' installed; it will start when you sign in. Start menu shortcut: $TaskName"
    if (Test-Up) { Write-Warning "Port $appPort is already in use (is 'npm run dev' running?). Stop it, then run: npm run startup:start" }
    else { Start-App }
  }
  'uninstall' {
    if (Get-Task) { Stop-App; Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; Write-Host "Task '$TaskName' removed." }
    else { Write-Host "Task '$TaskName' is not installed." }
    Remove-Item $shortcut -ErrorAction SilentlyContinue
  }
  'start' { if (-not (Get-Task)) { throw "Task '$TaskName' is not installed. Run: npm run startup:install" }; Start-App }
  'stop' { if (-not (Get-Task)) { throw "Task '$TaskName' is not installed." }; Stop-App }
  'restart' {
    if (-not (Get-Task)) { throw "Task '$TaskName' is not installed. Run: npm run startup:install" }
    Build-Client; Stop-App; Start-Sleep -Seconds 1; Start-App
  }
  'status' { Show-Status }
}
