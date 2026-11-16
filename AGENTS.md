# AGENTS.md — Video Editor

## Purpose and priorities

This repository is a self-hosted, browser-based video editor. Its primary purpose is installation and local operation on a user's own host, especially native Windows 10/11, as well as Linux and macOS. Treat a public demo or remote server deployment as an optional scenario, not the default.

When assisting a user, prioritize:

1. A working, understandable installation on the user's chosen operating system.
2. Local media processing and user privacy.
3. Minimal dependencies, reversible changes, and preservation of user data.
4. Existing behavior and compatibility before adding new features.

Read `README.md` and inspect the relevant source files before changing installation commands, features, configuration, or claims. These instructions apply throughout the repository unless a more specific `AGENTS.md` exists in a subdirectory. Explicit user instructions take priority.

## Architecture and repository map

- Python 3.11+ with FastAPI and Uvicorn serves the web UI, validates editing recipes, generates processing plans, and manages presets.
- Vanilla HTML/CSS/JavaScript implements the browser UI; FFmpeg WebAssembly processes the source media locally in the browser.
- SQLite stores application preset data. Do not substitute MariaDB, PostgreSQL, Redis, or a cloud service merely to support local installation.
- `app/main.py`: FastAPI application and middleware.
- `app/core/`: configuration and database functionality.
- `app/api/`: API handlers and media-processing plan logic.
- `app/web/`: routes, templates, static assets, and editor interface.
- `tests/`: Python, JavaScript, and optional browser tests.
- `tools/`: developer utilities.
- `deploy/`: optional deployment examples; not required for native local use.
- `README.md`: primary user-facing installation, configuration, and feature documentation.

Routes: `/` (entry), `/t/app` (full editor), `/t/min` (minimal editor), `/t/merge` (multi-file merge), and `/healthz` (health check).

Video processing occurs in the browser. Do not introduce source-video upload or server-side transcoding as an assumed requirement. The server can receive recipe metadata for validation and plan generation. Do not claim that all data stays within the browser.

## Installation agent protocol: identify the target host first

Use this protocol whenever the user asks to install, set up, launch, troubleshoot, or make Video Editor start automatically. Do not start with generic Linux commands or assume that the machine running the agent is the target machine.

### Step 1 — Establish the target and user intent

Before recommending commands, determine:

1. **Target host OS and version:** Windows 10/11, Linux distribution/version, or macOS version. If unknown, ask the user one direct question: "Which operating system will run Video Editor: Windows 10/11, Linux, or macOS?" Do not infer it from the current shell or remote connection.
2. **Where commands will run:** user's own computer, remote host, virtual machine, or another machine. If the agent can inspect a machine, verify that it is the intended target before relying on inspection results.
3. **Shell and privileges:** PowerShell, Command Prompt, Bash, or another shell; whether package installation is permitted. Avoid requesting administrator/root access for normal local use.
4. **Installation state:** new clone, existing checkout, partially installed environment, or troubleshooting an existing installation. Preserve existing files and user settings.
5. **Access scope:** localhost-only (default) or user-requested access from another device. Do not configure network exposure implicitly.

Ask only for details that cannot be established from the conversation or permitted read-only inspection. Do not demand a questionnaire when one question suffices. Explain the proposed next step in the user's language.

### Step 2 — Read-only host inspection

With access to the **confirmed target host** and permission for inspection, use commands appropriate to its shell. These commands are examples, not a requirement to run every command.

