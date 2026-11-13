import { supabase } from './supabase'
import type {
  AuditEntry,
  Consent,
  ConsentDocument,
  Member,
  MemberLogin,
  Session,
  SignInput,
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
