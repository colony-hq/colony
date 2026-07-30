"use client";

import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import { goldTokenAbi } from "@/lib/abi";
import { addresses, contractsDeployed } from "@/lib/contracts";
import { robinhoodTestnet } from "@/lib/chain";

export function ConnectBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const { data: goldBalance } = useReadContract({
    address: addresses.goldToken,
    abi: goldTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && contractsDeployed,
      refetchInterval: 15_000,
    },
  });

  if (!isConnected) {
    const injectedConnector = connectors[0];
    return (
      <div className="wallet">
        <button
          onClick={() => injectedConnector && connect({ connector: injectedConnector })}
          disabled={!injectedConnector || isPending}
        >
          {isPending ? "Menghubungkan…" : "Connect Wallet"}
        </button>
        {error && <span className="error">{error.message}</span>}
      </div>
    );
  }

  const wrongChain = chainId !== robinhoodTestnet.id;

  return (
    <div className="wallet">
      {wrongChain ? (
        <button
          className="gold"
          onClick={() => switchChain({ chainId: robinhoodTestnet.id })}
          disabled={switching}
        >
          {switching ? "Beralih…" : "Switch ke Robinhood Chain"}
        </button>
      ) : (
        <span className="badge gold">
          💰 {goldBalance !== undefined ? Number(formatEther(goldBalance)).toLocaleString() : "…"} GOLD
        </span>
      )}
      <span className="badge">
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button className="ghost" onClick={() => disconnect()}>
        Putuskan
      </button>
    </div>
  );
}
