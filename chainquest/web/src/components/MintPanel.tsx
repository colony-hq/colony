"use client";

import { useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { heroNFTAbi } from "@/lib/abi";
import { addresses, contractsDeployed } from "@/lib/contracts";

const CLASSES = [
  { id: 0, name: "Warrior", icon: "🛡️", blurb: "Kuat & tahan banting" },
  { id: 1, name: "Rogue", icon: "🗡️", blurb: "Lincah & mematikan" },
  { id: 2, name: "Mage", icon: "🔮", blurb: "Ledakan sihir" },
] as const;

export function MintPanel() {
  const [name, setName] = useState("");
  const [heroClass, setHeroClass] = useState<number>(0);

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const mint = () => {
    writeContract({
      address: addresses.heroNFT,
      abi: heroNFTAbi,
      functionName: "mintHero",
      args: [name.trim(), heroClass],
    });
  };

  const busy = isPending || confirming;

  return (
    <section className="panel">
      <h2>Mint Hero Baru</h2>
      <div className="field">
        <label htmlFor="hero-name">Nama hero</label>
        <input
          id="hero-name"
          type="text"
          maxLength={32}
          placeholder="cth. Arjuna"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (isSuccess || error) reset();
          }}
        />
      </div>
      <div className="field">
        <label>Class</label>
        <div className="class-picker">
          {CLASSES.map((c) => (
            <div
              key={c.id}
              className={`class-option ${heroClass === c.id ? "selected" : ""}`}
              onClick={() => setHeroClass(c.id)}
              role="button"
              title={c.blurb}
            >
              <span className="icon">{c.icon}</span>
              {c.name}
            </div>
          ))}
        </div>
      </div>
      <button
        className="gold"
        style={{ width: "100%" }}
        onClick={mint}
        disabled={!contractsDeployed || busy || name.trim().length === 0}
      >
        {isPending
          ? "Menunggu wallet…"
          : confirming
            ? "Menunggu konfirmasi…"
            : "⚒️ Mint Hero (gratis)"}
      </button>
      {isSuccess && (
        <p className="hint" style={{ color: "var(--win)" }}>
          Hero berhasil di-mint! Pilih dari daftar untuk mulai bertarung.
        </p>
      )}
      {error && <p className="error">{shortError(error.message)}</p>}
    </section>
  );
}

function shortError(message: string): string {
  return message.split("\n")[0].slice(0, 200);
}
