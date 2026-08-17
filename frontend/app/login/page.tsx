import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = {
  title: "Sign in — AlphaForge",
  description: "Sign in to your AlphaForge portal.",
};

/* Auth screens are deliberately bare: no nav, no branding, no guide bot.
   The product chrome only appears once you're through the door. */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 py-16">
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
