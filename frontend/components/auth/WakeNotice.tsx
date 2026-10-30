"use client";

import { useSyncExternalStore } from "react";
import { isWaking, subscribeWaking } from "@/lib/wake";

/**
 * Says why nothing is happening while the backend starts up. It sits outside the
 * session gate because the first thing that waits is the session check itself.
 */
export function WakeNotice() {
  const waking = useSyncExternalStore(subscribeWaking, isWaking, () => false);
  if (!waking) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4"
    >
      <div className="flex max-w-md items-center gap-2.5 rounded-xl border border-forge-gold/30 bg-panel/95 px-4 py-2.5 text-[12.5px] leading-5 text-haze">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-forge-gold" />
        Waking the server — this can take up to two minutes after it has been idle.
      </div>
    </div>
  );
}
