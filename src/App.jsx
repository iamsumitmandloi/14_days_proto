import { useState, useEffect, useCallback } from "react";

// ─── CONFIG — set these in your .env file ───────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = "stability_logs";
// ────────────────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

const calcScore = ({ pushupsDone, deepWorkDone, stepsCount, cigarettesCount }) =>
  (pushupsDone ? 1 : 0) +
  (deepWorkDone ? 1 : 0) +
  (stepsCount >= 15000 ? 1 : 0) +
  (cigarettesCount <= 3 ? 1 : 0);

const headers = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Prefer: "return=representation",
};

async function fetchLogs() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?order=date.desc&limit=14`,
    { headers }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function upsertLog(entry) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const EMPTY = { pushupsDone: false, deepWorkDone: false, stepsCount: 0, cigarettesCount: 0 };

export default function App() {
  const [form, setForm] = useState(EMPTY);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const score = calcScore(form);
  const totalScore = logs.reduce((s, l) => s + (l.score ?? 0), 0);
  const isConfigured = SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_PROJECT");

  const load = useCallback(async () => {
    if (!isConfigured) { setLoading(false); return; }
    try {
      const data = await fetchLogs();
      setLogs(data);
      const todayEntry = data.find(l => l.date === today());
      if (todayEntry) {
        setForm({
          pushupsDone: todayEntry.pushups_done,
          deepWorkDone: todayEntry.deep_work_done,
          stepsCount: todayEntry.steps_count,
          cigarettesCount: todayEntry.cigarettes_count,
        });
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [isConfigured]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const entry = {
        date: today(),
        pushups_done: form.pushupsDone,
        deep_work_done: form.deepWorkDone,
        steps_count: form.stepsCount,
        cigarettes_count: form.cigarettesCount,
        score,
      };
      await upsertLog(entry);
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui,sans-serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>14-Day Stability Tracker</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>{today()}</p>

      {!isConfigured && (
        <div style={styles.banner("#fff3cd", "#856404")}>
          ⚠️ <strong>Setup required.</strong> Replace <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> at the top of the file, then create the table below.
          <pre style={{ marginTop: 8, fontSize: 11, background: "#f8f0d0", padding: 8, borderRadius: 4, overflowX: "auto" }}>{SQL_SETUP}</pre>
        </div>
      )}

      {error && <div style={styles.banner("#fde8e8", "#c0392b")}>❌ {error}</div>}

      {/* Today Card */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Today</h2>

        <Toggle label="Pushups Done" value={form.pushupsDone} onChange={v => set("pushupsDone", v)} />
        <Toggle label="Deep Work Done" value={form.deepWorkDone} onChange={v => set("deepWorkDone", v)} />

        <NumberField label="Steps" value={form.stepsCount} onChange={v => set("stepsCount", v)}
          hint={form.stepsCount >= 15000 ? "✓ Goal reached" : `${(15000 - form.stepsCount).toLocaleString()} to goal`} />
        <NumberField label="Cigarettes" value={form.cigarettesCount} onChange={v => set("cigarettesCount", v)}
          hint={form.cigarettesCount <= 3 ? "✓ Within limit" : `${form.cigarettesCount - 3} over limit`} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <ScoreBadge score={score} max={4} size="lg" />
          <button
            onClick={save}
            disabled={saving || !isConfigured}
            style={styles.btn(saving || !isConfigured)}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* 14-Day Progress */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={styles.cardTitle}>14-Day Progress</h2>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>{totalScore} / {logs.length * 4} pts</span>
        </div>

        <ProgressBar value={totalScore} max={56} />

        {loading ? (
          <p style={{ textAlign: "center", color: "#999", fontSize: 13, marginTop: 16 }}>Loading…</p>
        ) : logs.length === 0 ? (
          <p style={{ textAlign: "center", color: "#999", fontSize: 13, marginTop: 16 }}>No entries yet. Save your first day!</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {logs.map(l => (
              <LogRow key={l.date} log={l} isToday={l.date === today()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
          background: value ? "#2563eb" : "#d1d5db", position: "relative", transition: "background .2s"
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s"
        }} />
      </button>
    </div>
  );
}

function NumberField({ label, value, onChange, hint }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        <input
          type="number" min={0} value={value}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          style={{ width: 80, padding: "4px 8px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, textAlign: "right" }}
        />
      </div>
      {hint && <div style={{ fontSize: 11, color: hint.startsWith("✓") ? "#16a34a" : "#dc2626", marginTop: 2, textAlign: "right" }}>{hint}</div>}
    </div>
  );
}

function ScoreBadge({ score, max, size = "sm" }) {
  const color = score === max ? "#16a34a" : score >= max / 2 ? "#2563eb" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
      <span style={{ fontSize: size === "lg" ? 32 : 18, fontWeight: 700, color }}>{score}</span>
      <span style={{ fontSize: size === "lg" ? 16 : 12, color: "#999" }}>/{max}</span>
    </div>
  );
}

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div style={{ background: "#e5e7eb", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb", borderRadius: 6, transition: "width .4s" }} />
      </div>
      <div style={{ fontSize: 11, color: "#999", textAlign: "right", marginTop: 2 }}>{pct}%</div>
    </div>
  );
}

function LogRow({ log, isToday }) {
  const icons = [
    log.pushups_done && "💪",
    log.deep_work_done && "🧠",
    log.steps_count >= 15000 && "👟",
    log.cigarettes_count <= 3 && "🚭",
  ].filter(Boolean);

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: "1px solid #f0f0f0",
      background: isToday ? "#f0f6ff" : "transparent",
      borderRadius: isToday ? 4 : 0, paddingLeft: isToday ? 6 : 0
    }}>
      <div>
        <span style={{ fontSize: 13, fontWeight: isToday ? 600 : 400 }}>
          {isToday ? "Today" : log.date}
        </span>
        <span style={{ fontSize: 12, marginLeft: 6 }}>{icons.join(" ")}</span>
      </div>
      <ScoreBadge score={log.score ?? 0} max={4} />
    </div>
  );
}

const styles = {
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, marginTop: 0 },
  btn: (disabled) => ({
    background: disabled ? "#d1d5db" : "#2563eb", color: "#fff",
    border: "none", borderRadius: 8, padding: "10px 24px",
    fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer"
  }),
  banner: (bg, color) => ({
    background: bg, color, border: `1px solid ${color}33`,
    borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16
  }),
};

const SQL_SETUP = `create table stability_logs (
  date text primary key,
  pushups_done boolean default false,
  deep_work_done boolean default false,
  steps_count integer default 0,
  cigarettes_count integer default 0,
  score integer default 0
);
-- Disable RLS for personal use:
alter table stability_logs disable row level security;`;
