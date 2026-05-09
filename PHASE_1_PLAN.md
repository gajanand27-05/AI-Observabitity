# Phase 1 — Minimal RAG (no observability yet)

> Phase 0 deliverable: ✅ logged-in user can hit backend through tunnel.
> Phase 1 deliverable: 🎯 logged-in user can ask a question, swap model + embedder, and get a real answer grounded in 20 Wikipedia articles.
>
> No tracing, no rules engine, no dashboards yet — those are Phase 2+.

---

## A. Decisions I need from you before coding

### A1. Pick the document topic *(most important)*

20 articles on **one coherent topic** beats 20 random topics — gives us interesting multi-hop questions for the bake-off later. Four candidates:

| Topic | Why it's good for observability testing | Sample article ideas |
|---|---|---|
| **History of computing & programming languages** | Lots of dates, name overlap (Turing, Knuth), invites multi-hop ("which language was inspired by which") | C, Python, Lisp, Turing, ENIAC, Linus Torvalds, Unix, Algol, Smalltalk, Ada Lovelace … |
| **Indian history (Mughal → independence)** | Dense dates + lineage, factual, regionally relevant to you | Mughal Empire, Akbar, Maratha Empire, East India Company, 1857 rebellion, Bhagat Singh, Gandhi, Nehru … |
| **Solar system + space exploration** | Numerical (distances, dates), overlapping (planets vs missions), great for hallucination spotting | Mars, Jupiter, Voyager 1, Apollo 11, ISS, Hubble, James Webb, Cassini, SpaceX, Perseverance … |
| **Formula 1 (sport + rules + history)** | Mix of rules text + biographical + statistical, names overlap a lot | Formula One, F1 regulations, Lewis Hamilton, Senna, Schumacher, Monaco GP, Ferrari, McLaren, DRS, Pirelli … |

**→ Tell me which one (or propose your own).** Once picked, I'll list 20 specific article titles and you confirm/edit.

### A2. Confirm defaults (I'll proceed with these unless you object)

| Knob | Default | Tunable later |
|---|---|---|
| Chunk size | 1000 chars, 150 char overlap | Yes — CLI flag, swept in Phase 1.5 |
| Top-K retrieval | 5 chunks | Yes — `/chat` request param |
| Embedding models | `nomic-embed-text` (768-dim) + `bge-m3` (1024-dim), local Ollama | Locked — both run side-by-side |
| Chunk strategy | Plain char windows (no semantic splitting) | Phase 1.5 can compare semantic chunkers |
| RAG prompt | "Answer the question using ONLY the context. If the answer isn't in the context, say so." | Versioned in Phase 5 |
| Doc storage | Cleaned `.txt` per article committed to `backend/data/docs/` (gitignored chroma) | Reproducible from any clone |

---

## B. What I'll build (in this order)

```
1. Ingestion ──────► 2. Chunk + embed ──────► 3. Retrieve ──────► 4. /chat ──────► 5. Chat UI
   (one-off CLI)      (one-off CLI, idempotent)  (in-process)      (FastAPI route)   (Next.js page)
```

### B1. `backend/app/rag/ingest.py` — fetch + clean Wikipedia
- Hits Wikipedia's Parsoid HTML API (`/api/rest_v1/page/html/{title}`)
- Strips HTML → plain text (BeautifulSoup)
- Saves to `backend/data/docs/{slug}.txt` (idempotent — skip if exists)

### B2. `backend/app/rag/chunk.py` — char-window chunker
- Configurable size + overlap
- Returns `[{doc_slug, chunk_idx, text, start, end}]`

### B3. `backend/app/rag/embed.py` — dual-collection indexer
- Persistent Chroma store at `backend/data/chroma/`
- Two collections: `wiki_nomic`, `wiki_bge_m3`
- Re-uses `LocalOllama.embed()` from `ollama_client.py`
- Idempotent — skips collection if doc count matches expected

### B4. `backend/scripts/build_index.py` — orchestrator CLI
- Runs B1 → B2 → B3 end-to-end
- Run once after picking the 20 docs, re-runnable

### B5. `backend/app/rag/retrieve.py` — query-time retrieval
- `retrieve(query, embedder, k) -> list[Chunk]`
- Embeds query with same embedder used for indexing, queries Chroma

### B6. `backend/app/routes/chat.py` — `/chat` endpoint
- `POST /chat` (auth required via `require_user`)
- Body: `{ question, model, embedder, k? }`
- Uses default `k=5`, returns `{ answer, chunks, model, embedder, latency_ms }`
- Calls `CloudOllama.chat()` with system prompt + retrieved chunks
- Also: `GET /models` returns the 12 locked models from registry, for the dropdown

### B7. `frontend/app/chat/page.tsx` — chat UI
- Already protected by `middleware.ts`
- Model dropdown (from `/models`), embedder dropdown (`nomic-embed-text` / `bge-m3`)
- Question input → POST `/chat` via `backendFetch()`
- Renders answer + collapsible "Retrieved chunks" panel showing each chunk's source article + score

### B8. `backend/scripts/test_phase1.py` — pipeline smoke test
- One question end-to-end against both embedders, asserts non-empty answer + ≥1 chunk retrieved

---

## C. Dependencies I'll add

**`backend/requirements.txt`:**
- `beautifulsoup4==4.12.3` (HTML strip)
- `lxml==5.3.0` (BS4 parser)

**`frontend/package.json`:** none (using existing fetch + Tailwind)

---

## D. New files / touched files

```
NEW:
  backend/app/rag/__init__.py
  backend/app/rag/ingest.py
  backend/app/rag/chunk.py
  backend/app/rag/embed.py
  backend/app/rag/retrieve.py
  backend/app/routes/__init__.py
  backend/app/routes/chat.py
  backend/scripts/build_index.py
  backend/scripts/test_phase1.py
  backend/data/docs/<20 .txt files>      (committed)
  frontend/app/chat/page.tsx

TOUCHED:
  backend/app/main.py                    (mount /chat and /models)
  backend/requirements.txt               (add bs4, lxml)
  frontend/app/dashboard/page.tsx        (link to /chat)
```

`backend/data/chroma/` stays gitignored (already in root `.gitignore`).

---

## E. How we'll know Phase 1 is done

- [ ] Run `python -m scripts.build_index` once → both Chroma collections populated
- [ ] `python -m scripts.test_phase1` returns answers from both embedders
- [ ] Browser flow: log in → /chat → ask "When was X founded?" → get a grounded answer with chunks shown
- [ ] Switch the embedder dropdown → answer regenerates from the other index
- [ ] Switch the model dropdown across 3 different models → all return successfully

That's the deliverable. **Phase 1.5 (the bake-off) is where we let data pick the default model — Phase 1 just makes the harness work.**

---

## F. What's *out of scope* for Phase 1 (don't get sucked in)

- ❌ No trace/span writes to Postgres (Phase 2)
- ❌ No heartbeat (Phase 2)
- ❌ No rules engine / Bad Answers (Phase 4)
- ❌ No streaming (Phase 6 — keep response simple JSON for now)
- ❌ No rate limiting (Phase 6)

---

**Your turn:** answer A1 (topic) and confirm A2 (or change the defaults). Then I'll implement B1–B8 and pause for your test.
