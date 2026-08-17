import Loader from "@/components/Loader";
import Hero from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { FeatureRows, Insights, FooterFull } from "@/components/Marketing";

/* HOME
   1 · Landing hero — what AlphaForge is, with the dashboard visual
   2 · The top 3 features, alternating left / right
   3 · Insights
   4 · Footer                                                            */
export default function Home() {
  return (
    <main className="relative bg-ink">
      <Loader />
      <Nav />
      <Hero />
      <FeatureRows />
      <Insights />
      <FooterFull />
    </main>
  );
}
