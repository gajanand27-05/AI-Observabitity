-- =====================================================================
-- AI Observability — initial schema
-- Run in Supabase: SQL Editor → New query → paste this entire file → Run
-- =====================================================================

-- ---------- profiles (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- traces ----------
create table if not exists public.traces (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  question            text not null,
  final_answer        text,
  model_id            text,
  embedder_id         text,
  total_latency_ms    integer,
  prompt_tokens       integer,
  completion_tokens   integer,
  estimated_cost_usd  numeric(12, 6),
  status              text not null default 'ok'
                        check (status in ('ok', 'flagged', 'error', 'queued')),
  prompt_version      text,
  metadata            jsonb not null default '{}'::jsonb
);
create index if not exists traces_user_created_idx
  on public.traces (user_id, created_at desc);
create index if not exists traces_status_idx
  on public.traces (status) where status <> 'ok';

-- ---------- spans ----------
create table if not exists public.spans (
  id          uuid primary key default gen_random_uuid(),
  trace_id    uuid not null references public.traces(id) on delete cascade,
  ord         integer not null,
  kind        text not null check (kind in
              ('embed_query','retrieve','build_prompt','llm_call','post_process','rule_check')),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  duration_ms integer,
  input_json  jsonb,
  output_json jsonb,
  error       text
);
create index if not exists spans_trace_ord_idx on public.spans (trace_id, ord);

-- ---------- feedback ----------
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  trace_id   uuid not null references public.traces(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  thumbs     smallint check (thumbs in (-1, 0, 1)),
  stars      smallint check (stars between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  unique (trace_id, user_id)
);

-- ---------- rule_violations ----------
create table if not exists public.rule_violations (
  id         uuid primary key default gen_random_uuid(),
  trace_id   uuid not null references public.traces(id) on delete cascade,
  rule_name  text not null,
  severity   text not null check (severity in ('low','medium','high','critical')),
  details    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rule_violations_trace_idx on public.rule_violations (trace_id);

-- ---------- backend_heartbeat ----------
create table if not exists public.backend_heartbeat (
  instance_id        text primary key,
  last_seen          timestamptz not null default now(),
  version            text,
  ollama_models_seen jsonb not null default '[]'::jsonb,
  metadata           jsonb not null default '{}'::jsonb
);

-- ---------- audit_log ----------
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action        text not null,
  target_type   text,
  target_id     text,
  before_json   jsonb,
  after_json    jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ---------- api_keys ----------
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  hashed_key    text not null unique,
  scope         text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  last_used     timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);


-- =====================================================================
-- Row-Level Security
-- The laptop backend uses the service_role key, which bypasses RLS by design.
-- These policies protect direct anon-key (browser) access.
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and deleted_at is null
  );
$$;

-- profiles
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id);

-- traces
alter table public.traces enable row level security;
drop policy if exists traces_select on public.traces;
create policy traces_select on public.traces
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists traces_insert_own on public.traces;
create policy traces_insert_own on public.traces
  for insert with check (auth.uid() = user_id);

-- spans (read-through trace ownership)
alter table public.spans enable row level security;
drop policy if exists spans_select on public.spans;
create policy spans_select on public.spans
  for select using (
    exists (
      select 1 from public.traces t
      where t.id = spans.trace_id
        and (t.user_id = auth.uid() or public.is_admin())
    )
  );

-- feedback
alter table public.feedback enable row level security;
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert with check (auth.uid() = user_id);
drop policy if exists feedback_update_own on public.feedback;
create policy feedback_update_own on public.feedback
  for update using (auth.uid() = user_id);

-- rule_violations (read-through trace ownership)
alter table public.rule_violations enable row level security;
drop policy if exists rule_violations_select on public.rule_violations;
create policy rule_violations_select on public.rule_violations
  for select using (
    exists (
      select 1 from public.traces t
      where t.id = rule_violations.trace_id
        and (t.user_id = auth.uid() or public.is_admin())
    )
  );

-- admin-only tables
alter table public.backend_heartbeat enable row level security;
drop policy if exists backend_heartbeat_admin on public.backend_heartbeat;
create policy backend_heartbeat_admin on public.backend_heartbeat
  for select using (public.is_admin());

alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin on public.audit_log;
create policy audit_log_admin on public.audit_log
  for select using (public.is_admin());

alter table public.api_keys enable row level security;
drop policy if exists api_keys_admin on public.api_keys;
create policy api_keys_admin on public.api_keys
  for select using (public.is_admin());
