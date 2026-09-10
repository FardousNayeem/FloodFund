<#
  FloodFund setup for Windows.
  Installs dependencies, compiles the contract, runs the tests, and deploys if a
  local chain is already listening.

    powershell -ExecutionPolicy Bypass -File .\setup.ps1
#>

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$RpcUrl = 'http://127.0.0.1:8545'

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host " !  $Message" -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host " x  $Message" -ForegroundColor Red; exit 1 }

function Invoke-Step {
    param([Parameter(Mandatory)][string[]]$Command)
    $exe, $rest = $Command
    & $exe @rest
    if ($LASTEXITCODE -ne 0) { Write-Fail "'$($Command -join ' ')' failed with exit code $LASTEXITCODE." }
}

Write-Step 'Checking prerequisites'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail 'Node.js is not installed. Get it from https://nodejs.org (version 18 or newer).'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Fail 'npm is not installed. It ships with Node.js.'
}


Write-Host "   node $(node -v)"
Write-Host "   npm  $(npm -v)"

Write-Step 'Installing dependencies'
Invoke-Step @('npm', 'install')

Write-Step 'Compiling the contract'
Invoke-Step @('npm', 'run', 'compile')

Write-Step 'Running tests'
Invoke-Step @('npm', 'test')

Write-Step 'Looking for a local chain on port 8545'

function Test-Chain {
    try {
        $body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
        $response = Invoke-RestMethod -Uri $RpcUrl -Method Post -Body $body `
            -ContentType 'application/json' -TimeoutSec 3 -ErrorAction Stop
        return $null -ne $response.result
    } catch {
        return $false
    }
}

$deployed = $false
if (Test-Chain) {
    Write-Host '   found one, deploying'
    Invoke-Step @('npm', 'run', 'migrate')
    $deployed = $true
} else {
    Write-Warn 'No chain is listening. Skipping deployment.'
}

Write-Host "`nSetup complete.`n" -ForegroundColor Green

if (-not $deployed) {
    Write-Host 'Start a chain in one terminal:'
    Write-Host '  npx ganache --port 8545 --chain.chainId 1337 --chain.networkId 1337 --wallet.deterministic' -ForegroundColor DarkGray
    Write-Host "`nThen deploy and serve in another:"
    Write-Host '  npm run migrate' -ForegroundColor DarkGray
    Write-Host '  npm run dev' -ForegroundColor DarkGray
} else {
    Write-Host 'Serve the app:'
    Write-Host '  npm run dev' -ForegroundColor DarkGray
    Write-Host '                http://localhost:3000' -ForegroundColor DarkGray
}

Write-Host "`nPoint your wallet at $RpcUrl, chain id 1337."
