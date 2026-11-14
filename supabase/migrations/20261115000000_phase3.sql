-- medRec 第3段階：予約と来院記録、入金と回数券、設定

-- ---------------------------------------------------------------- 設定

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('ticket_count', '11'),          -- 回数券1冊の枚数
  ('ticket_valid_months', '2');    -- 回数券の有効期限（発行日からの月数）

alter table public.app_settings enable row level security;
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_staff_insert on public.app_settings for insert to authenticated
  with check (public.is_staff());
create policy settings_staff_update on public.app_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- 予約

create table public.appointments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete restrict,
  scheduled_at timestamptz not null,
  status       text not null default '予定' check (status in ('予定', '来院', '来院なし', '取消')),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index appointments_time_idx on public.appointments (scheduled_at);
create index appointments_member_idx on public.appointments (member_id, scheduled_at desc);

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();
-- 日時や状態の変更は、変更履歴に残る
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit();

alter table public.appointments enable row level security;
create policy appointments_read on public.appointments for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy appointments_staff_insert on public.appointments for insert to authenticated
  with check (public.is_staff());
create policy appointments_staff_update on public.appointments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy appointments_staff_delete on public.appointments for delete to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------- 回数券

create table public.ticket_books (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete restrict,
  issued_on   date not null default public.today_jst(),
  total_count integer not null check (total_count between 1 and 100),
  expires_on  date not null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_on >= issued_on)
);
create index ticket_books_member_idx on public.ticket_books (member_id, expires_on);

-- どの療法記録でどの回数券を1枚使ったか
alter table public.sessions
  add column ticket_book_id uuid references public.ticket_books (id) on delete restrict;
create index sessions_ticket_idx on public.sessions (ticket_book_id) where ticket_book_id is not null;

create function public.sessions_check_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b    ticket_books;
  used integer;
begin
  if new.ticket_book_id is null then
    return new;
  end if;
  -- 同じ回数券への同時の消化を直列にする
  select * into b from ticket_books where id = new.ticket_book_id for update;
  if b.id is null or b.member_id <> new.member_id then
    raise exception 'この会員の回数券ではありません';
  end if;
  if new.session_date > b.expires_on then
    raise exception '回数券の有効期限（%）を過ぎています', b.expires_on;
  end if;
  if new.session_date < b.issued_on then
    raise exception '回数券の発行日（%）より前の療法には使えません', b.issued_on;
  end if;
  select count(*) into used from sessions where ticket_book_id = b.id and id <> new.id;
  if used >= b.total_count then
    raise exception '回数券の残りがありません';
  end if;
  return new;
end $$;
create trigger sessions_check_ticket before insert or update of ticket_book_id, session_date, member_id
  on public.sessions for each row execute function public.sessions_check_ticket();

-- 枚数を、すでに使った数より少なくはできない
create function public.ticket_books_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.total_count < (select count(*) from sessions where ticket_book_id = new.id) then
    raise exception '使用済みの枚数より少なくはできません';
  end if;
  return new;
end $$;
create trigger ticket_books_check before update of total_count on public.ticket_books
  for each row execute function public.ticket_books_check();

create trigger ticket_books_touch before update on public.ticket_books
  for each row execute function public.touch_updated_at();
create trigger ticket_books_audit after insert or update or delete on public.ticket_books
  for each row execute function public.audit();

-- 残数つきの一覧。見える範囲は元の表の規則に従う。
create view public.ticket_balances with (security_invoker = true) as
  select b.*,
         (select count(*)::integer from public.sessions s where s.ticket_book_id = b.id) as used_count,
         b.total_count - (select count(*)::integer from public.sessions s where s.ticket_book_id = b.id) as remaining
  from public.ticket_books b;

alter table public.ticket_books enable row level security;
create policy tickets_read on public.ticket_books for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy tickets_staff_insert on public.ticket_books for insert to authenticated
  with check (public.is_staff());
create policy tickets_staff_update on public.ticket_books for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy tickets_staff_delete on public.ticket_books for delete to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------- 入金（スタッフ専用）

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete restrict,
  paid_on        date not null default public.today_jst(),
  kind           text not null check (kind in ('入会金', '療法費', '回数券', 'その他')),
  amount         integer not null check (amount >= 0),
  note           text not null default '',
  ticket_book_id uuid references public.ticket_books (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index payments_member_idx on public.payments (member_id, paid_on desc);
create index payments_date_idx on public.payments (paid_on);

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit();

alter table public.payments enable row level security;
create policy payments_staff_all on public.payments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- 権限

revoke all on public.app_settings, public.appointments, public.ticket_books, public.payments,
  public.ticket_balances from anon;
revoke execute on function public.sessions_check_ticket() from anon, public;
revoke execute on function public.ticket_books_check() from anon, public;
