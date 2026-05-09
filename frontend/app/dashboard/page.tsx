import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-gray-600 dark:text-gray-300">
        Logged in as <strong>{user?.email}</strong>. Traces will appear here in Phase 2.
      </p>
      <Link
        href="/chat"
        className="inline-block rounded bg-black text-white px-4 py-2 text-sm hover:bg-gray-800"
      >
        Open chat →
      </Link>
    </main>
  );
}
