import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-300">
        Logged in as <strong>{user?.email}</strong>. Traces will appear here in Phase 2.
      </p>
    </main>
  );
}
