// Fundraiser wallets, one per relief zone.
//
// These were hardcoded in the contract constructor. They live here instead so a
// deployment can point at test wallets locally and the real wallets on a public
// network, and so rotating one is a config change rather than a redeploy.
module.exports = {
  // Addresses the contract originally shipped with.
  live: {
    sylhet: '0x644f17865493E1862236e568434690224813bf77',
    chittagongSouth: '0x0d82576c8d778d135f197AD9BDD21268008f9Ac3',
    chittagongNorth: '0x0fD7cAC82c431CB40937d391543FF039f3C58774',
  },
};
