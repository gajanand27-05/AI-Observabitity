"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { backendFetch } from "@/lib/backend";

type Run = {
  run_id: string;
  question_id: string;
  category: string;
  expected_behavior: "answer" | "refuse";
  question: string;
  model: string;
  embedder: string;
  answer: string;
  error: string | null;
};
type Feedback = { run_id: string; stars: number; thumbs: string };

// Stable shuffle: same seed -> same order. Lets refresh keep position.
function shuffleStable<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const rng = () => {
    h = (h * 1103515245 + 12345) | 0;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function RatePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qid, setQid] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [r, f] = await Promise.all([
          backendFetch("/admin/bakeoff/runs"),
          backendFetch("/admin/bakeoff/feedback"),
        ]);
        if (!r.ok) throw new Error(`runs ${r.status}`);
        if (!f.ok) throw new Error(`feedback ${f.status}`);
        setRuns(((await r.json()).rows ?? []) as Run[]);
        setFeedback(((await f.json()).rows ?? []) as Feedback[]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const questions = useMemo(() => {
    const seen = new Set<string>();
    const out: Run[] = [];
    for (const r of runs) {
      if (!seen.has(r.question_id)) {
        seen.add(r.question_id);
        out.push(r);
      }
    }
    out.sort((a, b) => a.question_id.localeCompare(b.question_id));
    return out;
  }, [runs]);

  useEffect(() => {
    if (!qid && questions.length) setQid(questions[0].question_id);
  }, [qid, questions]);

  const selected = useMemo(() => {
    if (!qid) return [];
    return shuffleStable(
      runs.filter((r) => r.question_id === qid && !r.error),
      qid,
    );
  }, [qid, runs]);

  const fbCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of feedback) m[f.run_id] = (m[f.run_id] ?? 0) + 1;
    return m;
  }, [feedback]);

  if (loading) return <main className="p-12 text-sm text-gray-500">Loading…</main>;
  if (error)
    return (
      <main className="p-12">
        <div className="rounded bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      </main>
    );
  if (!questions.length)
    return <main className="p-12 text-sm text-gray-500">No runs to rate yet.</main>;

  const currentQ = questions.find((q) => q.question_id === qid);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Rate (blind)</h1>
        <Link href="/admin/bakeoff" className="text-sm text-gray-500 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <select
          className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm flex-1"
          value={qid ?? ""}
          onChange={(e) => {
            setQid(e.target.value);
            setRevealed(false);
          }}
        >
          {questions.map((q) => (
            <option key={q.question_id} value={q.question_id}>
              {q.question_id} [{q.category}] {q.question.slice(0, 80)}
            </option>
          ))}
        </select>
        <button
          onClick={() => setRevealed((v) => !v)}
          className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-xs"
        >
          {revealed ? "Hide models" : "Reveal models"}
        </button>
      </div>

      {currentQ && (
        <div className="rounded border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-500">
            {currentQ.category} · expected: {currentQ.expected_behavior}
          </p>
          <p className="mt-1 font-medium">{currentQ.question}</p>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {selected.length} answers (shuffled). Use stars (1–5) and thumbs.
      </p>

      <div className="space-y-3">
        {selected.map((r, i) => (
          <RateCard
            key={r.run_id}
            run={r}
            label={String.fromCharCode(65 + i)}
            revealed={revealed}
            ratedCount={fbCounts[r.run_id] ?? 0}
            onSaved={() => setFeedback((cur) => [...cur, { run_id: r.run_id, stars: 0, thumbs: "" }])}
          />
        ))}
      </div>
    </main>
  );
}

function RateCard({
  run, label, revealed, ratedCount, onSaved,
}: {
  run: Run;
  label: string;
  revealed: boolean;
  ratedCount: number;
  onSaved: () => void;
}) {
  const [stars, setStars] = useState<number>(0);
  const [thumbs, setThumbs] = useState<"up" | "down" | "skip" | "">("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(s: number, t: "up" | "down" | "skip") {
    setSaving(true);
    setErr(null);
    try {
      const r = await backendFetch("/admin/bakeoff/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: run.run_id, stars: s, thumbs: t }),
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      setSaved(true);
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-medium">[{label}]</span>
          {revealed && (
            <span className="text-xs text-gray-500 font-mono">
              {run.model} / {run.embedder}
            </span>
          )}
          {ratedCount > 0 && (
            <span className="text-xs text-amber-600">already rated {ratedCount}×</span>
          )}
        </div>
      </div>
      <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
        {run.answer}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => {
                setStars(s);
                if (thumbs) submit(s, thumbs as "up" | "down" | "skip");
              }}
              disabled={saving}
              className={`px-2 py-1 rounded text-sm ${
                stars >= s ? "text-amber-500" : "text-gray-300 dark:text-gray-700"
              }`}
              title={`${s} star`}
            >
              ★
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(["up", "down", "skip"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setThumbs(t);
                if (stars > 0 || t === "skip") submit(stars || 1, t);
              }}
              disabled={saving}
              className={`px-2 py-1 rounded text-xs border ${
                thumbs === t
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-gray-300 dark:border-gray-700"
              }`}
            >
              {t === "up" ? "👍" : t === "down" ? "👎" : "skip"}
            </button>
          ))}
        </div>
        {saved && <span className="text-xs text-green-600">saved</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
