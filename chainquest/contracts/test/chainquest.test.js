const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const Class = { Warrior: 0, Rogue: 1, Mage: 2 };

async function deployFixture() {
  const [owner, player, other] = await ethers.getSigners();

  const GoldToken = await ethers.getContractFactory("GoldToken");
  const gold = await GoldToken.deploy();

  const HeroNFT = await ethers.getContractFactory("HeroNFT");
  const heroes = await HeroNFT.deploy();

  const BattleArena = await ethers.getContractFactory("BattleArena");
  const arena = await BattleArena.deploy(heroes.target, gold.target);

  await gold.setMinter(arena.target, true);
  await heroes.setArena(arena.target);

  return { owner, player, other, gold, heroes, arena };
}

async function mintHero(heroes, signer, name = "Aria", heroClass = Class.Warrior) {
  const tx = await heroes.connect(signer).mintHero(name, heroClass);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try {
        return heroes.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "HeroMinted");
  return event.args.heroId;
}

describe("GoldToken", function () {
  it("only allows configured minters to mint", async function () {
    const { gold, player } = await loadFixture(deployFixture);
    await expect(
      gold.connect(player).mint(player.address, 100n)
    ).to.be.revertedWithCustomError(gold, "NotMinter");
  });

  it("lets the owner manage minters", async function () {
    const { gold, owner, player } = await loadFixture(deployFixture);
    await gold.connect(owner).setMinter(player.address, true);
    await gold.connect(player).mint(player.address, 100n);
    expect(await gold.balanceOf(player.address)).to.equal(100n);
  });
});

describe("HeroNFT", function () {
  it("mints a hero with class-based stats plus a bonus of 0-4", async function () {
    const { heroes, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player, "Aria", Class.Warrior);

    expect(await heroes.ownerOf(heroId)).to.equal(player.address);
    const hero = await heroes.getHero(heroId);
    expect(hero.name).to.equal("Aria");
    expect(hero.level).to.equal(1);
    // Warrior base: 12/6/10, bonus 0-4 each
    expect(hero.strength).to.be.within(12, 16);
    expect(hero.agility).to.be.within(6, 10);
    expect(hero.vitality).to.be.within(10, 14);
  });

  it("rejects empty and too-long names", async function () {
    const { heroes, player } = await loadFixture(deployFixture);
    await expect(
      heroes.connect(player).mintHero("", Class.Rogue)
    ).to.be.revertedWithCustomError(heroes, "EmptyName");
    await expect(
      heroes.connect(player).mintHero("x".repeat(33), Class.Rogue)
    ).to.be.revertedWithCustomError(heroes, "NameTooLong");
  });

  it("only the arena can apply battle results", async function () {
    const { heroes, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player);
    await expect(
      heroes.connect(player).applyBattleResult(heroId, 100n, true)
    ).to.be.revertedWithCustomError(heroes, "OnlyArena");
  });

  it("levels up when XP crosses the threshold, carrying over the remainder", async function () {
    const { heroes, player, owner } = await loadFixture(deployFixture);
    // Point the arena at an EOA so we can call applyBattleResult directly.
    await heroes.connect(owner).setArena(owner.address);
    const heroId = await mintHero(heroes, player);

    const before = await heroes.getHero(heroId);
    await heroes.connect(owner).applyBattleResult(heroId, 250n, true);
    const after = await heroes.getHero(heroId);

    // 250 xp: level 1->2 costs 100, level 2->3 costs 200. Ends level 2 with 150 xp.
    expect(after.level).to.equal(2);
    expect(after.xp).to.equal(150n);
    expect(after.wins).to.equal(1n);
    expect(after.strength).to.equal(before.strength + 3n); // Warrior gains
  });

  it("serves fully on-chain tokenURI metadata", async function () {
    const { heroes, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player, "Meta", Class.Mage);
    const uri = await heroes.tokenURI(heroId);
    expect(uri).to.match(/^data:application\/json;base64,/);
    const json = JSON.parse(
      Buffer.from(uri.split(",")[1], "base64").toString("utf8")
    );
    expect(json.name).to.equal("Meta");
    const classAttr = json.attributes.find((a) => a.trait_type === "Class");
    expect(classAttr.value).to.equal("Mage");
  });
});

