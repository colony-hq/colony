// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ChainQuest Gold — reward currency earned by winning battles
contract GoldToken is ERC20, Ownable {
    mapping(address => bool) public minters;

    error NotMinter(address caller);

    event MinterSet(address indexed minter, bool allowed);

    constructor() ERC20("ChainQuest Gold", "GOLD") Ownable(msg.sender) {}

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter(msg.sender);
        _mint(to, amount);
    }
}
