"use client";

import { useEffect, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Heartbeat {
  instance_id: string;
  last_seen: string;
  version: string;
  ollama_models_seen: string[];
  metadata: any;
}

export default function SystemStatusPage() {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await backendFetch("/admin/bakeoff/system/status");
      if (!res.ok) throw new Error("Failed to fetch system status");
      const data = await res.json();
      setHeartbeats(data.heartbeats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = (lastSeen: string) => {
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 60000; // 1 minute threshold
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">System Status</h1>

      {loading && <p>Loading system status...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!loading && !error && (
        <div className="grid gap-6">
          {heartbeats.length === 0 && <p>No backend instances detected.</p>}
          {heartbeats.map((hb) => (
            <Card key={hb.instance_id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-bold">{hb.instance_id}</CardTitle>
                  <CardDescription>Version: {hb.version}</CardDescription>
                </div>
                <Badge variant={isOnline(hb.last_seen) ? "default" : "destructive"}>
                  {isOnline(hb.last_seen) ? "ONLINE" : "OFFLINE"}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Last seen: {new Date(hb.last_seen).toLocaleString()}
                </div>
                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Ollama Models Seen:</h4>
                  <div className="flex flex-wrap gap-2">
                    {hb.ollama_models_seen.length > 0 ? (
                      hb.ollama_models_seen.map((m) => (
                        <Badge key={m} variant="outline">
                          {m}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground italic">No local models detected</span>
                    )}
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
