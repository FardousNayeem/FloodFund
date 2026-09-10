#!/usr/bin/env bash
#
# FloodFund setup for Linux and macOS.
# Installs dependencies, compiles the contract, runs the tests, and deploys if a
# local chain is already listening.
#
#   ./setup.sh

set -euo pipefail

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'

step() { printf '\n%s==>%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '%s !%s %s\n' "$YELLOW" "$OFF" "$1"; }
die()  { printf '%s x%s %s\n' "$RED" "$OFF" "$1" >&2; exit 1; }

cd "$(dirname "$0")"

RPC_URL="http://127.0.0.1:8545"

step "Checking prerequisites"

command -v node >/dev/null 2>&1 || die "Node.js is not installed. Get it from https://nodejs.org (version 18 or newer)."
command -v npm  >/dev/null 2>&1 || die "npm is not installed. It ships with Node.js."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 or newer is required. Found $(node -v)."

printf '   node %s\n   npm  %s\n' "$(node -v)" "$(npm -v)"

step "Installing dependencies"
npm install

step "Compiling the contract"
npm run compile

step "Running tests"
npm test

step "Looking for a local chain on port 8545"

chain_is_up() {
  curl -s -m 3 -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$RPC_URL" 2>/dev/null | grep -q result
}

if chain_is_up; then
  printf '   found one, deploying\n'
  npm run migrate
  DEPLOYED=1
else
  warn "No chain is listening. Skipping deployment."
  DEPLOYED=0
fi

printf '\n%sSetup complete.%s\n\n' "$GREEN" "$OFF"

if [ "$DEPLOYED" -eq 0 ]; then
  cat <<EOF
Start a chain in one terminal:

  ${DIM}npx ganache --port 8545 --chain.chainId 1337 --chain.networkId 1337 --wallet.deterministic${OFF}

Then deploy and serve in another:

  ${DIM}npm run migrate${OFF}
  ${DIM}npm run dev${OFF}

EOF
else
  cat <<EOF
Serve the app:

  ${DIM}npm run dev${OFF}     ${DIM}# http://localhost:3000${OFF}

EOF
fi

printf 'Point your wallet at %s, chain id 1337.\n' "$RPC_URL"
