"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./auth/AuthProvider";
import { api } from "@/lib/api";

function Emblem() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="afnav" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00f5a0" />
          <stop offset="55%" stopColor="#0be0ff" />
          <stop offset="100%" stopColor="#a55efd" />
        </linearGradient>
      </defs>
      <polygon points="32,3 55,16.5 55,43.5 32,57 9,43.5 9,16.5" fill="none" stroke="url(#afnav)" strokeWidth="2.6" />
      <path d="M18 46 L32 18 L46 46" fill="none" stroke="url(#afnav)" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="24" y1="37" x2="40" y2="37" stroke="url(#afnav)" strokeWidth="4.4" strokeLinecap="round" />
    </svg>
  );
}

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
];

export function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-4 backdrop-blur-sm sm:px-10">
      <Link href="/" className="hv-btn flex items-center gap-2.5">
        <Emblem />
        <span className="font-mono text-sm font-bold tracking-wide text-white">AlphaForge</span>
      </Link>

      <div className="hidden items-center gap-8 font-mono text-xs uppercase tracking-widest text-haze lg:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hv-link hover:text-forge-cyan">
            {l.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <DataModeBadge />
        <AccountMenu />
      </div>
    </nav>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Data-mode badge.

   A platform whose entire claim is that it tells you the truth cannot show
   synthetic prices without saying so. The engine, the maths and the honesty
   verdicts are real either way — it is only the price series that is
   generated — but the visitor has to be told which they are looking at, on
   every page, not just inside the three modules that happen to render a
   frame badge after you press Run.

   Renders nothing at all when the API is serving real market data.
   ────────────────────────────────────────────────────────────────────────── */
function DataModeBadge() {
  const [demo, setDemo] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    api.config()
      .then((c) => { if (alive) setDemo(c.demo_mode); })
      .catch(() => { if (alive) setDemo(null); });   // API down: say nothing
    return () => { alive = false; };
  }, []);

  if (!demo) return null;

  return (
    <span
      title="Prices are generated, not live market data. Every calculation, backtest and honesty verdict is real — only the price series is synthetic."
      className="hidden items-center gap-1.5 rounded-full border border-forge-gold/40 bg-forge-gold/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-forge-gold sm:inline-flex"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-forge-gold" />
      Demo data
    </span>
  );
}

/** Signed out → Sign in / Create account. Signed in → avatar menu with Log out. */
function AccountMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-[15px] bg-white/8" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2.5">
        <Link
          href="/login"
          className="hv-link hidden font-mono text-xs uppercase tracking-widest text-haze hover:text-forge-cyan sm:block"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="hv-btn rounded-[15px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-4 py-2 font-mono text-xs uppercase tracking-widest text-ink"
        >
          Get started
        </Link>
      </div>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="hv-btn flex items-center gap-2.5 rounded-[15px] border border-white/14 bg-white/[0.05] py-1.5 pl-1.5 pr-3"
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-full font-mono text-[11px] font-bold text-ink"
          style={{ background: "linear-gradient(135deg,#00f5a0,#0be0ff)" }}
        >
          {initials || "AF"}
        </span>
        <span className="hidden font-mono text-[11px] uppercase tracking-widest text-white sm:block">
          {user.name.split(/\s+/)[0]}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/12 bg-[#080d1a]/97 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
            <div className="truncate font-mono text-[11px] text-hazedim">{user.email}</div>
          </div>
          <Link
            href="/features#modules"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[13px] text-haze transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            My portal
          </Link>
          <button
            onClick={async () => {
              setOpen(false);
              await logout();   // navigates home itself, with a full page load
            }}
            className="block w-full px-4 py-2.5 text-left text-[13px] text-haze transition-colors hover:bg-white/[0.06] hover:text-red-300"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
