// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title ChainQuest Heroes — ERC-721 heroes with fully on-chain stats and metadata
contract HeroNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    enum Class {
        Warrior,
        Rogue,
        Mage
    }

    struct Hero {
        string name;
        Class heroClass;
        uint32 level;
        uint64 xp;
        uint32 strength;
        uint32 agility;
        uint32 vitality;
        uint64 wins;
        uint64 losses;
    }

    uint256 public nextId = 1;
    address public arena;
    mapping(uint256 => Hero) private _heroes;

    error OnlyArena(address caller);
    error EmptyName();
    error NameTooLong();

    event HeroMinted(
        uint256 indexed heroId,
        address indexed owner,
        string name,
        Class heroClass,
        uint32 strength,
        uint32 agility,
        uint32 vitality
    );
    event HeroLeveledUp(uint256 indexed heroId, uint32 newLevel);
    event ArenaSet(address indexed arena);

    modifier onlyArena() {
        if (msg.sender != arena) revert OnlyArena(msg.sender);
        _;
    }

    constructor() ERC721("ChainQuest Heroes", "HERO") Ownable(msg.sender) {}

    function setArena(address arena_) external onlyOwner {
        arena = arena_;
        emit ArenaSet(arena_);
    }

    /// @notice Mint a new hero. Free on testnet — stats get a small random bonus.
    function mintHero(string calldata name, Class heroClass) external returns (uint256 heroId) {
        if (bytes(name).length == 0) revert EmptyName();
        if (bytes(name).length > 32) revert NameTooLong();

        heroId = nextId++;

        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, heroId)
            )
        );

        (uint32 baseStr, uint32 baseAgi, uint32 baseVit) = _baseStats(heroClass);
        Hero storage h = _heroes[heroId];
        h.name = name;
        h.heroClass = heroClass;
        h.level = 1;
        h.strength = baseStr + uint32(seed % 5);
        h.agility = baseAgi + uint32((seed >> 8) % 5);
        h.vitality = baseVit + uint32((seed >> 16) % 5);

        _safeMint(msg.sender, heroId);
        emit HeroMinted(heroId, msg.sender, name, heroClass, h.strength, h.agility, h.vitality);
    }

    /// @notice Called by the arena after a battle: grant XP, record the result, level up.
    function applyBattleResult(uint256 heroId, uint64 xpGained, bool won) external onlyArena {
        _requireOwned(heroId);
        Hero storage h = _heroes[heroId];
        h.xp += xpGained;
        if (won) {
            h.wins += 1;
        } else {
            h.losses += 1;
        }
        while (h.xp >= xpForNextLevel(h.level)) {
            h.xp -= xpForNextLevel(h.level);
            h.level += 1;
            (uint32 gStr, uint32 gAgi, uint32 gVit) = _levelGains(h.heroClass);
            h.strength += gStr;
            h.agility += gAgi;
            h.vitality += gVit;
            emit HeroLeveledUp(heroId, h.level);
        }
    }

    function xpForNextLevel(uint32 level) public pure returns (uint64) {
        return uint64(level) * 100;
    }

    /// @notice Combat power used by the arena.
    function power(uint256 heroId) external view returns (uint256) {
        _requireOwned(heroId);
        Hero storage h = _heroes[heroId];
        return
            uint256(h.strength) * 3 +
            uint256(h.agility) * 2 +
            uint256(h.vitality) * 2 +
            uint256(h.level) * 5;
    }

    function getHero(uint256 heroId) external view returns (Hero memory) {
        _requireOwned(heroId);
        return _heroes[heroId];
    }

    /// @notice Fully on-chain metadata (data: URI with JSON).
    function tokenURI(uint256 heroId) public view override returns (string memory) {
        _requireOwned(heroId);
        Hero storage h = _heroes[heroId];
        string memory className = _className(h.heroClass);
        bytes memory json = abi.encodePacked(
            '{"name":"', h.name, '","description":"ChainQuest hero on Robinhood Chain",',
            '"attributes":[',
            '{"trait_type":"Class","value":"', className, '"},',
            '{"trait_type":"Level","value":', uint256(h.level).toString(), '},',
            '{"trait_type":"Strength","value":', uint256(h.strength).toString(), '},',
            '{"trait_type":"Agility","value":', uint256(h.agility).toString(), '},',
            '{"trait_type":"Vitality","value":', uint256(h.vitality).toString(), '},',
            '{"trait_type":"Wins","value":', uint256(h.wins).toString(), '},',
            '{"trait_type":"Losses","value":', uint256(h.losses).toString(), '}',
            ']}'
        );
        return string(
            abi.encodePacked("data:application/json;base64,", Base64.encode(json))
        );
    }

    function _baseStats(Class heroClass) private pure returns (uint32, uint32, uint32) {
        if (heroClass == Class.Warrior) return (12, 6, 10);
        if (heroClass == Class.Rogue) return (7, 13, 8);
        return (10, 8, 6); // Mage: high strength stat represents spellpower
    }

    function _levelGains(Class heroClass) private pure returns (uint32, uint32, uint32) {
        if (heroClass == Class.Warrior) return (3, 1, 2);
        if (heroClass == Class.Rogue) return (1, 3, 2);
        return (3, 2, 1); // Mage
    }

    function _className(Class heroClass) private pure returns (string memory) {
        if (heroClass == Class.Warrior) return "Warrior";
        if (heroClass == Class.Rogue) return "Rogue";
        return "Mage";
    }
}
