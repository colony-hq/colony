import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ChainQuest — RPG on Robinhood Chain",
  description:
    "Turn-based crypto RPG on Robinhood Chain testnet. Mint heroes, battle monsters, earn GOLD.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
