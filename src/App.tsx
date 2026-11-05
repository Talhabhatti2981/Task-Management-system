import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Addtask from "./Addtask";
import AuthPanel from "./AuthPanel";
import { supabase } from "./lib/supabase";
import type { UserProfile } from "./types";
import "./App.css";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [passwordSetup, setPasswordSetup] = useState(() =>
    /type=(invite|recovery)/.test(window.location.hash)
  );

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(null);
      setProfileError("");
      setCheckingSession(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/profile", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = (await response.json()) as UserProfile & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load profile");
        if (!cancelled) setProfile(result);
      } catch (error) {
        if (!cancelled) {
          setProfileError(error instanceof Error ? error.message : "Could not load profile");
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const ping = () =>
      void fetch("/api/activity", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    ping();
    const interval = window.setInterval(ping, 30000);
    return () => window.clearInterval(interval);
  }, [session]);

  const finishPasswordSetup = async () => {
    setPasswordSetup(false);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!session) return;
    const response = await fetch("/api/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = (await response.json()) as UserProfile & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not load profile");
    setProfile(result);
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (checkingSession) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Connecting to workspace...</div>;
  }

  if (passwordSetup && session) {
    return <AuthPanel mode="set-password" onComplete={finishPasswordSetup} />;
  }

  if (!session) return <AuthPanel mode="sign-in" />;

  if (profileError) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Account setup incomplete</h1>
          <p className="mt-2 text-sm text-slate-600">{profileError}</p>
          <button onClick={signOut} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign out</button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading your workspace...</div>;
  }

  return <Addtask profile={profile} accessToken={session.access_token} onSignOut={signOut} />;
}

export default App
