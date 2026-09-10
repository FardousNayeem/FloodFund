// https://trufflesuite.com/docs/truffle/reference/configuration/
const TEST_NETWORK_ID = 1337;

let testProvider;
const createTestProvider = () =>
  require('ganache').provider({
    logging: { quiet: true },
    chain: { networkId: TEST_NETWORK_ID, chainId: TEST_NETWORK_ID },
    wallet: { totalAccounts: 10, defaultBalance: 1000 },
  });

module.exports = {
  networks: {
    // An external chain: Ganache CLI, or `truffle develop`.
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
    },

    // Ganache GUI defaults to 7545, which is where the original 5777 artifact
    // in build/contracts came from.
    ganache: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '5777',
    },

    // `npm test` uses this network. It runs an in-process chain, so the suite
    // needs no node running and no ports free.
    test: {
      // Truffle asks for the provider more than once per run. Handing back a
      // fresh chain each time gives two different network ids and the run
      // aborts, so the instance is created once and reused.
      provider: () => (testProvider ||= createTestProvider()),
      network_id: TEST_NETWORK_ID,
    },
  },

  compilers: {
    solc: {
      version: '0.8.16',
      settings: {
        optimizer: { enabled: true, runs: 200 },
      },
    },
  },
};