describe("BattleArena", function () {
  it("seeds four monsters in the constructor", async function () {
    const { arena } = await loadFixture(deployFixture);
    expect(await arena.monsterCount()).to.equal(4n);
    const slime = await arena.monsters(0);
    expect(slime.name).to.equal("Slime");
  });

  it("rejects fighting with someone else's hero", async function () {
    const { heroes, arena, player, other } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player);
    await expect(
      arena.connect(other).fight(heroId, 0)
    ).to.be.revertedWithCustomError(arena, "NotHeroOwner");
  });

  it("rejects unknown monsters", async function () {
    const { heroes, arena, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player);
    await expect(
      arena.connect(player).fight(heroId, 99)
    ).to.be.revertedWithCustomError(arena, "UnknownMonster");
  });

  it("enforces the cooldown between fights", async function () {
    const { heroes, arena, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player);
    await arena.connect(player).fight(heroId, 0);
    await expect(
      arena.connect(player).fight(heroId, 0)
    ).to.be.revertedWithCustomError(arena, "HeroOnCooldown");

    await network.provider.send("evm_increaseTime", [31]);
    await network.provider.send("evm_mine");
    await arena.connect(player).fight(heroId, 0);
  });

  it("grants XP and GOLD on victory, reduced XP and no GOLD on defeat", async function () {
    const { heroes, arena, gold, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player, "Grinder", Class.Warrior);
    const slime = await arena.monsters(0);

    const tx = await arena.connect(player).fight(heroId, 0);
    const receipt = await tx.wait();
    const battle = receipt.logs
      .map((log) => {
        try {
          return arena.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "BattleFought");

    expect(battle).to.not.be.undefined;
    const hero = await heroes.getHero(heroId);
    const goldBalance = await gold.balanceOf(player.address);

    if (battle.args.victory) {
      expect(battle.args.xpGained).to.equal(slime.xpReward);
      expect(goldBalance).to.equal(slime.goldReward);
      expect(hero.wins).to.equal(1n);
    } else {
      expect(battle.args.xpGained).to.equal(slime.xpReward / 4n);
      expect(goldBalance).to.equal(0n);
      expect(hero.losses).to.equal(1n);
    }
  });

  it("a level-1 hero cannot lose to a Slime roll-range and always beats it eventually", async function () {
    // Hero power >= 12*3 + 6*2 + 10*2 + 5 = 73 min for Warrior; Slime max roll = 20*1.2 = 24.
    // So a Warrior always beats a Slime: worst hero roll 73*0.8 = 58 > 24.
    const { heroes, arena, gold, player } = await loadFixture(deployFixture);
    const heroId = await mintHero(heroes, player, "Tank", Class.Warrior);
    const slime = await arena.monsters(0);

    for (let i = 0; i < 5; i++) {
      await arena.connect(player).fight(heroId, 0);
      await network.provider.send("evm_increaseTime", [31]);
      await network.provider.send("evm_mine");
    }
    const hero = await heroes.getHero(heroId);
    expect(hero.wins).to.equal(5n);
    expect(hero.losses).to.equal(0n);
    expect(await gold.balanceOf(player.address)).to.equal(slime.goldReward * 5n);
    expect(hero.level).to.be.greaterThan(1);
  });

  it("only the owner can add monsters or change the cooldown", async function () {
    const { arena, player } = await loadFixture(deployFixture);
    await expect(
      arena.connect(player).addMonster("Imp", 10, 10, 1n)
    ).to.be.revertedWithCustomError(arena, "OwnableUnauthorizedAccount");
    await expect(
      arena.connect(player).setCooldown(0)
    ).to.be.revertedWithCustomError(arena, "OwnableUnauthorizedAccount");
  });
});
