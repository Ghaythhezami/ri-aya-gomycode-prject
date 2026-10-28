<#
.SYNOPSIS
    Ensures the local PostgreSQL instance has a working `riaya` login role
    matching server/.env, so the NestJS server and seed script can connect.

.DESCRIPTION
    This machine has a NATIVE PostgreSQL 17 service on port 5432 (not the
    docker-compose container). pg_hba.conf requires scram-sha-256 for all
    local connections, and the `riaya` role's password does not match, so
    every connection is rejected with:
        FATAL: password authentication failed for user "riaya"

    The script:
      1. Backs up pg_hba.conf
      2. Temporarily switches local auth to `trust`
      3. Reloads PostgreSQL
      4. Creates/updates the riaya role, password, ownership and grants
      5. Restores the original pg_hba.conf and reloads again
      6. Verifies the app credentials work end-to-end

    Reloading the PostgreSQL service requires admin rights, so the script
    SELF-ELEVATES: it relaunches itself via UAC, waits for the elevated run
    to finish, then prints that run's log. Implies -Wait; no manual window
    juggling needed. If UAC is declined it exits cleanly.

.PARAMETER Password
    Password for the riaya role. Defaults to 'riaya' (matches server/.env).

.PARAMETER Elevated
    Internal use. Set automatically in the relaunched elevated process.

.PARAMETER LogPath
    Where to write the run log. Defaults to fix-db-credentials.log next to
    this script. The log is readable from the non-elevated shell afterwards.

.EXAMPLE
    cd C:\Users\KENULE-NWINEE\Documents\Ri-aya
    .\server\scripts\fix-db-credentials.ps1
#>

[CmdletBinding()]
param(
    [string]$Password = 'riaya',
    [string]$DbName = 'riaya',
    [string]$User = 'riaya',
    [string]$PgRoot = 'C:\Program Files\PostgreSQL\17',
    [string]$LogPath,
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is unreliable as a param default, so resolve it here.
if (-not $LogPath) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $LogPath = Join-Path $scriptDir 'fix-db-credentials.log'
}

$bin     = Join-Path $PgRoot 'bin'
$data    = Join-Path $PgRoot 'data'
$hba     = Join-Path $data 'pg_hba.conf'
$psql    = Join-Path $bin 'psql.exe'
$pgctl   = Join-Path $bin 'pg_ctl.exe'
$service = 'postgresql-x64-17'

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Psql {
    param([string]$Sql, [string]$Database = 'postgres')
    # psql writes harmless notices (e.g. "WARNING: collation version mismatch")
    # to stderr. With $ErrorActionPreference = 'Stop', PowerShell 5.1 promotes
    # any stderr line to a terminating error - even on success. So relax the
    # preference for the call and judge success by exit code alone.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $psql -U postgres -h localhost -p 5432 -d $Database -v ON_ERROR_STOP=1 -t -A -c $Sql 2>&1
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $prev
    }
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    if ($code -ne 0) { throw "psql failed ($code): $text" }
    # Drop NOTICE/WARNING lines so callers get a clean value.
    $clean = ($out | ForEach-Object { "$_" } | Where-Object { $_ -notmatch '^\s*(WARNING|NOTICE|HINT|DETAIL):' }) -join "`n"
    return $clean.Trim()
}

# ---------------------------------------------------------------- elevation
# `powershell -File script.ps1` does NOT elevate, even when the user is in the
# Administrators group. Relaunch through Start-Process -Verb RunAs (real UAC),
# wait for it, then surface the elevated log here.
if (-not $Elevated) {
    if (Test-IsAdmin) {
        # Already elevated in-place; carry on normally.
    }
    else {
        Write-Host '==> Administrator rights required - requesting elevation (UAC)...' -ForegroundColor Yellow
        if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }

        $quoted = {
            param($v) '"' + ($v -replace '"', '\"') + '"'
        }
        $argList = @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', (& $quoted $PSCommandPath),
            '-Password', (& $quoted $Password),
            '-DbName', (& $quoted $DbName),
            '-User', (& $quoted $User),
            '-PgRoot', (& $quoted $PgRoot),
            '-LogPath', (& $quoted $LogPath),
            '-Elevated'
        ) -join ' '

        try {
            $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait -PassThru
        }
        catch {
            Write-Host ''
            Write-Host 'ERROR: elevation was declined or blocked (UAC).' -ForegroundColor Red
            Write-Host 'The database was NOT modified.' -ForegroundColor Red
            Write-Host 'Retry from a terminal started with "Run as administrator".' -ForegroundColor Yellow
            exit 1
        }

        if (Test-Path $LogPath) {
            Write-Host ''
            Write-Host '================ elevated run log ================' -ForegroundColor DarkGray
            Get-Content $LogPath | Write-Host
            Write-Host '=================================================' -ForegroundColor DarkGray
        }
        else {
            Write-Host 'No log was produced by the elevated run.' -ForegroundColor Yellow
        }

        exit $proc.ExitCode
    }
}

