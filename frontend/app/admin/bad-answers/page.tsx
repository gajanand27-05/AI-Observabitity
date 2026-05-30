"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, MessageSquare } from "lucide-react";

interface Violation {
  rule_name: string;
  severity: string;
  details: any;
}

interface Trace {
  id: string;
  created_at: string;
  question: string;
  final_answer: string;
  model_id: string;
  status: string;
  rule_violations: Violation[];
}

export default function BadAnswersPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await backendFetch("/admin/observability/bad-answers");
        if (!res.ok) throw new Error("Failed to fetch bad answers");
        const data = await res.json();
        setTraces(data.traces || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="container mx-auto py-10 px-4 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Bad Answers</h1>
        <Badge variant="destructive" className="text-lg py-1 px-3">
          {traces.length} Flagged
        </Badge>
      </div>

      <p className="text-muted-foreground">
        These traces have been automatically flagged by rules or manually by users.
      </p>

      {loading ? (
        <p>Loading flagged traces...</p>
      ) : error ? (
        <p className="text-destructive">Error: {error}</p>
      ) : (
        <div className="grid gap-6">
          {traces.length === 0 && (
            <div className="text-center py-20 border rounded-lg bg-muted/20">
              <p className="text-muted-foreground italic">No bad answers found. Great job!</p>
            </div>
          )}
          {traces.map((trace) => (
            <Card key={trace.id} className="border-destructive/50">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{trace.id.split('-')[0]}</span>
                      <span>•</span>
                      <span>{new Date(trace.created_at).toLocaleString()}</span>
                    </div>
                    <CardTitle className="text-lg">{trace.question}</CardTitle>
                    <CardDescription>{trace.model_id}</CardDescription>
                  </div>
                  <Link href={`/dashboard/traces/${trace.id}`}>
                    <Badge variant="outline" className="hover:bg-accent transition-colors cursor-pointer">
                      View Full Trace <ChevronRight className="h-3 w-3 ml-1" />
                    </Badge>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted/50 p-3 rounded text-sm italic border-l-4 border-muted">
                    <MessageSquare className="h-4 w-4 inline mr-2 opacity-50" />
                    {trace.final_answer ? (trace.final_answer.length > 200 ? trace.final_answer.substring(0, 200) + "..." : trace.final_answer) : "No answer generated"}
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Violations / Signals
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {trace.rule_violations && trace.rule_violations.length > 0 ? (
                        trace.rule_violations.map((v, i) => (
                          <Badge key={i} variant={v.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">
                            {v.rule_name}: {v.severity}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Manual User Flag</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
