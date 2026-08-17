import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { FooterFull } from "@/components/Marketing";
import { DashboardModule } from "@/components/modules/DashboardModule";
import { HonestyModule } from "@/components/modules/HonestyModule";
import { BacktestModule } from "@/components/modules/BacktestModule";
import { SignalsModule } from "@/components/modules/SignalsModule";
import { RiskModule } from "@/components/modules/RiskModule";
import { PortfolioModule } from "@/components/modules/PortfolioModule";
import { FactorsModule } from "@/components/modules/FactorsModule";
import { RegimeModule } from "@/components/modules/RegimeModule";
import { PredictionModule } from "@/components/modules/PredictionModule";
import { ModulePending } from "@/components/modules/ModulePending";

/** Every module is now wired to the Python engine. */
const VIEWS: Record<string, () => JSX.Element> = {
  "honesty-engine": HonestyModule,
  backtester: BacktestModule,
  dashboard: DashboardModule,
  signals: SignalsModule,
  risk: RiskModule,
  portfolio: PortfolioModule,
  factors: FactorsModule,
  regime: RegimeModule,
  prediction: PredictionModule,
};

/* One route per module. Modules are wired to the Python engine one at a time;
   the rest render a clear "not wired yet" state rather than a fake screen. */
const MODULES: Record<
  string,
  { n: string; title: string; subtitle: string; accent: string; live?: boolean }
> = {
  "honesty-engine": {
    n: "01",
    title: "Honesty Engine",
    subtitle: "Deflated Sharpe and Probability of Backtest Overfitting, with a blunt verdict on every backtest.",
    accent: "#00f5a0",
  },
  backtester: {
    n: "03",
    title: "Strategy Backtester",
    subtitle: "Lookahead-free backtesting with real costs, walk-forward validation and Monte Carlo.",
    accent: "#a55efd",
  },
  dashboard: {
    n: "05",
    title: "Dashboard",
    subtitle: "Price action, momentum and the full risk picture for a single instrument.",
    accent: "#00f5a0",
    live: true,
  },
  signals: {
    n: "06",
    title: "Signals",
    subtitle: "What your indicator rules say to do right now, across every ticker.",
    accent: "#0be0ff",
  },
  risk: {
    n: "07",
    title: "Risk Analytics",
    subtitle: "VaR and CVaR with fat tails and GARCH — the downside made explicit.",
    accent: "#a55efd",
  },
  portfolio: {
    n: "08",
    title: "Portfolio Optimization",
    subtitle: "Efficient frontier and risk-parity weights from the full covariance structure.",
    accent: "#ffd700",
  },
  factors: {
    n: "09",
    title: "Factor Analytics",
    subtitle: "Information Coefficient, ICIR, quintile returns and signal decay.",
    accent: "#00f5a0",
  },
  regime: {
    n: "10",
    title: "Regime Detection",
    subtitle: "Hidden Markov Model classification of bull, bear and choppy states.",
    accent: "#0be0ff",
  },
  prediction: {
    n: "11",
    title: "Prediction",
    subtitle: "ARIMA, GARCH and machine-learning forecasts, with honest caveats.",
    accent: "#a55efd",
  },
};

export function generateStaticParams() {
  return Object.keys(MODULES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const m = MODULES[params.slug];
  if (!m) return { title: "Module — AlphaForge" };
  return { title: `${m.title} — AlphaForge`, description: m.subtitle };
}

export default function ModulePage({ params }: { params: { slug: string } }) {
  const m = MODULES[params.slug];
  if (!m) notFound();

  const View = VIEWS[params.slug];

  return (
    <RequireAuth>
    <main className="relative bg-ink">
      <Nav />
      {View ? (
        <View />
      ) : (
        <ModulePending n={m.n} title={m.title} subtitle={m.subtitle} accent={m.accent} />
      )}
      <FooterFull />
    </main>
    </RequireAuth>
  );
}
