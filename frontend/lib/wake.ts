/* ──────────────────────────────────────────────────────────────────────────
   Waits for a sleeping backend before anything is sent to it.

   Free container hosts suspend an idle service, and bringing it back has been
   measured at 63 to 103 seconds. Until then the proxy in front of it either
   holds the request open, leaving a blank page, or answers 502/503/504.

   Retrying failed requests would be the wrong cure here:
     • The API's own 500s and its deliberate 503 (machine-learning tier not
       installed) are real answers that must reach the user unchanged.
     • A backtest the proxy gave up on is usually still computing. Sending it
       again stacks a second copy on a very small instance.

   So nothing is ever retried. One cheap GET is repeated until the service
   answers; real requests wait behind it and are then sent exactly once.
   ────────────────────────────────────────────────────────────────────────── */

const PROBE = "/api/config";

/** Patience for one wake-up: comfortably past the slowest measured cold start. */
const BUDGET_MS = 180_000;
/** One probe's deadline. Long, because the proxy may hold a healthy wake-up open. */
const ATTEMPT_MS = 120_000;
const GAP_MS = 2_500;
/** Stay quiet for a warm server: only explain the wait once it is noticeable. */
const NOTICE_AFTER_MS = 2_500;
/** Well inside the host's 15-minute idle window. */
const TRUST_MS = 5 * 60_000;

/** Statuses a proxy uses for "the service did not answer". */
const GATEWAY = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

export const SERVICE_DOWN =
  "The AlphaForge service didn't answer. It may be restarting — give it a moment and try again.";

export class ApiUnreachableError extends Error {
  constructor(message = SERVICE_DOWN) {
    super(message);
    this.name = "ApiUnreachableError";
  }
}

export const isUnreachable = (e: unknown): e is ApiUnreachableError =>
  (e as Error)?.name === "ApiUnreachableError";

/**
 * True when a proxy produced this response rather than the service. FastAPI
 * always replies in JSON, which is what separates its deliberate 503 from a
 * gateway's HTML page.
 */
export const isGatewayFailure = (res: Response): boolean =>
  GATEWAY.has(res.status) &&
  !(res.headers.get("content-type") ?? "").includes("application/json");

/* ── shared state ───────────────────────────────────────────────────────── */

let trustedUntil = 0;
let pending: Promise<void> | null = null;
let waking = false;
const listeners = new Set<() => void>();

function setWaking(next: boolean) {
  if (next === waking) return;
  waking = next;
  listeners.forEach((fn) => fn());
}

/** useSyncExternalStore pair, for the notice that explains the wait. */
export const isWaking = () => waking;
export function subscribeWaking(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Records what a real response says about the service's health. */
export function noteResponse(res: Response) {
  trustedUntil = isGatewayFailure(res) ? 0 : Date.now() + TRUST_MS;
}

/** The request never completed: wait for the service again next time. */
export function noteFailure() {
  trustedUntil = 0;
}

/* ── the wait itself ────────────────────────────────────────────────────── */

const abortError = () => new DOMException("Aborted", "AbortError");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeOnce(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_MS);
  try {
    const res = await fetch(PROBE, { signal: ctrl.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;   // network error, or the proxy hung past the deadline
  } finally {
    clearTimeout(timer);
  }
}

async function wake(): Promise<void> {
  const deadline = Date.now() + BUDGET_MS;
  const notice = setTimeout(() => setWaking(true), NOTICE_AFTER_MS);
  try {
    while (Date.now() < deadline) {
      if (await probeOnce()) {
        trustedUntil = Date.now() + TRUST_MS;
        return;
      }
      await pause(GAP_MS);
    }
    throw new ApiUnreachableError(
      "The AlphaForge service is taking longer than usual to start. Please try again in a minute."
    );
  } finally {
    clearTimeout(notice);
    setWaking(false);
  }
}

/**
 * Resolves once the service is known to be up. Every caller shares one wake-up,
 * and cancelling one caller's wait leaves the others undisturbed.
 */
export function ensureAwake(signal?: AbortSignal): Promise<void> {
  if (Date.now() < trustedUntil) return Promise.resolve();
  pending ??= wake().finally(() => { pending = null; });
  if (!signal) return pending;

  const shared = pending;
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
