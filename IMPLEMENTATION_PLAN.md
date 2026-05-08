# AI Observability — Implementation Plan

A learning-by-building project: a small RAG chatbot with full observability so we can see exactly what the AI did, why, and where it went wrong.

The frontend is **publicly hosted on Vercel** so anyone can use it. The Python backend runs **on your local laptop** and is exposed to the internet via a **Cloudflare Tunnel**. Traces and auth live in a hosted database, so the dashboard keeps working even when your laptop is off.

---

## 1. What we are actually building

A **mini RAG chatbot** + a **public observability dashboard** with **user accounts and an admin view**, recording and analyzing every single AI request.

**The chatbot side**
- A user signs up / logs in
- Asks a question in a chat UI
- The system retrieves relevant chunks from a small set of real, factual documents (Wikipedia)
- A model from Ollama Cloud writes the answer using only those chunks

**The observability side** (the real point of this project)
- Every request becomes a **trace** — a full step-by-step record stored in Supabase
- Each trace stores: question, retrieved chunks, prompt, raw model output, latency per step, token counts, estimated cost, rule violations, user_id
- A **user dashboard** — each user sees only their own traces
- An **admin dashboard** — sees everything, system health, cost across users, abuse signals, model bake-off results
- A **"Bad Answers"** page (admin) — flagged traces, click into the full trace to debug
- 👍 / 👎 feedback button per answer

---

## 2. Tech stack (locked in)

| Layer | Choice | Why |
|---|---|---|
| **LLM** | **Ollama Cloud API** — multiple models, swappable per request | Best open-source models, no fixed default, we benchmark |
| **Embeddings** | **Local Ollama if available, else Ollama Cloud** | **Local is preferred** — zero per-call cost, lower latency, embeds run during ingestion (one-time). Fall back to Cloud if local Ollama isn't running. |
| **Vector store** | **ChromaDB** (local file-backed) | Pure Python, no server, embedded with backend |
| **Backend API** | **FastAPI** (Python 3.12.10) | Clean async API, easy to instrument |
| **Public exposure** | **Cloudflare Tunnel** (`cloudflared`) | Free, no port forwarding, gives a stable public HTTPS URL → laptop |
| **Database** | **Supabase** (Postgres) | Hosted Postgres + free tier + great Next.js integration. Stores users, traces, spans, feedback, rule violations. |
| **Auth** | **Supabase Auth** | Bundled with the database. Built-in: email+password, forgot password, password reset, email verification, magic links, OAuth, MFA. Less code to maintain, JWT-based. |
| **Frontend** | **Next.js 15** (App Router, TS, Tailwind, shadcn/ui) | Modern, clean, Vercel-native |
| **Frontend hosting** | **Vercel** (free tier) | Zero-config Next.js hosting, free SSL |
| **Charts** | **Recharts** or **Tremor** | Quick analytics UI |
| **Cache / queue (later)** | **Upstash Redis** (free tier) | For rate limiting + request queueing if backend is down |

**Best-practice alternatives I'd flag** (you decide):
- **Auth alternative:** **Better Auth** would let you migrate off Supabase later (auth tables in your own Postgres). We chose Supabase Auth for now — simpler, integrated. Migration path exists if needed.
- **DB alternative:** **Neon** (serverless Postgres) is faster for cold starts and has better branching. Pick Supabase if you also want their dashboard, storage, and realtime. **Pick one — don't run both.**
- **Vector store alternative:** ChromaDB local is fine to start. If we ever need to scale, **Qdrant** or **pgvector inside Supabase** are the upgrade paths. pgvector is tempting because it removes one moving part.
- **Tunnel alternative:** **ngrok** works but free tier rotates URLs. **Cloudflare Tunnel** is the right choice — free, stable URL, optional custom domain.

---

## 3. Architecture diagram

