import { useState, type FormEvent } from "react";
import { HiOutlineLockClosed, HiOutlineUser } from "react-icons/hi2";
import { supabase } from "./lib/supabase";

type AuthPanelProps = {
  mode: "sign-in" | "set-password";
  inviteToken?: string | null;
  onComplete?: () => Promise<void>;
};

const LIVE_FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_URL ||
    "https://fnyshqcxndhevdkglvpo.supabase.co") + "/functions/v1/complete-invite";
const LIVE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueXNocWN4bmRoZXZka2dsdnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODE2ODksImV4cCI6MjEwOTU1NzY4OX0.NZj9BmWV1LIlO4k2hGQg15a0_6HwnAijHBvpj2B2LTU";

function AuthPanel({ mode, inviteToken = null, onComplete }: AuthPanelProps) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const isSetup = mode === "set-password";
  const isInviteSetup = Boolean(inviteToken);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Supabase URL and publishable key are not configured.");
      return;
    }
    if (isSetup && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      if (isInviteSetup && inviteToken) {
        const response = await fetch(LIVE_FUNCTIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: LIVE_ANON_KEY,
          },
          body: JSON.stringify({ token: inviteToken, password }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          email?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Could not create your password");
        }
        if (!result.email) {
          throw new Error("Invite completed, but email was missing");
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email,
          password,
        });
        if (signInError) throw signInError;
        window.history.replaceState(null, "", window.location.pathname);
        await onComplete?.();
      } else if (isSetup) {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) throw updateError;
        await onComplete?.();
      } else {
        const loginName = identity.trim();
        const email =
          loginName.toLowerCase() === "admin"
            ? import.meta.env.VITE_ADMIN_EMAIL
            : loginName;
        if (!email) {
          throw new Error("Set ADMIN_EMAIL in .env to enable the Admin username.");
        }
        const redirectTo =
          import.meta.env.VITE_APP_URL ||
          "https://task-management-system-4xj4.vercel.app/";
        if (creatingAccount) {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectTo },
          });
          if (signUpError) throw signUpError;
          const { error: signInAfterSignUpError } =
            await supabase.auth.signInWithPassword({ email, password });
          if (signInAfterSignUpError) {
            throw new Error(
              "Account created. Confirm the email if asked, then sign in on the live site."
            );
          }
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) throw signInError;
        }
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell grid min-h-screen place-items-center px-5 py-6">
      <section className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">
            TF
          </div>
          <div>
            <p className="font-bold text-slate-950">TaskFlow</p>
            <p className="text-xs text-slate-500">Team workspace</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              {isSetup ? "Account invitation" : "Secure sign in"}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {isSetup ? "Create your password" : "Welcome to TaskFlow"}
            </h1>
            <p className="mt-2 text-sm leading-5 text-slate-500">
              {isSetup
                ? "Set a private password to finish joining your team workspace."
                : "Manage your work and progress."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-2">
            {!isSetup && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Username or email
                </span>
                <span className="relative block">
                  <HiOutlineUser className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoComplete="username"
                    value={identity}
                    onChange={(event) => setIdentity(event.target.value)}
                    placeholder="Admin or name@company.com"
                    required
                    className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                  />
                </span>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                {isSetup ? "New password" : "Password"}
              </span>
              <span className="relative block">
                <HiOutlineLockClosed className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                />
              </span>
            </label>
            {isSetup && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Confirm password
                </span>
                <input
                  autoComplete="new-password"
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
            >
              {busy
                ? "Please wait..."
                : isSetup
                  ? "Set password and continue"
                  : creatingAccount
                    ? "Create account"
                    : "Sign in"}
            </button>
            {!isSetup && (
              <button
                type="button"
                onClick={() => {
                  setCreatingAccount((current) => !current);
                  setError("");
                }}
                className="w-full pt-1 text-sm font-medium text-slate-500 hover:text-emerald-700"
              >
                {creatingAccount
                  ? "Already have an account? Sign in"
                  : "New workspace? Create the admin account"}
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}

export default AuthPanel;
