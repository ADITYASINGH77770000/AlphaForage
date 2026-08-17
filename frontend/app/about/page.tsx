import { Nav } from "@/components/Nav";
import { FooterFull } from "@/components/Marketing";
import { AboutPageContent } from "@/components/AboutPage";

export const metadata = {
  title: "About — AlphaForge",
  description:
    "Why AlphaForge exists: the principles behind an honesty-first quant platform, what we deliberately don't build, and the research every check is grounded in.",
};

export default function AboutPage() {
  return (
    <main className="relative bg-ink">
      <Nav />
      <AboutPageContent />
      <FooterFull />
    </main>
  );
}
