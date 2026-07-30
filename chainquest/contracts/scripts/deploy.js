const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account. Set DEPLOYER_PRIVATE_KEY in the environment."
    );
  }
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId ?? "local"})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Fund it from the faucet first.");
  }

  const GoldToken = await ethers.getContractFactory("GoldToken");
  const gold = await GoldToken.deploy();
  await gold.waitForDeployment();
  console.log(`GoldToken:   ${gold.target}`);

  const HeroNFT = await ethers.getContractFactory("HeroNFT");
  const heroes = await HeroNFT.deploy();
  await heroes.waitForDeployment();
  console.log(`HeroNFT:     ${heroes.target}`);

  const BattleArena = await ethers.getContractFactory("BattleArena");
  const arena = await BattleArena.deploy(heroes.target, gold.target);
  await arena.waitForDeployment();
  console.log(`BattleArena: ${arena.target}`);

  await (await gold.setMinter(arena.target, true)).wait();
  await (await heroes.setArena(arena.target)).wait();
  console.log("Wired: arena is GOLD minter and hero arena.");

  const deployment = {
    network: network.name,
    chainId: network.config.chainId ?? null,
    deployedAt: new Date().toISOString(),
    contracts: {
      GoldToken: gold.target,
      HeroNFT: heroes.target,
      BattleArena: arena.target,
    },
  };
  const outPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`Saved ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
