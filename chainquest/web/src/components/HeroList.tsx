"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { heroNFTAbi } from "@/lib/abi";
import { addresses, contractsDeployed } from "@/lib/contracts";

const CLASS_ICONS = ["🛡️", "🗡️", "🔮"];
const CLASS_NAMES = ["Warrior", "Rogue", "Mage"];

type Props = {
  selectedHeroId: bigint | null;
  onSelect: (id: bigint) => void;
};

export function HeroList({ selectedHeroId, onSelect }: Props) {
  const { address } = useAccount();

  const { data: balance } = useReadContract({
    address: addresses.heroNFT,
    abi: heroNFTAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && contractsDeployed, refetchInterval: 10_000 },
  });

  const count = balance !== undefined ? Number(balance) : 0;

  const { data: idResults } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: addresses.heroNFT,
      abi: heroNFTAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address!, BigInt(i)] as const,
    })),
    query: { enabled: count > 0 && Boolean(address) },
  });

  const heroIds = (idResults ?? [])
    .filter((r) => r.status === "success")
    .map((r) => r.result as bigint);

  const { data: heroResults } = useReadContracts({
    contracts: heroIds.map((id) => ({
      address: addresses.heroNFT,
      abi: heroNFTAbi,
      functionName: "getHero" as const,
      args: [id] as const,
    })),
    query: { enabled: heroIds.length > 0, refetchInterval: 10_000 },
  });

  // Auto-select the first hero once loaded.
  useEffect(() => {
    if (selectedHeroId === null && heroIds.length > 0) {
      onSelect(heroIds[0]);
    }
  }, [selectedHeroId, heroIds, onSelect]);

  return (
    <section className="panel">
      <h2>Hero Kamu {count > 0 ? `(${count})` : ""}</h2>
      {count === 0 && (
        <p className="hint">Belum punya hero. Mint dulu di atas! 👆</p>
      )}
      {heroIds.map((id, i) => {
        const result = heroResults?.[i];
        if (!result || result.status !== "success") {
          return (
            <div key={id.toString()} className="hero-card">
              <span className="muted">Memuat hero #{id.toString()}…</span>
            </div>
          );
        }
        const hero = result.result as {
          name: string;
          heroClass: number;
          level: number;
          xp: bigint;
          strength: number;
          agility: number;
          vitality: number;
          wins: bigint;
          losses: bigint;
        };
        const xpNeeded = hero.level * 100;
        const xpPct = Math.min(100, (Number(hero.xp) / xpNeeded) * 100);
        return (
          <div
            key={id.toString()}
            className={`hero-card ${selectedHeroId === id ? "selected" : ""}`}
            onClick={() => onSelect(id)}
          >
            <div className="hero-name">
              <strong>
                {CLASS_ICONS[hero.heroClass]} {hero.name}
              </strong>
              <span>
                Lv {hero.level} · {CLASS_NAMES[hero.heroClass]}
              </span>
            </div>
            <div className="stats">
              <span>STR <b>{hero.strength}</b></span>
              <span>AGI <b>{hero.agility}</b></span>
              <span>VIT <b>{hero.vitality}</b></span>
              <span>
                W/L <b>{hero.wins.toString()}/{hero.losses.toString()}</b>
              </span>
            </div>
            <div className="xpbar" title={`${hero.xp}/${xpNeeded} XP`}>
              <div style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