**Windows PowerShell:**

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture
$PSVersionTable.PSVersion
py --list
py -3.11 -c "import sys, sqlite3; print(sys.version); print(sqlite3.sqlite_version)"
Get-Location
```

Use the last command with the actual installed supported Python version if 3.11 is absent. If the Python launcher is unavailable, inspect a user-provided Python executable or `python --version` rather than assuming Python is missing.

**Linux:**

```bash
uname -s -m
cat /etc/os-release
python3 --version
python3 -c 'import sqlite3; print(sqlite3.sqlite_version)'
pwd
```

**macOS:**

```bash
sw_vers
uname -m
python3 --version
python3 -c 'import sqlite3; print(sqlite3.sqlite_version)'
pwd
```

If inspection is unavailable, declined, or performed on a different host, do not present the output as target-host evidence. Ask the user to run the relevant commands or proceed with clearly labeled unverified prerequisites. Never run an installer or change machine settings as part of OS detection.

### Step 3 — Decide the native installation path

| Confirmed target | Default shell  | Required runtime                  | Avoid as a prerequisite                            |
| ---------------- | -------------- | --------------------------------- | -------------------------------------------------- |
| Windows 10/11    | PowerShell     | Native Python 3.11+ with SQLite   | WSL2, Docker, Linux VM, Bash, systemd, Nginx       |
| Linux            | Native shell   | Python 3.11+ with venv and SQLite | Docker, reverse proxy, systemd service             |
| macOS            | Terminal shell | Python 3.11+ with venv and SQLite | Docker, Linux VM, Homebrew if Python already works |

Use `requirements.txt` for normal installation. Node.js, npm, Playwright, and a native FFmpeg binary are **not required** for the normal application runtime. SQLite is supplied by a Python installation with the `sqlite3` module. The app can start without a project-level `.env` file.

If Python or venv support is missing, explain the specific missing prerequisite and ask permission before installing it. Do not silently install a package manager or change global Python configuration. If the user's platform is outside the documented targets, identify it as unverified and investigate compatibility rather than promising support.

### Step 4 — Present the plan and request permission

Before making changes, summarize:

- Confirmed target OS, version, shell, Python/SQLite status, and any unverified facts.
- Repository directory, intended virtual-environment directory, and whether this is a new or existing installation.
- Exact OS-specific commands to create the environment, install dependencies, and launch the app.
- Expected local URL: `http://127.0.0.1:8011/` unless explicitly configured otherwise.
- Actions that write files, install packages, start processes, or change persistent settings.

Get approval for execution. If the user asked only for instructions, provide instructions without executing them. If the user has already authorized the precise scope, do not ask for redundant permission. Do not turn local setup into a system service, enable startup on boot, or open firewall ports unless requested.

### Step 5 — Native Windows installation (PowerShell)

From the **cloned repository root**, with a confirmed installed Python version:

```powershell
py -3.11 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --lifespan on --log-level info
```

Use `py --list` to choose an installed supported version if `-3.11` is unavailable. A Python virtual environment does not require PowerShell activation: invoke `venv\Scripts\python.exe` directly. Do not modify PowerShell execution policy for this task. Keep Windows paths and PowerShell syntax; never provide `source venv/bin/activate`, Unix absolute paths, or `systemctl` as Windows instructions.

Open `http://127.0.0.1:8011/` in a browser on the same host. For persistent background operation, discuss Windows-native process management only if the user requests it.

### Step 6 — Native Linux and macOS installation

From the **cloned repository root**:

```bash
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --lifespan on --log-level info
```

Confirm that `python3` is 3.11+ before creating the environment; use the appropriate supported interpreter if multiple versions are installed. If a Linux distribution needs a separate venv package, give distribution-specific instructions only after confirming the distribution and requesting permission. Do not assume macOS has Homebrew or Linux uses systemd. Use the same localhost URL.

### Step 7 — Configuration and existing-installation safety

- The normal local default is loopback `127.0.0.1`; no public DNS, HTTPS reverse proxy, Docker, or firewall change is required for same-host use.
- Do not blindly copy `.env.example` into `.env`: its example absolute `DATABASE_URL` contains a placeholder. Use the application's default database path when suitable, or configure a path valid on the actual host.
- Inspect an existing `.env` and database configuration before changing them; preserve credentials and settings. Never print secrets in reports.
- SQLite stores application preset data. Do not migrate to another database engine to simplify installation.
- Do not overwrite or delete user media, browser project data, SQLite files, saved presets, or backups during reinstall or troubleshooting.
- Keep the application's existing Content Security Policy and trusted-host safeguards. For explicitly requested LAN/remote access, explain the additional bind-address, host, firewall, and security implications before changes.

### Step 8 — Verify only what was authorized

When the user permits runtime verification:

1. Confirm the application starts without an unresolved traceback.
2. Check `http://127.0.0.1:8011/healthz` and open `http://127.0.0.1:8011/` on the target host.
3. Confirm the editor's static FFmpeg WebAssembly assets load when appropriate.
4. With a user-provided short local media file and permission, perform a simple edit and verify output playback. Loading the page alone does not prove successful encoding.
5. Check project save/reload/recovery only when relevant, and do not use or delete the user's existing project data for testing.

Clearly separate **read-only inspection**, **installation performed**, **server started**, **browser checked**, and **media export verified**. Never claim a successful Windows, Linux, or macOS installation without evidence from that host.

### Step 9 — Troubleshooting decision order

When startup fails, identify the first failing step and report its exact error. Investigate in this order as relevant:

1. Wrong OS-specific command or wrong working directory.
2. Missing or incompatible Python, venv, or `sqlite3` module.
3. Dependency installation failure or incorrect virtual-environment interpreter.
4. Invalid environment configuration, placeholder database URL, or directory permissions.
5. Port 8011 already in use, loopback binding, or trusted-host mismatch.
6. Static WebAssembly asset availability, browser support, or insufficient browser memory for encoding.

