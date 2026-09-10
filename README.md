# FloodFund

Donation routing for Bangladesh flood relief on Ethereum.

A donor registers a wallet once, picks one of three relief zones, and the
contract forwards the full amount to that zone's fundraiser in the same
transaction. The contract never holds a balance, and every path that could leave
ether behind reverts instead.

```
Donor  ->  FloodFund  ->  Sylhet | Chittagong South | Chittagong North
              (pass-through, same transaction)
```

## Quick start

**Linux and macOS**

```bash
./setup.sh
```

**Windows**

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Setup checks your toolchain, installs dependencies, compiles, runs the tests,
and deploys if a local chain is already listening on port 8545.

To bring up a chain and serve the app:

```bash
npx ganache --port 8545 --chain.chainId 1337 --chain.networkId 1337 --wallet.deterministic
npm run migrate
npm run dev
```

Open http://localhost:3000 and point your wallet at `http://127.0.0.1:8545`,
chain id `1337`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Serve the frontend on port 3000 |
| `npm run compile` | Compile the contract |
| `npm run migrate` | Deploy to the local chain |
| `npm test` | Run the suite on an in-process chain, no node needed |
| `npm run ci` | Compile, then test |

## Security fixes

The first version had two defects that could lose money. Both are covered by
tests.

| Defect | Fix |
|---|---|
| Anyone could donate without registering, because an unregistered address stored an empty contact string that satisfied the check | Registration is a `registered` flag, and `donate` tests that flag |
| A misspelled zone matched no branch, so the ether stayed in a contract with no withdrawal path | Zones are an `enum`, so an unknown value fails ABI decoding before `donate` runs |

Also hardened:

- `getDonationsInfo` reports what was raised here, not fundraiser wallet
  balances. The old reading survives as `getFundraiserBalances`.
- Mobile numbers are stored as a hash of the address and the number. The
  plaintext never reaches the chain.
- Re-registering updates a profile instead of minting a second donor id.
- Fundraiser wallets are configurable and rotatable by the owner.
- Transfers use `call`, writes follow checks-effects-interactions, and `donate`
  is reentrancy guarded.
- `receive` and `fallback` reject bare transfers.

## Layout

| Path | Contents |
|---|---|
| `contracts/FloodFund.sol` | The contract |
| `migrations/` | Deployment, wiring zones to wallets |
| `fundraisers.js` | Fundraiser wallets per network |
| `test/` | 19 tests |
| `src/` | Frontend: one page, one stylesheet, one script |
| `legacy/` | Files the rewrite replaced. Nothing loads them |

The frontend has no build step. Ethers, the fonts and the icon set are vendored,
so the page works with no network access.

## Notes

- The contract is unaudited and is not deployed to any public network.
- The hero has an image slot in `src/index.html`, left empty on purpose.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
