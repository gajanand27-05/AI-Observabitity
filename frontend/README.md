# Frontend — AI Observability

Next.js 15 (App Router) + TypeScript + Tailwind + Supabase Auth.

## Setup

```powershell
cd frontend
npm install
cp .env.local.example .env.local
# Then edit .env.local with values from project-root .env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_BACKEND_URL)
```

## Run

```powershell
npm run dev
# → http://localhost:3000
```

## Auth flows

- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` (email-link return)
- `middleware.ts` protects `/chat`, `/dashboard`, `/admin/*`
- `/admin/*` additionally requires `profile.role === 'admin'`

## Backend calls

`lib/backend.ts` exports `backendFetch(path, init)` — automatically attaches the Supabase access token as a Bearer header. Use it for any call to the FastAPI backend.
