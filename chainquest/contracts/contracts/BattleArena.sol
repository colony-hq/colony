// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {HeroNFT} from "./HeroNFT.sol";
import {GoldToken} from "./GoldToken.sol";

/// @title ChainQuest Battle Arena — turn-based fights against monsters
/// @dev Randomness uses prevrandao/blockhash which is fine for a testnet game,
///      NOT for anything of real value.
contract BattleArena is Ownable {
    struct Monster {
        string name;
        uint32 power;
        uint64 xpReward;
        uint256 goldReward; // in wei units of GOLD (18 decimals)
    }

    HeroNFT public immutable heroes;
    GoldToken public immutable gold;

    Monster[] public monsters;
    uint256 public cooldownSeconds = 30;
    mapping(uint256 => uint256) public lastFightAt;
    uint256 private _nonce;

    error NotHeroOwner(uint256 heroId, address caller);
    error HeroOnCooldown(uint256 heroId, uint256 readyAt);
    error UnknownMonster(uint256 monsterId);

    event BattleFought(
        uint256 indexed heroId,
        address indexed player,
        uint256 indexed monsterId,
        bool victory,
        uint256 heroRoll,
        uint256 monsterRoll,
        uint64 xpGained,
        uint256 goldGained
    );
    event MonsterAdded(uint256 indexed monsterId, string name, uint32 power);
    event CooldownSet(uint256 seconds_);

    constructor(HeroNFT heroes_, GoldToken gold_) Ownable(msg.sender) {
        heroes = heroes_;
        gold = gold_;

        _addMonster("Slime", 20, 40, 5 ether);
        _addMonster("Goblin Raider", 45, 80, 15 ether);
        _addMonster("Orc Warlord", 85, 150, 40 ether);
        _addMonster("Ancient Dragon", 160, 300, 120 ether);
    }

    function monsterCount() external view returns (uint256) {
        return monsters.length;
    }

    function addMonster(
        string calldata name,
        uint32 power,
        uint64 xpReward,
        uint256 goldReward
    ) external onlyOwner {
        _addMonster(name, power, xpReward, goldReward);
    }

    function setCooldown(uint256 seconds_) external onlyOwner {
        cooldownSeconds = seconds_;
        emit CooldownSet(seconds_);
    }

    /// @notice Fight a monster with your hero. Win: full XP + GOLD. Lose: 1/4 XP.
    function fight(uint256 heroId, uint256 monsterId) external {
        if (heroes.ownerOf(heroId) != msg.sender) revert NotHeroOwner(heroId, msg.sender);
        if (monsterId >= monsters.length) revert UnknownMonster(monsterId);

        uint256 readyAt = lastFightAt[heroId] + cooldownSeconds;
        if (block.timestamp < readyAt) revert HeroOnCooldown(heroId, readyAt);
        lastFightAt[heroId] = block.timestamp;

        Monster storage m = monsters[monsterId];
        uint256 heroPower = heroes.power(heroId);

        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    blockhash(block.number - 1),
                    msg.sender,
                    heroId,
                    _nonce++
                )
            )
        );

        // Each side rolls 80%–120% of its power.
        uint256 heroRoll = (heroPower * (80 + (seed % 41))) / 100;
        uint256 monsterRoll = (uint256(m.power) * (80 + ((seed >> 16) % 41))) / 100;

        bool victory = heroRoll >= monsterRoll;
        uint64 xpGained = victory ? m.xpReward : m.xpReward / 4;
        uint256 goldGained = victory ? m.goldReward : 0;

        heroes.applyBattleResult(heroId, xpGained, victory);
        if (goldGained > 0) {
            gold.mint(msg.sender, goldGained);
        }

        emit BattleFought(
            heroId,
            msg.sender,
            monsterId,
            victory,
            heroRoll,
            monsterRoll,
            xpGained,
            goldGained
        );
    }

    function _addMonster(
        string memory name,
        uint32 power,
        uint64 xpReward,
        uint256 goldReward
    ) private {
        monsters.push(Monster({name: name, power: power, xpReward: xpReward, goldReward: goldReward}));
        emit MonsterAdded(monsters.length - 1, name, power);
    }
}
