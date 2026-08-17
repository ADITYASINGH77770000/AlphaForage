"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Robot } from "../guide/Robot";
import { useAuth } from "./AuthProvider";

/**
 * Gate for the portal. Wraps the module pages: signed-out visitors are sent to
 * /login and returned to where they were headed once they're in.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink">
        <div className="flex flex-col items-center gap-4">
          <Robot size={64} mood="thinking" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-hazedim">
            {loading ? "checking your session…" : "redirecting to sign in…"}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
