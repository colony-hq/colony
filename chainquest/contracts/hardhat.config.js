require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require("hardhat/builtin-tasks/task-names");

// Use the solc compiler bundled in the npm "solc" package instead of
// downloading binaries from binaries.soliditylang.org (blocked in some
// sandboxed environments).
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.28") {
    const compilerPath = require.resolve("solc/soljson.js");
    return {
      compilerPath,
      isSolcJs: true,
      version: "0.8.28",
      longVersion: "0.8.28+commit.7893614a",
    };
  }
  return runSuper(args);
});

const RPC_URL =
  process.env.ROBINHOOD_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.ROBINHOOD_TESTNET_CHAIN_ID || 46630);
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks: {
    robinhoodTestnet: {
      url: RPC_URL,
      chainId: CHAIN_ID,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { robinhoodTestnet: "blockscout" },
    customChains: [
      {
        network: "robinhoodTestnet",
        chainId: CHAIN_ID,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
    ],
  },
};
