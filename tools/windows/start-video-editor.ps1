$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$scriptPath = $MyInvocation.MyCommand.Path
$scriptDirectory = Split-Path -Parent $scriptPath
$projectRoot = (Resolve-Path (Join-Path $scriptDirectory "..\..")).Path
$pythonPath = Join-Path $projectRoot "venv\Scripts\python.exe"
$mainPath = Join-Path $projectRoot "app\main.py"
$requirementsPath = Join-Path $projectRoot "requirements.txt"
$logDirectory = Join-Path $projectRoot "logs\windows"
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$startupLogPath = Join-Path $logDirectory "startup-$runId.log"
$stdoutLogPath = Join-Path $logDirectory "uvicorn-$runId.stdout.log"
$stderrLogPath = Join-Path $logDirectory "uvicorn-$runId.stderr.log"

function Write-StartupLog {
    param([string]$Message)

    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ssK"), $Message
    Add-Content -LiteralPath $startupLogPath -Value $line -Encoding UTF8
}

function Get-ListeningProcessIds {
    $connections = @(Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8011 -State Listen -ErrorAction SilentlyContinue)
    $connections | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique
}

function Test-VideoEditorProcess {
    param([int]$ProcessId)

    $process = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return $false
    }

    $commandLine = [string]$process.CommandLine
    $executablePath = [string]$process.ExecutablePath
    $normalizedPythonPath = $pythonPath.Replace("/", "\").ToLowerInvariant()
    $normalizedExecutablePath = $executablePath.Replace("/", "\").ToLowerInvariant()
    $normalizedCommandLine = $commandLine.Replace("/", "\").ToLowerInvariant()

    return ($normalizedCommandLine -match "app\.main:app") -and (
        $normalizedExecutablePath -eq $normalizedPythonPath -or
        $normalizedCommandLine.Contains($normalizedPythonPath)
    )
}

try {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Write-StartupLog "Starting Video Editor startup check."
    Write-StartupLog ("Project root: {0}" -f $projectRoot)

    foreach ($requiredPath in @($pythonPath, $mainPath, $requirementsPath)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw ("Required file was not found: {0}" -f $requiredPath)
        }
    }

    $processIds = @(Get-ListeningProcessIds)
    if ($processIds.Count -gt 0) {
        $videoEditorProcessIds = @($processIds | Where-Object { Test-VideoEditorProcess -ProcessId $_ })
        if ($videoEditorProcessIds.Count -eq $processIds.Count) {
            Write-StartupLog ("Video Editor is already listening on 127.0.0.1:8011. Existing process IDs: {0}" -f ($videoEditorProcessIds -join ", "))
            exit 0
        }

        throw ("Port 8011 is already in use by another process. Process IDs: {0}" -f ($processIds -join ", "))
    }

    Write-StartupLog "Starting Uvicorn with the project virtual environment."
    $serverProcess = Start-Process `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8011", "--lifespan", "on", "--log-level", "info") `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $stdoutLogPath `
        -RedirectStandardError $stderrLogPath `
        -Wait `
        -PassThru `
        -NoNewWindow

    if ($serverProcess.ExitCode -ne 0) {
        throw ("Uvicorn exited with code {0}. See {1} and {2}." -f $serverProcess.ExitCode, $stdoutLogPath, $stderrLogPath)
    }

    Write-StartupLog ("Uvicorn exited normally with code {0}." -f $serverProcess.ExitCode)
    exit 0
}
catch {
    $errorMessage = "ERROR: {0}" -f $_.Exception.Message
    try {
        if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
            New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        }
        Write-StartupLog $errorMessage
    }
    catch {
        Write-Error $errorMessage
    }
    exit 1
}