Prefer the smallest reversible fix. Do not suggest Docker, WSL2, reinstalling the OS, disabling security protections, or changing global execution policies as the first remedy. If a check cannot be performed, say what remains unknown and give a manual command or next diagnostic step.

### Step 10 — Installation handoff

Report the detected target OS, installation location, Python version, launch command, local URL, changes made, verification actually completed, and remaining issues. Explain how to stop the foreground server (normally `Ctrl+C`) and how to start it again. Never claim automatic startup or background-service installation unless it was explicitly configured and verified.

### Step 11 — Windows user-logon auto-start

Apply this procedure when the user asks for Video Editor to start automatically at Windows login, restart after a PC restart, run in the background, register or remove a Task Scheduler task, disable or re-enable auto-start, or troubleshoot auto-start failure. Distinguish user-logon execution from execution before any user logs on. The default supported path here is user-logon execution; a boot-time service is a separate operating model and is not implied by this feature.

Before changing anything, confirm or reuse information already established about:

1. The actual Windows target host and version, not the host running the agent.
2. The computer on which commands will run, the shell, and whether the user has normal or elevated privileges.
3. Whether this is a new or existing native installation.
4. The project root and the existing `venv\Scripts\python.exe` path.
5. Whether a Video Editor server is already running and which process owns `127.0.0.1:8011`.
6. The user's desired trigger: login, post-restart login, or a request for boot-time operation.
7. The current Task Scheduler state and the intended task scope.

Do not infer target-host facts from the agent's current shell. Ask only for facts that are not already known, and do not register, start, stop, disable, remove, or change a persistent task without the user's explicit approval.

For Windows auto-start, read `docs/WINDOWS_AUTOSTART.md` and inspect `tools/windows/start-video-editor.ps1` before giving commands or proposing changes. Confirm that both files are present and accessible. If either file is missing or cannot be read, do not assume its behavior or invent a replacement; report the missing reference and ask the user to provide it or authorize a separately designed procedure. When the files are available, follow their documented Task Scheduler registration, verification, and removal steps rather than creating another startup script or installing a service manager.

The Windows path uses the native Task Scheduler with a current-user logon trigger, limited run level, and the existing project virtual environment. Keep the server bound to `127.0.0.1:8011`. Do not require WSL, Docker, a Linux VM, a Windows service, registry changes, firewall changes, or system-wide PowerShell execution-policy changes. Do not silently add `-AtStartup`, elevated execution, or an always-on service when the user asked for login auto-start.

The official startup script derives the project root from its own location, validates the virtual-environment Python executable and required project files, creates project-local Windows logs, and starts `app.main:app` with Uvicorn from the project root. It treats an existing listener as a successful no-op only when the process matches this project's virtual-environment Python and `app.main:app`. If another process owns port 8011, it reports an error and does not terminate that process. It waits for Uvicorn and returns a failure status for an abnormal exit. The Task Scheduler restart settings are bounded and do not guarantee recovery from every configuration, permission, or port error.

When the user authorizes execution, verify in this order:

1. The official script, project root, virtual environment, and required files exist on the target host.
2. The script can be run manually and its startup and Uvicorn logs can be written.
3. The server process starts without an unresolved traceback and `/healthz` responds at `http://127.0.0.1:8011/healthz`.
4. The Task Scheduler task has the intended current-user logon trigger, limited privileges, action path, working directory, and bounded restart settings.
5. Starting the task does not create a duplicate server or replace another process using port 8011.
6. After a user-approved sign-out/sign-in or restart, the task runs and `/healthz` responds.

Do not reboot or sign out during verification without separate user approval. A browser page check and a health response do not prove successful media encoding; perform a media test only when requested and authorized. Report manual execution, task registration, post-login verification, browser checks, and media export as separate results, and mark any unperformed Windows checks as unverified.

For failures, inspect the exact startup/Uvicorn logs, task state, process exit status, and port owner before changing anything. Investigate missing virtual environments or files, wrong project paths, Python executable problems, permissions, task action or trigger errors, port conflicts, duplicate servers, and abnormal Uvicorn exits in that order as relevant. Preserve existing `.env`, SQLite data, presets, browser projects, media, and backups. Do not reinstall the application, weaken security settings, change global execution policy, or terminate a process merely to make auto-start succeed. Explain the documented stop, disable, re-enable, and removal procedure and its effect on the running process separately.

