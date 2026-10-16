# Upload a built folder to the gh-pages branch of github.com/Arindam2000/inkwell.
# Reads GITHUB_TOKEN from .env. The token is never printed; git errors are replaced by a clean message.
param([Parameter(Mandatory = $true)][string]$Folder)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { throw 'No .env file. Add one line: GITHUB_TOKEN=...' }
$token = (Get-Content $envFile | Where-Object { $_ -match '^\s*GITHUB_TOKEN\s*=' } | Select-Object -First 1) -replace '^\s*GITHUB_TOKEN\s*=\s*', ''
$token = $token.Trim().Trim('"')
if (-not $token) { throw 'GITHUB_TOKEN is empty in .env' }

$src = Resolve-Path (Join-Path $root $Folder)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("inkwell-deploy-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  Copy-Item -Path (Join-Path $src '*') -Destination $tmp -Recurse -Force
  Copy-Item -Path (Join-Path $src '.*') -Destination $tmp -Recurse -Force -ErrorAction SilentlyContinue
  $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
  $sha = (git -C $root rev-parse --short HEAD)
  Push-Location $tmp
  git init -q -b gh-pages
  git -c user.name='Arindam Datta' -c user.email='official.arindamdatta@gmail.com' add -A
  git -c user.name='Arindam Datta' -c user.email='official.arindamdatta@gmail.com' commit -q -m "deploy $sha"
  $out = git -c "http.extraHeader=Authorization: Basic $auth" push -f -q https://github.com/Arindam2000/inkwell.git gh-pages 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Upload to GitHub failed (check the token has Contents: Read and write on inkwell)." }
  Write-Output "Deployed $sha to gh-pages"
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
