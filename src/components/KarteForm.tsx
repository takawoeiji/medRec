import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type { StaffMemberInput } from '../api'
import { BLOOD_TYPES, MEMBER_CLASSES, SEXES, SYMPTOM_ROWS, ageOf, today, type Member } from '../types'

export type KarteValues = StaffMemberInput & { photo: string }

export function emptyKarte(): KarteValues {
  return {
    member_class: null, is_vip: false, is_fasting: false, phone: '', registered_on: today(),
    furigana: '', name: '', postal_code: '', address: '', email: '', mobile_email: '',
    occupation: '', referrer: '', birth_date: null, sex: null, blood_type: null,
    height_cm: '', blood_pressure: '', symptoms: [], symptom_detail: '', photo: '',
  }
}

export function karteFrom(m: Member, photo: string): KarteValues {
  const base = emptyKarte()
  const picked = Object.fromEntries(Object.keys(base).filter((k) => k in m).map((k) => [k, m[k as keyof Member]]))
  return { ...base, ...picked, photo } as KarteValues
}

/** 写真を長辺 480px の JPEG に縮めて保存サイズを抑える */
function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 480 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('画像を読み込めませんでした'))
    }
    img.src = url
  })
}

interface Props {
  initial: KarteValues
  /** staff は会員区分・電話番号・登録日も編集できる */
  mode: 'customer' | 'staff'
  heading: string
  lead?: string
  submitLabel: string
  onSubmit: (v: KarteValues) => Promise<void>
  cancelHref?: string
  extra?: ReactNode
}

export default function KarteForm({ initial, mode, heading, lead, submitLabel, onSubmit, cancelHref, extra }: Props) {
  const [v, setV] = useState<KarteValues>(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof KarteValues>(key: K, value: KarteValues[K]) => setV((p) => ({ ...p, [key]: value }))
  const text = (key: keyof KarteValues) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(key, e.target.value as never)
  const toggleSymptom = (s: string) =>
    set('symptoms', v.symptoms.includes(s) ? v.symptoms.filter((x) => x !== s) : [...v.symptoms, s])

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      set('photo', await resizePhoto(file))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!v.name.trim()) {
      setError('氏名を入力してください。')
      window.scrollTo(0, 0)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(v)
    } catch (err) {
      setError(`保存できませんでした：${(err as Error).message}`)
      setBusy(false)
      window.scrollTo(0, 0)
    }
  }

  const age = ageOf(v.birth_date)
  const staff = mode === 'staff'

  return (
    <form onSubmit={submit} className="form" noValidate>
      <div className="page-head">
        <h1>{heading}</h1>
      </div>
      {lead && <p className="lead">{lead}</p>}
      {error && <p className="error">{error}</p>}

      {staff && (
        <fieldset>
          <legend>会員区分</legend>
          <div className="choices">
            {MEMBER_CLASSES.map((c) => (
              <label key={c} className="choice">
                <input type="radio" name="member_class" checked={v.member_class === c} onChange={() => set('member_class', c)} />
                {c}会員
              </label>
            ))}
            <label className="choice">
              <input type="radio" name="member_class" checked={!v.member_class} onChange={() => set('member_class', null)} />
              未設定
            </label>
          </div>
          <div className="choices mt">
            <label className="choice">
              <input type="checkbox" checked={v.is_vip} onChange={(e) => set('is_vip', e.target.checked)} />
              VIP
            </label>
            <label className="choice">
              <input type="checkbox" checked={v.is_fasting} onChange={(e) => set('is_fasting', e.target.checked)} />
              断食
            </label>
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>基本情報</legend>
        <div className="basic">
          <div className="grid">
            <label className="field">
              <span className="label">フリガナ</span>
              <input value={v.furigana} onChange={text('furigana')} autoComplete="off" />
            </label>
            <label className="field">
              <span className="label">
                氏名 <em>必須</em>
              </span>
              <input value={v.name} onChange={text('name')} autoComplete="off" required />
            </label>
            <label className="field">
              <span className="label">生年月日 {age !== null && <span className="age">満{age}歳</span>}</span>
              <input type="date" value={v.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value || null)} />
            </label>
            {staff && (
              <label className="field">
                <span className="label">登録日</span>
                <input type="date" value={v.registered_on} onChange={text('registered_on')} />
              </label>
            )}
            <div className="field">
              <span className="label">性別</span>
              <div className="choices">
                {SEXES.map((s) => (
                  <label key={s} className="choice">
                    <input type="radio" name="sex" checked={v.sex === s} onChange={() => set('sex', s)} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">血液型</span>
              <div className="choices">
                {BLOOD_TYPES.map((b) => (
                  <label key={b} className="choice">
                    <input type="radio" name="blood_type" checked={v.blood_type === b} onChange={() => set('blood_type', b)} />
                    {b}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="photo-box">
            {v.photo ? <img src={v.photo} alt="顔写真" /> : <span className="muted">写真</span>}
            <label className="btn small">
              {v.photo ? '写真を変更' : '写真を選ぶ'}
              <input type="file" accept="image/*" capture="user" onChange={onPhoto} hidden />
            </label>
            {v.photo && (
              <button type="button" className="btn small ghost" onClick={() => set('photo', '')}>
                削除
              </button>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>連絡先</legend>
        <div className="grid">
          <label className="field">
            <span className="label">郵便番号</span>
            <input value={v.postal_code} onChange={text('postal_code')} inputMode="numeric" placeholder="123-4567" autoComplete="postal-code" />
          </label>
          {staff && (
            <label className="field">
              <span className="label">電話</span>
              <input type="tel" value={v.phone} onChange={text('phone')} />
            </label>
          )}
          <label className="field span2">
            <span className="label">住所</span>
            <input value={v.address} onChange={text('address')} autoComplete="street-address" />
          </label>
          <label className="field">
            <span className="label">E-mail</span>
            <input type="email" value={v.email} onChange={text('email')} autoComplete="email" />
          </label>
          <label className="field">
            <span className="label">携帯メール</span>
            <input type="email" value={v.mobile_email} onChange={text('mobile_email')} />
          </label>
          <label className="field">
            <span className="label">職業</span>
            <input value={v.occupation} onChange={text('occupation')} />
          </label>
          <label className="field">
            <span className="label">紹介者</span>
            <input value={v.referrer} onChange={text('referrer')} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>身体の記録</legend>
        <div className="grid">
          <label className="field">
            <span className="label">身長（cm）</span>
            <input value={v.height_cm} onChange={text('height_cm')} inputMode="decimal" />
          </label>
          <label className="field">
            <span className="label">血圧（任意）</span>
            <input value={v.blood_pressure} onChange={text('blood_pressure')} placeholder="120/80" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>該当するものにチェックしてください</legend>
        <div className="symptoms">
          {SYMPTOM_ROWS.flat().map((s) => (
            <label key={s} className={v.symptoms.includes(s) ? 'chip on' : 'chip'}>
              <input type="checkbox" checked={v.symptoms.includes(s)} onChange={() => toggleSymptom(s)} />
              {s}
            </label>
          ))}
        </div>
        <label className="field">
          <span className="label">詳しい症状・自覚症状</span>
          <textarea rows={5} value={v.symptom_detail} onChange={text('symptom_detail')} />
        </label>
      </fieldset>

      {extra}

      <div className="actions sticky">
        {cancelHref && (
          <a className="btn" href={cancelHref}>
            キャンセル
          </a>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
