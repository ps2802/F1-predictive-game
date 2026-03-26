"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";
import { AppNav } from "@/app/components/AppNav";

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  balance_usdc: number;
  is_admin: boolean;
  email: string;
  created_at: string;
  wallet_address: string | null;
};

type RaceScore = {
  race_id: string;
  total_score: number;
  calculated_at: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [raceScores, setRaceScores] = useState<RaceScore[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoadError("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const res = await fetch("/api/profile");
    if (res.ok) {
      const data = await res.json();
      setProfile(data.profile);
      setUsername(data.profile?.username ?? "");
      setRaceScores(data.raceScores ?? []);
      setTotalScore(data.totalScore ?? 0);
      setPredictionsCount(data.predictionsCount ?? 0);
    } else {
      setLoadError("Couldn't load your profile. Please try again.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || username.trim().length < 2) {
      setSaveMsg("Username must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setSaveMsg("");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    const data = await res.json();
    setSaveMsg(res.ok ? "Saved!" : data.error ?? "Failed to save.");
    if (res.ok && profile) {
      setProfile({ ...profile, username: username.trim() });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav profile={null} />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav profile={null} />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <h1 className="gla-page-title">Something went wrong</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>{loadError}</p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={() => { setLoading(true); load(); }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={profile} />

      <div className="gla-content" style={{ maxWidth: "720px" }}>
        <h1 className="gla-page-title">Profile</h1>
        <p className="gla-page-sub">Manage your identity and track your season</p>

        {/* Stats strip */}
        <div className="profile-stats-strip">
          <div className="profile-stat-block">
            <span className="profile-stat-num">{totalScore.toFixed(1)}</span>
            <span className="profile-stat-lbl">Season Score</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat-block">
            <span className="profile-stat-num">{predictionsCount}</span>
            <span className="profile-stat-lbl">Races Predicted</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat-block">
            <span className="profile-stat-num">₮{Number(profile?.balance_usdc ?? 0).toFixed(2)}</span>
            <span className="profile-stat-lbl">Test USDC · Beta</span>
          </div>
        </div>

        {/* Identity card */}
        <div className="profile-identity-card">
          <h3 className="profile-card-title">Identity</h3>

          {/* Username */}
          <div className="profile-field-group">
            <label className="profile-field-label">Username</label>
            <form onSubmit={handleSave} className="profile-field-row">
              <input
                className="auth-input"
                style={{ flex: 1 }}
                placeholder="Choose a username (required)"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setSaveMsg(""); }}
                minLength={2}
                maxLength={30}
              />
              <button className="gla-race-btn" type="submit" disabled={saving || !username.trim()}>
                {saving ? "…" : "Save"}
              </button>
            </form>
            {saveMsg && (
              <p className={`profile-save-msg${saveMsg === "Saved!" ? " is-ok" : " is-err"}`}>
                {saveMsg}
              </p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="profile-field-group">
            <label className="profile-field-label">Email</label>
            <div className="profile-field-static">
              <span>{profile?.email ?? "—"}</span>
              <span className="profile-field-note">Managed by your sign-in provider — cannot be changed here.</span>
            </div>
          </div>

          {/* Wallet address */}
          {profile?.wallet_address && (
            <div className="profile-field-group">
              <label className="profile-field-label">Wallet Address</label>
              <div className="profile-field-static profile-wallet-addr">
                <span className="profile-wallet-text">{profile.wallet_address}</span>
                <span className="profile-field-note">Embedded Solana wallet (Privy)</span>
              </div>
            </div>
          )}
        </div>

        {/* Race scores history */}
        <div style={{ marginTop: "2rem" }}>
          <h3 className="league-section-title">Race History</h3>
          {raceScores.length === 0 ? (
            <div className="lb-empty">
              <p className="lb-empty-headline">No predictions yet.</p>
              <p className="lb-empty-sub">Pick your first podium to start scoring points.</p>
              <Link href="/dashboard" className="gla-race-btn" style={{ display: "inline-block", marginTop: "1.25rem" }}>
                Make Predictions
              </Link>
            </div>
          ) : (
            <div className="lb-table">
              <div className="lb-header" style={{ gridTemplateColumns: "1fr 120px 100px" }}>
                <span>Race</span>
                <span>Score</span>
                <span>Date</span>
              </div>
              {raceScores.map((rs) => {
                const raceData = races.find((r) => r.id === rs.race_id);
                return (
                  <Link
                    key={rs.race_id}
                    href={`/scores/${rs.race_id}`}
                    className="lb-row"
                    style={{ gridTemplateColumns: "1fr 120px 100px", textDecoration: "none", display: "grid", cursor: "pointer" }}
                  >
                    <span className="lb-name">{raceData?.name ?? rs.race_id}</span>
                    <span className="lb-score">{Number(rs.total_score).toFixed(1)}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
                      {new Date(rs.calculated_at).toLocaleDateString()}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

