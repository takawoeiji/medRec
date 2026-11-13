export const MEMBER_TYPES = ['特別', '正', '準'] as const
export const BLOOD_TYPES = ['A', 'O', 'B', 'AB'] as const
export const SEXES = ['男', '女'] as const

/** 紙の登録表と同じ並び（6行 × 6列） */
export const SYMPTOM_ROWS: string[][] = [
  ['心臓病', '低血圧', '首の痛み', '頭痛', '腎臓', 'リュウマチ'],
  ['糖尿病', '冷え症', '眼の痛み', '腰痛', '膵臓', 'アレルギー'],
  ['不眠症', '生理痛', '肘の痛み', '貧血', '便秘', 'アトピー'],
  ['胃腸痛', '耳鳴り', '膝の痛み', '喘息', '下痢', '記憶減退'],
  ['肝臓病', '背部痛', '足の痛み', '咳', '生理不順', '禁煙希望'],
  ['高血圧', '肩こり', '坐骨神経痛', '過労', '前立腺炎', 'ダイエット'],
]

export interface BodyMeasure {
  weight: string
  bodyFatPct: string
  bodyFatMass: string
}

export interface Consent {
  agreed: boolean
  date: string
  signerName: string
  /** 自署（PNG の data URL） */
  signature: string
  proxyName: string
  proxyRelation: string
}

export interface Member {
  id: string
  memberType: string
  furigana: string
  name: string
  postalCode: string
  address: string
  phone: string
  email: string
  mobileEmail: string
  occupation: string
  referrer: string
  registeredOn: string
  birthDate: string
  sex: string
  bloodType: string
  /** 顔写真（JPEG の data URL） */
  photo: string
  heightCm: string
  bloodPressure: string
  fastingBefore: BodyMeasure
  fastingAfter: BodyMeasure
  symptoms: string[]
  symptomDetail: string
  impressions: string
  consent: Consent
  createdAt: string
  updatedAt: string
}

export interface Settings {
  orgName: string
  formTitle: string
  /** 入会注意事項の本文（同意画面に表示） */
  notice: string
}

export const DEFAULT_SETTINGS: Settings = {
  orgName: '郭良気功研究所',
  formTitle: '慧丹気功健康回復法会員登録表',
  notice: '',
}

export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function newMember(): Member {
  const now = new Date().toISOString()
  const measure = (): BodyMeasure => ({ weight: '', bodyFatPct: '', bodyFatMass: '' })
  return {
    id: crypto.randomUUID(),
    memberType: '',
    furigana: '',
    name: '',
    postalCode: '',
    address: '',
    phone: '',
    email: '',
    mobileEmail: '',
    occupation: '',
    referrer: '',
    registeredOn: today(),
    birthDate: '',
    sex: '',
    bloodType: '',
    photo: '',
    heightCm: '',
    bloodPressure: '',
    fastingBefore: measure(),
    fastingAfter: measure(),
    symptoms: [],
    symptomDetail: '',
    impressions: '',
    consent: {
      agreed: false,
      date: today(),
      signerName: '',
      signature: '',
      proxyName: '',
      proxyRelation: '',
    },
    createdAt: now,
    updatedAt: now,
  }
}

/** 満年齢。生年月日が未入力・不正なら null */
export function ageOf(birthDate: string, at: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let age = at.getFullYear() - y
  if (at.getMonth() + 1 < mo || (at.getMonth() + 1 === mo && at.getDate() < d)) age--
  return age >= 0 && age < 150 ? age : null
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : ''
}
