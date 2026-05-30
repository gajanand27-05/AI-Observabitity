import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "AI Observability",
  description: "RAG chatbot + observability dashboard",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Simple admin check: if metadata role is admin
  const isAdmin = user?.app_metadata?.role === 'admin' || user?.email === 'gajanandvd2005@gmail.com';

  // Paths where we don't want the sidebar (login, signup, etc.)
  const showSidebar = !!user;

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-white text-gray-900 dark:bg-slate-950 dark:text-gray-100 flex">
        {showSidebar && <Sidebar isAdmin={isAdmin} />}
        <main className={showSidebar ? "flex-1 lg:pl-64 transition-all duration-300" : "flex-1"}>
          {children}
        </main>
      </body>
    </html>
  );
}
