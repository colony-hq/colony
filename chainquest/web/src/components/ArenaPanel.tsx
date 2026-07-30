"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, formatEther } from "viem";
import {
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { battleArenaAbi } from "@/lib/abi";
import { addresses, contractsDeployed } from "@/lib/contracts";

const MONSTER_ICONS = ["🟢", "👺", "🪓", "🐉"];

type Monster = {
  name: string;
  power: number;
  xpReward: bigint;
  goldReward: bigint;
};

type BattleOutcome = {
  victory: boolean;
  heroRoll: bigint;
  monsterRoll: bigint;
  xpGained: bigint;
  goldGained: bigint;
  monsterName: string;
};

export function ArenaPanel({ heroId }: { heroId: bigint | null }) {
  const [selectedMonster, setSelectedMonster] = useState<number>(0);
  const [log, setLog] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [fighting, setFighting] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const publicClient = usePublicClient();
  const { writeContractAsync, error: writeError } = useWriteContract();

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: monsterCount } = useReadContract({
    address: addresses.battleArena,
    abi: battleArenaAbi,
    functionName: "monsterCount",
    query: { enabled: contractsDeployed },
  });

  const { data: monsterResults } = useReadContracts({
    contracts: Array.from({ length: Number(monsterCount ?? 0n) }, (_, i) => ({
      address: addresses.battleArena,
      abi: battleArenaAbi,
      functionName: "monsters" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: (monsterCount ?? 0n) > 0n },
  });

  const monsters: Monster[] = useMemo(
    () =>
      (monsterResults ?? [])
        .filter((r) => r.status === "success")
        .map((r) => {
          const [name, power, xpReward, goldReward] = r.result as readonly [
            string,
            number,
            bigint,
            bigint,
          ];
          return { name, power, xpReward, goldReward };
        }),
    [monsterResults]
  );

  const { data: cooldownSeconds } = useReadContract({
    address: addresses.battleArena,
    abi: battleArenaAbi,
    functionName: "cooldownSeconds",
    query: { enabled: contractsDeployed },
  });

  const { data: lastFightAt, refetch: refetchLastFight } = useReadContract({
    address: addresses.battleArena,
    abi: battleArenaAbi,
    functionName: "lastFightAt",
    args: heroId !== null ? [heroId] : undefined,
    query: { enabled: heroId !== null && contractsDeployed },
  });

  const readyAt =
    lastFightAt !== undefined && cooldownSeconds !== undefined
      ? Number(lastFightAt) + Number(cooldownSeconds)
      : 0;
  const cooldownLeft = Math.max(0, readyAt - now);

  const fight = async () => {
    if (heroId === null || !publicClient) return;
    setFighting(true);
    setOutcome(null);
    const monster = monsters[selectedMonster];
    setLog([
      `⚔️ Hero #${heroId} menantang ${monster?.name ?? "monster"}…`,
      "Menunggu tanda tangan wallet…",
    ]);
    try {
      const hash = await writeContractAsync({
        address: addresses.battleArena,
        abi: battleArenaAbi,
        functionName: "fight",
        args: [heroId, BigInt(selectedMonster)],
      });
      setLog((l) => [...l, "Transaksi terkirim, menunggu konfirmasi on-chain…"]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let battle: BattleOutcome | null = null;
      for (const eventLog of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: battleArenaAbi,
            data: eventLog.data,
            topics: eventLog.topics,
          });
          if (decoded.eventName === "BattleFought") {
            const args = decoded.args as unknown as {
              victory: boolean;
              heroRoll: bigint;
              monsterRoll: bigint;
              xpGained: bigint;
              goldGained: bigint;
            };
            battle = {
              victory: args.victory,
              heroRoll: args.heroRoll,
              monsterRoll: args.monsterRoll,
              xpGained: args.xpGained,
              goldGained: args.goldGained,
              monsterName: monster?.name ?? "Monster",
            };
            break;
          }
        } catch {
          // log from another contract — skip
        }
      }

      if (battle) {
        setOutcome(battle);
        setLog((l) => [
          ...l,
          `Hero roll: ${battle.heroRoll} · ${battle.monsterName} roll: ${battle.monsterRoll}`,
        ]);
      } else {
        setLog((l) => [...l, "Pertarungan selesai (event tidak ditemukan)."]);
      }
      refetchLastFight();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLog((l) => [...l, `❌ ${message.split("\n")[0].slice(0, 160)}`]);
    } finally {
      setFighting(false);
    }
  };

  if (heroId === null) {
    return (
      <section className="panel">
        <h2>Arena Pertarungan</h2>
        <p className="hint">Pilih atau mint hero dulu untuk masuk arena.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Arena Pertarungan</h2>

      <div className="monster-grid">
        {monsters.map((m, i) => (
          <div
            key={i}
            className={`monster-card ${selectedMonster === i ? "selected" : ""}`}
            onClick={() => setSelectedMonster(i)}
          >
            <span className="icon">{MONSTER_ICONS[i] ?? "👾"}</span>
            <div className="m-name">{m.name}</div>
            <div className="m-meta">
              PWR {m.power} · {m.xpReward.toString()} XP ·{" "}
              {Number(formatEther(m.goldReward)).toLocaleString()} GOLD
            </div>
          </div>
        ))}
        {monsters.length === 0 && (
          <p className="hint">Memuat monster dari chain…</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={fight}
          disabled={!contractsDeployed || fighting || cooldownLeft > 0 || monsters.length === 0}
        >
          {fighting
            ? "Bertarung…"
            : cooldownLeft > 0
              ? `Cooldown ${cooldownLeft}s`
              : "⚔️ Serang!"}
        </button>
        {cooldownLeft > 0 && (
          <span className="cooldown">Hero butuh istirahat sejenak…</span>
        )}
      </div>

      <div className="battle-log">
        {log.length === 0 && (
          <span className="muted">
            Pilih monster lalu serang. Hasil pertarungan diputuskan on-chain —
            tiap sisi melempar 80–120% dari power-nya.
          </span>
        )}
        {log.map((line, i) => (
          <div key={i} className="muted">
            {line}
          </div>
        ))}
        {outcome && (
          <div className={outcome.victory ? "win" : "lose"} style={{ marginTop: 8 }}>
            {outcome.victory ? (
              <>
                🏆 MENANG! +{outcome.xpGained.toString()} XP, +
                {Number(formatEther(outcome.goldGained)).toLocaleString()} GOLD
              </>
            ) : (
              <>
                💀 Kalah dari {outcome.monsterName}… tapi tetap dapat +
                {outcome.xpGained.toString()} XP. Coba lagi!
              </>
            )}
          </div>
        )}
      </div>

      {writeError && (
        <p className="error">{writeError.message.split("\n")[0].slice(0, 200)}</p>
      )}
    </section>
  );
}
