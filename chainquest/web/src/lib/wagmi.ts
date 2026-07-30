import { createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { robinhoodTestnet } from "./chain";

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
  },
  ssr: true,
});
