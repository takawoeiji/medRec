import { supabase } from './supabase'
import type {
  AppSettings,
  Appointment,
  AuditEntry,
  FastingCourse,
  LegacyDocument,
  Consent,
  ConsentDocument,
  Member,
  MemberLogin,
  Payment,
  Session,
  SignInput,
  TicketBalance,
} from './types'

const MESSAGES: [RegExp, string][] = [
  [/Token has expired or is invalid|invalid.*otp/i, '認証コードが違うか、期限が切れています。'],
  [/Invalid login credentials/i, 'メールアドレスまたはパスワードが違います。'],
  [/rate limit|security purposes/i, '少し時間をおいてから、もう一度お試しください。'],
  [/Failed to fetch|NetworkError/i, '通信できませんでした。電波の状況を確認してください。'],
  [/duplicate key.*member_logins/i, 'この電話番号はすでに登録されています。'],
]

function fail(error: { message: string }): never {
  const hit = MESSAGES.find(([re]) => re.test(error.message))
  throw new Error(hit ? hit[1] : error.message)
}

function unwrap<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) fail(r.error)
  return r.data as T
}

// ---- ログイン

export async function sendOtp(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) fail(error)
}

export async function verifyOtp(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
  if (error) fail(error)
}

export async function staffSignIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) fail(error)
}

export const signOut = () => supabase.auth.signOut()

export async function isStaff(userId: string): Promise<boolean> {
  const rows = unwrap(await supabase.from('staff').select('user_id').eq('user_id', userId))
  return rows.length > 0
}

// ---- 同意

export async function currentDocs(): Promise<ConsentDocument[]> {
  const docs = unwrap(await supabase.from('current_consent_documents').select('*'))
  // 個人情報 → 入会注意事項 の順に見せる
  return (docs as ConsentDocument[]).sort((a, b) => (a.kind === 'privacy' ? -1 : 1) - (b.kind === 'privacy' ? -1 : 1))
}

export async function allDocs(): Promise<ConsentDocument[]> {
  return unwrap(
    await supabase.from('consent_documents').select('*').order('version', { ascending: false }),
  ) as ConsentDocument[]
}

export async function publishDoc(kind: string, version: number, title: string, body: string) {
  unwrap(await supabase.from('consent_documents').insert({ kind, version, title, body }).select())
}

export async function consentsOf(memberId: string): Promise<Consent[]> {
  return unwrap(
    await supabase
      .from('consents')
      .select('*, document:consent_documents(*)')
      .eq('member_id', memberId)
      .order('signed_at'),
  ) as Consent[]
}

const signArgs = (s: SignInput) => ({
  p_signer_type: s.signerType,
  p_signer_name: s.signerName,
  p_proxy_name: s.proxyName,
  p_proxy_relation: s.proxyRelation,
  p_signature: s.signature,
  p_user_agent: navigator.userAgent,
})

/** 新規登録。同意を記録して空のカルテを作り、その会員の ID を返す */
export async function registerMember(s: SignInput): Promise<string> {
  return unwrap(await supabase.rpc('register_member', signArgs(s))) as string
}

export async function signConsents(memberId: string, s: SignInput) {
  unwrap(await supabase.rpc('sign_consents', { p_member: memberId, ...signArgs(s) }))
}

// ---- 会員

export type MemberRow = Member & { consents: { document_id: string }[] }

export async function listMembers(filter: {
  q?: string
  vip?: boolean
  fasting?: boolean
  cls?: string
} = {}): Promise<MemberRow[]> {
  let query = supabase.from('members').select('*, consents(document_id)')
  const q = (filter.q ?? '').replace(/[,()%*\\]/g, ' ').trim()
  if (q) {
    const tel = q.replace(/[-\s]/g, '')
    query = query.or(
      [`name.ilike.%${q}%`, `furigana.ilike.%${q}%`, /^\d+$/.test(tel) ? `phone_digits.ilike.%${tel}%` : '']
        .filter(Boolean)
        .join(','),
    )
  }
  if (filter.vip) query = query.eq('is_vip', true)
  if (filter.fasting) query = query.eq('is_fasting', true)
  if (filter.cls) query = query.eq('member_class', filter.cls)
  return unwrap(await query.order('furigana').order('name').limit(300)) as MemberRow[]
}

