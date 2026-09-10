/* FloodFund frontend.
 *
 * Reads totals without a wallet so the page is useful to someone who has not
 * connected yet, and only asks for a signer when the user is about to write.
 */

(() => {
  'use strict';

  const ARTIFACT_URL = 'FloodFund.json';
  const FALLBACK_RPC = 'http://127.0.0.1:8545';

  const ZONES = [
    { id: 0, name: 'Sylhet' },
    { id: 1, name: 'Chittagong South' },
    { id: 2, name: 'Chittagong North' },
  ];

  // Custom errors carry no message, so map the ones a user can actually hit.
  const REVERT_MESSAGES = {
    NotRegistered: 'Register this wallet before donating.',
    AlreadyAFundraiser: 'A fundraiser wallet cannot register as a donor.',
    ZeroAmount: 'Enter an amount above zero.',
    EmptyName: 'Enter a display name.',
    TransferFailed: 'The fundraiser wallet refused the transfer.',
    DirectPaymentRejected: 'This contract does not accept bare transfers.',
    NotOwner: 'Only the contract owner can do that.',
    ZeroAddress: 'That address is not usable.',
  };

  const $ = (id) => document.getElementById(id);

  const state = {
    abi: null,
    networks: null,
    address: null,
    chainId: null,
    account: null,
    reader: null, // contract bound to a read-only provider
    writer: null, // contract bound to a signer
    registered: false,
  };

  /* --- formatting -------------------------------------------------------- */

  const formatEth = (wei) => {
    const value = Number(ethers.formatEther(wei));
    if (value === 0) return '0';
    if (value < 0.0001) return '< 0.0001';
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const shortAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  const CHAIN_NAMES = {
    1n: 'Ethereum mainnet',
    11155111n: 'Sepolia',
    1337n: 'Local chain',
    5777n: 'Ganache',
    31337n: 'Hardhat',
  };

  const chainName = (chainId) => CHAIN_NAMES[chainId] || `Chain ${chainId}`;

  /* --- notices ----------------------------------------------------------- */

  const ICONS = {
    info: 'ph-info',
    error: 'ph-warning-circle',
    pending: 'ph-circle-notch',
    success: 'ph-check-circle',
  };

  function notify(el, kind, message, link) {
    if (!message) {
      el.hidden = true;
      return;
    }

    const tone = kind === 'success' ? 'info' : kind;
    el.className = `notice notice--${tone === 'pending' ? 'pending' : tone}`;
    el.querySelector('i').className = `ph ${ICONS[kind] || ICONS.info}`;

    const body = el.querySelector('span');
    body.textContent = message;

    if (link) {
      body.append(' ');
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.text;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      body.append(anchor);
    }

    el.hidden = false;
  }

  function fieldError(inputId, errorId, message) {
    const input = $(inputId);
    const error = $(errorId);

    if (message) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = message;
      error.hidden = false;
      return false;
    }

    input.removeAttribute('aria-invalid');
    error.hidden = true;
    return true;
  }

  function describeError(error) {
    if (error?.code === 'ACTION_REJECTED') return 'You rejected the transaction in your wallet.';

    const name = error?.revert?.name;
    if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
    if (name) return `The contract rejected this: ${name}.`;

    if (error?.code === 'INSUFFICIENT_FUNDS') return 'This wallet does not hold enough ether.';
    return error?.shortMessage || error?.message || 'Something went wrong.';
  }

  function setConnectLabel(text) {
    const button = $('connectButton');
    button.innerHTML = '<i class="ph ph-wallet" aria-hidden="true"></i>';
    button.append(text);
    delete button.dataset.label;
  }

  function busy(button, isBusy, label) {
    button.disabled = isBusy;
    if (isBusy) {
      button.dataset.label = button.textContent.trim();
      button.innerHTML = '<span class="btn__spinner" aria-hidden="true"></span>';
      button.append(label || 'Working');
    } else {
      // An explicit label wins: the caller knows the state the button is
      // returning to, which may differ from the one it left.
      button.textContent = label || button.dataset.label || 'Submit';
      delete button.dataset.label;
    }
  }

  /* --- zone rows --------------------------------------------------------- */

  function renderZones(totals, wallets) {
    const list = $('zoneList');
    const grand = totals ? totals.total : 0n;

    list.replaceChildren(
      ...ZONES.map((zone) => {
        const raised = totals ? totals.byZone[zone.id] : null;
        const share = totals && grand > 0n ? Number((raised * 10000n) / grand) / 100 : 0;

        const row = document.createElement('div');
        row.className = 'zone';

        const left = document.createElement('div');
        const name = document.createElement('p');
        name.className = 'zone__name';
        name.textContent = zone.name;
        left.append(name);

        const wallet = document.createElement('p');
        wallet.className = 'zone__wallet';
        if (wallets) {
          wallet.textContent = shortAddress(wallets[zone.id]);
        } else {
          wallet.innerHTML = '<span class="skeleton">0x000000</span>';
        }
        left.append(wallet);

        const amount = document.createElement('p');
        amount.className = 'zone__amount';
        if (raised === null) {
          amount.innerHTML = '<span class="skeleton">0.000</span>';
        } else {
          amount.textContent = `${formatEth(raised)} ETH`;
        }

        const bar = document.createElement('div');
        bar.className = 'zone__share';
        const fill = document.createElement('i');
        fill.style.width = `${share}%`;
        bar.append(fill);

        row.append(left, amount, bar);
        return row;
      })
    );
  }

  /* --- chain reads ------------------------------------------------------- */

  async function refreshTotals() {
    if (!state.reader) return;

    try {
      const [info, wallets, donors] = await Promise.all([
        state.reader.getDonationsInfo(),
        state.reader.getFundraisers(),
        state.reader.donorCount(),
      ]);

      const totals = {
        total: info.total,
        byZone: [info.sylhet, info.chittagongSouth, info.chittagongNorth],
      };

      const totalEl = $('totalRaised');
      totalEl.classList.remove('skeleton');
      totalEl.textContent = formatEth(totals.total);

      renderZones(totals, [wallets.sylhet, wallets.chittagongSouth, wallets.chittagongNorth]);
      $('footerDonors').textContent = donors.toString();
    } catch (error) {
      console.error('Could not read totals', error);
      notify($('donateStatus'), 'error', `Could not read the contract. ${describeError(error)}`);
    }
  }

  async function refreshDonorState() {
    if (!state.reader || !state.account) return;

    try {
      const info = await state.reader.getDonorInfo(state.account);
      state.registered = info.registered;

      $('registerSubmit').textContent = info.registered ? 'Update details' : 'Register';
      if (info.registered) {
        $('donorName').value = $('donorName').value || info.name;
      }

      updateControls();
    } catch (error) {
      console.error('Could not read donor state', error);
    }
  }

  function updateControls() {
    const ready = Boolean(state.writer);

    $('registerSubmit').disabled = !ready;
    $('donateSubmit').disabled = !ready || !state.registered;

    if (!ready) {
      notify($('donateStatus'), 'info', 'Connect a wallet to donate.');
    } else if (!state.registered) {
      notify($('donateStatus'), 'info', 'Register this wallet first. Donating is locked until then.');
    } else {
      notify($('donateStatus'), null);
    }
  }

  function setNetworkPill(label, tone) {
    $('networkLabel').textContent = label;
    $('networkPill').dataset.state = tone;
    $('footerNetwork').textContent = label;
  }

  /* --- wallet ------------------------------------------------------------ */

  async function loadArtifact() {
    const response = await fetch(ARTIFACT_URL);
    if (!response.ok) throw new Error(`Could not load ${ARTIFACT_URL}. Run "npm run migrate" first.`);

    const artifact = await response.json();
    state.abi = artifact.abi;
    state.networks = artifact.networks || {};
  }

  function deploymentFor(chainId) {
    const record = state.networks[chainId.toString()];
    return record ? record.address : null;
  }

  async function attachReader(provider) {
    const network = await provider.getNetwork();
    state.chainId = network.chainId;

    const address = deploymentFor(network.chainId);
    if (!address) {
      setNetworkPill(`No deployment on ${chainName(network.chainId)}`, 'wrong');
      if (state.reader) state.reader.removeAllListeners();
      state.reader = null;
      renderZones(null, null);
      return false;
    }

    state.address = address;
    if (state.reader) state.reader.removeAllListeners();
    state.reader = new ethers.Contract(address, state.abi, provider);

    setNetworkPill(chainName(network.chainId), state.account ? 'live' : 'idle');
    $('footerAddress').textContent = address;

    await refreshTotals();
    watchEvents();
    return true;
  }

  let watching = false;

  function watchEvents() {
    if (watching || !state.reader) return;
    watching = true;

    // Totals move when anyone donates, not just this wallet.
    state.reader.on('DonationReceived', () => refreshTotals());
    state.reader.on('DonorRegistered', () => refreshTotals());
  }

  async function connect() {
    const button = $('connectButton');

    if (!window.ethereum) {
      notify(
        $('registerStatus'),
        'error',
        'No Ethereum wallet found in this browser. Install one to donate.'
      );
      return;
    }

    busy(button, true, 'Connecting');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      state.account = ethers.getAddress(accounts[0]);

      watching = false;
      const deployed = await attachReader(provider);

      if (deployed) {
        const signer = await provider.getSigner();
        state.writer = new ethers.Contract(state.address, state.abi, signer);
        await refreshDonorState();
      } else {
        state.writer = null;
      }

      setConnectLabel(shortAddress(state.account));
      updateControls();
      notify($('registerStatus'), null);
    } catch (error) {
      notify($('registerStatus'), 'error', describeError(error));
      setConnectLabel('Connect wallet');
      button.disabled = false;
      return;
    }

    button.disabled = false;
  }

  /* --- writes ------------------------------------------------------------ */

  async function submitRegistration(event) {
    event.preventDefault();
    if (!state.writer) return;

    const name = $('donorName').value.trim();
    const mobile = $('donorMobile').value.trim();

    let valid = fieldError('donorName', 'donorNameError', name ? null : 'Enter a display name.');
    valid =
      fieldError(
        'donorMobile',
        'donorMobileError',
        /^[0-9+\s-]{6,20}$/.test(mobile) ? null : 'Enter a valid mobile number.'
      ) && valid;

    if (!valid) return;

    const button = $('registerSubmit');
    const wasRegistered = state.registered;
    busy(button, true, 'Confirm in wallet');

    try {
      const tx = await state.writer.registerDonor(name, mobile);
      notify($('registerStatus'), 'pending', `Sent. Waiting for confirmation of ${shortAddress(tx.hash)}.`);

      await tx.wait();
      notify(
        $('registerStatus'),
        'success',
        wasRegistered ? 'Details updated.' : 'Registered. You can donate now.'
      );

      await refreshDonorState();
      await refreshTotals();
    } catch (error) {
      notify($('registerStatus'), 'error', describeError(error));
    } finally {
      busy(button, false, state.registered ? 'Update details' : 'Register');
      updateControls();
    }
  }

  async function submitDonation(event) {
    event.preventDefault();
    if (!state.writer) return;

    const zone = Number($('donateZone').value);
    const raw = $('donateAmount').value.trim();

    // The enum bounds check reverts without decodable data, so catch a bad zone
    // here rather than showing the user a raw EVM message.
    if (!ZONES.some((entry) => entry.id === zone)) {
      notify($('donateStatus'), 'error', 'Pick one of the three relief zones.');
      return;
    }

    let value;
    try {
      value = ethers.parseEther(raw || '0');
    } catch {
      fieldError('donateAmount', 'donateAmountError', 'Enter an amount like 0.05.');
      return;
    }

    if (value <= 0n) {
      fieldError('donateAmount', 'donateAmountError', 'Enter an amount above zero.');
      return;
    }
    fieldError('donateAmount', 'donateAmountError', null);

    const button = $('donateSubmit');
    busy(button, true, 'Confirm in wallet');

    try {
      const tx = await state.writer.donate(zone, { value });
      notify($('donateStatus'), 'pending', `Sent. Waiting for confirmation of ${shortAddress(tx.hash)}.`);

      await tx.wait();
      notify(
        $('donateStatus'),
        'success',
        `${formatEth(value)} ETH delivered to ${ZONES[zone].name}. Thank you.`
      );

      $('donateAmount').value = '';
      await refreshTotals();
      await refreshDonorState();
    } catch (error) {
      notify($('donateStatus'), 'error', describeError(error));
    } finally {
      busy(button, false, 'Donate');
      $('donateSubmit').disabled = !state.writer || !state.registered;
    }
  }

  async function submitLookup(event) {
    event.preventDefault();

    const raw = $('lookupAddress').value.trim();
    if (!ethers.isAddress(raw)) {
      fieldError('lookupAddress', 'lookupError', 'That is not a wallet address.');
      return;
    }
    fieldError('lookupAddress', 'lookupError', null);

    if (!state.reader) {
      fieldError('lookupAddress', 'lookupError', 'Not connected to a chain with this contract.');
      return;
    }

    const button = $('lookupSubmit');
    busy(button, true, 'Looking up');

    try {
      const info = await state.reader.getDonorInfo(ethers.getAddress(raw));

      if (!info.registered) {
        $('lookupResult').hidden = true;
        $('lookupEmpty').hidden = false;
        $('lookupEmpty').lastChild.textContent = ' That address is not registered.';
        return;
      }

      $('lookupName').textContent = info.name;
      $('lookupId').textContent = `#${info.id}`;
      $('lookupCount').textContent = info.donations.toString();
      $('lookupTotal').textContent = `${formatEth(info.totalDonated)} ETH`;

      $('lookupEmpty').hidden = true;
      $('lookupResult').hidden = false;
    } catch (error) {
      fieldError('lookupAddress', 'lookupError', describeError(error));
    } finally {
      busy(button, false, 'Look up');
    }
  }

  /* --- theme ------------------------------------------------------------- */

  function initTheme() {
    const toggle = $('themeToggle');
    let stored = null;

    try {
      stored = localStorage.getItem('floodfund-theme');
    } catch {
      /* private browsing, or storage blocked */
    }

    const apply = (theme) => {
      if (theme) document.documentElement.dataset.theme = theme;
      const dark =
        theme === 'dark' ||
        (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      toggle.querySelector('i').className = `ph ${dark ? 'ph-sun' : 'ph-moon'}`;
    };

    apply(stored);

    toggle.addEventListener('click', () => {
      const current =
        document.documentElement.dataset.theme ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';

      apply(next);
      try {
        localStorage.setItem('floodfund-theme', next);
      } catch {
        /* nothing to do; the choice just will not persist */
      }
    });
  }

  /* --- boot -------------------------------------------------------------- */

  async function boot() {
    initTheme();
    renderZones(null, null);

    $('connectButton').addEventListener('click', connect);
    $('registerForm').addEventListener('submit', submitRegistration);
    $('donateForm').addEventListener('submit', submitDonation);
    $('lookupForm').addEventListener('submit', submitLookup);

    try {
      await loadArtifact();
    } catch (error) {
      notify($('registerStatus'), 'error', error.message);
      setNetworkPill('Contract not deployed', 'wrong');
      return;
    }

    // Read-only first. The page shows real totals before anyone connects.
    const provider = window.ethereum
      ? new ethers.BrowserProvider(window.ethereum)
      : new ethers.JsonRpcProvider(FALLBACK_RPC);

    try {
      await attachReader(provider);
    } catch (error) {
      console.error('Could not reach a node', error);
      setNetworkPill('No node reachable', 'wrong');
      renderZones(null, null);
    }

    updateControls();

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', () => window.location.reload());
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
