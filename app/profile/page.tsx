"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  balance_usdc: number;
  is_admin: boolean;
  email: string;
  wallet_address: string | null;
  created_at: string;
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

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
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
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    setSaveMsg(res.ok ? "Saved!" : data.error ?? "Failed to save.");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  const balance = Number(profile?.balance_usdc ?? 0);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav
        isAdmin={profile?.is_admin ?? false}
        profileLabel={profile?.username ? `@${profile.username}` : "Profile"}
      />

      <div className="gla-content">
        <div className="profile-identity">
          <p className="gla-page-title">
            {profile?.username ? `@${profile.username}` : "Your Profile"}
          </p>
          {profile?.username && (
            <p className="gla-page-sub">{profile.email}</p>
          )}
        </div>

        <div className="profile-grid">
          {/* Stats */}
          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-value">{totalScore.toFixed(1)}</span>
              <span className="profile-stat-label">Season Score</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{predictionsCount}</span>
              <span className="profile-stat-label">Races Predicted</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">${balance.toFixed(2)}</span>
              <span className="profile-stat-label">Balance</span>
            </div>
          </div>

          {/* Edit username */}
          <div className="profile-edit-card">
            <h3 className="profile-card-title">Change Username</h3>
            <form onSubmit={handleSave} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
              <input
                className="auth-input"
                style={{ flex: 1 }}
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={2}
                maxLength={30}
              />
              <button className="gla-race-btn" type="submit" disabled={saving}>
                {saving ? "..." : "Save"}
              </button>
            </form>
            {saveMsg && (
              <p style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: saveMsg === "Saved!" ? "#4caf50" : "var(--gl-red)" }}>
                {saveMsg}
              </p>
            )}
          </div>
        </div>

        {/* Wallet section — inline, no separate page needed */}
        <div className="profile-wallet-section">
          <h3 className="league-section-title">Wallet</h3>
          <div className="profile-wallet-card">
            <div className="profile-wallet-balance">
              <span className="profile-wallet-amount">${balance.toFixed(2)}</span>
              <span className="profile-wallet-currency">USDC</span>
            </div>
            <div className="profile-wallet-actions">
              <Link href="/wallet" className="gla-race-btn">
                Wallet Details
              </Link>
            </div>
          </div>
          {profile?.wallet_address && (
            <p className="profile-wallet-address">
              Wallet: {profile.wallet_address.slice(0, 6)}...{profile.wallet_address.slice(-4)}
            </p>
          )}
        </div>

        {/* Race scores history */}
        {raceScores.length > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <h3 className="league-section-title">Race History</h3>
            <div className="lb-table">
              <div className="lb-header" style={{ gridTemplateColumns: "1fr 120px 100px" }}>
                <span>Race</span>
                <span>Score</span>
                <span>Date</span>
              </div>
              {raceScores.map((rs) => {
                const raceData = races.find((r) => r.id === rs.race_id);
                return (
                  <Link key={rs.race_id} href={`/scores/${rs.race_id}`} className="lb-row" style={{ gridTemplateColumns: "1fr 120px 100px", textDecoration: "none", display: "grid", cursor: "pointer" }}>
                    <span className="lb-name">{raceData?.name ?? rs.race_id}</span>
                    <span className="lb-score">{Number(rs.total_score).toFixed(1)}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
                      {new Date(rs.calculated_at).toLocaleDateString()}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
