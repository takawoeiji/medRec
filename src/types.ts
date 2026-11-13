export const ORG_NAME = '郭良気功研究所'
export const FORM_TITLE = '慧丹気功健康回復法会員登録表'

export const MEMBER_CLASSES = ['特別', '正', '準'] as const
export const BLOOD_TYPES = ['A', 'O', 'B', 'AB'] as const
export const SEXES = ['男', '女'] as const
export const MODES = ['来所', '遠隔'] as const

/** 紙の登録表と同じ並び（6行 × 6列） */
export const SYMPTOM_ROWS: string[][] = [
  ['心臓病', '低血圧', '首の痛み', '頭痛', '腎臓', 'リュウマチ'],
  ['糖尿病', '冷え症', '眼の痛み', '腰痛', '膵臓', 'アレルギー'],
  ['不眠症', '生理痛', '肘の痛み', '貧血', '便秘', 'アトピー'],
  ['胃腸痛', '耳鳴り', '膝の痛み', '喘息', '下痢', '記憶減退'],
  ['肝臓病', '背部痛', '足の痛み', '咳', '生理不順', '禁煙希望'],
  ['高血圧', '肩こり', '坐骨神経痛', '過労', '前立腺炎', 'ダイエット'],
]

export interface Member {
  id: string
  member_class: string | null
  is_vip: boolean
  is_fasting: boolean
  furigana: string
  name: string
  postal_code: string
  address: string
  phone: string
  email: string
  mobile_email: string
  occupation: string
  referrer: string
  registered_on: string
  birth_date: string | null
  sex: string | null
  blood_type: string | null
  height_cm: string
  blood_pressure: string
  symptoms: string[]
  symptom_detail: string
  karte_completed_at: string | null
  created_at: string
  updated_at: string
}

export interface MemberLogin {
  id: string
  member_id: string
  phone: string
  relation: '本人' | '代理人'
  proxy_name: string
  proxy_relation: string
}

export interface ConsentDocument {
  id: string
  kind: 'privacy' | 'admission'
  version: number
  title: string
  body: string
  created_at: string
}

export interface Consent {
  id: string
  member_id: string
  document_id: string
  signed_at: string
  signer_type: '本人' | '代理人'
  signer_name: string
  proxy_name: string
  proxy_relation: string
  signature: string
  via: 'customer_login' | 'staff_device'
  phone: string | null
  document?: ConsentDocument
}

export interface SessionComment {
  id: string
  session_id: string
  author_role: 'customer' | 'staff'
  body: string
  created_at: string
}

export interface Session {
  id: string
  member_id: string
  session_date: string
  mode: '来所' | '遠隔'
  is_vip: boolean
  is_fasting: boolean
  created_at: string
  comments: SessionComment[]
  /** スタッフにだけ返る */
  note: { note: string } | null
}

export interface AuditEntry {
  id: number
  table_name: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  by_staff: boolean
  changed_at: string
}

export interface SignInput {
  signerType: '本人' | '代理人'
  signerName: string
  proxyName: string
  proxyRelation: string
  signature: string
}

/** 今日の日付（日本時間）。データベース側の today_jst() と合わせる */
export function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

/** 満年齢。生年月日が未入力・不正なら null */
export function ageOf(birthDate: string | null, at: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '')
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let age = at.getFullYear() - y
  if (at.getMonth() + 1 < mo || (at.getMonth() + 1 === mo && at.getDate() < d)) age--
  return age >= 0 && age < 150 ? age : null
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  // 日時つき（同意日時など）は、端末の時刻に直してから日付を取る
  if (iso.length > 10) {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : ''
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 入力された電話番号を国番号つきにする（090-1234-5678 → +819012345678） */
export function toE164(input: string): string | null {
  const d = input.replace(/\D/g, '')
  if (d.length < 9 || d.length > 15) return null
  if (d.startsWith('0')) return `+81${d.slice(1)}`
  return `+${d}`
}

/** データベースの形（819012345678）を読みやすくする */
export function showPhone(stored: string): string {
  const d = stored.startsWith('81') ? `0${stored.slice(2)}` : stored
  return /^0\d{10}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d
}

/** 未同意の文面（最新版のうち、同意の記録がないもの） */
export function pendingDocs(docs: ConsentDocument[], consents: Pick<Consent, 'document_id'>[]) {
  const done = new Set(consents.map((c) => c.document_id))
  return docs.filter((d) => !done.has(d.id))
}

// ---- 第2段階

export interface FastingLog {
  id: string
  course_id: string
  log_date: string
  weight_kg: number
  blood_pressure: string
  progress: string
  entered_by: 'customer' | 'staff'
}

export interface FastingCourse {
  id: string
  member_id: string
  start_date: string
  planned_days: number
  end_date: string | null
  medication: string
  medication_declared_at: string | null
  note: string
  logs: FastingLog[]
}

export interface LegacyDocument {
  id: string
  storage_path: string
  file_name: string
  file_size: number
  name: string
  furigana: string
  phone: string
  note: string
  indexed_at: string | null
  member_id: string | null
  uploaded_at: string
  member?: { id: string; name: string } | null
}

/** 2つの日付の差（日数）。b - a */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}

export function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[1])}/${Number(m[2])}` : ''
}
