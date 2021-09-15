var MyContract = artifacts.require("OpenSquaring");

module.exports = function(deployer) {
  // deployment steps
  deployer.deploy(MyContract);
};
