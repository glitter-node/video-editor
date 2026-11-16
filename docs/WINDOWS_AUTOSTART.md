# Windows Auto-Start

Video Editor can be started automatically when the current Windows user signs in. This is an optional convenience for a native Windows installation. It uses Windows Task Scheduler; it does not install a Windows service or require a separate service manager.

## Prerequisites

Before registering an auto-start task, confirm that:

- The target computer runs a supported native Windows installation, such as Windows 10 or Windows 11.
- Python 3.11 or newer is installed and the project virtual environment exists.
- The project dependencies are installed from `requirements.txt`.
- The repository contains `app\main.py`, `requirements.txt`, and `venv\Scripts\python.exe`.
- The current Windows user can read and execute the project files and write to the project's `logs\windows` directory.
- The application is intended to remain local-only at `127.0.0.1:8011`.

The normal installation does not require WSL, Docker, a Linux virtual machine, a native FFmpeg executable, or a Windows service program.

## Confirm an Existing Installation

Open PowerShell and change to the existing repository directory. Do not replace an existing `.env`, database, project data, or media directory.

```powershell
Set-Location (Read-Host "Enter the full path to the Video Editor project")
Test-Path .\app\main.py
Test-Path .\requirements.txt
Test-Path .\venv\Scripts\python.exe
```

Each command should return `True`. If the virtual environment is missing, complete the normal Windows installation in `README.md` before configuring auto-start.

## How the Startup Script Works

The script is [tools/windows/start-video-editor.ps1](../tools/windows/start-video-editor.ps1). It derives the project root from its own location, so the repository can be installed on another drive or in a directory containing spaces.

At each invocation, it:

1. Validates the virtual-environment Python executable and required project files.
2. Creates `logs\windows` inside the project if needed.
3. Checks the listener on `127.0.0.1:8011`.
4. Exits successfully when that listener is already the Video Editor launched from this project's virtual environment.
5. Exits with an error when another process owns the port. It never terminates another process.
6. Starts `python.exe -m uvicorn app.main:app` with the project root as its working directory.
7. Waits for Uvicorn and returns its exit status. A non-zero exit is reported as a failure.

The script does not install Python packages, modify PowerShell's system execution policy, change `.env`, write SQLite data directly, or alter user media and browser project data.

## Run the Script Manually

From the repository root, run:

```powershell
Set-Location (Read-Host "Enter the full path to the Video Editor project")
& .\tools\windows\start-video-editor.ps1
```

If the current execution policy prevents a local script, use a process-scoped policy for this invocation. This does not change the system or user policy:

```powershell
Set-Location (Read-Host "Enter the full path to the Video Editor project")
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\windows\start-video-editor.ps1
```

While the script is running, check the local health endpoint from another PowerShell window:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8011/healthz
```

The response should contain `ok`. The editor is available at `http://127.0.0.1:8011/`.

## Register Auto-Start at User Logon

The following block registers a task for the current user without assuming a drive letter, account name, or installation directory. It prompts for the repository path and does not overwrite an existing task with the same name.

Run it in a normal, non-elevated PowerShell window:

```powershell
$projectRoot = (Resolve-Path (Read-Host "Enter the full path to the Video Editor project")).Path
$scriptPath = Join-Path $projectRoot "tools\windows\start-video-editor.ps1"
$taskName = "Video Editor - Current User"
$powershellPath = (Get-Command powershell.exe -CommandType Application).Path

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "The startup script was not found: $scriptPath"
}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw "A scheduled task named '$taskName' already exists. Inspect it before changing it."
}

$action = New-ScheduledTaskAction `
    -Execute $powershellPath `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $scriptPath) `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME)
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal `
    -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType InteractiveToken `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Starts the local Video Editor at user logon."
