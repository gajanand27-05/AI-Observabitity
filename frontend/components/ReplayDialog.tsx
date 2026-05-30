"use client";

import { useState, useEffect } from "react";
import { backendFetch } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Play, RotateCcw, AlertCircle } from "lucide-react";

interface ReplayDialogProps {
  traceId: string;
  originalPrompt?: string;
  onSuccess?: (newAnswer: string, newTraceId: string) => void;
}

export function ReplayDialog({ traceId, originalPrompt, onSuccess }: ReplayDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState(originalPrompt || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availablePrompts, setAvailablePrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      backendFetch("/admin/observability/prompts")
        .then(res => res.json())
        .then(data => {
          setAvailablePrompts(data.prompts);
          if (!prompt) setPrompt(data.default);
        });
    }
  }, [isOpen]);

  const handleReplay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backendFetch("/admin/observability/replay", {
        method: "POST",
        body: JSON.stringify({ trace_id: traceId, custom_prompt: prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (onSuccess) onSuccess(data.answer, data.new_trace_id);
      setIsOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <RotateCcw className="h-4 w-4 mr-2" /> Debug / Replay
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <CardHeader>
          <CardTitle>Replay Trace</CardTitle>
          <CardDescription>
            Experiment with a different prompt to see how it changes the answer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt Version Template</label>
            <select 
              className="w-full p-2 border rounded bg-background"
              onChange={(e) => setPrompt(availablePrompts[e.target.value])}
            >
              <option value="">Select a template...</option>
              {Object.keys(availablePrompts).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <textarea
              className="w-full min-h-[200px] p-3 font-mono text-sm border rounded bg-muted/30"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleReplay} disabled={loading || !prompt}>
              {loading ? "Replaying..." : "Run Replay"}
              <Play className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
