# Phase 1.5 — Model Bake-off

> Phase 1 deliverable: ✅ working RAG harness, manually verified.
> Phase 1.5 deliverable: 🎯 **real data** that lets you pick the default model with confidence — not a guess.
>
> "Don't assume — measure" is the rule.

---

## A. What Phase 1.5 actually is

Run all 12 locked models against a fixed eval set, capture every metric that matters (quality, speed, tokens, cost-proxy), and surface the data through a dashboard so you can pick a default with both eyes open.

**What's measured** (per `(question × model × embedder)` combo):
- **Speed** — end-to-end latency, tokens/sec
- **Cost-proxy** — prompt tokens, completion tokens, total tokens
- **Quality (auto)** — LLM-as-judge: groundedness 1-5, correctness 1-5, completeness 1-5
- **Quality (manual)** — your own 👍/👎 + 1-5 stars in the admin UI
- **Determinism** — was the answer non-empty? did it refuse correctly on adversarial questions?

Run matrix: **12 models × 2 embedders × ~18 questions = ~432 runs**. At avg ~5 s/run that's ~35–40 min wall time per full sweep.

---

## B. Decisions I need from you

### B1. Storage backend for bake-off results

| Option | Pros | Cons |
|---|---|---|
| **JSONL files** in `backend/data/bake_off/` | Trivial, no DB schema, easy to commit raw data to repo, easy to load into pandas later | Dashboard has to read files (slower for big data, but 432 rows is tiny) |
| **New Postgres tables** (`bake_off_runs`, `bake_off_judge_scores`, `bake_off_feedback`) | Easy queries, joins to `auth.users` for who-rated-what, RLS for admin-only | Migration needed, we're pre-empting Phase 2's trace work |

**My recommendation: JSONL.** Bake-off is a one-time-ish thing, not production traffic. Postgres can come in Phase 2 when we wire production traces. Tell me if you'd rather use Postgres.

### B2. LLM-as-judge model

The "judge" scores all 12 candidate answers. Risk: if the judge IS one of the candidates, it'll likely score itself favorably (self-preference bias is well-documented).

| Option | Setup |
|---|---|
| **A. Single judge, disqualified from leaderboard** | Use `kimi-k2.6`. Its scores still get logged, but exclude `kimi-k2.6` from "best by quality" rankings (or note the caveat) |
| **B. Single judge, NOT in lineup** | Pick a strong cloud model that isn't one of the 12. Looking at `AVAILABLE_MODELS.txt` — could use `qwen3-max` or similar if not on lineup |
| **C. Ensemble (3 judges)** | `kimi-k2.6` + `glm-5.1` + `deepseek-v4-pro`. Average the scores. Each judge disqualified from its own evaluation. 3× the cost |

**My recommendation: A** for v1. Cheap, single source of truth, clear caveat. Upgrade to C in a future iteration if results look biased.

### B3. Manual scoring UI shape

| Option | What you see |
|---|---|
| **Blind side-by-side** | One question. All 12 answers shown anonymized + shuffled (no model labels). You rate each. Eliminates brand-name bias |
| **Open side-by-side** | One question. All 12 answers labeled with model name. Faster to interpret but biased |
| **Sequential** | One question + one model at a time. Simplest UI but least efficient |

**My recommendation: Blind side-by-side.** Costs you a few extra clicks to expand "show models" after rating, but the data is much cleaner.

### B4. Eval set — confirm/edit the 18 questions

5 categories:

**Factual (5)** — single-fact extraction
1. When was Python first released and by whom?
2. At what company was the C programming language designed?
3. What year did Linus Torvalds release the first version of Linux?
4. Who is credited with proposing the World Wide Web?
5. What was ENIAC primarily designed to compute?

**Multi-hop (4)** — needs >1 article
6. What language was the Linux kernel originally written in, and at what company was that language created?
7. Which two early computer scientists are most associated with the COBOL and FORTRAN languages respectively?
8. Was Smalltalk influenced by Lisp? Justify your answer.
9. Did Ada Lovelace and Alan Turing work on the same physical machine?

