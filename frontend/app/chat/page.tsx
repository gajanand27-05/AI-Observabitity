"use client";

import { useEffect, useState, useRef } from "react";
import { backendFetch } from "@/lib/backend";
import { 
  SendHorizontal, 
  Bot, 
  User, 
  ExternalLink, 
  ThumbsUp, 
  ThumbsDown, 
  Database, 
  Cpu, 
  Settings2,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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

interface Message {
  role: "user" | "assistant";
  content: string;
  meta?: {
    model: string;
    latency: number;
    trace_id: string;
    chunks: Chunk[];
  };
}

export default function ChatPage() {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [embedders, setEmbedders] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedEmbedder, setSelectedEmbedder] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    (async () => {
      try {
        const r = await backendFetch("/models");
        if (!r.ok) throw new Error(`/models ${r.status}`);
        const j: ModelsResp = await r.json();
        setModels(j.chat_models);
        setEmbedders(j.embedders);
        if (j.default_model) setSelectedModel(j.default_model);
        else if (j.chat_models.length) setSelectedModel(j.chat_models[0].id);
        if (j.embedders.length) setSelectedEmbedder(j.embedders[0]);
      } catch (e: unknown) {
        setError(`Failed to load models: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  async function sendFeedback(trace_id: string, thumbs: number) {
    try {
      await backendFetch("/feedback", {
        method: "POST",
        body: JSON.stringify({ trace_id, thumbs }),
      });
      setFeedbackSent(prev => ({ ...prev, [trace_id]: true }));
    } catch (e) {
      console.error("Failed to send feedback", e);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const r = await backendFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg.content, model: selectedModel, embedder: selectedEmbedder }),
      });
      
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`${r.status}: ${text}`);
      }
      
      const data = (await r.json()) as ChatResp;
      const botMsg: Message = {
        role: "assistant",
        content: data.answer,
        meta: {
          model: data.model,
          latency: data.latency_ms,
          trace_id: data.trace_id,
          chunks: data.chunks
        }
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 relative">
      {/* Header / Settings Toggle */}
      <header className="flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Chat</h1>
          <div className="hidden md:flex items-center gap-2">
             <Badge variant="outline" className="gap-1.5 py-1">
               <Cpu className="h-3 w-3" /> {selectedModel.split(':')[0]}
             </Badge>
             <Badge variant="outline" className="gap-1.5 py-1">
               <Database className="h-3 w-3" /> {selectedEmbedder}
             </Badge>
          </div>
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        >
          <Settings2 className="h-4 w-4" />
          Settings
          <ChevronDown className={cn("h-3 w-3 transition-transform", showSettings && "rotate-180")} />
        </button>

        {/* Settings Popover */}
        {showSettings && (
          <div className="absolute top-16 right-6 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 z-50 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500">Model</label>
              <select
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id} ({m.approx_size})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500">Embedder</label>
              <select
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm"
                value={selectedEmbedder}
                onChange={(e) => setSelectedEmbedder(e.target.value)}
              >
                {embedders.map((emb) => (
                  <option key={emb} value={emb}>{emb}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </header>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-8 pb-32">
          {messages.length === 0 && (
            <div className="text-center py-20 space-y-4">
              <div className="bg-primary/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto text-primary">
                <Bot className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">How can I help today?</h2>
                <p className="text-slate-500 max-w-sm mx-auto">
                  Ask me anything about the history of computing—from Turing to the birth of the Linux kernel.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={cn(
              "flex gap-4 group",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-5 w-5" />
                </div>
              )}
              
              <div className={cn(
                "max-w-[85%] space-y-2",
                msg.role === "user" ? "flex flex-col items-end" : ""
              )}>
                <div className={cn(
                  "p-4 rounded-2xl shadow-sm",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground rounded-tr-none" 
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-tl-none"
                )}>
                  <p className="whitespace-pre-wrap leading-relaxed text-sm">
                    {msg.content}
                  </p>
                </div>

                {msg.meta && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 px-1">
                      <span className="text-[10px] font-medium text-slate-500">
                        {msg.meta.model.split(':')[0]} • {msg.meta.latency}ms
                      </span>
                      <Link 
                        href={`/dashboard/traces/${msg.meta.trace_id}`}
                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        TRACE <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                      
                      <div className="flex items-center gap-1 border-l pl-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        {feedbackSent[msg.meta.trace_id] ? (
                          <span className="text-[10px] text-green-600 font-medium">Recorded</span>
                        ) : (
                          <>
                            <button onClick={() => sendFeedback(msg.meta.trace_id!, 1)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors">
                              <ThumbsUp className="h-3 w-3 text-slate-500 hover:text-primary" />
                            </button>
                            <button onClick={() => sendFeedback(msg.meta.trace_id!, -1)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors">
                              <ThumbsDown className="h-3 w-3 text-slate-500 hover:text-red-500" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Source Accordion */}
                    <details className="text-[11px] text-slate-500 bg-slate-100/50 dark:bg-slate-800/30 rounded-lg p-2 group/sources">
                      <summary className="cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors font-medium">
                        View Sources ({msg.meta.chunks.length})
                      </summary>
                      <div className="mt-2 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-2">
                        {msg.meta.chunks.map((c, i) => (
                          <div key={i} className="bg-white/50 dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                            <div className="font-bold text-slate-900 dark:text-slate-300 mb-1">{c.doc_slug.replace(/-/g, ' ')} (Score: {c.score.toFixed(2)})</div>
                            <div className="line-clamp-2 italic">"{c.text}"</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-4 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
                <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm">
              <p className="font-bold mb-1">Request Failed</p>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50 dark:via-slate-950 to-transparent pointer-events-none">
        <div className="max-w-3xl mx-auto w-full pointer-events-auto">
          <form onSubmit={ask} className="relative group">
            <textarea
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-4 pr-14 shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[60px] max-h-48 scrollbar-hide text-sm resize-none"
              placeholder="Ask about Turing, C, Linux, the Web..."
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="absolute right-3 bottom-3 p-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-all shadow-lg active:scale-95"
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          </form>
          <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">
            AI can make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}
