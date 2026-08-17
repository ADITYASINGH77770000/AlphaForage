"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Robot } from "../guide/Robot";
import { useAuth } from "./AuthProvider";

/** Shared sign-up / sign-in form. `mode` picks which one. */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const { user, loading, signup, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Default landing spot is the home page — the branded loader plays, then the
  // landing page. Only a deep link that bounced through the gate (?next=…)
  // sends you straight into a module.
  const next = params.get("next") || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  // Someone already signed in has no business on the sign-in screen.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isSignup) await signup(name, email, password);
      else await login(email, password);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl border border-white/12 bg-panel/50 p-7 backdrop-blur"
        style={{ boxShadow: "0 40px 90px -40px rgba(11,224,255,0.35)" }}
      >
        <div className="flex items-center gap-3">
          <Robot size={44} mood="happy" />
          <div>
            <h1 className="text-[20px] font-semibold leading-tight text-white">
              {isSignup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-0.5 text-[13px] text-hazedim">
              {isSignup
                ? "Then I'll walk you through the whole platform."
                : "Sign in to open the portal."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4">
          {isSignup && (
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                placeholder="Aditya Singh"
                className="af-input"
              />
            </Field>
          )}

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="af-input"
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                minLength={isSignup ? 8 : undefined}
                placeholder={isSignup ? "At least 8 characters" : "••••••••"}
                className="af-input pr-16"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-hazedim hover:text-white"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </Field>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="hv-btn w-full rounded-[12px] border border-forge-green/60 bg-gradient-to-r from-forge-green to-forge-cyan py-2.5 font-mono text-[12px] uppercase tracking-widest text-ink disabled:opacity-60"
          >
            {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-hazedim">
          {isSignup ? "Already have an account? " : "New to AlphaForge? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="hv-link font-semibold text-forge-cyan"
          >
            {isSignup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </motion.div>

      <p className="mx-auto mt-5 max-w-[380px] text-center text-[11.5px] leading-5 text-hazedim/70">
        Accounts are stored locally by your own AlphaForge instance. Educational
        research tool — not financial advice.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-hazedim">
        {label}
      </span>
      {children}
    </label>
  );
}
