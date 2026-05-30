"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { backendFetch } from "@/lib/backend";

type Chunk = { doc_slug: string; chunk_idx: number; text: string; score: number };
type ChatModel = { id: string; family: string; tier: string; approx_size: string };
type ModelsResp = { chat_models: ChatModel[]; embedders: string[]; default_model: string };
type ChatResp = {
  answer: string;
  chunks: Chunk[];
  model: string;
  embedder: string;
  latency_ms: number;
  trace_id: string;
};

export default function ChatPage() {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [embedders, setEmbedders] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [embedder, setEmbedder] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<ChatResp | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await backendFetch("/models");
        if (!r.ok) throw new Error(`/models ${r.status}`);
        const j: ModelsResp = await r.json();
        setModels(j.chat_models);
        setEmbedders(j.embedders);
        if (j.default_model) setModel(j.default_model);
        else if (j.chat_models.length) setModel(j.chat_models[0].id);
        if (j.embedders.length) setEmbedder(j.embedders[0]);
      } catch (e: unknown) {
        setError(`Failed to load models: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResp(null);
    try {
      const r = await backendFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, embedder }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`${r.status}: ${text}`);
      }
      setResp((await r.json()) as ChatResp);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold">Chat</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        20 Wikipedia articles on the history of computing. Ask anything.
      </p>

      <form onSubmit={ask} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="font-medium">Model</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.tier}, {m.approx_size})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Embedder</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
              value={embedder}
              onChange={(e) => setEmbedder(e.target.value)}
            >
              {embedders.map((emb) => (
                <option key={emb} value={emb}>
                  {emb}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          className="block w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 min-h-24"
          placeholder="Ask about Turing, C, Linux, the Web..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading || !question.trim() || !model || !embedder}
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && (
        <div className="rounded bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {resp && (
        <section className="space-y-4">
          <div>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Answer</h2>
              <Link
                href={`/dashboard/traces/${resp.trace_id}`}
                className="text-xs flex items-center text-primary hover:underline"
              >
                View Trace Details <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {resp.model} · {resp.embedder} · {resp.latency_ms} ms
            </p>
            <div className="mt-2 whitespace-pre-wrap rounded bg-gray-50 dark:bg-gray-900 p-4">
              {resp.answer}
            </div>
          </div>
          <details className="rounded border border-gray-200 dark:border-gray-800 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Retrieved chunks ({resp.chunks.length})
            </summary>
            <ol className="mt-3 space-y-3">
              {resp.chunks.map((c, i) => (
                <li
                  key={i}
                  className="border-l-2 border-gray-300 dark:border-gray-700 pl-3 text-sm"
                >
                  <div className="text-xs text-gray-500">
                    {c.doc_slug.replace(/-/g, " ")} · chunk {c.chunk_idx} · score{" "}
                    {c.score.toFixed(3)}
                  </div>
                  <div className="mt-1 text-gray-700 dark:text-gray-300">{c.text}</div>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </main>
  );
}