```
                          ┌────────────────────────────────────┐
                          │   Public Internet (anyone, anywhere)│
                          └─────────────────┬──────────────────┘
                                            │
                                            ▼
                ┌──────────────────────────────────────────────┐
                │  Vercel — Next.js 15 (always on, free tier)  │
                │  ┌────────────────────────────────────────┐  │
                │  │ /login /signup /forgot /reset          │  │  ← Supabase Auth
                │  │ /chat                                  │  │
                │  │ /dashboard  (user: own traces)         │  │
                │  │ /admin      (admin: everything)        │  │
                │  │ /admin/bad-answers                     │  │
                │  │ /admin/bake-off                        │  │
                │  └────────────────────────────────────────┘  │
                │  Server actions / API routes call:           │
                │   • Supabase  (always)                       │
                │   • Backend   (when laptop is up)            │
                └────────────┬───────────────┬─────────────────┘
                             │               │
       ┌─────────────────────┘               └────────────────────┐
       ▼                                                          ▼
┌──────────────────────────┐               ┌──────────────────────────────┐
│ Supabase Postgres        │               │ Cloudflare Tunnel            │
│ (always available)       │               │ https://api.<yourdomain>     │
│                          │               │  ↓ secure tunnel ↓            │
│  • auth.users (Supabase) │               │ ┌──────────────────────────┐ │
│  • sessions              │               │ │ Your laptop (FastAPI)    │ │
│  • traces, spans         │               │ │ ┌─────────────────────┐  │ │
│  • feedback              │               │ │ │ /chat /traces /rules│  │ │
│  • rule_violations       │               │ │ │ /healthz /heartbeat │  │ │
│  • model_runs            │               │ │ └────────┬────────────┘  │ │
│  • api_keys (for backend)│               │ │          ▼               │ │
│  • audit_log             │               │ │ ┌─────────────────────┐  │ │
└──────────────────────────┘               │ │ │ RAG pipeline        │  │ │
              ▲                            │ │ │ instrumented spans  │  │ │
              │ writes traces              │ │ └────┬────────┬───────┘  │ │
              └────────────────────────────┤ │      ▼        ▼          │ │
                                           │ │   Chroma   Ollama        │ │
                                           │ │   (local)  Cloud API     │ │
                                           │ └──────────────────────────┘ │
                                           └──────────────────────────────┘
```

**Key idea:** The frontend talks to **Supabase directly** for everything except live AI calls. Only `/chat` and bake-off runs go through Cloudflare Tunnel → laptop. So even when the laptop is off, login, dashboards, and historical trace viewing all keep working.

---

## 4. The "is the backend on?" problem (your laptop on/off)

Since the Python backend runs on a personal laptop, it will be offline a lot. The system must handle this gracefully.

**Mechanisms:**
1. **Heartbeat** — laptop backend POSTs `{ status: "online", started_at, version }` to Supabase every 30s. A row in `backend_heartbeat` table.
2. **Status pill in the UI** — `🟢 Online · last seen 12s ago` / `🔴 Offline · last seen 4h ago`. Driven by heartbeat freshness.
3. **Graceful degradation:**
   - Login, signup, dashboards, historical traces, bad answers — **always work** (Supabase is up)
   - New chat — disabled with a clear message: "Backend is offline. The owner is asleep / away. Try again later, or queue your question."
4. **Optional: queued questions** — if backend is offline, user's question is stored in a `pending_questions` table. When backend comes back online, it drains the queue and emails / notifies the user when their answer is ready.
5. **/healthz** endpoint on backend that Cloudflare Tunnel exposes — Vercel can ping it as a backup signal.

This whole pattern *is* observability — knowing the state of your system in real time is the foundation everything else stands on.

---

## 5. The trace data model (now in Postgres, not SQLite)

```
auth.users (Supabase managed)
  └─ profiles (1:1, holds role + display_name + soft-delete)
       └─ traces
       ├─ id, user_id, created_at
       ├─ question, final_answer
       ├─ model_id, embedder_id
       ├─ total_latency_ms, prompt_tokens, completion_tokens, estimated_cost_usd
       ├─ status (ok / flagged / error / queued)
       ├─ prompt_version
       └─ spans (1..N, ordered)
            ├─ kind: embed_query | retrieve | build_prompt | llm_call | post_process
            ├─ started_at, ended_at, duration_ms
            ├─ input_json, output_json (with PII redaction)
            └─ error (if any)

feedback           (trace_id, user_id, thumbs, stars, comment)
rule_violations    (trace_id, rule_name, severity, details)
backend_heartbeat  (instance_id, last_seen, version, ollama_models_seen)
audit_log          (actor_user_id, action, target, before_json, after_json, ts)
api_keys           (id, hashed_key, scope, owner_user_id, last_used)
```