# Everything below runs elevated. Transcribe to the log so the caller can read it.
try { Start-Transcript -Path $LogPath -Force | Out-Null } catch { }

foreach ($p in @($psql, $pgctl, $hba, $data)) {
    if (-not (Test-Path $p)) { throw "Not found: $p" }
}

$backup = "$hba.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "==> Backing up pg_hba.conf to $backup" -ForegroundColor Cyan
Copy-Item $hba $backup -Force

$restored = $false
try {
    Write-Host '==> Temporarily setting local auth to trust' -ForegroundColor Cyan
    $lines = Get-Content $hba
    $patched = foreach ($line in $lines) {
        if ($line -match '^\s*#' -or $line -notmatch '\S') { $line }
        else { $line -replace 'scram-sha-256', 'trust' -replace 'md5', 'trust' }
    }
    Set-Content -Path $hba -Value $patched -Encoding ascii

    Write-Host '==> Reloading PostgreSQL' -ForegroundColor Cyan
    & $pgctl reload -D $data 2>&1 | Out-Null
    Start-Sleep -Seconds 3

    Write-Host "==> Ensuring role '$User' exists with the expected password" -ForegroundColor Cyan
    $roleExists = Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname = '$User';"
    if ($roleExists -eq '1') {
        Invoke-Psql "ALTER ROLE $User WITH LOGIN PASSWORD '$Password';" | Out-Null
        Write-Host "    updated existing role"
    }
    else {
        Invoke-Psql "CREATE ROLE $User LOGIN PASSWORD '$Password';" | Out-Null
        Write-Host "    created new role"
    }

    Write-Host "==> Ensuring database '$DbName' exists and is owned by '$User'" -ForegroundColor Cyan
    $dbExists = Invoke-Psql "SELECT 1 FROM pg_database WHERE datname = '$DbName';"
    if ($dbExists -ne '1') {
        Invoke-Psql "CREATE DATABASE $DbName OWNER $User;" | Out-Null
        Write-Host "    created database"
    }
    else {
        Invoke-Psql "ALTER DATABASE $DbName OWNER TO $User;" | Out-Null
    }

    Invoke-Psql "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $User;" | Out-Null
    Invoke-Psql "GRANT ALL ON SCHEMA public TO $User;" -Database $DbName | Out-Null
    Invoke-Psql "ALTER SCHEMA public OWNER TO $User;" -Database $DbName | Out-Null

    # Cosmetic: clears the recurring collation-version warning in the server log.
    try { Invoke-Psql 'ALTER DATABASE postgres REFRESH COLLATION VERSION;' | Out-Null } catch { }
    try { Invoke-Psql "ALTER DATABASE $DbName REFRESH COLLATION VERSION;" | Out-Null } catch { }
}
finally {
    if (Test-Path $backup) {
        Write-Host '==> Restoring original pg_hba.conf' -ForegroundColor Cyan
        Copy-Item $backup $hba -Force
        & $pgctl reload -D $data 2>&1 | Out-Null
        Start-Sleep -Seconds 3
        $restored = $true
        Write-Host "    backup kept at $backup"
    }
}

if (-not $restored) {
    Write-Warning "pg_hba.conf was NOT restored. Restore manually from: $backup"
    try { Stop-Transcript | Out-Null } catch { }
    exit 1
}

Write-Host '==> Verifying app credentials (scram-sha-256)' -ForegroundColor Cyan
$env:PGPASSWORD = $Password
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $verify = & $psql -h localhost -p 5432 -U $User -d $DbName -t -A -c 'select current_user;' 2>&1
    $code = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $prev
}
if ($code -ne 0) {
    Write-Host "Verification FAILED: $verify" -ForegroundColor Red
    try { Stop-Transcript | Out-Null } catch { }
    exit 1
}

$who = (($verify | ForEach-Object { "$_" } | Where-Object { $_ -notmatch '^\s*(WARNING|NOTICE|HINT|DETAIL):' }) -join '').Trim()
Write-Host ''
Write-Host "SUCCESS - connected as '$who'" -ForegroundColor Green
Write-Host 'Next steps:' -ForegroundColor Green
Write-Host '  pnpm --filter server seed'
Write-Host '  pnpm --filter server start:dev'
try { Stop-Transcript | Out-Null } catch { }
exit 0