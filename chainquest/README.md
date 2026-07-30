# ⚔️ ChainQuest — Turn-Based RPG on Robinhood Chain

Game RPG crypto turn-based di **Robinhood Chain Testnet** (Arbitrum Orbit L2).
Mint hero sebagai NFT, lawan monster, naikkan level, dan kumpulkan token GOLD —
semua state game hidup on-chain.

## Arsitektur

```
chainquest/
├── contracts/   # Hardhat + Solidity 0.8.28 + OpenZeppelin 5
│   ├── GoldToken.sol    # ERC-20 "GOLD" — reward pertarungan
│   ├── HeroNFT.sol      # ERC-721 enumerable — hero + stats + metadata on-chain
│   └── BattleArena.sol  # Logika battle, monster, cooldown, reward
└── web/         # Next.js 15 + wagmi v2 + viem
```

### Gameplay

- **Mint hero** (gratis): pilih class Warrior / Rogue / Mage. Stats dasar per
  class + bonus acak 0–4 saat mint.
- **Battle**: tiap sisi melempar 80–120% dari power-nya. Menang = full XP +
  GOLD; kalah = 1/4 XP tanpa GOLD. Cooldown 30 detik per hero.
- **Level up**: XP threshold = level × 100, sisa XP dibawa. Stats naik sesuai
  class. Metadata NFT (tokenURI) sepenuhnya on-chain sebagai data-URI JSON.
- Randomness pakai `prevrandao`/`blockhash` — cukup untuk game testnet,
  **bukan** untuk aset bernilai riil.

## Network

| | |
|---|---|
| Chain | Robinhood Chain Testnet |
| Chain ID | 46630 |
| RPC | https://rpc.testnet.chain.robinhood.com |
| Explorer | https://explorer.testnet.chain.robinhood.com |
| Faucet | https://faucet.testnet.chain.robinhood.com |

## Development

### Contracts

```bash
cd contracts
npm install
npm test                 # 14 tests
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:robinhood
npm run export-abi       # regenerate web/src/lib/abi.ts
```

Catatan: compiler solc diambil dari paket npm `solc` (bukan download dari
binaries.soliditylang.org) supaya bisa jalan di environment sandbox.

### Web

```bash
cd web
npm install
npm run dev
```

Env vars (`.env.local` atau Vercel project settings):

```
NEXT_PUBLIC_HERO_NFT_ADDRESS=0x...
NEXT_PUBLIC_GOLD_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_BATTLE_ARENA_ADDRESS=0x...
```

Tanpa env vars ini app tetap jalan tapi menampilkan banner "belum deploy".
