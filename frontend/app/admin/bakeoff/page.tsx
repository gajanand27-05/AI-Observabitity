"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { backendFetch } from "@/lib/backend";

type Run = {
  run_id: string;
  eval_set_version: string;
  question_id: string;
  category: string;
  expected_behavior: "answer" | "refuse";
  question: string;
  model: string;
  embedder: string;
  answer: string;
  latency_ms: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  error: string | null;
};
type Judge = {
  run_id: string;
  question_id: string;
  model: string;
  embedder: string;
  judge_model: string;
  groundedness: number;
  correctness: number;
  completeness: number;
  reasoning: string;
  error: string | null;
};
type Feedback = { run_id: string; stars: number; thumbs: string };
type Tab = "leaderboard" | "scatter" | "drilldown" | "disagreement";

const JUDGE_DISCLAIMER =
  "Judge model is part of the candidate pool — its own quality scores are tinted by self-preference bias.";

export default function BakeoffPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [judge, setJudge] = useState<Judge[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("leaderboard");

  useEffect(() => {
    (async () => {
      try {
        const [r, j, f] = await Promise.all([
          backendFetch("/admin/bakeoff/runs"),
          backendFetch("/admin/bakeoff/judge"),
          backendFetch("/admin/bakeoff/feedback"),
        ]);
        for (const [name, res] of [["runs", r], ["judge", j], ["feedback", f]] as const) {
          if (!res.ok) throw new Error(`/${name} ${res.status}: ${await res.text()}`);
        }
        setRuns(((await r.json()).rows ?? []) as Run[]);
        setJudge(((await j.json()).rows ?? []) as Judge[]);
        setFeedback(((await f.json()).rows ?? []) as Feedback[]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const board = useMemo(() => buildLeaderboard(runs, judge, feedback), [runs, judge, feedback]);
  const judgeModel = judge[0]?.judge_model;

  if (loading) return <main className="p-12 text-sm text-gray-500">Loading bake-off data...</main>;
  if (error)
    return (
      <main className="p-12">
        <div className="rounded bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Bake-off</h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">
            {runs.length} runs · {judge.length} judged · {feedback.length} ratings
          </span>
          <Link
            href="/admin/bakeoff/rate"
            className="rounded bg-black text-white px-3 py-1.5 text-xs hover:bg-gray-800"
          >
            Rate answers →
          </Link>
        </div>
      </div>

      {judgeModel && (
        <div className="rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-xs">
          <span className="font-medium">Judge: {judgeModel}.</span> {JUDGE_DISCLAIMER}
        </div>
      )}

      <nav className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {(["leaderboard", "scatter", "drilldown", "disagreement"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px capitalize ${
              tab === t
                ? "border-black dark:border-white font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "leaderboard" && <Leaderboard rows={board} judgeModel={judgeModel} />}
      {tab === "scatter" && <Scatter rows={board} judgeModel={judgeModel} />}
      {tab === "drilldown" && <Drilldown runs={runs} judge={judge} feedback={feedback} />}
      {tab === "disagreement" && <Disagreement runs={runs} judge={judge} />}
    </main>
  );
}

// ------------------------- Aggregation --------------------------

type Row = {
  model: string;
  embedder: string;
  n_runs: number;
  avg_quality: number;     // mean of (g+c+co)/3 across runs
  avg_groundedness: number;
  avg_correctness: number;
  avg_completeness: number;
  median_latency: number;
  avg_total_tokens: number;
  refusal_correctness: number; // % of expected-refuse questions where correctness >= 4
  refusal_n: number;
  manual_avg_stars: number | null;
  manual_n: number;
};

function buildLeaderboard(runs: Run[], judge: Judge[], feedback: Feedback[]): Row[] {
  const judgeByRun: Record<string, Judge> = {};
  for (const j of judge) judgeByRun[j.run_id] = j;
  const fbByRun: Record<string, { stars: number[]; thumbs: string[] }> = {};
  for (const f of feedback) {
    const rec = (fbByRun[f.run_id] ??= { stars: [], thumbs: [] });
    rec.stars.push(f.stars);
    rec.thumbs.push(f.thumbs);
  }

  // group by (model, embedder)
  const groups: Record<string, Run[]> = {};
  for (const r of runs) {
    const k = `${r.model}__${r.embedder}`;
    (groups[k] ??= []).push(r);
  }

  const rows: Row[] = [];
  for (const [k, group] of Object.entries(groups)) {
    const [model, embedder] = k.split("__");
    const judged = group
      .map((r) => judgeByRun[r.run_id])
      .filter((j) => j && !j.error && j.correctness > 0);
    const lat = group.filter((r) => !r.error).map((r) => r.latency_ms).sort((a, b) => a - b);
    const tokens = group.filter((r) => !r.error).map((r) => r.total_tokens);
    const refuseQs = group.filter((r) => r.expected_behavior === "refuse" && !r.error);
    const refuseJudged = refuseQs.map((r) => judgeByRun[r.run_id]).filter((j) => j && !j.error);
    const refuseOk = refuseJudged.filter((j) => j.correctness >= 4).length;
    const fbForGroup = group.flatMap((r) => fbByRun[r.run_id]?.stars ?? []);

    rows.push({
      model,
      embedder,
      n_runs: group.length,
      avg_quality: avg(judged.map((j) => (j.groundedness + j.correctness + j.completeness) / 3)),
      avg_groundedness: avg(judged.map((j) => j.groundedness)),
      avg_correctness: avg(judged.map((j) => j.correctness)),
      avg_completeness: avg(judged.map((j) => j.completeness)),
      median_latency: median(lat),
      avg_total_tokens: avg(tokens),
      refusal_correctness: refuseJudged.length ? refuseOk / refuseJudged.length : 0,
      refusal_n: refuseJudged.length,
      manual_avg_stars: fbForGroup.length ? avg(fbForGroup) : null,
      manual_n: fbForGroup.length,
    });
  }
  rows.sort((a, b) => b.avg_quality - a.avg_quality);
  return rows;
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
}

// ------------------------- Components --------------------------

function Leaderboard({ rows, judgeModel }: { rows: Row[]; judgeModel: string | undefined }) {
  if (!rows.length)
    return <div className="text-sm text-gray-500">No runs yet. Run the bake-off CLI.</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-gray-500 text-left">
        <tr>
          <th className="py-2">#</th>
          <th>Model</th>
          <th>Embedder</th>
          <th className="text-right">Quality</th>
          <th className="text-right">G / C / Co</th>
          <th className="text-right">Latency</th>
          <th className="text-right">Tokens</th>
          <th className="text-right">Refusal</th>
          <th className="text-right">Manual ★</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isJudge = r.model === judgeModel;
          return (
            <tr
              key={`${r.model}-${r.embedder}`}
              className={`border-t border-gray-100 dark:border-gray-800 ${
                isJudge ? "opacity-60" : ""
              }`}
            >
              <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
              <td className="py-2 pr-3 font-mono text-xs">
                {r.model}
                {isJudge && <span className="ml-1 text-amber-600">(judge)</span>}
              </td>
              <td className="py-2 pr-3 text-xs text-gray-500">{r.embedder}</td>
              <td className="py-2 pr-3 text-right font-medium">{r.avg_quality.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right text-xs text-gray-500">
                {r.avg_groundedness.toFixed(1)} / {r.avg_correctness.toFixed(1)} /{" "}
                {r.avg_completeness.toFixed(1)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.median_latency.toFixed(0)} ms</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.avg_total_tokens.toFixed(0)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {r.refusal_n
                  ? `${(r.refusal_correctness * 100).toFixed(0)}% (${r.refusal_n})`
                  : "-"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {r.manual_avg_stars != null
                  ? `${r.manual_avg_stars.toFixed(1)} (${r.manual_n})`
                  : "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Scatter({ rows, judgeModel }: { rows: Row[]; judgeModel: string | undefined }) {
  if (!rows.length) return <div className="text-sm text-gray-500">No runs yet.</div>;
  const W = 700, H = 360, pad = 40;
  const xs = rows.map((r) => r.median_latency);
  const ys = rows.map((r) => r.avg_quality);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = 0, yMax = 5;
  const xPos = (x: number) => pad + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - 2 * pad);
  const yPos = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - 2 * pad);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        Quality (avg of g/c/co) vs median latency. Top-left is the sweet spot. Judge model in amber.
      </p>
      <svg width={W} height={H} className="rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        {/* axes */}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" strokeOpacity={0.3} />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="currentColor" strokeOpacity={0.3} />
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.6}>
          median latency (ms)
        </text>
        <text x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`} fontSize={11} fill="currentColor" opacity={0.6}>
          quality (1-5)
        </text>
        {/* y-axis ticks */}
        {[1, 2, 3, 4, 5].map((y) => (
          <g key={y}>
            <line x1={pad - 3} y1={yPos(y)} x2={pad} y2={yPos(y)} stroke="currentColor" strokeOpacity={0.3} />
            <text x={pad - 6} y={yPos(y) + 3} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
              {y}
            </text>
          </g>
        ))}
        {/* dots */}
        {rows.map((r) => {
          const isJudge = r.model === judgeModel;
          const isBge = r.embedder === "bge-m3";
          return (
            <g key={`${r.model}-${r.embedder}`}>
              <circle
                cx={xPos(r.median_latency)}
                cy={yPos(r.avg_quality)}
                r={isBge ? 6 : 4}
                fill={isJudge ? "rgb(245, 158, 11)" : isBge ? "rgb(37, 99, 235)" : "rgb(220, 38, 38)"}
                fillOpacity={0.6}
                stroke={isJudge ? "rgb(180, 100, 0)" : "currentColor"}
              >
                <title>{`${r.model} (${r.embedder}) — q=${r.avg_quality.toFixed(2)}, lat=${r.median_latency.toFixed(0)}ms`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-gray-500">
        <span><span className="inline-block w-3 h-3 rounded-full bg-blue-600 mr-1 align-middle" />bge-m3</span>
        <span><span className="inline-block w-3 h-3 rounded-full bg-red-600 mr-1 align-middle" />nomic-embed-text</span>
        <span><span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-1 align-middle" />judge model</span>
      </div>
    </div>
  );
}

function Drilldown({ runs, judge, feedback }: { runs: Run[]; judge: Judge[]; feedback: Feedback[] }) {
  const [qid, setQid] = useState<string | null>(null);
  const judgeByRun: Record<string, Judge> = {};
  for (const j of judge) judgeByRun[j.run_id] = j;
  const fbByRun: Record<string, Feedback[]> = {};
  for (const f of feedback) (fbByRun[f.run_id] ??= []).push(f);

  const questions = Array.from(new Map(runs.map((r) => [r.question_id, r])).values()).sort(
    (a, b) => a.question_id.localeCompare(b.question_id),
  );
  const selected = qid ? runs.filter((r) => r.question_id === qid) : [];

  return (
    <div className="space-y-4">
      <select
        className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        value={qid ?? ""}
        onChange={(e) => setQid(e.target.value || null)}
      >
        <option value="">Pick a question…</option>
        {questions.map((q) => (
          <option key={q.question_id} value={q.question_id}>
            {q.question_id} [{q.category}] {q.question.slice(0, 80)}
          </option>
        ))}
      </select>

      {selected.length > 0 && (
        <div className="space-y-3">
          {selected
            .slice()
            .sort((a, b) => a.model.localeCompare(b.model) || a.embedder.localeCompare(b.embedder))
            .map((r) => {
              const j = judgeByRun[r.run_id];
              const fb = fbByRun[r.run_id] ?? [];
              return (
                <details
                  key={r.run_id}
                  className="rounded border border-gray-200 dark:border-gray-800 p-3 text-sm"
                >
                  <summary className="cursor-pointer flex items-center justify-between gap-3">
                    <span className="font-mono text-xs">
                      {r.model} <span className="text-gray-500">/ {r.embedder}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {j && !j.error
                        ? `q=${((j.groundedness + j.correctness + j.completeness) / 3).toFixed(2)} · ${r.latency_ms} ms · ${r.total_tokens} tok`
                        : r.error
                        ? `ERROR: ${r.error.slice(0, 60)}`
                        : `${r.latency_ms} ms · not judged yet`}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {r.answer || <em className="text-gray-500">(no answer)</em>}
                    </div>
                    {j && !j.error && (
                      <div className="text-xs text-gray-500">
                        Judge: g={j.groundedness} c={j.correctness} co={j.completeness} —{" "}
                        <em>{j.reasoning}</em>
                      </div>
                    )}
                    {fb.length > 0 && (
                      <div className="text-xs text-gray-500">
                        Manual: {fb.map((f) => `${f.stars}★/${f.thumbs}`).join(", ")}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
        </div>
      )}
    </div>
  );
}

function Disagreement({ runs, judge }: { runs: Run[]; judge: Judge[] }) {
  const judgeByRun: Record<string, Judge> = {};
  for (const j of judge) if (!j.error) judgeByRun[j.run_id] = j;

  const byQ: Record<string, { question: string; scores: number[] }> = {};
  for (const r of runs) {
    const j = judgeByRun[r.run_id];
    if (!j) continue;
    const rec = (byQ[r.question_id] ??= { question: r.question, scores: [] });
    rec.scores.push((j.groundedness + j.correctness + j.completeness) / 3);
  }

  const ranked = Object.entries(byQ)
    .map(([qid, { question, scores }]) => ({
      qid, question,
      n: scores.length, mean: avg(scores), stdev: stdev(scores),
      min: Math.min(...scores), max: Math.max(...scores),
    }))
    .sort((a, b) => b.stdev - a.stdev);

  if (!ranked.length) return <div className="text-sm text-gray-500">No judged data yet.</div>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Questions ranked by stddev of judge quality scores across all 24 runs (model × embedder).
        High stddev = models disagreed most. Investigate these.
      </p>
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 text-left">
          <tr>
            <th className="py-2 w-12">QID</th>
            <th>Question</th>
            <th className="text-right">n</th>
            <th className="text-right">mean</th>
            <th className="text-right">stdev</th>
            <th className="text-right">min / max</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.qid} className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-2 pr-3 font-mono text-xs">{r.qid}</td>
              <td className="py-2 pr-3 text-xs">{r.question}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.n}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.mean.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right tabular-nums font-medium">{r.stdev.toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-gray-500">
                {r.min.toFixed(1)} / {r.max.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
