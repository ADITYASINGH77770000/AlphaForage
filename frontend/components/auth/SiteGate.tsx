"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Robot } from "../guide/Robot";
import { useAuth } from "./AuthProvider";

/* ──────────────────────────────────────────────────────────────────────────
   Whole-site gate.

   AlphaForge is a private portal: without a session there is nothing to see
   but the way back in. Signing out stops the site immediately rather than
   dropping you on a browsable landing page.

   `RequireAuth` still wraps the module pages. That is deliberate belt-and-
   braces — this gate is the one that decides, and the module guard is a
   second line if a route is ever mounted outside this layout.
   ────────────────────────────────────────────────────────────────────────── */

/** The only routes reachable signed out. */
const PUBLIC = ["/login", "/signup"];

function isPublic(path: string): boolean {
  return PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
}

export function SiteGate({ children }: { children: React.ReactNode }) {
  const { user, loading, offline, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const open = isPublic(pathname);

  useEffect(() => {
    if (open || loading || user || offline) return;
    // Remember where they were headed, except for "/" — that is the default
    // landing spot anyway, and a redundant ?next= just uglifies the URL.
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    router.replace(`/login${next}`);
  }, [open, loading, user, offline, router, pathname]);

  if (open) return <>{children}</>;

  // Session check in flight. Deliberately blank rather than branded: the home
  // page plays the logo loader the moment it mounts, and a second splash
  // competing with it would step on that.
  if (loading) return <div className="min-h-screen bg-ink" />;

  // Sending someone to sign in here would claim their session had ended, when
  // all that is known is that the question could not be asked.
  if (offline) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink px-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <Robot size={64} mood="thinking" />
          <h1 className="text-[17px] font-semibold text-white">The service isn&apos;t answering yet</h1>
          <p className="text-[13px] leading-6 text-hazedim">
            It sleeps when nobody has used it for a while and usually takes a minute or
            two to come back. This doesn&apos;t mean you&apos;ve been signed out.
          </p>
          <button
            type="button"
            onClick={retry}
            className="hv-btn rounded-[12px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan px-6 py-2.5 font-mono text-[12px] uppercase tracking-widest text-ink"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink">
        <div className="flex flex-col items-center gap-4">
          <Robot size={64} mood="thinking" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-hazedim">
            signed out — taking you to sign in…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
