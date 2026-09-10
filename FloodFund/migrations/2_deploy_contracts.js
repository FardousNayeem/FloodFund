// requiring the contract
var FloodFund = artifacts.require("./FloodFund.sol");

// exporting as module 
 module.exports = function(deployer) {
  deployer.deploy(FloodFund);
 };
