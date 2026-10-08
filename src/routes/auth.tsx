import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Peace Companion" },
      {
        name: "description",
        content:
          "Sign in to Peace Companion to keep your conversations, mood check-ins, and journal notes together in one calm place.",
      },
      { property: "og:title", content: "Sign in — Peace Companion" },
      {
        property: "og:description",
        content: "Create an account or sign in to continue your conversations with Peace Companion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Welcome. You're all set.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/dashboard" });
      else toast.info("Your account is ready. You can sign in with your email and password.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Reset link sent — check your email.");
      setForgotMode(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in didn't work. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-14">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 block text-center text-sm text-muted-foreground">
          ← Peace Companion
        </Link>
        <div className="rounded-3xl border border-border/70 bg-card p-7 shadow-sm">
          <h1 className="text-2xl">
            {forgotMode ? "Reset your password" : isSignUp ? "Create your space" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {forgotMode
              ? "Enter your email and we'll send you a reset link."
              : isSignUp
                ? "Your conversations and check-ins stay private to you."
                : "Pick up right where you left off."}
          </p>

          {forgotMode ? (
            <form onSubmit={handleResetRequest} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="resetEmail">Email</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full rounded-full" disabled={busy}>
                {busy ? "One moment…" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => setForgotMode(false)}
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isSignUp && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">What should we call you?</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex"
                  autoComplete="nickname"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>
            {!isSignUp && (
              <button
                type="button"
                onClick={() => setForgotMode(true)}
                className="w-full text-right text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            )}
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              {busy ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full rounded-full" onClick={handleGoogle}>
            Continue with Google
          </Button>

          <button
            type="button"
            onClick={() => setIsSignUp((v) => !v)}
            className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {isSignUp ? "I already have an account" : "I'm new here — create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