```

The task runs only after this user signs in, not at system boot before logon. It uses limited privileges and does not request administrator elevation. If the task already exists, the block stops and leaves it unchanged. Inspect it with:

```powershell
Get-ScheduledTask -TaskName "Video Editor - Current User" | Format-List *
```

To test the registered task without waiting for the next sign-in:

```powershell
Start-ScheduledTask -TaskName "Video Editor - Current User"
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8011/healthz
```

## Restart and Failure Policy

The startup script waits for the Uvicorn child process and returns a non-zero exit status when startup fails or Uvicorn exits abnormally. The task settings request up to three restarts with a one-minute interval. This limit prevents an endless restart loop when Python, the virtual environment, the project files, or port 8011 are invalid or unavailable.

An already-running Video Editor instance is treated as a successful no-op. A different process listening on port 8011 is treated as an error; the script does not stop or replace it. Resolve the port conflict after identifying the owning application, or intentionally configure that application separately. The startup script keeps the application's existing port and environment configuration unchanged.

## Logs

Logs are stored under the project directory:

```text
logs\windows\startup-YYYYMMDD-HHMMSS.log
logs\windows\uvicorn-YYYYMMDD-HHMMSS.stdout.log
logs\windows\uvicorn-YYYYMMDD-HHMMSS.stderr.log
```

The startup log records validation, duplicate detection, port conflicts, and process exit status. Uvicorn standard output and standard error are kept in separate per-run files. The script does not delete or rotate old logs automatically; long-running installations should periodically archive or remove old log files after stopping the task and confirming that no needed diagnostic information remains.

## Verify After Restart or Re-Login

After restarting Windows or signing out and signing back in:

```powershell
Get-ScheduledTask -TaskName "Video Editor - Current User" | Select-Object TaskName, State
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8011/healthz
```

Then open `http://127.0.0.1:8011/` in a browser. Review the newest files in `logs\windows` if the health request fails. A successful page load or health response does not verify video export; test a short local media file separately when that functional verification is authorized.

## Stop, Disable, Re-Enable, or Remove Auto-Start

Stop the current task and its task-managed process:

```powershell
Stop-ScheduledTask -TaskName "Video Editor - Current User"
```

Disable auto-start while keeping the task definition:

```powershell
Disable-ScheduledTask -TaskName "Video Editor - Current User"
```

Re-enable it:

```powershell
Enable-ScheduledTask -TaskName "Video Editor - Current User"
```

Remove the task after confirming its name and scope:

```powershell
Unregister-ScheduledTask -TaskName "Video Editor - Current User" -Confirm:$true
```

Removing or disabling the task does not remove the repository, virtual environment, SQLite database, presets, browser project data, media, or logs. If a task stop leaves a server process running, verify its executable and command line before stopping that specific process through Task Manager. Do not terminate an unrelated process just because it uses a similar port.

## Troubleshooting

### Python or virtual-environment path errors

From the project root, check the executable directly:

```powershell
Test-Path .\venv\Scripts\python.exe
& .\venv\Scripts\python.exe --version
& .\venv\Scripts\python.exe -c "import sqlite3; print(sqlite3.sqlite_version)"
```

The startup script uses the virtual environment's Python and never assumes that a global `python.exe` is on `PATH`. Recreate or repair the environment only through the normal installation procedure; do not delete existing data as a troubleshooting step.

### Port 8011 is occupied

Inspect the listener before taking action:

```powershell
Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8011 -State Listen |
    Select-Object LocalAddress, LocalPort, OwningProcess
```

The script distinguishes a matching Video Editor process from another process using the port. It does not kill either process. If the matching server is healthy, the scheduled invocation exits successfully without starting a duplicate.

### Task starts and immediately stops

Check the newest startup and Uvicorn logs. Common causes are a missing virtual environment, a missing project file, an invalid existing `.env`, insufficient directory permissions, or a port conflict. Run the script manually in PowerShell to see the same failure interactively. Do not copy a placeholder database URL into `.env`; preserve the existing configuration unless it has been reviewed for this installation.

### Task Scheduler permissions

The registration block uses the current interactive user and limited run level. Administrator elevation is not required for a normal per-user task. If local policy prevents task registration or script execution, follow the policy of the target Windows installation rather than weakening system-wide execution or security settings.

## Local Security and Data Preservation

The startup script binds Uvicorn to `127.0.0.1`, so it is reachable only from the same Windows host by default. It does not open firewall ports, configure remote access, change trusted hosts, or create a Windows service. Do not change the bind address unless you have separately reviewed firewall, trusted-host, authentication, and network exposure requirements.

The task and script preserve the existing `.env`, SQLite database, presets, browser project data, source media, and backups. The browser performs media processing locally; this auto-start feature does not add source-video upload or server-side transcoding.

Signing out normally ends the interactive user session and may stop the task-managed server process. This is user-logon auto-start, not a boot-time service. If the server must continue after sign-out, that is a different operating model with different permissions and security implications and is outside this feature.

## Limitations

- Auto-start is opt-in and is not registered by the normal installation commands.
- The task restarts a failed launch at most three times per failure episode; it does not attempt unlimited recovery.
- Logs are per-run files without automatic rotation.
- This procedure has not been verified on a live Windows host in this change. Confirm task registration, restart behavior, sign-out behavior, health checks, and a short media export on the intended Windows installation.
