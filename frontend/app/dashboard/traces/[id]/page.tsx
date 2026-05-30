"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  Clock, 
  Zap, 
  Database, 
  MessageSquare, 
  AlertTriangle,
  History,
  Cpu,
  Terminal,
  Search
} from "lucide-react";
import { ReplayDialog } from "@/components/ReplayDialog";
import { cn } from "@/lib/utils";

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

interface Violation {
  rule_name: string;
  severity: string;
  details: any;
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
    rule_violations?: Violation[];
  };
  spans: Span[];
}

export default function TraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    backendFetch("/me").then(res => {
      if (res.ok) return res.json();
      return { role: "user" };
    }).then(user => {
      setIsAdmin(user.role === "admin" || user.email === "gajanandvd2005@gmail.com");
    });

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

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-500 font-medium animate-pulse">Analyzing trace history...</p>
    </div>
  );

  if (error) return (
    <div className="container mx-auto py-20 px-8 text-center">
       <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 p-8 rounded-2xl max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Error Loading Trace</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <Link href="/dashboard">
            <Badge variant="outline" className="hover:bg-slate-100 cursor-pointer">Return to Dashboard</Badge>
          </Link>
       </div>
    </div>
  );

  if (!data) return <div className="p-10 text-center">Trace not found.</div>;

  const { trace, spans } = data;

  return (
    <div className="container mx-auto py-10 px-8 space-y-10 max-w-6xl">
      <div className="flex flex-col gap-6">
        <Link href="/dashboard" className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-primary transition-colors w-fit">
          <ChevronLeft className="h-3 w-3 mr-1" /> Back to History
        </Link>

        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3">
              <Badge variant={trace.status === "ok" ? "default" : "destructive"} className="px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest">
                {trace.status.toUpperCase()}
              </Badge>
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <History className="h-3 w-3" /> {new Date(trace.created_at).toLocaleString()}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight">{trace.question}</h1>
          </div>
          {isAdmin && (
            <div className="flex-shrink-0">
              <ReplayDialog 
                traceId={trace.id} 
                onSuccess={(answer, newId) => {
                  window.location.href = `/dashboard/traces/${newId}`;
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Latency", value: `${trace.total_latency_ms}ms`, icon: Clock, sub: "Total RTT" },
          { label: "Tokens", value: trace.prompt_tokens + trace.completion_tokens, icon: Zap, sub: `${trace.prompt_tokens}p / ${trace.completion_tokens}c` },
          { label: "Model", value: trace.model_id?.split(':')[0], icon: Cpu, sub: "Inference" },
          { label: "Embedder", value: trace.embedder_id, icon: Database, sub: "Vector Space" }
        ].map((item, i) => (
          <Card key={i} className="shadow-none border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-1">
              <item.icon className="h-4 w-4 text-slate-400 mb-1" />
              <div className="text-lg font-bold tracking-tight">{item.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</div>
              <div className="text-[9px] text-slate-400 italic">{item.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Answer & Violations */}
        <div className="lg:col-span-2 space-y-8">
          <Card className={cn(
            "shadow-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative overflow-hidden",
            trace.status === 'flagged' && "border-red-200 dark:border-red-900/30"
          )}>
            {trace.status === 'flagged' && <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />}
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-50 dark:border-slate-800/50 pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Assistant Answer
              </CardTitle>
              {trace.rule_violations && trace.rule_violations.length > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  {trace.rule_violations.length} Critical Issues
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <p className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">
                {trace.final_answer || <span className="italic text-slate-400 text-sm">Execution failed or returned no answer.</span>}
              </p>
              
              {trace.rule_violations && trace.rule_violations.length > 0 && (
                <div className="p-5 border border-red-200 dark:border-red-900/20 bg-red-50/50 dark:bg-red-900/5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2" /> Automated Quality Analysis
                  </h4>
                  <div className="grid gap-3">
                    {trace.rule_violations.map((v, i) => (
                      <div key={i} className="flex gap-4 p-3 rounded-xl bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/20">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[10px] text-red-500">{v.rule_name}</span>
                            <Badge variant={v.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[9px] h-4 py-0">
                              {v.severity}
                            </Badge>
                          </div>
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{v.details?.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Detailed Timeline */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Terminal className="h-5 w-5 text-slate-400" /> Execution Timeline
            </h2>
            <div className="space-y-6 relative border-l-2 border-slate-100 dark:border-slate-800 ml-4 pl-8">
              {spans.map((span) => (
                <div key={span.id} className="relative">
                  <div className={cn(
                    "absolute -left-[41px] top-2 h-4 w-4 rounded-full border-4 border-slate-50 dark:border-slate-950 shadow-sm transition-colors",
                    span.error ? "bg-red-500" : "bg-primary"
                  )} />
                  <Card className="shadow-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800/50 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-xs font-mono font-bold tracking-tight">
                        {span.kind.toUpperCase()}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px] font-bold bg-white dark:bg-slate-900 py-0 h-5">
                        {span.duration_ms}ms
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-0">
                      {span.error && (
                        <div className="px-4 py-3 bg-red-500/10 text-red-500 text-xs font-bold border-b border-red-500/20">
                           {span.error}
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                        <div className="p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Input</p>
                          <pre className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl overflow-auto max-h-60 text-[10px] font-mono scrollbar-hide border border-slate-100 dark:border-slate-800">
                            {JSON.stringify(span.input_json, null, 2)}
                          </pre>
                        </div>
                        <div className="p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Output</p>
                          <pre className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl overflow-auto max-h-60 text-[10px] font-mono scrollbar-hide border border-slate-100 dark:border-slate-800">
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

        {/* Right Column: Knowledge Base / Context */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Search className="h-5 w-5 text-slate-400" /> Context Retrieved
          </h2>
          <div className="space-y-4">
             {spans.find(s => s.kind === 'retrieve')?.output_json?.map((chunk: any, i: number) => (
                <Card key={i} className="shadow-none border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 group">
                  <CardHeader className="p-4 pb-2 space-y-1">
                    <div className="flex justify-between items-start">
                       <Badge variant="secondary" className="text-[9px] uppercase font-bold py-0 h-4">Chunk {chunk.chunk_idx}</Badge>
                       <span className="text-[10px] font-bold text-emerald-500">Score: {chunk.score.toFixed(3)}</span>
                    </div>
                    <CardTitle className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-primary transition-colors">
                      {chunk.doc_slug.replace(/-/g, ' ')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-[11px] leading-relaxed text-slate-500 italic line-clamp-6 group-hover:line-clamp-none transition-all">
                      "{chunk.text}"
                    </p>
                  </CardContent>
                </Card>
             )) || (
               <div className="p-8 border-2 border-dashed rounded-2xl text-center">
                  <Database className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-medium">No context was retrieved for this trace.</p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
