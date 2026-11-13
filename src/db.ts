import { DEFAULT_SETTINGS, newMember, type Member, type Settings } from './types'

// データはこの端末のブラウザ（IndexedDB）にだけ保存する。外部には送信しない。
const DB_NAME = 'medrec'
const MEMBERS = 'members'
const SETTINGS = 'settings'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(MEMBERS)) db.createObjectStore(MEMBERS, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listMembers(): Promise<Member[]> {
  const all = await run<Member[]>(MEMBERS, 'readonly', (s) => s.getAll())
  return all.map(normalize)
}

export async function getMember(id: string): Promise<Member | undefined> {
  const m = await run<Member | undefined>(MEMBERS, 'readonly', (s) => s.get(id))
  return m ? normalize(m) : undefined
}

export async function saveMember(m: Member): Promise<void> {
  await run(MEMBERS, 'readwrite', (s) => s.put({ ...m, updatedAt: new Date().toISOString() }))
}

export async function deleteMember(id: string): Promise<void> {
  await run(MEMBERS, 'readwrite', (s) => s.delete(id))
}

export async function getSettings(): Promise<Settings> {
  const s = await run<Partial<Settings> | undefined>(SETTINGS, 'readonly', (st) => st.get('app'))
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await run(SETTINGS, 'readwrite', (s) => s.put(settings, 'app'))
}

/** 古い・欠けたデータでも画面が壊れないよう、既定値で埋める */
function normalize(raw: Partial<Member>): Member {
  const base = newMember()
  return {
    ...base,
    ...raw,
    fastingBefore: { ...base.fastingBefore, ...(raw.fastingBefore ?? {}) },
    fastingAfter: { ...base.fastingAfter, ...(raw.fastingAfter ?? {}) },
    consent: { ...base.consent, ...(raw.consent ?? {}) },
    symptoms: Array.isArray(raw.symptoms) ? raw.symptoms : [],
  } as Member
}

// ---- バックアップ / 取り込み / CSV ----

export interface Backup {
  app: 'medrec'
  version: 1
  exportedAt: string
  settings: Settings
  members: Member[]
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'medrec',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    members: await listMembers(),
  }
}

/** 同じ ID の会員は上書き、それ以外は追加。取り込んだ件数を返す */
export async function importBackup(data: unknown): Promise<number> {
  const b = data as Partial<Backup>
  if (!b || b.app !== 'medrec' || !Array.isArray(b.members)) {
    throw new Error('medRec のバックアップファイルではありません')
  }
  const members = b.members.filter((m) => m && typeof m.id === 'string').map(normalize)
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEMBERS, 'readwrite')
    const store = tx.objectStore(MEMBERS)
    members.forEach((m) => store.put(m))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  return members.length
}

export function toCsv(members: Member[]): string {
  const cols: [string, (m: Member) => string][] = [
    ['会員種別', (m) => m.memberType],
    ['フリガナ', (m) => m.furigana],
    ['氏名', (m) => m.name],
    ['郵便番号', (m) => m.postalCode],
    ['住所', (m) => m.address],
    ['電話', (m) => m.phone],
    ['E-mail', (m) => m.email],
    ['携帯メール', (m) => m.mobileEmail],
    ['職業', (m) => m.occupation],
    ['紹介者', (m) => m.referrer],
    ['登録日', (m) => m.registeredOn],
    ['生年月日', (m) => m.birthDate],
    ['性別', (m) => m.sex],
    ['血液型', (m) => m.bloodType],
    ['身長(cm)', (m) => m.heightCm],
    ['血圧', (m) => m.bloodPressure],
    ['断食前 体重', (m) => m.fastingBefore.weight],
    ['断食前 体脂肪率', (m) => m.fastingBefore.bodyFatPct],
    ['断食前 体脂肪量', (m) => m.fastingBefore.bodyFatMass],
    ['断食後 体重', (m) => m.fastingAfter.weight],
    ['断食後 体脂肪率', (m) => m.fastingAfter.bodyFatPct],
    ['断食後 体脂肪量', (m) => m.fastingAfter.bodyFatMass],
    ['該当項目', (m) => m.symptoms.join('・')],
    ['詳しい症状・自覚症状', (m) => m.symptomDetail],
    ['施術後の感想', (m) => m.impressions],
    ['入会同意', (m) => (m.consent.agreed ? '済' : '未')],
    ['同意日', (m) => (m.consent.agreed ? m.consent.date : '')],
    ['代理人氏名', (m) => m.consent.proxyName],
    ['本人との続柄', (m) => m.consent.proxyRelation],
  ]
  const esc = (v: string) => {
    // 表計算ソフトで数式として解釈されないようにする
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    return `"${safe.replace(/"/g, '""')}"`
  }
  const lines = [cols.map(([h]) => esc(h)).join(',')]
  for (const m of members) lines.push(cols.map(([, f]) => esc(f(m) ?? '')).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
