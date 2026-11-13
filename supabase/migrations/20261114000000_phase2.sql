-- medRec 第2段階：断食の管理、過去の紙（PDF）の保管と検索

-- ---------------------------------------------------------------- 断食コース

create table public.fasting_courses (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null references public.members (id) on delete restrict,
  start_date             date not null default public.today_jst(),
  planned_days           integer not null check (planned_days between 1 and 365),
  -- 終了日。空のあいだは実施中。
  end_date               date check (end_date is null or end_date >= start_date),
  -- 服薬の申告。顧客は未申告のときに1回だけ書ける。以後の変更はスタッフ。
  medication             text not null default '',
  medication_declared_at timestamptz,
  note                   text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index fasting_courses_member_idx on public.fasting_courses (member_id, start_date desc);
-- 実施中のコースは会員ごとに1つまで
create unique index fasting_courses_one_active on public.fasting_courses (member_id) where end_date is null;

create table public.fasting_logs (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.fasting_courses (id) on delete restrict,
  member_id      uuid not null references public.members (id) on delete restrict,
  log_date       date not null,
  weight_kg      numeric(4, 1) not null check (weight_kg between 20 and 300),
  blood_pressure text not null default '',
  progress       text not null default '' check (length(progress) <= 4000),
  entered_by     text not null default 'staff' check (entered_by in ('customer', 'staff')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (course_id, log_date)
);
create index fasting_logs_course_idx on public.fasting_logs (course_id, log_date);

create function public.fasting_logs_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c fasting_courses;
begin
  select * into c from fasting_courses where id = new.course_id;
  if c.id is null then
    raise exception '断食コースが見つかりません';
  end if;
  new.member_id := c.member_id;
  if new.log_date < c.start_date or new.log_date > coalesce(c.end_date, public.today_jst()) then
    raise exception '記録できるのは、開始日から今日（終了後は終了日）までの日付です';
  end if;
  if tg_op = 'INSERT' then
    new.entered_by := case when public.is_staff() then 'staff' else 'customer' end;
  else
    new.entered_by := old.entered_by;
    new.course_id := old.course_id;
  end if;
  return new;
end $$;
create trigger fasting_logs_fill before insert or update on public.fasting_logs
  for each row execute function public.fasting_logs_fill();

create trigger fasting_courses_touch before update on public.fasting_courses
  for each row execute function public.touch_updated_at();
create trigger fasting_logs_touch before update on public.fasting_logs
  for each row execute function public.touch_updated_at();
create trigger fasting_courses_audit after insert or update or delete on public.fasting_courses
  for each row execute function public.audit();
create trigger fasting_logs_audit after insert or update or delete on public.fasting_logs
  for each row execute function public.audit();

-- 顧客による日次の記録。実施中のコースに、1日1件、追加のみ。
create function public.add_fasting_log(
  p_course uuid, p_date date, p_weight numeric, p_blood_pressure text, p_progress text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c    fasting_courses;
  v_id uuid;
begin
  select * into c from fasting_courses where id = p_course;
  if c.id is null or not public.has_access(c.member_id) then
    raise exception 'この記録にはアクセスできません';
  end if;
  if not public.has_current_consents(c.member_id) then
    raise exception '入会同意が済んでいません';
  end if;
  if c.end_date is not null then
    raise exception 'この断食コースは終了しています';
  end if;
  if exists (select 1 from fasting_logs where course_id = p_course and log_date = p_date) then
    raise exception 'この日の記録は登録済みです。訂正はスタッフにお申し出ください';
  end if;
  insert into fasting_logs (course_id, member_id, log_date, weight_kg, blood_pressure, progress)
  values (p_course, c.member_id, p_date, p_weight, coalesce(p_blood_pressure, ''), coalesce(p_progress, ''))
  returning id into v_id;
  return v_id;
end $$;

-- 顧客による服薬の申告。未申告のときに1回だけ。
create function public.declare_medication(p_course uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c fasting_courses;
begin
  select * into c from fasting_courses where id = p_course;
  if c.id is null or not public.has_access(c.member_id) then
    raise exception 'この記録にはアクセスできません';
  end if;
  if btrim(coalesce(p_text, '')) = '' then
    raise exception '服用中の薬を入力してください（なければ「なし」）';
  end if;
  update fasting_courses
  set medication = left(btrim(p_text), 2000), medication_declared_at = now()
  where id = p_course and medication_declared_at is null and end_date is null;
  if not found then
    raise exception '服薬は申告済みです。変更はスタッフにお申し出ください';
  end if;
end $$;

alter table public.fasting_courses enable row level security;
alter table public.fasting_logs    enable row level security;

create policy fasting_courses_read on public.fasting_courses for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy fasting_courses_staff_insert on public.fasting_courses for insert to authenticated
  with check (public.is_staff());
create policy fasting_courses_staff_update on public.fasting_courses for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy fasting_logs_read on public.fasting_logs for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy fasting_logs_staff_insert on public.fasting_logs for insert to authenticated
  with check (public.is_staff());
create policy fasting_logs_staff_update on public.fasting_logs for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- 過去の紙

-- スキャンした PDF はそのまま保管し、検索用に名前と電話番号だけを手入力する。スタッフ専用。
create table public.legacy_documents (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name    text not null default '',
  file_size    integer not null default 0,
  name         text not null default '',
  furigana     text not null default '',
  phone        text not null default '',
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  note         text not null default '',
  -- 名前・電話の入力が済んだ日時。空のあいだは「未入力」。
  indexed_at   timestamptz,
  -- 結び付けた会員。自動では結び付けない。
  member_id    uuid references public.members (id) on delete set null,
  uploaded_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index legacy_documents_name_idx on public.legacy_documents (name);
create index legacy_documents_phone_idx on public.legacy_documents (phone_digits);
create index legacy_documents_member_idx on public.legacy_documents (member_id);
create index legacy_documents_pending_idx on public.legacy_documents (uploaded_at) where indexed_at is null;

create trigger legacy_documents_touch before update on public.legacy_documents
  for each row execute function public.touch_updated_at();

alter table public.legacy_documents enable row level security;
create policy legacy_staff_all on public.legacy_documents for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legacy-papers', 'legacy-papers', false, 26214400, array['application/pdf']);

create policy legacy_files_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'legacy-papers' and public.is_staff());
create policy legacy_files_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'legacy-papers' and public.is_staff());
create policy legacy_files_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'legacy-papers' and public.is_staff());

-- ---------------------------------------------------------------- 権限

revoke all on public.fasting_courses, public.fasting_logs, public.legacy_documents from anon;
revoke execute on function public.add_fasting_log(uuid, date, numeric, text, text) from anon, public;
revoke execute on function public.declare_medication(uuid, text) from anon, public;
revoke execute on function public.fasting_logs_fill() from anon, public;
grant execute on function public.add_fasting_log(uuid, date, numeric, text, text) to authenticated;
grant execute on function public.declare_medication(uuid, text) to authenticated;
