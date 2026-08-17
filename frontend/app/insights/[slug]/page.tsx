import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { FooterFull } from "@/components/Marketing";
import { ARTICLES, getArticle, type Block } from "@/lib/insights";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a) return { title: "Insight — AlphaForge" };
  return {
    title: `${a.title} — AlphaForge`,
    description: a.dek,
    openGraph: { title: a.title, description: a.dek, type: "article" },
  };
}

function Prose({ block, accent }: { block: Block; accent: string }) {
  switch (block.kind) {
    case "h":
      return (
        <h2 className="mt-12 text-[1.45rem] font-medium leading-snug text-white sm:text-[1.7rem]">
          {block.text}
        </h2>
      );
    case "p":
      return <p className="mt-5 text-[16.5px] leading-8 text-haze">{block.text}</p>;
    case "list":
      return (
        <ul className="mt-6 space-y-3.5">
          {block.items.map((t) => (
            <li key={t} className="flex items-start gap-3 text-[15.5px] leading-7 text-haze">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: accent }}
              />
              {t}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          className="my-9 border-l-[3px] py-1 pl-5 text-[17px] font-medium italic leading-8 text-white/90"
          style={{ borderColor: accent }}
        >
          {block.text}
        </blockquote>
      );
    case "callout":
      return (
        <div
          className="my-9 rounded-2xl border px-6 py-5"
          style={{ borderColor: `${accent}44`, background: `${accent}0d` }}
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: accent }}>
            {block.title}
          </div>
          <p className="mt-2.5 text-[15.5px] leading-7 text-haze">{block.text}</p>
        </div>
      );
    case "table":
      return (
        <div className="my-8">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead className="bg-panel/60">
                <tr>
                  {block.head.map((h) => (
                    <th
                      key={h}
                      className="border-b border-white/10 px-4 py-3 font-mono text-[10.5px] uppercase tracking-wider text-hazedim"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.03]">
                    {r.map((cell, j) => (
                      <td
                        key={j}
                        className="border-b border-white/[0.06] px-4 py-3 text-[14px] leading-6"
                        style={{ color: j === 0 ? "#ffffff" : "#adc6dd" }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && (
            <p className="mt-2.5 text-[12.5px] italic text-hazedim">{block.caption}</p>
          )}
        </div>
      );
  }
}

export default function InsightPage({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a) notFound();

  const more = ARTICLES.filter((x) => x.slug !== a.slug);

  return (
    <main className="min-h-screen bg-ink">
      <Nav />

      <article className="relative z-10 mx-auto max-w-[760px] px-6 pb-8 pt-32">
        <Link
          href="/#insights"
          className="hv-link font-mono text-[11px] uppercase tracking-[0.18em] text-hazedim"
        >
          ← All insights
        </Link>

        <div className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]">
          <span style={{ color: a.accent }}>{a.tag}</span>
          <span className="text-hazedim/60">· {a.readMinutes} min read</span>
        </div>

        <h1 className="mt-4 text-[2.1rem] font-medium leading-[1.15] text-white sm:text-[2.7rem]">
          {a.title}
        </h1>
        <p className="mt-5 text-[17.5px] leading-8 text-haze">{a.dek}</p>

        <figure className="mt-10">
          <div
            className="overflow-hidden rounded-2xl border border-white/12"
            style={{ boxShadow: `0 40px 90px -40px ${a.accent}55` }}
          >
            <Image
              src={a.image}
              alt={a.imageAlt}
              width={1440}
              height={736}
              priority
              sizes="(max-width: 800px) 100vw, 760px"
              className="block h-auto w-full"
            />
          </div>
          <figcaption className="mt-3 text-[12.5px] leading-6 text-hazedim">
            {a.imageCaption}
          </figcaption>
        </figure>

        <div className="mt-4">
          {a.body.map((b, i) => (
            <Prose key={i} block={b} accent={a.accent} />
          ))}
        </div>

        {/* try it in the product */}
        <div className="mt-14 rounded-2xl border border-white/10 bg-panel/40 px-6 py-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-hazedim">
            See it on your own data
          </div>
          <p className="mt-2 text-[15px] leading-7 text-haze">
            Every number in this piece comes from the same engine that runs the product.
          </p>
          <Link
            href={a.tryIt.href}
            className="hv-btn mt-5 inline-block rounded-[12px] border px-5 py-2.5 font-mono text-[12px] uppercase tracking-widest"
            style={{ borderColor: `${a.accent}80`, background: `${a.accent}1a`, color: a.accent }}
          >
            {a.tryIt.label} →
          </Link>
        </div>

        {/* references */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-hazedim">
            References
          </h3>
          <ol className="mt-4 space-y-2.5">
            {a.references.map((r, i) => (
              <li key={i} className="text-[13.5px] leading-6 text-hazedim">
                {i + 1}. {r.text}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[12.5px] leading-6 text-hazedim/70">
            Educational research tool, not financial advice. AlphaForge grades strategies for
            honesty — it does not predict the future.
          </p>
        </div>

        {/* more reading */}
        <div className="mt-14 border-t border-white/10 pt-10">
          <h3 className="text-[1.2rem] font-medium text-white">Keep reading</h3>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {more.map((m) => (
              <Link
                key={m.slug}
                href={`/insights/${m.slug}`}
                className="hv group block overflow-hidden rounded-2xl border border-white/10 bg-panel/40 hover:border-white/25"
              >
                <div className="relative h-32 overflow-hidden border-b border-white/10">
                  <Image
                    src={m.image}
                    alt={m.imageAlt}
                    width={720}
                    height={368}
                    sizes="(max-width: 640px) 100vw, 360px"
                    className="h-full w-full object-cover object-left-top"
                  />
                </div>
                <div className="p-5">
                  <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: m.accent }}>
                    {m.tag} · {m.readMinutes} min
                  </div>
                  <div className="mt-2 text-[15px] font-semibold leading-snug text-white">
                    {m.title}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </article>

      <FooterFull />
    </main>
  );
}
