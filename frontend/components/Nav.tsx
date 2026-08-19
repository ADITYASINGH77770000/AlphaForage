"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating away must close the sheet, or it covers the page you asked for.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className="fixed inset-x-0 top-0 z-40 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-4 sm:px-10">
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

        <div className="flex items-center gap-2 sm:gap-3">
          <DataModeBadge />
          <AccountMenu />
          {/* Below lg the links above are hidden, so without this the Features
              and About pages are unreachable on a phone entirely. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/12 text-haze hover:border-forge-cyan hover:text-forge-cyan lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open
                ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
                : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="lg:hidden">
          {/* Tapping anywhere outside closes, which is what a phone user expects
              far more than hunting for the X. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 -z-10 h-screen w-screen cursor-default bg-ink/60"
          />
          <div className="mx-4 mb-4 rounded-[14px] border border-white/12 bg-panel/95 p-2 shadow-2xl backdrop-blur-xl">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`block rounded-[10px] px-4 py-3 font-mono text-[13px] uppercase tracking-widest transition-colors ${
                  pathname === l.href
                    ? "bg-white/[0.06] text-forge-cyan"
                    : "text-haze hover:bg-white/[0.04] hover:text-forge-cyan"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
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
      className="inline-flex items-center gap-1.5 rounded-full border border-forge-gold/40 bg-forge-gold/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-forge-gold sm:px-3"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-forge-gold" />
      {/* Phones get the short label so the bar still fits at 360px wide. */}
      <span className="sm:hidden">Demo</span>
      <span className="hidden sm:inline">Demo data</span>
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
