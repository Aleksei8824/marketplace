create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique,
 created_at timestamptz not null default now()
);
create table if not exists public.listings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(title) between 3 and 120),
 description text not null check (char_length(description) between 5 and 5000),
 price numeric(12,2) not null check (price >= 0),
 city text not null check (char_length(city) between 2 and 100),
 image_url text,
 status text not null default 'pending' check (status in ('pending','approved','rejected','needs_review')),
 moderation_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists listings_status_created_idx on public.listings(status,created_at desc);
create index if not exists listings_user_id_idx on public.listings(user_id);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete cascade,
 buyer_id uuid not null references auth.users(id) on delete cascade,
 seller_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 last_message_at timestamptz not null default now(),
 constraint conversations_different_users check (buyer_id <> seller_id),
 constraint conversations_unique_pair unique (listing_id,buyer_id,seller_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists conversations_buyer_idx on public.conversations(buyer_id,last_message_at desc);
create index if not exists conversations_seller_idx on public.conversations(seller_id,last_message_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,username)
 values(new.id,nullif(new.raw_user_meta_data ->> 'username',''))
 on conflict(id) do nothing;
 return new;
end;
$$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
grant select,insert on public.profiles to authenticated;
grant select,insert,update,delete on public.listings to authenticated;
grant select,insert on public.conversations to authenticated;
grant select,insert on public.messages to authenticated;
grant select on public.listings to anon;

drop policy if exists "profile read own" on public.profiles;
create policy "profile read own" on public.profiles for select to authenticated using((select auth.uid())=id);
drop policy if exists "profile create own" on public.profiles;
create policy "profile create own" on public.profiles for insert to authenticated with check((select auth.uid())=id);
drop policy if exists "listings public approved" on public.listings;
create policy "listings public approved" on public.listings for select to anon,authenticated using(status='approved' or user_id=(select auth.uid()) or ((select auth.jwt())->'app_metadata'->>'role')='moderator');
drop policy if exists "listing owner create pending" on public.listings;
create policy "listing owner create pending" on public.listings for insert to authenticated with check(user_id=(select auth.uid()) and status in('pending','needs_review'));
drop policy if exists "listing owner update own pending" on public.listings;
create policy "listing owner update own pending" on public.listings for update to authenticated using(user_id=(select auth.uid()) and status in('pending','needs_review','rejected')) with check(user_id=(select auth.uid()) and status in('pending','needs_review','rejected'));
drop policy if exists "moderator update listings" on public.listings;
create policy "moderator update listings" on public.listings for update to authenticated using(((select auth.jwt())->'app_metadata'->>'role')='moderator') with check(((select auth.jwt())->'app_metadata'->>'role')='moderator');
drop policy if exists "conversation participants read" on public.conversations;
create policy "conversation participants read" on public.conversations for select to authenticated using((select auth.uid()) in(buyer_id,seller_id));
drop policy if exists "buyer create conversation" on public.conversations;
create policy "buyer create conversation" on public.conversations for insert to authenticated with check(buyer_id=(select auth.uid()) and exists(select 1 from public.listings l where l.id=listing_id and l.status='approved' and l.user_id=seller_id));
drop policy if exists "message participants read" on public.messages;
create policy "message participants read" on public.messages for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and (select auth.uid()) in(c.buyer_id,c.seller_id)));
drop policy if exists "conversation participants send messages" on public.messages;
create policy "conversation participants send messages" on public.messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.conversations c where c.id=conversation_id and (select auth.uid()) in(c.buyer_id,c.seller_id)));
