param(
  [int]$Port = 55437,
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin'
)

# Requires a disposable local PostgreSQL server. No application connection
# settings are read, no existing database is changed, and no database is deleted.
$ErrorActionPreference = 'Stop'
$retentionRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$retentionDatabase = 'urmall_expiry_test_' + [Guid]::NewGuid().ToString('N')
$retentionPsql = Join-Path $PostgresBin 'psql.exe'
$retentionCreateDb = Join-Path $PostgresBin 'createdb.exe'

function Invoke-RetentionSql {
  param([string[]]$SqlArguments)
  & $retentionPsql -h 127.0.0.1 -p $Port -U postgres -d $retentionDatabase -v ON_ERROR_STOP=1 @SqlArguments
  if ($LASTEXITCODE -ne 0) { throw 'UrMall expiry PostgreSQL test failed.' }
}

& $retentionCreateDb -h 127.0.0.1 -p $Port -U postgres $retentionDatabase
if ($LASTEXITCODE -ne 0) { throw 'Could not create the disposable expiry test database.' }
Write-Output "Created isolated test database: $retentionDatabase on 127.0.0.1:$Port"
Invoke-RetentionSql -SqlArguments @('-f', (Join-Path $PSScriptRoot 'urmall_expiry_retention_fixture.sql'))

# Test the actual existing billing functions. The fixture substitutes only
# external dependencies (wallet debit/delivery), not the renewal/grace logic.
$retentionLegacyFunctions = @(
  @{ File = '20260822090000_business_subscription_yearly_billing.sql'; Name = 'kunthai_renew_subscription_row' },
  @{ File = '20260820130000_visibility_credit_business_subscriptions.sql'; Name = 'kunthai_business_effective_entitlement' }
)
foreach ($retentionLegacyFunction in $retentionLegacyFunctions) {
  $retentionLegacySource = Get-Content (Join-Path $retentionRepo ('supabase\migrations\' + $retentionLegacyFunction.File)) -Raw
  $retentionPattern = '(?s)create or replace function public\.' + $retentionLegacyFunction.Name + '\(.*?\$\$;'
  $retentionLegacySql = [regex]::Match($retentionLegacySource, $retentionPattern).Value
  if (-not $retentionLegacySql) { throw "Legacy function not found: $($retentionLegacyFunction.Name)" }
  Invoke-RetentionSql -SqlArguments @('-c', $retentionLegacySql)
}
Invoke-RetentionSql -SqlArguments @('-f', (Join-Path $retentionRepo 'supabase\migrations\20260905130000_urmall_expiry_retention.sql'))
Invoke-RetentionSql -SqlArguments @('-f', (Join-Path $PSScriptRoot 'urmall_expiry_retention_assertions.sql'))
Write-Output "PASS. Disposable test database retained for inspection: $retentionDatabase"
