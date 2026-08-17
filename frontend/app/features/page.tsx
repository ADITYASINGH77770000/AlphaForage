import { Nav } from "@/components/Nav";
import { FooterFull } from "@/components/Marketing";
import { FeaturesPageContent } from "@/components/FeaturesPage";

export const metadata = {
  title: "Features — AlphaForge",
  description:
    "Nine analytics modules built on tested maths, and one Honesty Engine whose only job is to tell you when your edge isn't real.",
};

export default function FeaturesPage() {
  return (
    <main className="relative bg-ink">
      <Nav />
      <FeaturesPageContent />
      <FooterFull />
    </main>
  );
}
