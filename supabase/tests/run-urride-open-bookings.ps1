param(
  [int]$Port = 55441,
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin'
)

# Creates a throwaway PostgreSQL cluster in a temp folder, runs the open-booking
# migration + scenarios against it, then stops it and deletes only that folder.
# No application connection settings are read and no existing database is touched.
#
# The server is started with postgres.exe directly and polled with pg_isready:
# on Windows, `pg_ctl -w start` with redirected output never returns.
$ErrorActionPreference = 'Stop'
$cluster = Join-Path ([IO.Path]::GetTempPath()) ('kunthai_open_booking_' + [Guid]::NewGuid().ToString('N'))
$bin = @{
  initdb = Join-Path $PostgresBin 'initdb.exe'
  postgres = Join-Path $PostgresBin 'postgres.exe'
  pgctl = Join-Path $PostgresBin 'pg_ctl.exe'
  isready = Join-Path $PostgresBin 'pg_isready.exe'
  psql = Join-Path $PostgresBin 'psql.exe'
  createdb = Join-Path $PostgresBin 'createdb.exe'
}

& $bin.initdb -D $cluster -U postgres -A trust -E UTF8 --no-locale | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }

$server = Start-Process -FilePath $bin.postgres -ArgumentList @('-D', "`"$cluster`"", '-p', "$Port", '-c', 'listen_addresses=127.0.0.1') -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60 -and -not $ready; $attempt++) {
    & $bin.isready -h 127.0.0.1 -p $Port -q
    $ready = $LASTEXITCODE -eq 0
    if (-not $ready) { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'The throwaway cluster did not start.' }

  & $bin.createdb -h 127.0.0.1 -p $Port -U postgres open_booking_test
  if ($LASTEXITCODE -ne 0) { throw 'createdb failed.' }
  Push-Location (Join-Path $PSScriptRoot '..\..')
  try {
    & $bin.psql -h 127.0.0.1 -p $Port -U postgres -d open_booking_test -v ON_ERROR_STOP=1 -q -f 'supabase/tests/urride_open_bookings.sql'
    if ($LASTEXITCODE -ne 0) { throw 'UrRide open booking scenarios FAILED.' }
  } finally {
    Pop-Location
  }
} finally {
  $stop = Start-Process -FilePath $bin.pgctl -ArgumentList @('-D', "`"$cluster`"", '-m', 'fast', 'stop') -WindowStyle Hidden -PassThru
  $stop.WaitForExit(30000) | Out-Null
  if (-not $server.HasExited) { $server.WaitForExit(10000) | Out-Null }
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $cluster
}
