"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, BarChart3, AlertTriangle, Users, Clock, Download } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { Button } from "@/components/ui/button";

interface AdminStats {
  total_traces: number;
  total_users: number;
  avg_latency: number;
  total_cost: number;
  model_usage: { name: string; value: number }[];
  status_counts: { name: string; value: number }[];
  latency_history: { time: string; latency: number }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        // Fetch traces to calculate stats (in a real app, the backend would provide an /admin/stats endpoint)
        const tracesRes = await backendFetch("/traces");
        const traces = (await tracesRes.json()).traces || [];
        
        // Fetch system status
        const statusRes = await backendFetch("/admin/bakeoff/system/status");
        const heartbeats = (await statusRes.json()).heartbeats || [];
        const online = heartbeats.some((hb: any) => (Date.now() - new Date(hb.last_seen).getTime()) < 60000);
        setIsOnline(online);

        // Aggregate stats
        const modelCounts: Record<string, number> = {};
        const statusCounts: Record<string, number> = {};
        let totalLatency = 0;
        let totalCost = 0;
        const uniqueUsers = new Set();
        
        const latencyHistory = traces.slice(0, 20).reverse().map((t: any) => ({
          time: new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          latency: t.total_latency_ms
        }));

        traces.forEach((t: any) => {
          modelCounts[t.model_id] = (modelCounts[t.model_id] || 0) + 1;
          statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
          totalLatency += t.total_latency_ms || 0;
          totalCost += t.estimated_cost_usd || 0;
          uniqueUsers.add(t.user_id);
        });

        setStats({
          total_traces: traces.length,
          total_users: uniqueUsers.size,
          avg_latency: traces.length ? Math.round(totalLatency / traces.length) : 0,
          total_cost: totalCost,
          model_usage: Object.entries(modelCounts).map(([name, value]) => ({ name: name.split(':')[0], value })),
          status_counts: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
          latency_history: latencyHistory,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, []);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="container mx-auto py-10 px-4 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin Console</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`${process.env.NEXT_PUBLIC_BACKEND_URL}/traces/export/csv`, '_blank')}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(`${process.env.NEXT_PUBLIC_BACKEND_URL}/traces/export/json`, '_blank')}>
              <Download className="h-4 w-4 mr-2" /> JSON
            </Button>
          </div>
          <div className="flex items-center gap-2 border-l pl-4">
            <span className="text-sm text-muted-foreground">Backend:</span>
            <Badge variant={isOnline ? "default" : "destructive"}>
              {isOnline === null ? "CHECKING..." : isOnline ? "ONLINE" : "OFFLINE"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Activity className="h-4 w-4 mr-2 text-muted-foreground" /> Total Traces
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_traces || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Users className="h-4 w-4 mr-2 text-muted-foreground" /> Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Clock className="h-4 w-4 mr-2 text-muted-foreground" /> Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.avg_latency || 0}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2 text-muted-foreground" /> Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.status_counts.find(s => s.name === 'error')?.value || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Model Usage Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Model Distribution</CardTitle>
            <CardDescription>Most used models across all users</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {stats?.model_usage.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.model_usage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8">
                    {stats.model_usage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        {/* Latency History Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Latency Trend</CardTitle>
            <CardDescription>Latency of the last 20 requests (ms)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {stats?.latency_history.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.latency_history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" fontSize={10} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="latency" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Management</CardTitle>
            <CardDescription>Direct access to administrative tools</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href="/admin/bad-answers">
              <div className="flex items-center p-3 rounded-lg border hover:bg-accent transition-colors">
                <AlertTriangle className="h-5 w-5 mr-3 text-destructive" />
                <div>
                  <div className="font-semibold">Bad Answers</div>
                  <div className="text-xs text-muted-foreground">Review flagged traces and rule violations</div>
                </div>
              </div>
            </Link>
            <Link href="/admin/bakeoff">
              <div className="flex items-center p-3 rounded-lg border hover:bg-accent transition-colors">
                <BarChart3 className="h-5 w-5 mr-3 text-primary" />
                <div>
                  <div className="font-semibold">Model Bake-off</div>
                  <div className="text-xs text-muted-foreground">View performance leaderboards and evals</div>
                </div>
              </div>
            </Link>
            <Link href="/admin/system">
              <div className="flex items-center p-3 rounded-lg border hover:bg-accent transition-colors">
                <Database className="h-5 w-5 mr-3 text-primary" />
                <div>
                  <div className="font-semibold">System Status</div>
                  <div className="text-xs text-muted-foreground">Monitor backend heartbeats and Ollama models</div>
                </div>
              </div>
            </Link>
            <div className="flex items-center p-3 rounded-lg border opacity-50 cursor-not-allowed">
              <Users className="h-5 w-5 mr-3 text-primary" />
              <div>
                <div className="font-semibold">User Management</div>
                <div className="text-xs text-muted-foreground">Manage accounts and rate limits (Coming Soon)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
