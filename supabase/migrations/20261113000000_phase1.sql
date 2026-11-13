-- medRec 第1段階：ログイン、入会同意、カルテ、会員検索、療法記録と感想
--
-- 見える範囲の原則
--   スタッフ … staff 表に登録されたログイン。全会員を読み書きできる。
--   顧客     … SMS で確認済みの電話番号が member_logins に登録されている会員だけ読める。
--              書き込みは下の関数（register_member / sign_consents / submit_karte /
--              update_contact）と、感想の追記・写真の差し替えに限る。
--   同意の記録と感想は、誰であっても変更・削除できない。

-- ---------------------------------------------------------------- 共通関数

-- 電話番号を「国番号つき・数字のみ」にそろえる（090-1234-5678 → 819012345678）
create function public.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when d = '' then null
    when d like '0%' then '81' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

create function public.today_jst() returns date
language sql stable as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  created_at timestamptz not null default now()
);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid())
$$;

-- ログイン中の利用者の、SMS で確認済みの電話番号
create function public.auth_phone() returns text
language sql stable as $$
  select public.normalize_phone(nullif(auth.jwt() ->> 'phone', ''))
$$;

-- ---------------------------------------------------------------- 会員

create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  member_class       text check (member_class in ('特別', '正', '準')),
  is_vip             boolean not null default false,
  is_fasting         boolean not null default false,
  furigana           text not null default '',
  name               text not null default '',
  postal_code        text not null default '',
  address            text not null default '',
  phone              text not null default '',
  phone_digits       text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  email              text not null default '',
  mobile_email       text not null default '',
  occupation         text not null default '',
  referrer           text not null default '',
  registered_on      date not null default public.today_jst(),
  birth_date         date,
  sex                text check (sex in ('男', '女')),
  blood_type         text check (blood_type in ('A', 'O', 'B', 'AB')),
  height_cm          text not null default '',
  blood_pressure     text not null default '',
  symptoms           text[] not null default '{}',
  symptom_detail     text not null default '',
  karte_completed_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index members_name_idx on public.members (name);
create index members_furigana_idx on public.members (furigana);

-- 写真は一覧の読み込みを重くしないよう別の表に置く（JPEG の data URL）
create table public.member_photos (
  member_id  uuid primary key references public.members (id) on delete restrict,
  data       text not null check (length(data) < 400000),
  updated_at timestamptz not null default now()
);

-- どの電話番号でログインした人が、どの会員を見られるか。
-- 代理人・家族で1つの番号を使う場合も、番号が変わった場合も、この表で扱う。
create table public.member_logins (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete restrict,
  phone          text not null check (phone ~ '^\d{8,15}$'),
  relation       text not null default '本人' check (relation in ('本人', '代理人')),
  proxy_name     text not null default '',
  proxy_relation text not null default '',
  created_at     timestamptz not null default now(),
  unique (member_id, phone)
);
create index member_logins_phone_idx on public.member_logins (phone);

create function public.has_access(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_phone() is not null and exists (
    select 1 from member_logins
    where member_id = p_member and phone = public.auth_phone()
  )
$$;

-- ---------------------------------------------------------------- 入会同意

-- 同意文面。改訂は「新しい版を足す」だけで、過去の版は書き換えない。
create table public.consent_documents (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('privacy', 'admission')),
  version    integer not null check (version > 0),
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete restrict,
  document_id    uuid not null references public.consent_documents (id) on delete restrict,
  signed_at      timestamptz not null default now(),
  signer_type    text not null check (signer_type in ('本人', '代理人')),
  signer_name    text not null default '',
  proxy_name     text not null default '',
  proxy_relation text not null default '',
  signature      text not null check (signature like 'data:image/png;base64,%' and length(signature) < 400000),
  via            text not null check (via in ('customer_login', 'staff_device')),
  user_id        uuid not null default auth.uid(),
  phone          text,
  user_agent     text not null default '',
  unique (member_id, document_id)
);
create index consents_member_idx on public.consents (member_id);

-- 各種類の最新版
create view public.current_consent_documents with (security_invoker = true) as
  select distinct on (kind) * from public.consent_documents order by kind, version desc;

-- 最新版すべてに同意済みか
create function public.has_current_consents(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from current_consent_documents d
    where not exists (
      select 1 from consents c where c.member_id = p_member and c.document_id = d.id
    )
  )
