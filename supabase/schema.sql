create table if not exists public.profiles (
  id text primary key,
  level text not null default 'B1',
  name text not null default 'Rocky',
  recent_errors jsonb not null default '[]'::jsonb,
  error_archive jsonb not null default '[]'::jsonb,
  learning_memory text not null default '',
  work_memory text not null default '',
  auto_speak boolean not null default false,
  scenario_id text not null default 'free',
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  corrections jsonb,
  scenario_id text not null default 'free',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_visible_scenario_idx
  on public.messages (scenario_id, created_at)
  where archived_at is null;

create table if not exists public.homework (
  id text primary key,
  title text not null,
  topic text not null,
  questions jsonb not null,
  status text not null default 'pending',
  grade jsonb,
  created_at timestamptz not null default now(),
  due_at timestamptz
);

create index if not exists homework_created_at_idx
  on public.homework (created_at desc);

create table if not exists public.vocabulary (
  id text primary key,
  word text not null,
  meaning_zh text not null default '',
  example_en text not null default '',
  source text not null default 'manual',
  source_message_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists vocabulary_word_unique_idx
  on public.vocabulary (lower(word));

insert into public.profiles (id, level, name, recent_errors, error_archive)
values ('default', 'B1', 'Rocky', '[]'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;
