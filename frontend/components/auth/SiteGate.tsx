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
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const open = isPublic(pathname);

  useEffect(() => {
    if (open || loading || user) return;
    // Remember where they were headed, except for "/" — that is the default
    // landing spot anyway, and a redundant ?next= just uglifies the URL.
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    router.replace(`/login${next}`);
  }, [open, loading, user, router, pathname]);

  if (open) return <>{children}</>;

  // Session check in flight. Deliberately blank rather than branded: the home
  // page plays the logo loader the moment it mounts, and a second splash
  // competing with it would step on that.
  if (loading) return <div className="min-h-screen bg-ink" />;

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
