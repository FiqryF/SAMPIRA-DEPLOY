[CmdletBinding()]
param(
    [string]$MySqlBin = 'C:\xampp\mysql\bin',
    [string]$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
    [string]$Screenshots,
    [switch]$SkipBrowser,
    [switch]$Phase8BrowserOnly,
    [switch]$AuthBrowserOnly,
    [switch]$PortalDesignOnly
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if ((git branch --show-current) -ne 'main') { throw 'Run this fixture from the integrated main working tree.' }
if (!$SkipBrowser -and !(Test-Path -LiteralPath $Chrome)) { throw 'Pass the installed Chrome executable with -Chrome.' }
if ($Screenshots) { $env:SAMPIRA_TEST_PHASE6_SCREENSHOTS = [IO.Path]::GetFullPath($Screenshots) }
$t=Join-Path $env:TEMP ('sampira-6b-fe-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $t | Out-Null
foreach($p in 24367,24934) { if(netstat -ano | Select-String ":$p\s+.*LISTENING"){throw "Fixture port occupied: $p"} }
$env:SAMPIRA_TEST_BIN="$t/server.exe"
$env:SAMPIRA_TEST_INIT="$t/init.exe"
$env:SAMPIRA_TEST_MYSQL=Join-Path $MySqlBin 'mysql.exe'
if ($SkipBrowser) { Remove-Item Env:SAMPIRA_TEST_CHROME -ErrorAction SilentlyContinue }
else { $env:SAMPIRA_TEST_CHROME=$Chrome }
$env:SAMPIRA_TEST_FE_SOURCE=(Get-Location).Path
if($PortalDesignOnly){$env:SAMPIRA_TEST_PORTAL_DESIGN_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_PORTAL_DESIGN_ONLY -ErrorAction SilentlyContinue}
if($AuthBrowserOnly){$env:SAMPIRA_TEST_AUTH_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_AUTH_ONLY -ErrorAction SilentlyContinue}
if($Phase8BrowserOnly){$env:SAMPIRA_TEST_PHASE8_ONLY='1'}
else{Remove-Item Env:SAMPIRA_TEST_PHASE8_ONLY -ErrorAction SilentlyContinue}
$env:SAMPIRA_TEST_PHASE3_FE='1'
$env:SAMPIRA_TEST_PHASE4_FE='1'
$env:SAMPIRA_TEST_PHASE5_FE='1'
$env:SAMPIRA_TEST_PHASE6_FE='1'
foreach($phase in 3,4,5,6){
 if($SkipBrowser){Set-Item "Env:SAMPIRA_TEST_PHASE$phase" '1'}
 else{Remove-Item "Env:SAMPIRA_TEST_PHASE$phase" -ErrorAction SilentlyContinue}
}
if($SkipBrowser){Remove-Item Env:SAMPIRA_TEST_PHASE6_BROWSER_PREP -ErrorAction SilentlyContinue}
else{$env:SAMPIRA_TEST_PHASE6_BROWSER_PREP='1'}
$env:SAMPIRA_TEST_PHASE7='1'
$env:SAMPIRA_TEST_PHASE9='1'

 go build -buildvcs=false -o $env:SAMPIRA_TEST_BIN ./cmd/server
 if($LASTEXITCODE){throw 'Server build failed'}
 go build -buildvcs=false -o $env:SAMPIRA_TEST_INIT ./db_init
 if($LASTEXITCODE){throw 'Initializer build failed'}

& (Join-Path $MySqlBin 'mysql_install_db.exe') "--datadir=$t/data" --port=24367 --silent
if($LASTEXITCODE){throw 'Fixture initialization failed'}
$db=Start-Process (Join-Path $MySqlBin 'mysqld.exe') -ArgumentList '--no-defaults','--bind-address=127.0.0.1','--port=24367',('--datadir="'+$t+'/data"'),'--console' -WindowStyle Hidden -PassThru -RedirectStandardOutput "$t/db.out" -RedirectStandardError "$t/db.err"
try {
 for($i=0;$i -lt 40;$i++){
  if($db.HasExited){Get-Content "$t/db.err";throw 'MariaDB exited'}
  if(netstat -ano | Select-String (':24367\s+.*LISTENING\s+'+$db.Id+'$')){break}
  Start-Sleep -Milliseconds 250
 }
 New-Item -ItemType Directory "$t/scripts" | Out-Null
 $scripts=@('check-phase1-migration.mjs','check-api-regressions.mjs','check-phase1-browser.mjs','check-phase3-frontend.mjs','check-phase4-frontend.mjs','check-phase5-frontend.mjs','check-phase6-frontend.mjs','check-landing-frontend.mjs','check-auth-frontend.mjs','check-phase3-reports.mjs','check-phase4-handling.mjs','check-phase5-locations.mjs','check-phase6-education.mjs','check-phase7.mjs','check-user-frontend.mjs','admin-visual-fixture.mjs','check-phase8-frontend.mjs','check-portal-design.mjs')
 $scripts += 'check-phase9.mjs'
 foreach($file in $scripts){
  $source = "scripts/$file"
  $content=(Get-Content -Raw -Encoding utf8 $source).Replace('13316','24367').Replace('18081','24934')
  if($file -eq 'check-phase1-migration.mjs'){
   $content=$content.Replace('cpSync(directory, join(cwd, directory)','cpSync(resolve(process.env.SAMPIRA_TEST_FE_SOURCE, directory), join(cwd, directory)')
   $content="import {fileURLToPath} from 'node:url';"+[Environment]::NewLine+$content
   foreach($child in $scripts){$content=$content.Replace("resolve('scripts/$child')","fileURLToPath(new URL('./$child', import.meta.url))")}
  }
  Set-Content -Encoding utf8 -LiteralPath "$t/scripts/$file" -Value $content
 }
 New-Item -ItemType Directory "$t/db_init/migrations" -Force | Out-Null
 Copy-Item "db_init/migrations/*.sql" "$t/db_init/migrations"
 node "$t/scripts/check-phase1-migration.mjs"
 if($LASTEXITCODE){throw 'Fixture failed'}
} finally {
 if(!$db.HasExited){& (Join-Path $MySqlBin 'mysqladmin.exe') --no-defaults --protocol=tcp -h 127.0.0.1 -P 24367 -u root shutdown; if(!$db.WaitForExit(5000)){Stop-Process -Id $db.Id}}
 Write-Output "Fixture: $t"
}
