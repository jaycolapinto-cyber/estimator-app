import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export default function AuthPage() {
  const [email, setEmail] = useState("jaycolapinto@gmail.com");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const origin = useMemo(() => {
    return typeof window !== "undefined" ? window.location.origin : "";
  }, []);

  const normalizeEmail = (v: string) => v.trim().toLowerCase();

  const onLogin = async () => {
    setMsg(null);
    const e = normalizeEmail(email);
    if (!e.includes("@")) return setMsg("Please enter a valid email.");
    if (!password) return setMsg("Please enter your password.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });
      if (error) throw error;
      // App.tsx will render the app once session exists
    } catch (err: any) {
      setMsg(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async () => {
    setMsg(null);
    const e = normalizeEmail(email);
    if (!e.includes("@")) return setMsg("Please enter a valid email.");
    if (!password || password.length < 8)
      return setMsg("Password must be at least 8 characters.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          // not used for password login, but harmless and useful if you ever enable email confirmations
          emailRedirectTo: origin,
        },
      });
      if (error) throw error;

      setMsg(
        "✅ Account created. If email confirmation is ON in Supabase, check your inbox; otherwise you can log in now."
      );
    } catch (err: any) {
      setMsg(err?.message || "Sign up failed.");
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    setMsg(null);
    const e = normalizeEmail(email);
    if (!e.includes("@")) return setMsg("Please enter a valid email.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: origin,
      });
      if (error) throw error;
      setMsg("✅ Password reset email sent.");
    } catch (err: any) {
      setMsg(err?.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onLogin();
  };

  return (
    <div style={styles.page}>
      {/* Left marketing panel */}
      <div style={styles.left}>
        <div style={styles.brandRow}>
          <div style={styles.brandDot}>DU</div>
          <div style={styles.brandName}>Deck Estimator</div>
        </div>

        <div style={{ marginTop: 90 }}>
          <div style={styles.bigIcon}>🌳</div>
          <div style={styles.heroTitle}>Build better proposals.</div>
          <div style={styles.heroTitle2}>Close more decks.</div>
          <div style={styles.heroSub}>
            Create estimates, generate proposals, and track jobs — all in one
            place.
          </div>
        </div>

        <div style={styles.footerLinks}>
          <span style={{ opacity: 0.75 }}>Terms</span>
          <span style={styles.dotSep}>•</span>
          <span style={{ opacity: 0.75 }}>Privacy</span>
        </div>
      </div>

      {/* Right login card */}
      <div style={styles.right}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Log In</div>
          <div style={styles.cardSubtitle}>
            New to Deck Estimator? <span style={styles.link}>Contact us</span>.
          </div>

          <div style={{ height: 18 }} />

          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            onKeyDown={onKeyDown}
            disabled={loading}
          />

          <div style={{ height: 14 }} />

          <label style={styles.label}>Password</label>
          <div style={styles.passwordRow}>
            <input
              style={{ ...styles.input, margin: 0, flex: 1 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              onKeyDown={onKeyDown}
              disabled={loading}
            />
            <div style={{ width: 12 }} />
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={showPw}
                onChange={(e) => setShowPw(e.target.checked)}
                disabled={loading}
              />
              <span style={{ fontSize: 12, opacity: 0.75 }}>Show</span>
            </label>
          </div>

          <div style={{ height: 12 }} />

          <div style={styles.rowBetween}>
            <span />
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={loading}
              style={styles.linkBtn}
            >
              Forgot password?
            </button>
          </div>

          <div style={{ height: 14 }} />

          <button
            style={styles.primaryBtn}
            onClick={onLogin}
            disabled={loading}
          >
            {loading ? "Working…" : "Log In"}
          </button>

          <button
            style={styles.secondaryBtn}
            onClick={onSignUp}
            disabled={loading}
          >
            {loading ? "Working…" : "Create account"}
          </button>

          <div style={{ height: 12 }} />

          {msg && <div style={styles.msg}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "1.1fr 1fr",
    background: "#0b1020",
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
  },
  left: {
    padding: 40,
    color: "white",
    background:
      "radial-gradient(1200px 700px at 20% 20%, rgba(75,93,255,0.35), rgba(11,16,32,0.95))",
    position: "relative",
    overflow: "hidden",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 10 },
  brandDot: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    fontWeight: 900,
    letterSpacing: 0.5,
  },
  brandName: { fontSize: 18, fontWeight: 800, opacity: 0.95 },
  bigIcon: { fontSize: 44, marginBottom: 18, opacity: 0.95 },
  heroTitle: { fontSize: 44, fontWeight: 900, lineHeight: 1.05 },
  heroTitle2: { fontSize: 44, fontWeight: 900, lineHeight: 1.05, opacity: 0.92 },
  heroSub: { marginTop: 16, maxWidth: 520, fontSize: 14, opacity: 0.8 },
  footerLinks: {
    position: "absolute",
    bottom: 22,
    left: 40,
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
  },
  dotSep: { opacity: 0.35 },

  right: {
    background:
      "radial-gradient(900px 600px at 80% 10%, rgba(75,93,255,0.22), rgba(11,16,32,1))",
    display: "grid",
    placeItems: "center",
    padding: 24,
  },
  card: {
    width: "min(440px, 92vw)",
    background: "white",
    borderRadius: 18,
    padding: 28,
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
  },
  cardTitle: { fontSize: 26, fontWeight: 900, textAlign: "center" },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 13,
    opacity: 0.75,
    textAlign: "center",
  },
  label: { fontSize: 12, fontWeight: 700, opacity: 0.75 },
  input: {
    width: "100%",
    marginTop: 6,
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid rgba(20,20,40,0.18)",
    outline: "none",
    fontSize: 14,
  },
  passwordRow: { display: "flex", alignItems: "center", marginTop: 6 },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8 },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  link: { color: "#3b5cff", fontWeight: 700, cursor: "pointer" },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#3b5cff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#3b5cff",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
  },
  secondaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(20,20,40,0.16)",
    background: "white",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    marginTop: 10,
  },
  msg: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.85,
    background: "rgba(59,92,255,0.08)",
    border: "1px solid rgba(59,92,255,0.22)",
    padding: "10px 10px",
    borderRadius: 10,
  },
};