**Best practices baked into the schema:**
- **PII redaction** in `input_json` / `output_json` — emails, phone numbers, API keys auto-masked before storage
- **Soft delete** (`deleted_at` column) instead of hard delete on user data — better for support and accidental recovery
- **Audit log** for any admin action that touches user data
- **Row-level security (RLS)** in Supabase — users physically cannot read other users' traces, even if a frontend bug tried
- **Rate limit counters** per user (so one abusive account can't burn your Ollama Cloud credits)

---

## 6. Auth & roles

- **Supabase Auth** handles user accounts. Users live in `auth.users`.
- We add a **`public.profiles`** table (1:1 with `auth.users`) holding `role` (`'user'` / `'admin'`), `display_name`, `deleted_at`. A trigger inserts a default profile row on signup.
- Default flows (all built into Supabase): **signup, login, logout, forgot password (email link), reset password, change password, change email, delete account, email verification**
- Optional later: magic links, 2FA, OAuth (Google / GitHub)
- Frontend uses `@supabase/ssr` + `@supabase/supabase-js` for sessions
- Middleware in Next.js: `/admin/*` requires `profile.role === 'admin'`
- Backend verifies the **Supabase-issued JWT** locally using the JWT secret (from Project Settings → API). **Never trust the user_id from the request body** — always pull it from the verified token's `sub` claim.

**Email service** — Supabase has a built-in email sender for dev (rate-limited, branded). For production we plug **Resend** in via Supabase's Custom SMTP setting → uses your Resend account, branded as your app.

---

## 7. The "Bad Answers" detection — rules engine

Lightweight rules that flag a response as suspicious. We start simple and grow:

| Rule | What it checks |
|---|---|
| **Groundedness** | Does the answer contain claims not in retrieved chunks? (lexical overlap + LLM-as-judge sample) |
| **Empty retrieval** | All retrieved chunks below score threshold |
| **Refusal mismatch** | Model refused even though good chunks were available |
| **Length anomaly** | Answer way too short / way too long for the question type |
| **User feedback** | Any 👎 auto-flags |
| **High latency** | Latency above per-model threshold |
| **Prompt injection signals** | User input contains classic injection patterns |
| **PII leak** | Output contains patterns matching emails / SSNs / API keys |

---

## 8. The documents

20 real Wikipedia articles. We pick the topic together at start of Phase 1. Best topics for testing observability are ones with:
- Clear factual claims (so groundedness is checkable)
- Some overlapping concepts (so multi-hop questions are interesting)
- Numerical / dated facts (so hallucinations are easier to spot)

Suggestions when we get there: a country's history, a single scientist's bibliography, a sport's rulebook, a programming language's history.

---

## 9. Phased build plan

Each phase is a **standalone, working milestone**. We pause after each one. No phase starts without your "go".

### **Phase 0 — Environment & cloud setup**
- Create Supabase project; capture project URL + anon key + service role key (the latter goes only on the laptop)
- Create Vercel project (link the Next.js repo later)
- Install **cloudflared**, log in, create a tunnel, get a public hostname
- Configure Ollama Cloud API: base URL + API key in `.env`
- Local Ollama: confirm install + pull `nomic-embed-text` and `bge-m3` (preferred for embedding)
- Python venv: `fastapi`, `uvicorn`, `chromadb`, `httpx`, `pydantic`, `python-dotenv`, `psycopg[binary]`, `slowapi` (rate limit), `python-jose` (JWT)
- Scaffold Next.js: Tailwind + shadcn/ui + Better Auth + Supabase client
- Smoke test:
  - Hit Ollama Cloud, list models
  - Insert a row in Supabase from local Python and from Vercel preview
  - Hit FastAPI through Cloudflare Tunnel from a browser
- **Deliverable:** Vercel preview, laptop backend reachable via public URL, Supabase storing test data, all three handshakes working

### **Phase 1 — Minimal RAG (no observability yet)**
- Pick the 20 Wikipedia articles together
- Chunk + embed in **two parallel collections** (`nomic-embed-text` and `bge-m3`) so we can compare retrieval quality later
- `/chat` endpoint: accepts `model`, `embedder`, `question`. Returns answer + retrieved chunks (raw, no DB write yet)
- Next.js chat page with model & embedder dropdowns + Better Auth gating
- **Deliverable:** logged-in user can ask questions, swap models, get answers via the public Cloudflare URL

### **Phase 1.5 — Model bake-off**
Generate the data needed to pick models with confidence — your idea, kept first-class.

- Eval set: 15-20 questions across difficulty (factual / multi-hop / synthesis / adversarial)
- Bake-off runner loops over every question × every model, writes traces + scores
- Models tested: **the 12 locked representatives** (see §13 — full list of 39 is available in `AVAILABLE_MODELS.txt` if we want to drill deeper later)
- Captured per run: latency, time-to-first-token, tokens in/out, throughput (tok/s), full output, retrieved chunks, $ estimate
- Quality scoring (two-pass):
  1. **LLM-as-judge** — one strong model scores all others (groundedness, correctness, completeness 1-5)
  2. **Manual UI** — admin clicks 👍/👎 + 1-5 stars
- Admin **bake-off dashboard**: leaderboard, quality vs speed scatter, per-question drill-down, "where models disagreed" view
- **Deliverable:** real data → you pick which model is the default, no guessing

### **Phase 2 — Tracing layer + heartbeat**
- Move trace storage from FastAPI memory → Supabase Postgres (schema from §5)
- Instrument every step of the pipeline as spans
- `/traces` and `/traces/:id` endpoints
- Heartbeat job: backend posts to `backend_heartbeat` every 30s
- **Deliverable:** every chat creates a trace row in Supabase; heartbeat visible in admin

### **Phase 3 — User & admin dashboards**
- User dashboard: own traces, search, latency / cost summaries, feedback, RLS-enforced
- Admin dashboard: everything, system health card (online/offline pill), cost across users, top models, abuse signals
- Trace detail page: timeline of spans, latency breakdown, prompt + chunks + answer side-by-side
- **Deliverable:** real visual observability, hosted on Vercel, anyone can sign up and see their traces

### **Phase 4 — Rules engine + Bad Answers + feedback loop**
- Implement rules from §7
- Run rules after each chat, store violations
- Admin `/admin/bad-answers` page
- 👍 / 👎 feedback wired up
- Email alert (Resend) to admin when a critical rule fires
- **Deliverable:** automatic flagging + manual feedback loop

### **Phase 5 — Debug & improve loop**
- "Replay" button on a bad trace — re-run with a tweaked prompt
- A/B compare two prompt versions on the same query
- Prompt version tracking
- **Deliverable:** the full real-world AI improvement workflow

### **Phase 6 (stretch) — Polish & hardening**
- Latency-over-time and cost-over-time charts (Tremor / Recharts)
- Token usage breakdown
- Export traces JSON / CSV
- Rate limiting on `/chat` per user (slowapi + Upstash) — protects your Ollama Cloud credit
- Backend graceful queue when offline + email-when-ready
- Optional: pgvector migration (drop ChromaDB)

---

## 10. Folder structure (target)

```
D:\AI Observabitity\
├─ IMPLEMENTATION_PLAN.md
├─ README.md
├─ .gitignore
├─ backend/                       ← Python on your laptop
│  ├─ pyproject.toml
│  ├─ .env                        ← Ollama Cloud key, Supabase service key (NEVER commit)
│  ├─ app/
│  │  ├─ main.py                  ← FastAPI entry
│  │  ├─ auth.py                  ← verify session token from frontend
│  │  ├─ rag/                     ← chunking, embedding, retrieval
│  │  ├─ tracing/                 ← span recorder, Supabase writer
│  │  ├─ rules/                   ← rules engine
│  │  ├─ heartbeat.py
│  │  ├─ ollama_client.py
│  │  └─ models_registry.py
│  ├─ data/
│  │  ├─ documents/               ← 20 Wikipedia source docs
│  │  └─ chroma/                  ← vector store files
│  └─ scripts/
│     ├─ ingest.py                ← chunk + embed all docs
│     └─ bake_off.py              ← model bake-off runner
├─ frontend/                      ← Next.js on Vercel
│  ├─ package.json
│  ├─ .env.local                  ← Supabase anon key, BACKEND_URL
│  ├─ app/
│  │  ├─ (auth)/
│  │  │  ├─ login/
│  │  │  ├─ signup/
│  │  │  ├─ forgot-password/
│  │  │  └─ reset-password/
│  │  ├─ chat/
│  │  ├─ dashboard/               ← user view
│  │  ├─ admin/                   ← admin view
│  │  │  ├─ traces/
│  │  │  ├─ bad-answers/
│  │  │  ├─ bake-off/
│  │  │  └─ system/
│  │  ├─ auth/callback/           ← Supabase OAuth/email-link callback
│  │  └─ layout.tsx
│  ├─ middleware.ts               ← Supabase session refresh + role gate
│  ├─ components/                 ← shadcn/ui based
│  └─ lib/
│     ├─ supabase/
│     │  ├─ client.ts             ← browser client
│     │  ├─ server.ts             ← server-component client
│     │  └─ middleware.ts
│     └─ backend.ts               ← typed client for FastAPI
└─ infra/
   ├─ cloudflared/                ← tunnel config (no secrets)
   └─ supabase/
      └─ migrations/              ← SQL for tables + RLS policies
```

---

## 11. Best practices baked in (and why)

| Practice | Why |
|---|---|
| **Frontend talks to Supabase directly** for non-AI data | Dashboard works when laptop is off |
| **Cloudflare Tunnel** (not port forwarding / ngrok) | Free, stable URL, doesn't expose home IP |
| **Supabase Auth** instead of rolling your own | Forgot password / reset / sessions are easy to get *subtly* wrong; let Supabase handle the crypto |
| **Row-Level Security in Supabase** | Defense in depth — even a frontend bug can't leak other users' traces |
| **Heartbeat + status pill** | Public users see honest status, not silent failures |
| **PII redaction before storage** | Users will paste anything into chat; never log emails / keys raw |
| **Audit log** for admin actions | Required for trust if this ever has real users |
| **Rate limiting on `/chat`** | Protects your Ollama Cloud credits |
| **API key + signed session tokens** between Vercel and laptop | Don't expose `/chat` to randoms scraping the tunnel URL |
| **CORS tight** — only Vercel domain allowed to call backend | Stops other sites embedding your tunnel |
| **Secrets only in `.env` + Vercel env vars** — never in repo | Git history is forever |
| **`service_role` key only on laptop**, anon key in browser | Service role bypasses RLS — never ship it to client |
| **Soft delete + 30-day retention** | Lets you undo, also a real privacy practice |
| **Per-user quotas** | Caps your worst-case cost |
| **Migrations in `supabase/migrations/`** | DB schema as code, reviewable |

---

## 12. Decisions locked in

- ✅ Documents: **Wikipedia** (specific topic chosen at start of Phase 1)
- ✅ LLM: **Ollama Cloud API** at `https://ollama.com` — verified working
- ✅ Embeddings: **local Ollama only** (Ollama Cloud does not serve embedding models — confirmed via `/v1/models`)
- ✅ Backend: **Python/FastAPI on your laptop**, exposed via **Cloudflare Tunnel**
- ✅ Frontend: **Next.js on Vercel** (free)
- ✅ DB: **Supabase Postgres**
- ✅ Auth: **Supabase Auth** (built-in) + **Resend** plugged in as Supabase's Custom SMTP for branded emails
- ✅ Two roles: `user` and `admin`; user/admin dashboards
- ✅ Backend on/off resilience: heartbeat + status pill + (optional) pending-question queue

## 13. Locked model lineup for Phase 1.5 bake-off

**12 models, 4 tiers, picked for family/size diversity.** Full list of all 39 available models lives in `AVAILABLE_MODELS.txt`.

| Tier | Model ID | Family | Approx size |
|---|---|---|---|
| **Tiny/fast (≤20B)** | `gemma3:4b` | Google | ~4B |
| | `ministral-3:8b` | Mistral | ~8B |
| | `gpt-oss:20b` | OpenAI open-weight | ~20B |
| **Mid (25B-80B)** | `nemotron-3-nano:30b` | NVIDIA | ~30B |
| | `gemma4:31b` | Google (newer gen) | ~31B |
| | `qwen3-next:80b` | Alibaba | ~80B |
| **Large (100B-300B)** | `gpt-oss:120b` | OpenAI open-weight | ~120B |
| | `nemotron-3-super` | NVIDIA | ~230B |
| **Flagship (400B+)** | `kimi-k2.6` | Moonshot | ~600B |
| | `deepseek-v4-pro` | DeepSeek (newest) | flagship |
| | `glm-5.1` | Zhipu (latest) | flagship |
| **Bonus** | `kimi-k2-thinking` | Moonshot reasoning | ~1T (CoT) |

**Excluded from bake-off** (kept available in API, just not in default run):
- **Specialized models**: `qwen3-vl:235b`, `qwen3-vl:235b-instruct` (vision), `qwen3-coder:480b`, `qwen3-coder-next`, `devstral-2:123b`, `devstral-small-2:24b` (code-tuned)
- **Older/sibling versions in same family**: `gemma3:12b`, `gemma3:27b`, `ministral-3:3b`, `ministral-3:14b`, `rnj-1:8b`, `glm-4.6`, `glm-4.7`, `glm-5`, `kimi-k2.5`, `kimi-k2:1t`, `deepseek-v3.1:671b`, `deepseek-v3.2`, `deepseek-v4-flash`, `minimax-m2`, `minimax-m2.1`, `minimax-m2.5`, `minimax-m2.7`, `cogito-2.1:671b`, `mistral-large-3:675b`, `gemini-3-flash-preview`

The skip list isn't permanent — once Phase 1.5 finishes and a top family emerges, we can drill into its siblings (e.g. compare `kimi-k2.6` vs `kimi-k2.5` vs `kimi-k2:1t` if Kimi looks strongest).

## 14. Phase 0 — open items

- **Domain for Cloudflare Tunnel**: auto `*.trycloudflare.com` for now; swap to a custom domain later when ready.
- **Resend**: plugged in as Supabase Custom SMTP. We'll wire this up alongside the auth flow in Phase 0 finishing steps.
- **Auth library**: **Supabase Auth** locked in (2026-05-03).
