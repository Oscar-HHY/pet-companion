-- AI assistant: multiple conversations per user (ChatGPT-style sidebar).
--
-- ai_conversations: one row per conversation; title = the conversation's first
-- question (set by the pet-assistant-chat Edge Function). Owner-only RLS.
-- ai_chat_messages.conversation_id: every message belongs to one conversation;
-- deleting a conversation deletes its messages (ON DELETE CASCADE).
--
-- Like the other AI tables there is no FK to user_profiles (some auth users have
-- no profile row); delete-account removes ai_conversations explicitly.
--
-- Grants are explicit because this project's default privileges do not give
-- service_role table access on new tables (see 20261011000000).

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

create policy "ai_conversations_select_own" on public.ai_conversations
  for select to authenticated using ((auth.uid())::text = user_id);
create policy "ai_conversations_insert_own" on public.ai_conversations
  for insert to authenticated with check ((auth.uid())::text = user_id);
create policy "ai_conversations_update_own" on public.ai_conversations
  for update to authenticated
  using ((auth.uid())::text = user_id) with check ((auth.uid())::text = user_id);
create policy "ai_conversations_delete_own" on public.ai_conversations
  for delete to authenticated using ((auth.uid())::text = user_id);

grant select, insert, update, delete on public.ai_conversations to authenticated, service_role;

alter table public.ai_chat_messages
  add column if not exists conversation_id uuid references public.ai_conversations(id) on delete cascade;

-- Backfill: put each user's existing messages into one conversation titled by
-- their first question.
with spans as (
  select user_id, min(created_at) as first_at, max(created_at) as last_at
  from public.ai_chat_messages where conversation_id is null group by user_id
), firsts as (
  select distinct on (user_id) user_id, content
  from public.ai_chat_messages where conversation_id is null and role = 'user'
  order by user_id, created_at
)
insert into public.ai_conversations (user_id, title, created_at, updated_at)
select s.user_id,
       coalesce(left(regexp_replace(btrim(f.content), '\s+', ' ', 'g'), 30), '对话'),
       s.first_at, s.last_at
from spans s left join firsts f using (user_id);

update public.ai_chat_messages m
set conversation_id = c.id
from public.ai_conversations c
where m.conversation_id is null and c.user_id = m.user_id;

alter table public.ai_chat_messages alter column conversation_id set not null;

create index if not exists ai_chat_messages_conversation_created_idx
  on public.ai_chat_messages (conversation_id, created_at);

-- A message may only be attached to one of the caller's own conversations
-- (the FK alone would accept any existing conversation id).
drop policy if exists "ai_chat_messages_insert_own" on public.ai_chat_messages;
create policy "ai_chat_messages_insert_own" on public.ai_chat_messages
  for insert to authenticated
  with check (
    (auth.uid())::text = user_id
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = (auth.uid())::text
    )
  );
