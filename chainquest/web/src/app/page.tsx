"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectBar } from "@/components/ConnectBar";
import { MintPanel } from "@/components/MintPanel";
import { HeroList } from "@/components/HeroList";
import { ArenaPanel } from "@/components/ArenaPanel";
import { contractsDeployed } from "@/lib/contracts";

export default function Home() {
  const { isConnected } = useAccount();
  const [selectedHeroId, setSelectedHeroId] = useState<bigint | null>(null);

  return (
    <main className="container">
      <div className="topbar">
        <h1 className="logo">
          ⚔️ ChainQuest
          <small>Turn-based RPG · Robinhood Chain Testnet</small>
        </h1>
        <ConnectBar />
      </div>

      {!contractsDeployed && (
        <div className="notice">
          Contracts belum ter-deploy — alamat contract belum dikonfigurasi.
          Set <code>NEXT_PUBLIC_HERO_NFT_ADDRESS</code>,{" "}
          <code>NEXT_PUBLIC_GOLD_TOKEN_ADDRESS</code>, dan{" "}
          <code>NEXT_PUBLIC_BATTLE_ARENA_ADDRESS</code>.
        </div>
      )}

      {!isConnected ? (
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>
            Hubungkan wallet untuk mulai bertualang.
          </p>
          <p className="hint">
            Mint hero (gratis, NFT on-chain), lawan monster turn-based, dan
            kumpulkan GOLD di Robinhood Chain testnet.
          </p>
        </div>
      ) : (
        <div className="grid">
          <div>
            <MintPanel />
            <div style={{ height: 20 }} />
            <HeroList
              selectedHeroId={selectedHeroId}
              onSelect={setSelectedHeroId}
            />
          </div>
          <ArenaPanel heroId={selectedHeroId} />
        </div>
      )}
    </main>
  );
}