Windows auto-start does not define an automatic-start implementation for Linux or macOS. For those systems, confirm the target OS and available native mechanism first; use an existing documented implementation when one exists, obtain approval before registering a persistent service, and state clearly when no repository-supported auto-start procedure is available.

## Editing and development conventions

- Keep HTML semantics, accessibility, responsive layouts, and existing English/Korean localization intact.
- Keep `<html lang="en">` for HTML documents unless the user explicitly requests a different document-language policy.
- Do not add inline styles or inline scripts. Keep JavaScript in separate files and use existing CSS stylesheets.
- Do not add source-code comments unless explicitly requested; use clear names and concise functions.
- Keep user-facing source strings in English or in the existing i18n translation structure, including both English and Korean where applicable.
- Make narrow, reviewable changes. Avoid unrelated refactors, new frameworks, dependencies, and frontend build systems.
- Preserve Content Security Policy compatibility, including the separate handling of script, CSS, worker, and WebAssembly assets. Do not weaken security headers merely to make a feature work.
- Handle browser-specific behavior and small-screen layouts without breaking desktop editing.
- Do not claim testing, compatibility, or feature completion when only static analysis or edits were performed.

## Project persistence and user data

In the full editor, distinguish a formally saved project from in-progress editing and recent automatic recovery data. Inspect the actual implementation before changing persistence behavior, because local working copies may be ahead of the GitHub default branch.

- Deleting a saved project must not implicitly clear the current editor or its recovery state.
- Preserve the distinction between the current saved project identifier and screen-specific `recent:*` records where implemented.
- Respect pending save operations, deletion ordering, transactions, and media-reference ownership. Never allow delayed saves to recreate a deleted project.
- Preserve media that remains referenced by recovery data or other active projects.
- Keep existing JSON project import/export and source-media re-selection behavior. Do not promise that a JSON file embeds the original video.
- Browser storage may be cleared, unavailable, or quota-limited. Recovery is best-effort, not a backup guarantee.
- Treat concurrent edits across browser tabs as a conflict risk unless explicitly implemented and verified.
- For UI wording, accurately distinguish `Delete Saved Project` from deleting the current editing session; do not treat those actions as equivalent.

## Security and privacy

- Do not upload selected video, image, or audio files to a server without an explicit, justified feature request and a clear privacy disclosure.
- Keep the server on loopback for typical single-host use.
- Do not log media content, secret keys, authentication headers, or private local paths unnecessarily.
- Never commit `.env`, credentials, SQLite runtime databases, local media, virtual environments, or generated browser artifacts.
- Respect configured `TRUSTED_HOSTS`, `CORS_ORIGINS`, and preset-write safeguards. Custom preset writes are disabled by default.
- Do not replace the local-first architecture with mandatory external APIs, accounts, telemetry, or cloud storage.

## Verification policy

Before running commands that install packages, start servers, run tests, generate output, modify the database, or change system settings, follow the user's explicit scope and permissions. When the user requests static analysis and source edits only, do not run tests, builds, syntax checks, development servers, or runtime checks.

When verification is authorized, choose checks appropriate to the change:

- Python: `python -m pytest -q` from the intended environment.
- JavaScript: existing `tests/test_*.mjs` files with Node.js, or relevant `npm run test:...` scripts.
- Browser E2E: optional Playwright infrastructure, only when installed and authorized.
- Manual: `/healthz`, editor loading, local source selection, a short edit, MP4 export and playback, persistence, reload and recovery when relevant.

Distinguish source inspection, tests executed, manual checks, and unverified behavior in every report. Do not describe existing historical test results as verification of newly edited code.

## Documentation and collaboration

- Keep `README.md` user-facing and centered on native installation, with Windows PowerShell as a first-class path. Keep server deployment as an optional advanced topic.
- Update installation documentation if commands, paths, minimum versions, environment defaults, or supported behavior change.
- Explain OS-specific differences; never copy Linux filesystem paths or shell syntax into Windows instructions.
- Preserve backwards compatibility for existing recipes, presets, and local project storage unless a migration is deliberately designed.
- For proposed changes, state the affected files, reason, data-migration impact, privacy/security impact, and verification status.
- If a feature is absent from the checked-out revision, say so. Do not invent files or silently substitute behavior from a newer branch.
- Ask before destructive user-data operations or irreversible system changes. Never delete user project data, databases, original media, or backups as routine cleanup.
- Prefer clear English commit messages and documentation. Communicate with the user in their preferred language.

## Suggested handoff report

Summarize what was changed, which files were touched, whether native Windows/Linux/macOS installation was affected, what verification was actually performed, and what remains unverified or requires the user's manual confirmation.
