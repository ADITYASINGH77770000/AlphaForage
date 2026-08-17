import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteGate } from "@/components/auth/SiteGate";
import { GuideBot } from "@/components/guide/GuideBot";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "AlphaForge — The quant platform that tells you the truth",
  description:
    "AlphaForge tests trading strategies honestly, with real costs and out-of-sample validation, then gives a blunt verdict on whether the edge is real or an overfit illusion — before you risk a rupee.",
  keywords: ["quant", "trading", "backtesting", "honesty engine", "overfitting", "AlphaForge"],
  openGraph: {
    title: "AlphaForge — The quant platform that tells you the truth",
    description:
      "Test a strategy with real costs and out-of-sample validation, and get a blunt, honest verdict on whether the edge is real — before you risk a rupee.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlphaForge — The quant platform that tells you the truth",
    description: "Honest quant strategy testing. Is your edge real, or an overfit illusion?",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="grain antialiased">
        <AuthProvider>
          {/* Nothing renders without a session except /login and /signup. */}
          <SiteGate>
            {children}
            {/* Forge — the onboarding assistant, present on every page. */}
            <GuideBot />
          </SiteGate>
        </AuthProvider>
      </body>
    </html>
  );
}
