"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  MessageSquarePlus, 
  History, 
  BarChart3, 
  AlertTriangle, 
  Database, 
  Activity, 
  LogOut,
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  isAdmin?: boolean;
}

export function Sidebar({ isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const navItems = [
    { label: "New Chat", href: "/chat", icon: MessageSquarePlus, section: "user" },
    { label: "History", href: "/dashboard", icon: History, section: "user" },
    { label: "Analytics", href: "/admin", icon: BarChart3, section: "admin", adminOnly: true },
    { label: "Bad Answers", href: "/admin/bad-answers", icon: AlertTriangle, section: "admin", adminOnly: true },
    { label: "Model Bake-off", href: "/admin/bakeoff", icon: LayoutDashboard, section: "admin", adminOnly: true },
    { label: "System Status", href: "/admin/system", icon: Database, section: "admin", adminOnly: true },
  ];

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-background border rounded-md"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 h-full bg-slate-950 text-slate-200 z-40 transition-all duration-300 border-r border-slate-800 flex flex-col",
        isCollapsed ? "w-16" : "w-64",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          {!isCollapsed && <span className="font-bold text-lg tracking-tight text-white">AI Observer</span>}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1.5 hover:bg-slate-900 rounded-md transition-colors"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 space-y-8">
          {/* User Section */}
          <div className="px-3 space-y-1">
            {!isCollapsed && <p className="px-3 text-[10px] font-bold uppercase text-slate-500 mb-2">General</p>}
            {filteredItems.filter(i => i.section === 'user').map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all group",
                  pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-slate-900 text-slate-400 hover:text-slate-100"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            ))}
          </div>

          {/* Admin Section */}
          {isAdmin && (
            <div className="px-3 space-y-1">
              {!isCollapsed && <p className="px-3 text-[10px] font-bold uppercase text-slate-500 mb-2">Administration</p>}
              {filteredItems.filter(i => i.section === 'admin').map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-all group",
                    pathname === item.href ? "bg-slate-100 text-slate-950 font-bold" : "hover:bg-slate-900 text-slate-400 hover:text-slate-100"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Footer / User Profile */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
