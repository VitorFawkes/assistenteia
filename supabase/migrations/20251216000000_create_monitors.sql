create type monitor_frequency as enum ('once', 'always', 'ask');

create table monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  keyword text not null,
  chat_id text, -- Null means "all chats" or "global"
  chat_name text, -- For display purposes
  frequency monitor_frequency default 'ask',
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_triggered_at timestamp with time zone
);

-- RLS
alter table monitors enable row level security;

create policy "Users can view their own monitors"
  on monitors for select
  using (auth.uid() = user_id);

create policy "Users can insert their own monitors"
  on monitors for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own monitors"
  on monitors for update
  using (auth.uid() = user_id);

create policy "Users can delete their own monitors"
  on monitors for delete
  using (auth.uid() = user_id);