$$;

-- ---------------------------------------------------------------- 療法記録

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete restrict,
  session_date date not null default public.today_jst(),
  mode         text not null check (mode in ('来所', '遠隔')),
  is_vip       boolean not null default false,
  is_fasting   boolean not null default false,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index sessions_member_idx on public.sessions (member_id, session_date desc);

-- スタッフのメモ。顧客には見せないので別の表にする。
create table public.session_staff_notes (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete restrict,
  note       text not null default '',
  updated_at timestamptz not null default now()
);

-- 感想。追記のみ。
create table public.session_comments (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete restrict,
  member_id      uuid not null references public.members (id) on delete restrict,
  author_user_id uuid not null,
  author_role    text not null check (author_role in ('customer', 'staff')),
  body           text not null check (length(btrim(body)) between 1 and 4000),
  created_at     timestamptz not null default now()
);
create index session_comments_session_idx on public.session_comments (session_id, created_at);

-- 書いた人・会員・日時はサーバー側で決める（画面から偽れないように）
create function public.session_comments_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select member_id into new.member_id from sessions where id = new.session_id;
  if new.member_id is null then
    raise exception '療法記録が見つかりません';
  end if;
  new.author_user_id := auth.uid();
  new.author_role := case when public.is_staff() then 'staff' else 'customer' end;
  new.created_at := now();
  return new;
end $$;
create trigger session_comments_fill before insert on public.session_comments
  for each row execute function public.session_comments_fill();

-- ---------------------------------------------------------------- 変更・削除の禁止

create function public.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% の記録は変更・削除できません', tg_table_name;
end $$;
create trigger consents_immutable before update or delete on public.consents
  for each row execute function public.forbid_change();
create trigger session_comments_immutable before update or delete on public.session_comments
  for each row execute function public.forbid_change();
create trigger consent_documents_immutable before update or delete on public.consent_documents
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------- 変更履歴

create table public.audit_log (
  id         bigint generated always as identity primary key,
  member_id  uuid,
  table_name text not null,
  row_id     text not null,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  changed_by uuid,
  by_staff   boolean not null default false,
  changed_at timestamptz not null default now()
);
create index audit_log_member_idx on public.audit_log (member_id, changed_at desc);

create function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' and o - 'updated_at' = n - 'updated_at' then
    return new;
  end if;
  insert into audit_log (member_id, table_name, row_id, action, old_data, new_data, changed_by, by_staff)
  values (
    coalesce(r ->> 'member_id', case when tg_table_name = 'members' then r ->> 'id' end)::uuid,
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'session_id'),
    tg_op, o, n, auth.uid(), public.is_staff()
  );
  return coalesce(new, old);
end $$;

create trigger members_audit after insert or update or delete on public.members
  for each row execute function public.audit();
create trigger member_logins_audit after insert or update or delete on public.member_logins
  for each row execute function public.audit();
create trigger sessions_audit after insert or update or delete on public.sessions
  for each row execute function public.audit();
create trigger session_staff_notes_audit after insert or update or delete on public.session_staff_notes
  for each row execute function public.audit();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();
create trigger session_staff_notes_touch before update on public.session_staff_notes
  for each row execute function public.touch_updated_at();
create trigger member_photos_touch before update on public.member_photos
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- 顧客用の関数

