"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Database, 
  BarChart3, 
  AlertTriangle, 
  Users, 
  Clock, 
  Download,
  ArrowUpRight,
  TrendingUp,
  AlertCircle
} from "lucide-react";
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
  Line,
  AreaChart,
  Area
} from 'recharts';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch traces to calculate stats
        const tracesRes = await backendFetch("/traces");
        if (!tracesRes.ok) {
           const text = await tracesRes.text();
           throw new Error(`Traces API error (${tracesRes.status}): ${text}`);
        }
        const tracesData = await tracesRes.json();
        const traces = tracesData.traces || [];
        
        // Fetch system status
        const statusRes = await backendFetch("/admin/bakeoff/system/status");
        if (!statusRes.ok) {
           const text = await statusRes.text();
           throw new Error(`System status API error (${statusRes.status}): ${text}`);
        }
        const statusData = await statusRes.json();
        const heartbeats = statusData.heartbeats || [];
        const online = heartbeats.some((hb: any) => (Date.now() - new Date(hb.last_seen).getTime()) < 60000);
        setIsOnline(online);

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
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to fetch dashboard data");
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, []);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="container mx-auto py-10 px-8 space-y-10 max-w-7xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">Analytics</h1>
          <p className="text-slate-500 font-medium">Real-time system health and performance overview.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
             <Button variant="ghost" size="sm" className="rounded-lg h-8 px-3 text-[11px] font-bold uppercase tracking-wider transition-all" onClick={() => window.open(`${process.env.NEXT_PUBLIC_BACKEND_URL}/traces/export/csv`, '_blank')}>
               <Download className="h-3 w-3 mr-2 text-slate-500" /> CSV
             </Button>
             <Button variant="ghost" size="sm" className="rounded-lg h-8 px-3 text-[11px] font-bold uppercase tracking-wider transition-all" onClick={() => window.open(`${process.env.NEXT_PUBLIC_BACKEND_URL}/traces/export/json`, '_blank')}>
               <Download className="h-3 w-3 mr-2 text-slate-500" /> JSON
             </Button>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />
          <Badge variant={isOnline ? "default" : "destructive"} className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border-none shadow-md">
            {isOnline === null ? "CHECKING..." : isOnline ? "● Live" : "● Offline"}
          </Badge>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 shadow-none rounded-2xl">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-red-900 dark:text-red-200 text-lg">Backend Connection Error</h3>
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
              <div className="pt-4 flex gap-3">
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-red-200 dark:border-red-800 text-red-700 dark:text-red-400" onClick={() => window.location.reload()}>
                  Retry Connection
                </Button>
                <div className="text-[10px] text-red-500/60 font-mono mt-2 uppercase tracking-tight">
                  TARGET: {process.env.NEXT_PUBLIC_BACKEND_URL}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: "Total Traces", value: stats?.total_traces, icon: Activity, color: "text-blue-500", bg: "bg-blue-50/50 dark:bg-blue-900/10" },
          { label: "Active Users", value: stats?.total_users, icon: Users, color: "text-emerald-500", bg: "bg-emerald-50/50 dark:bg-emerald-900/10" },
          { label: "Avg Latency", value: stats ? `${stats.avg_latency}ms` : undefined, icon: Clock, color: "text-amber-500", bg: "bg-amber-50/50 dark:bg-amber-900/10" },
          { label: "System Errors", value: stats ? (stats.status_counts.find(s => s.name === 'error')?.value || 0) : undefined, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50/50 dark:bg-red-900/10" }
        ].map((stat, i) => (
          <Card key={i} className={cn("shadow-none border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 transition-all", loading && "animate-pulse")}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
                  <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    {loading ? "..." : stat.value ?? 0}
                  </div>
                </div>
                <div className={cn("p-2.5 rounded-xl shadow-sm", stat.bg, stat.color)}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Latency History Chart */}
        <Card className="shadow-none border-slate-200 dark:border-slate-800 overflow-hidden bg-white/50 dark:bg-slate-900/50">
          <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                   <TrendingUp className="h-4 w-4 text-primary" /> Latency Trend
                </CardTitle>
                <CardDescription className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Performance of last 20 requests</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 h-[350px]">
            {loading ? (
               <div className="h-full w-full flex items-center justify-center animate-pulse bg-slate-50/50 dark:bg-slate-800/20 rounded-xl" />
            ) : stats?.latency_history.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.latency_history}>
                  <defs>
                    <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} unit="ms" tick={{fill: '#94a3b8'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', color: '#fff' }}
                    itemStyle={{ color: '#60a5fa' }}
                  />
                  <Area type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorLat)" animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 border-2 border-dashed rounded-2xl">
                 <Activity className="h-8 w-8 opacity-20" />
                 <p className="italic text-xs font-medium uppercase tracking-widest">No latency data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Distribution Chart */}
        <Card className="shadow-none border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
          <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Model Distribution
            </CardTitle>
            <CardDescription className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Most active inference engines</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 h-[350px]">
            {loading ? (
               <div className="h-full w-full flex items-center justify-center animate-pulse bg-slate-50/50 dark:bg-slate-800/20 rounded-xl" />
            ) : stats?.model_usage.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.model_usage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={10} hide />
                  <YAxis dataKey="name" type="category" fontSize={10} axisLine={false} tickLine={false} width={80} tick={{fill: '#94a3b8', fontWeight: 'bold'}} />
                  <Tooltip 
                    cursor={{fill: 'rgba(0,0,0,0.05)'}}
                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                    {stats.model_usage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 border-2 border-dashed rounded-2xl">
                 <Database className="h-8 w-8 opacity-20" />
                 <p className="italic text-xs font-medium uppercase tracking-widest">No usage patterns found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "Bad Answers", href: "/admin/bad-answers", icon: AlertTriangle, desc: "Review flagged traces", variant: "destructive" },
          { label: "Model Bake-off", href: "/admin/bakeoff", icon: BarChart3, desc: "Tournament results", variant: "default" },
          { label: "System Status", href: "/admin/system", icon: Database, desc: "Local Ollama health", variant: "default" },
        ].map((action, i) => (
          <Link key={i} href={action.href}>
            <div className="group p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary transition-all shadow-sm hover:shadow-xl hover:-translate-y-1 active:translate-y-0">
              <div className="flex justify-between items-start mb-4">
                <div className={cn("p-2.5 rounded-xl shadow-sm", action.variant === "destructive" ? "bg-red-50 dark:bg-red-900/20 text-red-500" : "bg-primary/10 text-primary")}>
                  <action.icon className="h-6 w-6" />
                </div>
                <ArrowUpRight className="h-5 w-5 text-slate-300 group-hover:text-primary transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <h3 className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-slate-50">{action.label}</h3>
              <p className="text-sm text-slate-500 font-medium">{action.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
