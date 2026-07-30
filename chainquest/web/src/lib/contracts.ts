import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const addresses = {
  goldToken: (process.env.NEXT_PUBLIC_GOLD_TOKEN_ADDRESS ?? ZERO) as Address,
  heroNFT: (process.env.NEXT_PUBLIC_HERO_NFT_ADDRESS ?? ZERO) as Address,
  battleArena: (process.env.NEXT_PUBLIC_BATTLE_ARENA_ADDRESS ?? ZERO) as Address,
};

export const contractsDeployed = Object.values(addresses).every(
  (a) => a !== ZERO
);