-- 最新版の文面のうち、未同意のものすべてに同意を記録する（内部用）
create function public._record_consents(
  p_member uuid, p_signer_type text, p_signer_name text,
  p_proxy_name text, p_proxy_relation text, p_signature text, p_user_agent text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if p_signer_type not in ('本人', '代理人') then
    raise exception '署名者の区分が正しくありません';
  end if;
  if p_signer_type = '代理人' and btrim(coalesce(p_proxy_name, '')) = '' then
    raise exception '代理人の氏名を入力してください';
  end if;
  if coalesce(p_signature, '') = '' then
    raise exception '署名がありません';
  end if;
  insert into consents (member_id, document_id, signer_type, signer_name, proxy_name,
                        proxy_relation, signature, via, user_id, phone, user_agent)
  select p_member, d.id, p_signer_type, coalesce(p_signer_name, ''),
         coalesce(p_proxy_name, ''), coalesce(p_proxy_relation, ''), p_signature,
         case when public.is_staff() then 'staff_device' else 'customer_login' end,
         auth.uid(), public.auth_phone(), left(coalesce(p_user_agent, ''), 400)
  from current_consent_documents d
  where not exists (select 1 from consents c where c.member_id = p_member and c.document_id = d.id);
  get diagnostics n = row_count;
  return n;
end $$;

-- 新規登録：同意を記録したうえで、空のカルテを作る。カルテの入力はこの後。
create function public.register_member(
  p_signer_type text, p_signer_name text, p_proxy_name text,
  p_proxy_relation text, p_signature text, p_user_agent text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phone  text := public.auth_phone();
  v_member uuid;
begin
  if v_phone is null then
    raise exception '電話番号でのログインが必要です';
  end if;
  if (select count(*) from member_logins where phone = v_phone) >= 10 then
    raise exception 'この電話番号で登録できる人数の上限に達しています';
  end if;
  insert into members (phone)
  values (case when v_phone like '81%' then '0' || substr(v_phone, 3) else v_phone end)
  returning id into v_member;
  insert into member_logins (member_id, phone, relation, proxy_name, proxy_relation)
  values (v_member, v_phone, p_signer_type,
          case when p_signer_type = '代理人' then coalesce(p_proxy_name, '') else '' end,
          case when p_signer_type = '代理人' then coalesce(p_proxy_relation, '') else '' end);
  perform public._record_consents(v_member, p_signer_type, p_signer_name, p_proxy_name,
                                  p_proxy_relation, p_signature, p_user_agent);
  return v_member;
end $$;

-- 既存の会員への同意（文面の改訂後の再同意、スタッフが作った会員の初回同意、施設の端末での署名）
create function public.sign_consents(
  p_member uuid, p_signer_type text, p_signer_name text, p_proxy_name text,
  p_proxy_relation text, p_signature text, p_user_agent text
) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_staff() or public.has_access(p_member)) then
    raise exception 'この会員の記録にはアクセスできません';
  end if;
  return public._record_consents(p_member, p_signer_type, p_signer_name, p_proxy_name,
                                 p_proxy_relation, p_signature, p_user_agent);
end $$;

-- カルテの初回入力。同意が済んでいなければ受け付けない。
create function public.submit_karte(p_member uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_access(p_member) then
    raise exception 'この会員の記録にはアクセスできません';
  end if;
  if not public.has_current_consents(p_member) then
    raise exception '入会同意が済んでいません';
  end if;
  if btrim(coalesce(p ->> 'name', '')) = '' then
    raise exception '氏名を入力してください';
  end if;
  update members set
    furigana       = coalesce(p ->> 'furigana', ''),
    name           = btrim(p ->> 'name'),
    postal_code    = coalesce(p ->> 'postal_code', ''),
    address        = coalesce(p ->> 'address', ''),
    email          = coalesce(p ->> 'email', ''),
    mobile_email   = coalesce(p ->> 'mobile_email', ''),
    occupation     = coalesce(p ->> 'occupation', ''),
    referrer       = coalesce(p ->> 'referrer', ''),
    birth_date     = nullif(p ->> 'birth_date', '')::date,
    sex            = nullif(p ->> 'sex', ''),
    blood_type     = nullif(p ->> 'blood_type', ''),
    height_cm      = coalesce(p ->> 'height_cm', ''),
    blood_pressure = coalesce(p ->> 'blood_pressure', ''),
    symptoms       = coalesce(array(select jsonb_array_elements_text(p -> 'symptoms')), '{}'),
    symptom_detail = coalesce(p ->> 'symptom_detail', ''),
    karte_completed_at = now()
  where id = p_member and karte_completed_at is null;
  if not found then
    raise exception 'カルテは登録済みです。変更はスタッフにお申し出ください';
  end if;
end $$;

-- 顧客が自分で直せるのは連絡先だけ
create function public.update_contact(p_member uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_access(p_member) then
    raise exception 'この会員の記録にはアクセスできません';
  end if;
  if not public.has_current_consents(p_member) then
    raise exception '入会同意が済んでいません';
  end if;
  update members set
    postal_code  = coalesce(p ->> 'postal_code', postal_code),
    address      = coalesce(p ->> 'address', address),
    email        = coalesce(p ->> 'email', email),
    mobile_email = coalesce(p ->> 'mobile_email', mobile_email),
    occupation   = coalesce(p ->> 'occupation', occupation)
  where id = p_member;
end $$;

-- ---------------------------------------------------------------- 行ごとのアクセス規則

alter table public.staff               enable row level security;
alter table public.members             enable row level security;
alter table public.member_photos       enable row level security;
alter table public.member_logins       enable row level security;
alter table public.consent_documents   enable row level security;
alter table public.consents            enable row level security;
alter table public.sessions            enable row level security;
alter table public.session_staff_notes enable row level security;
alter table public.session_comments    enable row level security;
alter table public.audit_log           enable row level security;

create policy staff_self on public.staff for select to authenticated
  using (user_id = auth.uid());

create policy members_read on public.members for select to authenticated
  using (public.is_staff() or public.has_access(id));
create policy members_staff_insert on public.members for insert to authenticated
  with check (public.is_staff());
create policy members_staff_update on public.members for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy photos_read on public.member_photos for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy photos_insert on public.member_photos for insert to authenticated
  with check (public.is_staff() or public.has_access(member_id));
create policy photos_update on public.member_photos for update to authenticated
  using (public.is_staff() or public.has_access(member_id))
  with check (public.is_staff() or public.has_access(member_id));
create policy photos_delete on public.member_photos for delete to authenticated
  using (public.is_staff() or public.has_access(member_id));

create policy logins_read on public.member_logins for select to authenticated
  using (public.is_staff() or phone = public.auth_phone());
create policy logins_staff_insert on public.member_logins for insert to authenticated
  with check (public.is_staff());
create policy logins_staff_update on public.member_logins for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy logins_staff_delete on public.member_logins for delete to authenticated
  using (public.is_staff());

create policy documents_read on public.consent_documents for select to authenticated
  using (true);
create policy documents_staff_insert on public.consent_documents for insert to authenticated
  with check (public.is_staff());

create policy consents_read on public.consents for select to authenticated
  using (public.is_staff() or public.has_access(member_id));

create policy sessions_read on public.sessions for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy sessions_staff_insert on public.sessions for insert to authenticated
  with check (public.is_staff());
create policy sessions_staff_update on public.sessions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy sessions_staff_delete on public.sessions for delete to authenticated
  using (public.is_staff());

create policy notes_staff_read on public.session_staff_notes for select to authenticated
  using (public.is_staff());
create policy notes_staff_insert on public.session_staff_notes for insert to authenticated
  with check (public.is_staff());
create policy notes_staff_update on public.session_staff_notes for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy comments_read on public.session_comments for select to authenticated
  using (public.is_staff() or public.has_access(member_id));
create policy comments_insert on public.session_comments for insert to authenticated
  with check (public.is_staff() or public.has_access(member_id));

create policy audit_staff_read on public.audit_log for select to authenticated
  using (public.is_staff());

-- ログインしていない利用者には何も渡さない
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public._record_consents(uuid, text, text, text, text, text, text) from authenticated;

-- ---------------------------------------------------------------- 仮の同意文面

insert into public.consent_documents (kind, version, title, body) values
('privacy', 1, '個人情報の取り扱いについて',
$t$【仮の文面です。正式な原稿に差し替えてください】

当研究所は、会員登録および療法の記録のために、次の情報をお預かりします。

・氏名、生年月日、住所、電話番号、メールアドレスなどの連絡先
・身長、体重、血圧、既往歴、自覚症状など健康に関する情報
・来所および療法の記録、療法後のご感想

利用目的
・会員の登録と管理
・療法の実施と経過の記録
・ご連絡およびご予約の管理

お預かりした情報は、ご本人の同意なく第三者に提供しません（法令に基づく場合を除きます）。
ご自身の情報の確認、訂正、利用の停止を希望される場合は、スタッフまでお申し出ください。$t$),
('admission', 1, '入会注意事項',
$t$【仮の文面です。正式な原稿に差し替えてください】

1. 療法の効果には個人差があり、結果を保証するものではありません。
2. 当研究所の活動は医療行為ではありません。治療中の病気がある方、薬を服用している方は、事前にお知らせください。
3. 体調に異変を感じたときは、療法を中止し、医療機関を受診してください。
4. 来所予定日を変更される場合は、事前にご連絡ください。
5. 費用の取り扱いについては、正式な文面でご案内します。
6. 貴重品はご自身で管理してください。

上記を理解し、不明な点について説明を受ける機会を得たうえで、入会に同意します。$t$);
