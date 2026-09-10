const FloodFund = artifacts.require('FloodFund');
const fundraisers = require('../fundraisers');

module.exports = async function (deployer, network, accounts) {
  // On a local chain, deploy against accounts the developer actually controls
  // so donations can be received and inspected. Everywhere else, use the real
  // fundraiser wallets.
  const zones =
    network === 'development' || network === 'develop' || network.startsWith('test')
      ? { sylhet: accounts[1], chittagongSouth: accounts[2], chittagongNorth: accounts[3] }
      : fundraisers.live;

  await deployer.deploy(FloodFund, zones.sylhet, zones.chittagongSouth, zones.chittagongNorth);

  const instance = await FloodFund.deployed();
  console.log(`FloodFund deployed to ${instance.address} on "${network}"`);
  console.log(`  Sylhet            ${zones.sylhet}`);
  console.log(`  Chittagong South  ${zones.chittagongSouth}`);
  console.log(`  Chittagong North  ${zones.chittagongNorth}`);
};
