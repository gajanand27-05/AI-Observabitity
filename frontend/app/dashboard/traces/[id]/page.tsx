"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Clock, Zap, Database, MessageSquare } from "lucide-react";

interface Span {
  id: string;
  ord: number;
  kind: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  input_json: any;
  output_json: any;
  error: string | null;
}

interface TraceData {
  trace: {
    id: string;
    created_at: string;
    question: string;
    final_answer: string;
    model_id: string;
    embedder_id: string;
    total_latency_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    estimated_cost_usd: number;
    status: string;
  };
  spans: Span[];
}

export default function TraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrace = async () => {
      try {
        const res = await backendFetch(`/traces/${id}`);
        if (!res.ok) throw new Error("Failed to fetch trace details");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTrace();
  }, [id]);

  if (loading) return <div className="p-10 text-center">Loading trace...</div>;
  if (error) return <div className="p-10 text-center text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-10 text-center">Trace not found.</div>;

  const { trace, spans } = data;

  return (
    <div className="container mx-auto py-10 px-4 space-y-8 max-w-4xl">
      <Link href="/dashboard" className="flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Badge variant={trace.status === "ok" ? "default" : "destructive"}>
            {trace.status}
          </Badge>
          <span className="text-sm text-muted-foreground">{new Date(trace.created_at).toLocaleString()}</span>
        </div>
        <h1 className="text-3xl font-bold">{trace.question}</h1>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold">{trace.total_latency_ms}ms</div>
            <div className="text-xs text-muted-foreground">Latency</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <Zap className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold">{trace.prompt_tokens + trace.completion_tokens}</div>
            <div className="text-xs text-muted-foreground">Tokens</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <MessageSquare className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold truncate w-full text-center" title={trace.model_id}>{trace.model_id.split(':')[0]}</div>
            <div className="text-xs text-muted-foreground">Model</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <Database className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold truncate w-full text-center" title={trace.embedder_id}>{trace.embedder_id}</div>
            <div className="text-xs text-muted-foreground">Embedder</div>
          </CardContent>
        </Card>
      </div>

      {/* Answer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Final Answer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap leading-relaxed">{trace.final_answer}</p>
        </CardContent>
      </Card>

      {/* Spans Timeline */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Execution Timeline</h2>
        <div className="space-y-4 relative border-l-2 border-muted ml-4 pl-8">
          {spans.map((span) => (
            <div key={span.id} className="relative">
              <div className="absolute -left-[41px] top-1 h-4 w-4 rounded-full bg-primary border-4 border-background" />
              <Card>
                <CardHeader className="py-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-mono">{span.kind}</CardTitle>
                    <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded">
                      {span.duration_ms}ms
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="py-3 text-xs">
                  {span.error && <p className="text-destructive mb-2 font-bold">Error: {span.error}</p>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-muted-foreground block mb-1">Input</span>
                      <pre className="bg-muted p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(span.input_json, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Output</span>
                      <pre className="bg-muted p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(span.output_json, null, 2)}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
