import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Addtask from "./Addtask";
import AuthPanel from "./AuthPanel";
import { supabase } from "./lib/supabase";
import { loadProfile, touchActivity } from "./lib/workspace";
import type { UserProfile } from "./types";
import "./App.css";

const readInviteToken = () => {
  const fromQuery = new URLSearchParams(window.location.search).get("invite");
  if (fromQuery) return fromQuery;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return new URLSearchParams(hash).get("invite");
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    readInviteToken()
  );
  const [passwordSetup, setPasswordSetup] = useState(() =>
    Boolean(readInviteToken()) ||
    /type=(invite|recovery|signup)/i.test(
      `${window.location.hash}${window.location.search}`
    )
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
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (
        event === "PASSWORD_RECOVERY" ||
        (event === "SIGNED_IN" &&
          /type=(invite|recovery|signup)/i.test(
            `${window.location.hash}${window.location.search}`
          ))
      ) {
        setPasswordSetup(true);
      }
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
    const loadCurrentProfile = async () => {
      try {
        const result = await loadProfile();
        if (!cancelled) setProfile(result);
      } catch (error) {
        if (!cancelled) {
          setProfileError(
            error instanceof Error ? error.message : "Could not load profile"
          );
        }
      }
    };

    void loadCurrentProfile();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const ping = () => void touchActivity();
    ping();
    const interval = window.setInterval(ping, 30000);
    return () => window.clearInterval(interval);
  }, [session]);

  const finishPasswordSetup = async () => {
    setPasswordSetup(false);
    setInviteToken(null);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search.replace(/[?&]invite=[^&]+/, "").replace(/^&/, "?")
    );
    if (!session) {
      const latest = await supabase?.auth.getSession();
      if (latest?.data.session) setSession(latest.data.session);
      return;
    }
    setProfile(await loadProfile());
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (checkingSession) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Connecting to workspace...
      </div>
    );
  }

  if ((passwordSetup || inviteToken) && (session || inviteToken)) {
    return (
      <AuthPanel
        mode="set-password"
        inviteToken={inviteToken}
        onComplete={finishPasswordSetup}
      />
    );
  }

  if (!session) return <AuthPanel mode="sign-in" />;

  if (profileError) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            Account setup incomplete
          </h1>
          <p className="mt-2 text-sm text-slate-600">{profileError}</p>
          <button
            onClick={signOut}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading your workspace...
      </div>
    );
  }

  return (
    <Addtask
      profile={profile}
      accessToken={session.access_token}
      onSignOut={signOut}
    />
  );
}

export default App;
