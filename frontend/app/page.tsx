import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold">AI Observability</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-300">
        Phase 0 scaffolding live. Chat, dashboards, and admin views land in later phases.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
