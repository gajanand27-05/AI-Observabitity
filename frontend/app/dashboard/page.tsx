"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Clock, Zap, Coins, ArrowRight, Cpu } from "lucide-react";

interface Trace {
  id: string;
  created_at: string;
  question: string;
  final_answer: string;
  model_id: string;
  total_latency_ms: number;
  total_tokens: number;
  estimated_cost_usd: number;
  status: string;
}

export default function UserDashboard() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchTraces = async () => {
      try {
        const res = await backendFetch("/traces");
        if (!res.ok) throw new Error("Failed to fetch traces");
        const data = await res.json();
        setTraces(data.traces || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTraces();
  }, []);

  const filteredTraces = traces.filter((t) =>
    t.question.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    count: traces.length,
    avgLatency: traces.length
      ? Math.round(traces.reduce((acc, t) => acc + (t.total_latency_ms || 0), 0) / traces.length)
      : 0,
    totalTokens: traces.reduce((acc, t) => acc + (t.total_tokens || 0), 0),
  };

  return (
    <div className="container mx-auto py-10 px-8 space-y-8 max-w-5xl">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Your Traces</h1>
          <p className="text-sm text-muted-foreground text-slate-500">
            View and search through your previous interactions.
          </p>
        </div>
        <Link
          href="/chat"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-all shadow-sm text-sm font-medium"
        >
          New Chat
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgLatency}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & List */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search questions..."
            className="w-full pl-10 pr-4 py-2 rounded-md border bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p>Loading traces...</p>
        ) : error ? (
          <p className="text-destructive">Error: {error}</p>
        ) : (
          <div className="grid gap-4">
            {filteredTraces.map((trace) => (
              <Link key={trace.id} href={`/dashboard/traces/${trace.id}`}>
                <Card className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer border-slate-200 dark:border-slate-800 shadow-none">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-2 overflow-hidden flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={trace.status === "ok" ? "default" : "destructive"} className="text-[10px] uppercase font-bold py-0">
                          {trace.status}
                        </Badge>
                        <span className="text-[10px] font-medium text-slate-400">
                          {new Date(trace.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-semibold text-sm truncate">{trace.question}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                        <span className="flex items-center gap-1"><Cpu className="h-2.5 w-2.5" /> {trace.model_id.split(':')[0]}</span>
                        <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {trace.total_latency_ms}ms</span>
                        <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> {trace.total_tokens} tokens</span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-300 ml-4 flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
            {filteredTraces.length === 0 && (
              <p className="text-center text-muted-foreground py-10">No traces found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