**Synthesis (3)** — combine + reason
10. Compare the design philosophies of Lisp and Smalltalk.
11. How did Unix influence Linux? Cite specific examples.
12. Briefly explain how object-oriented programming differs from earlier procedural styles.

**Adversarial / refusal (3)** — context lacks the answer
13. What is the population of Bangalore? *(Out of scope — should refuse.)*
14. Did Tim Berners-Lee invent the internet? *(Trick — he invented the Web, not the Internet.)*
15. When did Donald Knuth win the Nobel Prize in Physics? *(He didn't — he won the Turing Award.)*

**Long-context recall (3)** — fact buried deep in a long article
16. What was Alan Turing's official cause of death?
17. What does the abbreviation "ARPA" stand for?
18. What was the first programming language Donald Knuth used as a child?

**→ Edit any, swap, or add. Or just say "ok."**

### B5. Streaming for time-to-first-token (TTFT)

Measuring TTFT requires streaming responses, which Phase 1 doesn't do.

| Option | Trade |
|---|---|
| **Skip TTFT** (record only end-to-end latency) | Simpler, no streaming code in Phase 1.5 |
| **Add streaming to /chat** | TTFT data captured, but bigger frontend changes |

**My recommendation: Skip.** End-to-end latency is what users actually feel. TTFT can be added in Phase 6 (polish).

---

## C. What I'll build (in this order)

```
1. Eval set file ─► 2. Runner ─► 3. Judge ─► 4. JSONL storage ─► 5. Admin dashboard ─► 6. Manual rating UI
                                              (raw data ready                          (you fill in
                                               for analysis)                            the human signal)
```

### C1. `backend/eval/questions.json` — the 18 questions
Versioned, committed to repo. Each question has `id`, `category`, `question`, `expected_behavior` (e.g. `"refuse"` for adversarial).

### C2. `backend/scripts/run_bake_off.py` — bake-off runner CLI
- Loops over all `(question × model × embedder)` combos
- For each: retrieve chunks, call cloud chat, capture latency + token counts + answer
- Writes `backend/data/bake_off/runs_<timestamp>.jsonl`
- Resumable: if a run with same `(eval_set_version, model, embedder, question_id)` already exists, skip
- ~36 min wall time per full sweep
- CLI flags: `--models`, `--embedders`, `--questions` (subset), `--judge-only`, `--dry-run`

### C3. `backend/scripts/run_judge.py` — LLM-as-judge runner
- Loads latest `runs_*.jsonl`
- For each row, asks judge model: "Given this context + question + answer, rate groundedness/correctness/completeness 1-5 with brief reasoning"
- Writes scores to `backend/data/bake_off/judge_<timestamp>.jsonl`
- Resumable, same pattern

### C4. `backend/app/routes/admin_bakeoff.py` — read-only API for the dashboard
Admin-gated (uses `profile.role === 'admin'` check):
- `GET /admin/bakeoff/runs` — latest runs JSON
- `GET /admin/bakeoff/judge` — latest judge scores
- `POST /admin/bakeoff/feedback` — record a manual rating
- `GET /admin/bakeoff/feedback` — list all manual ratings

### C5. `frontend/app/admin/bakeoff/page.tsx` — dashboard
- **Leaderboard tab** — sortable table: model | embedder | avg_quality | median_latency | avg_tokens_out | refusal_correctness
- **Speed-vs-quality scatter** — each model is one dot, x = median latency, y = avg quality
- **Per-question drill-down** — click a question, see all 12×2 answers grouped, each with judge scores + your stars
- **Disagreement view** — questions where judge scores diverged most across models

### C6. `frontend/app/admin/bakeoff/rate/page.tsx` — manual rating UI
- One question at a time
- 24 answers shown anonymized + shuffled (12 models × 2 embedders, names hidden)
- For each: 1-5 stars + 👍/👎/skip
- Auto-saves to `POST /admin/bakeoff/feedback`
- "Reveal model" button after rating

---

## D. Storage layout (Option B1 = JSONL)

```
backend/
  eval/
    questions.json                          # versioned eval set
  data/
    bake_off/
      runs_2026-05-09T18-00-00.jsonl        # one row per (q, model, embedder) run
      judge_2026-05-09T18-00-00.jsonl       # one row per (run, judge_score)
      feedback.jsonl                        # append-only manual ratings
```

`runs_*.jsonl` row schema:
```json
{
  "run_id": "uuid",
  "eval_set_version": "v1",
  "question_id": "Q01",
  "model": "kimi-k2.6",
  "embedder": "bge-m3",
  "answer": "...",
  "chunks": [{"doc_slug": "...", "chunk_idx": 4, "score": 0.78}],
  "latency_ms": 4321,
  "prompt_tokens": 1234,
  "completion_tokens": 89,
  "total_tokens": 1323,
  "started_at": "2026-05-09T18:00:00Z",
  "finished_at": "2026-05-09T18:00:04Z",
  "error": null
}
```

---

## E. New files / touched files

```
NEW:
  backend/eval/questions.json
  backend/eval/__init__.py
  backend/app/routes/admin_bakeoff.py
  backend/scripts/run_bake_off.py
  backend/scripts/run_judge.py
  backend/data/bake_off/                    (gitignored)
  frontend/app/admin/bakeoff/page.tsx
  frontend/app/admin/bakeoff/rate/page.tsx

TOUCHED:
  backend/app/main.py                       (mount admin_bakeoff router)
  backend/app/models_registry.py            (add `judge` flag if going with B2 option A)
  frontend/app/dashboard/page.tsx           (admin-only link to /admin/bakeoff)
  .gitignore                                (add backend/data/bake_off/ if not auto-covered)
```

No new dependencies — uses what's already installed (FastAPI, httpx, ChromaDB, Tailwind).

---

## F. How we'll know Phase 1.5 is done

- [ ] `python -m scripts.run_bake_off` writes a complete `runs_*.jsonl` (~432 rows, no errors)
- [ ] `python -m scripts.run_judge` writes a complete `judge_*.jsonl`
- [ ] You can browse `/admin/bakeoff` → see the leaderboard sorted by quality
- [ ] You manually rate ≥5 questions through `/admin/bakeoff/rate`
- [ ] You pick a default model — it's now the "default" in `models_registry.py` and selected by default in `/chat`
- [ ] We commit the chosen default + the bake-off results JSONL to git as a record

---

## G. Out of scope (not Phase 1.5)

- ❌ TTFT / streaming (Phase 6)
- ❌ Cost in actual dollars (Ollama Cloud pricing varies per provider — capture tokens, you can multiply later)
- ❌ Sweeping chunk size / overlap / top-k (separate experiment, can come after Phase 4)
- ❌ Production trace storage in Postgres (Phase 2)
- ❌ Heartbeat / online-offline pill (Phase 2)
- ❌ Rules engine / Bad Answers (Phase 4)
- ❌ Real-time streaming of bake-off progress (the runner is a CLI; you watch logs)

---

## H. Risks / open questions

- **Long-running CLI** — 35-40 min sweep is okay locally, but if your laptop sleeps or Ollama Cloud rate-limits, the runner needs to be resumable. ✅ Resumable design baked into C2.
- **Judge bias** — the judge model has favorites. We need to disclose this in the dashboard (a "judge: kimi-k2.6 (excluded from quality leaderboard)" caption).
- **Question ambiguity** — some of the 18 might be ambiguous; the judge will penalize ambiguity unfairly. We'll review and possibly drop questions where ALL 12 models scored low (signal that the question, not the model, is the problem).
- **Refusal scoring** — "Did the model correctly refuse?" needs different scoring logic than "Was the answer correct?" We'll handle this with the `expected_behavior: "refuse"` flag in `questions.json` and a separate `refusal_correctness` column in the leaderboard.

---

**Your turn:** answer B1–B5 (or just say which defaults you want changed). Then I'll build C1–C6 and pause for your test before declaring Phase 1.5 done.