export async function getMember(id: string): Promise<Member | null> {
  return unwrap(await supabase.from('members').select('*').eq('id', id).maybeSingle()) as Member | null
}

export type KarteInput = Pick<
  Member,
  | 'furigana' | 'name' | 'postal_code' | 'address' | 'email' | 'mobile_email' | 'occupation'
  | 'referrer' | 'birth_date' | 'sex' | 'blood_type' | 'height_cm' | 'blood_pressure'
  | 'symptoms' | 'symptom_detail'
>
export type StaffMemberInput = KarteInput &
  Pick<Member, 'member_class' | 'is_vip' | 'is_fasting' | 'phone' | 'registered_on'>

export async function submitKarte(memberId: string, input: KarteInput) {
  unwrap(await supabase.rpc('submit_karte', { p_member: memberId, p: input }))
}

export async function updateContact(
  memberId: string,
  input: Pick<Member, 'postal_code' | 'address' | 'email' | 'mobile_email' | 'occupation'>,
) {
  unwrap(await supabase.rpc('update_contact', { p_member: memberId, p: input }))
}

export async function createMember(input: StaffMemberInput): Promise<string> {
  const row = unwrap(
    await supabase
      .from('members')
      .insert({ ...input, karte_completed_at: new Date().toISOString() })
      .select('id')
      .single(),
  ) as { id: string }
  return row.id
}

export async function updateMember(id: string, input: Partial<StaffMemberInput>, completeKarte = false) {
  const patch = completeKarte ? { ...input, karte_completed_at: new Date().toISOString() } : input
  unwrap(await supabase.from('members').update(patch).eq('id', id).select('id'))
}

export async function getPhoto(memberId: string): Promise<string> {
  const row = unwrap(
    await supabase.from('member_photos').select('data').eq('member_id', memberId).maybeSingle(),
  ) as { data: string } | null
  return row?.data ?? ''
}

export async function setPhoto(memberId: string, data: string) {
  if (data) {
    unwrap(await supabase.from('member_photos').upsert({ member_id: memberId, data }).select('member_id'))
  } else {
    unwrap(await supabase.from('member_photos').delete().eq('member_id', memberId).select('member_id'))
  }
}

// ---- ログイン用の電話番号（スタッフ）

export async function loginsOf(memberId: string): Promise<MemberLogin[]> {
  return unwrap(
    await supabase.from('member_logins').select('*').eq('member_id', memberId).order('created_at'),
  ) as MemberLogin[]
}

export async function addLogin(input: Omit<MemberLogin, 'id'>) {
  unwrap(await supabase.from('member_logins').insert(input).select('id'))
}

export async function changeLoginPhone(id: string, phone: string) {
  unwrap(await supabase.from('member_logins').update({ phone }).eq('id', id).select('id'))
}

export async function removeLogin(id: string) {
  unwrap(await supabase.from('member_logins').delete().eq('id', id).select('id'))
}

// ---- 療法記録

