const FloodFund = artifacts.require('FloodFund');

const ZONE = { SYLHET: 0, CHITTAGONG_SOUTH: 1, CHITTAGONG_NORTH: 2 };
const ONE_ETHER = web3.utils.toWei('1', 'ether');

async function expectRevert(promise, label) {
  try {
    await promise;
  } catch (error) {
    assert.include(error.message.toLowerCase(), 'revert', `${label}: expected a revert, got: ${error.message}`);
    return error;
  }
  assert.fail(`${label}: expected a revert, transaction succeeded`);
}

contract('FloodFund', (accounts) => {
  const [owner, sylhetWallet, southWallet, northWallet, alice, bob, stranger] = accounts;

  let fund;

  beforeEach(async () => {
    fund = await FloodFund.new(sylhetWallet, southWallet, northWallet, { from: owner });
  });

  describe('registration', () => {
    it('records a donor and assigns sequential ids', async () => {
      await fund.registerDonor('Nusrat Jahan', '01711234567', { from: alice });
      await fund.registerDonor('Tanvir Ahsan', '01819876543', { from: bob });

      const aliceInfo = await fund.getDonorInfo(alice);
      assert.equal(aliceInfo.name, 'Nusrat Jahan');
      assert.isTrue(aliceInfo.registered);
      assert.equal(aliceInfo.id.toNumber(), 1);

      assert.equal((await fund.getDonorInfo(bob)).id.toNumber(), 2);
      assert.equal((await fund.donorCount()).toNumber(), 2);
    });

    it('does not store the mobile number in plaintext', async () => {
      await fund.registerDonor('Nusrat Jahan', '01711234567', { from: alice });

      const stored = await fund.donors(alice);
      const asText = JSON.stringify(stored);
      assert.notInclude(asText, '01711234567', 'the raw mobile number is readable on chain');

      assert.isTrue(await fund.verifyContact(alice, '01711234567'));
      assert.isFalse(await fund.verifyContact(alice, '01700000000'));
    });

    it('treats re-registration as a profile update, not a new donor', async () => {
      await fund.registerDonor('Nusrat Jahan', '01711234567', { from: alice });
      await fund.registerDonor('Nusrat J. Haque', '01711234567', { from: alice });

      assert.equal((await fund.donorCount()).toNumber(), 1, 'donor count was inflated');
      const info = await fund.getDonorInfo(alice);
      assert.equal(info.name, 'Nusrat J. Haque');
      assert.equal(info.id.toNumber(), 1, 'a second id was minted');
    });

    it('rejects a fundraiser registering as a donor', async () => {
      await expectRevert(
        fund.registerDonor('Sylhet Relief', '01711111111', { from: sylhetWallet }),
        'fundraiser registration'
      );
    });

    it('rejects an empty name', async () => {
      await expectRevert(fund.registerDonor('', '01711234567', { from: alice }), 'empty name');
    });
  });

  describe('donating', () => {
    beforeEach(async () => {
      await fund.registerDonor('Nusrat Jahan', '01711234567', { from: alice });
    });

    it('forwards the full donation to the zone fundraiser', async () => {
      const before = web3.utils.toBN(await web3.eth.getBalance(sylhetWallet));

      await fund.donate(ZONE.SYLHET, { from: alice, value: ONE_ETHER });

      const after = web3.utils.toBN(await web3.eth.getBalance(sylhetWallet));
      assert.equal(after.sub(before).toString(), ONE_ETHER);
    });

    it('never retains a balance', async () => {
      await fund.donate(ZONE.CHITTAGONG_NORTH, { from: alice, value: ONE_ETHER });
      assert.equal(await web3.eth.getBalance(fund.address), '0');
    });

    // The bug: donate() compared the caller's _mobile argument against the
    // caller's stored mobileNumber. An unregistered address stores "", so
    // passing "" satisfied the check and anyone could donate unregistered.
    it('rejects an unregistered donor passing an empty contact string', async () => {
      await expectRevert(
        fund.donate(ZONE.SYLHET, { from: stranger, value: ONE_ETHER }),
        'unregistered donation'
      );
      assert.equal((await fund.totalRaised()).toString(), '0');
    });

    // The bug: an unrecognised zone string matched no branch, so the value
    // stayed in a contract with no withdrawal path. Zone is now an enum, and
    // an out-of-range value fails before any state changes.
    it('rejects an out-of-range zone instead of swallowing the ether', async () => {
      await expectRevert(fund.donate(3, { from: alice, value: ONE_ETHER }), 'invalid zone');
      assert.equal(await web3.eth.getBalance(fund.address), '0');
      assert.equal((await fund.totalRaised()).toString(), '0');
    });

    it('rejects a zero-value donation', async () => {
      await expectRevert(fund.donate(ZONE.SYLHET, { from: alice, value: 0 }), 'zero value');
    });

    it('rejects ether sent directly to the contract', async () => {
      await expectRevert(
        web3.eth.sendTransaction({ from: alice, to: fund.address, value: ONE_ETHER }),
        'direct payment'
      );
      assert.equal(await web3.eth.getBalance(fund.address), '0');
    });

    it('emits a donation event carrying the running zone total', async () => {
      const receipt = await fund.donate(ZONE.SYLHET, { from: alice, value: ONE_ETHER });
      const log = receipt.logs.find((entry) => entry.event === 'DonationReceived');

      assert.isDefined(log, 'no DonationReceived event');
      assert.equal(log.args.donor, alice);
      assert.equal(log.args.zone.toNumber(), ZONE.SYLHET);
      assert.equal(log.args.amount.toString(), ONE_ETHER);
      assert.equal(log.args.zoneTotal.toString(), ONE_ETHER);
    });
  });

  describe('accounting', () => {
    beforeEach(async () => {
      await fund.registerDonor('Nusrat Jahan', '01711234567', { from: alice });
      await fund.registerDonor('Tanvir Ahsan', '01819876543', { from: bob });
    });

    it('reports what was raised through the contract, per zone', async () => {
      await fund.donate(ZONE.SYLHET, { from: alice, value: web3.utils.toWei('2', 'ether') });
      await fund.donate(ZONE.CHITTAGONG_SOUTH, { from: bob, value: web3.utils.toWei('3', 'ether') });
      await fund.donate(ZONE.SYLHET, { from: bob, value: web3.utils.toWei('1', 'ether') });

      const info = await fund.getDonationsInfo();
      assert.equal(web3.utils.fromWei(info.sylhet), '3');
      assert.equal(web3.utils.fromWei(info.chittagongSouth), '3');
      assert.equal(web3.utils.fromWei(info.chittagongNorth), '0');
      assert.equal(web3.utils.fromWei(info.total), '6');
      assert.equal((await fund.donationCount()).toNumber(), 3);
    });

    // The old getDonationsInfo() read fundraiser wallet balances, so unrelated
    // funds already in a wallet were reported as donations.
    it('excludes money that did not come through the contract', async () => {
      await web3.eth.sendTransaction({ from: stranger, to: northWallet, value: ONE_ETHER });

      const info = await fund.getDonationsInfo();
      assert.equal(info.chittagongNorth.toString(), '0');
      assert.notEqual(await web3.eth.getBalance(northWallet), '0');
    });

    it('tracks per-donor totals', async () => {
      await fund.donate(ZONE.SYLHET, { from: alice, value: ONE_ETHER });
      await fund.donate(ZONE.CHITTAGONG_NORTH, { from: alice, value: ONE_ETHER });

      const info = await fund.getDonorInfo(alice);
      assert.equal(web3.utils.fromWei(info.totalDonated), '2');
      assert.equal(info.donations.toNumber(), 2);
    });
  });

  describe('administration', () => {
    it('lets the owner rotate a fundraiser wallet', async () => {
      await fund.setFundraiser(ZONE.SYLHET, stranger, { from: owner });

      const wallets = await fund.getFundraisers();
      assert.equal(wallets.sylhet, stranger);

      await fund.registerDonor('Nusrat Jahan', '01711234567', { from: alice });
      const before = web3.utils.toBN(await web3.eth.getBalance(stranger));
      await fund.donate(ZONE.SYLHET, { from: alice, value: ONE_ETHER });
      const after = web3.utils.toBN(await web3.eth.getBalance(stranger));

      assert.equal(after.sub(before).toString(), ONE_ETHER);
    });

    it('refuses a fundraiser change from anyone else', async () => {
      await expectRevert(fund.setFundraiser(ZONE.SYLHET, alice, { from: alice }), 'non-owner');
    });

    it('refuses the zero address as a fundraiser', async () => {
      await expectRevert(
        fund.setFundraiser(ZONE.SYLHET, '0x0000000000000000000000000000000000000000', { from: owner }),
        'zero address'
      );
    });

    it('transfers ownership', async () => {
      await fund.transferOwnership(alice, { from: owner });
      assert.equal(await fund.owner(), alice);
      await expectRevert(fund.setFundraiser(ZONE.SYLHET, bob, { from: owner }), 'previous owner');
    });
  });
});