export async function sessionsOf(memberId: string): Promise<Session[]> {
  const rows = unwrap(
    await supabase
      .from('sessions')
      .select('*, comments:session_comments(id, session_id, author_role, body, created_at), note:session_staff_notes(note)')
      .eq('member_id', memberId)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as Session[]
  rows.forEach((s) => s.comments.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  return rows
}

export interface SessionInput {
  session_date: string
  mode: string
  is_vip: boolean
  is_fasting: boolean
  ticket_book_id: string | null
  note: string
}

async function saveNote(sessionId: string, memberId: string, note: string) {
  unwrap(
    await supabase
      .from('session_staff_notes')
      .upsert({ session_id: sessionId, member_id: memberId, note })
      .select('session_id'),
  )
}

export async function createSession(memberId: string, { note, ...input }: SessionInput) {
  const row = unwrap(
    await supabase.from('sessions').insert({ member_id: memberId, ...input }).select('id').single(),
  ) as { id: string }
  if (note.trim()) await saveNote(row.id, memberId, note)
}

export async function updateSession(
  id: string,
  memberId: string,
  { note, ...input }: SessionInput,
  hadNote: boolean,
) {
  unwrap(await supabase.from('sessions').update(input).eq('id', id).select('id'))
  if (note.trim() || hadNote) await saveNote(id, memberId, note)
}

export async function addComment(sessionId: string, body: string) {
  unwrap(await supabase.from('session_comments').insert({ session_id: sessionId, body }).select('id'))
}

// ---- 変更履歴（スタッフ）

export async function auditOf(memberId: string): Promise<AuditEntry[]> {
  return unwrap(
    await supabase
      .from('audit_log')
      .select('id, table_name, action, old_data, new_data, by_staff, changed_at')
      .eq('member_id', memberId)
      .order('changed_at', { ascending: false })
      .limit(100),
  ) as AuditEntry[]
}

// ---- 断食


export async function coursesOf(memberId: string): Promise<FastingCourse[]> {
  const rows = unwrap(
    await supabase
      .from('fasting_courses')
      .select('*, logs:fasting_logs(id, course_id, log_date, weight_kg, blood_pressure, progress, entered_by)')
      .eq('member_id', memberId)
      .order('start_date', { ascending: false }),
  ) as FastingCourse[]
  rows.forEach((c) => c.logs.sort((a, b) => a.log_date.localeCompare(b.log_date)))
  return rows
}

export async function createCourse(input: {
  member_id: string
  start_date: string
  planned_days: number
  medication: string
  note: string
}) {
  const medication_declared_at = input.medication.trim() ? new Date().toISOString() : null
  unwrap(await supabase.from('fasting_courses').insert({ ...input, medication_declared_at }).select('id'))
}

export async function updateCourse(
  id: string,
  patch: Partial<Pick<FastingCourse, 'planned_days' | 'end_date' | 'medication' | 'medication_declared_at' | 'note'>>,
) {
  unwrap(await supabase.from('fasting_courses').update(patch).eq('id', id).select('id'))
}

export interface FastingLogInput {
  log_date: string
  weight_kg: number
  blood_pressure: string
  progress: string
}

/** スタッフによる記録の追加・訂正（同じ日があれば上書き。履歴に残る） */
export async function saveLogAsStaff(courseId: string, memberId: string, input: FastingLogInput) {
  unwrap(
    await supabase
      .from('fasting_logs')
      .upsert({ course_id: courseId, member_id: memberId, ...input }, { onConflict: 'course_id,log_date' })
      .select('id'),
  )
}

/** 顧客による日次の記録（追加のみ） */
export async function addFastingLog(courseId: string, input: FastingLogInput) {
  unwrap(
    await supabase.rpc('add_fasting_log', {
      p_course: courseId,
      p_date: input.log_date,
      p_weight: input.weight_kg,
      p_blood_pressure: input.blood_pressure,
      p_progress: input.progress,
    }),
  )
}

export async function declareMedication(courseId: string, text: string) {
  unwrap(await supabase.rpc('declare_medication', { p_course: courseId, p_text: text }))
}

// ---- 過去の紙（スタッフ）

const BUCKET = 'legacy-papers'
const LEGACY_COLS = '*, member:members(id, name)'

export async function uploadLegacy(file: File) {
  if (file.type !== 'application/pdf') throw new Error(`${file.name}：PDF ではありません`)
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.pdf`
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf' })
  if (up.error) throw new Error(`${file.name}：${up.error.message}`)
  const row = await supabase
    .from('legacy_documents')
    .insert({ storage_path: path, file_name: file.name, file_size: file.size })
    .select('id')
  if (row.error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`${file.name}：${row.error.message}`)
  }
}

function legacySearch(q: string) {
  const clean = q.replace(/[,()%*\\]/g, ' ').trim()
  const tel = clean.replace(/[-\s]/g, '')
  return [`name.ilike.%${clean}%`, `furigana.ilike.%${clean}%`, /^\d+$/.test(tel) ? `phone_digits.ilike.%${tel}%` : '']
    .filter(Boolean)
    .join(',')
}

export async function searchLegacy(q: string): Promise<LegacyDocument[]> {
  let query = supabase.from('legacy_documents').select(LEGACY_COLS).not('indexed_at', 'is', null)
  if (q.trim()) query = query.or(legacySearch(q))
  return unwrap(await query.order('furigana').order('name').limit(200)) as LegacyDocument[]
}

export async function countLegacy(q: string): Promise<number> {
  const r = await supabase
    .from('legacy_documents')
    .select('id', { count: 'exact', head: true })
    .not('indexed_at', 'is', null)
    .or(legacySearch(q))
  if (r.error) fail(r.error)
  return r.count ?? 0
}

/** 名前・電話が未入力のもの（古い順）と、その総数 */
export async function pendingLegacy(): Promise<{ docs: LegacyDocument[]; total: number }> {
  const r = await supabase
    .from('legacy_documents')
    .select(LEGACY_COLS, { count: 'exact' })
    .is('indexed_at', null)
    .order('uploaded_at')
    .order('id')
    .limit(20)
  if (r.error) fail(r.error)
  return { docs: (r.data ?? []) as LegacyDocument[], total: r.count ?? 0 }
}

export async function getLegacy(id: string): Promise<LegacyDocument | null> {
  return unwrap(
    await supabase.from('legacy_documents').select(LEGACY_COLS).eq('id', id).maybeSingle(),
  ) as LegacyDocument | null
}

export async function legacyOfMember(memberId: string): Promise<LegacyDocument[]> {
  return unwrap(
    await supabase.from('legacy_documents').select('*').eq('member_id', memberId).order('uploaded_at'),
  ) as LegacyDocument[]
}

/** 同じ電話番号または同じ名前で、まだどの会員にも結び付いていない過去の紙 */
export async function legacyCandidates(name: string, phone: string): Promise<LegacyDocument[]> {
  const tel = phone.replace(/\D/g, '')
  const nm = name.replace(/[,()%*\\]/g, ' ').trim()
  const conds = [tel.length >= 9 ? `phone_digits.eq.${tel}` : '', nm ? `name.eq.${nm}` : ''].filter(Boolean)
  if (conds.length === 0) return []
  return unwrap(
    await supabase.from('legacy_documents').select('*').is('member_id', null).or(conds.join(',')).limit(20),
  ) as LegacyDocument[]
}

/** 過去の紙に書かれた名前・電話に近い会員 */
export async function memberCandidates(name: string, phone: string): Promise<Member[]> {
  const tel = phone.replace(/\D/g, '')
  const nm = name.replace(/[,()%*\\]/g, ' ').trim()
  const conds = [tel.length >= 9 ? `phone_digits.eq.${tel}` : '', nm ? `name.ilike.%${nm}%` : ''].filter(Boolean)
  if (conds.length === 0) return []
  return unwrap(await supabase.from('members').select('*').or(conds.join(',')).limit(10)) as Member[]
}

export async function updateLegacy(
  id: string,
  patch: Partial<Pick<LegacyDocument, 'name' | 'furigana' | 'phone' | 'note' | 'indexed_at' | 'member_id'>>,
) {
  unwrap(await supabase.from('legacy_documents').update(patch).eq('id', id).select('id'))
}

export async function deleteLegacy(doc: LegacyDocument) {
  unwrap(await supabase.from('legacy_documents').delete().eq('id', doc.id).select('id'))
  await supabase.storage.from(BUCKET).remove([doc.storage_path])
}

/** PDF を取り出して、この画面の中だけで使える URL にする */
export async function legacyBlobUrl(path: string): Promise<string> {
  const r = await supabase.storage.from(BUCKET).download(path)
  if (r.error) fail(r.error)
  return URL.createObjectURL(r.data as Blob)
}

// ---- 設定

export async function getSettings(): Promise<AppSettings> {
  const rows = unwrap(await supabase.from('app_settings').select('key, value')) as { key: string; value: unknown }[]
  const get = (key: string, fallback: number) => {
    const v = Number(rows.find((r) => r.key === key)?.value)
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return { ticket_count: get('ticket_count', 11), ticket_valid_months: get('ticket_valid_months', 2) }
}

export async function saveSettings(s: AppSettings) {
  unwrap(
    await supabase
      .from('app_settings')
      .upsert([
        { key: 'ticket_count', value: s.ticket_count },
        { key: 'ticket_valid_months', value: s.ticket_valid_months },
      ])
      .select('key'),
  )
}

// ---- 予約

const APPOINTMENT_COLS = '*, member:members(id, name, furigana, phone)'

export async function appointmentsOf(memberId: string): Promise<Appointment[]> {
  return unwrap(
    await supabase
      .from('appointments')
      .select('*')
      .eq('member_id', memberId)
      .order('scheduled_at', { ascending: false })
      .limit(50),
  ) as Appointment[]
}

export async function appointmentsBetween(fromIso: string, toIso: string): Promise<Appointment[]> {
  return unwrap(
    await supabase
      .from('appointments')
      .select(APPOINTMENT_COLS)
      .gte('scheduled_at', fromIso)
      .lt('scheduled_at', toIso)
      .order('scheduled_at')
      .limit(1000),
  ) as Appointment[]
}

export async function createAppointment(memberId: string, scheduledAt: string, note: string) {
  unwrap(
    await supabase.from('appointments').insert({ member_id: memberId, scheduled_at: scheduledAt, note }).select('id'),
  )
}

export async function updateAppointment(
  id: string,
  patch: Partial<Pick<Appointment, 'scheduled_at' | 'status' | 'note'>>,
) {
  unwrap(await supabase.from('appointments').update(patch).eq('id', id).select('id'))
}

// ---- 回数券と入金

export async function ticketsOf(memberId: string): Promise<TicketBalance[]> {
  return unwrap(
    await supabase.from('ticket_balances').select('*').eq('member_id', memberId).order('issued_on', { ascending: false }),
  ) as TicketBalance[]
}

/** 回数券を発行する。金額があれば、入金も同時に記録する */
export async function issueTickets(input: {
  member_id: string
  issued_on: string
  total_count: number
  expires_on: string
  amount: number | null
}) {
  const { amount, ...book } = input
  const row = unwrap(await supabase.from('ticket_books').insert(book).select('id').single()) as { id: string }
  if (amount !== null) {
    await addPayment({
      member_id: input.member_id, paid_on: input.issued_on, kind: '回数券', amount, note: '', ticket_book_id: row.id,
    })
  }
}

export async function updateTicket(id: string, patch: { expires_on: string }) {
  unwrap(await supabase.from('ticket_books').update(patch).eq('id', id).select('id'))
}

export async function paymentsOf(memberId: string): Promise<Payment[]> {
  return unwrap(
    await supabase
      .from('payments')
      .select('*')
      .eq('member_id', memberId)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as Payment[]
}

export async function addPayment(input: Omit<Payment, 'id'>) {
  unwrap(await supabase.from('payments').insert(input).select('id'))
}

export async function deletePayment(id: string) {
  unwrap(await supabase.from('payments').delete().eq('id', id).select('id'))
}

// ---- CSV 用：件数の上限なく全件を読む

export async function fetchAll<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(
      await supabase.from(table).select(columns).order(orderBy).order('id').range(from, from + PAGE - 1),
    ) as T[]
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}
