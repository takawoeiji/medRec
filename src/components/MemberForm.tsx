import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { go } from '../App'
import { getMember, saveMember } from '../db'
import {
  BLOOD_TYPES,
  MEMBER_TYPES,
  SEXES,
  SYMPTOM_ROWS,
  ageOf,
  newMember,
  type BodyMeasure,
  type Consent,
  type Member,
  type Settings,
} from '../types'
import SignaturePad from './SignaturePad'

interface Props {
  id?: string
  settings: Settings
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

export default function MemberForm({ id, settings }: Props) {
  const [m, setM] = useState<Member | null>(id ? null : newMember())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getMember(id)
      .then((found) => (found ? setM(found) : setError('この会員は見つかりませんでした。')))
      .catch((e) => setError(String(e?.message ?? e)))
  }, [id])

  if (error && !m) return <p className="error">{error}</p>
  if (!m) return <p className="muted">読み込み中…</p>

  const set = <K extends keyof Member>(key: K, value: Member[K]) => setM({ ...m, [key]: value })
  const text =
    (key: keyof Member) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, e.target.value as never)
  const setMeasure = (
    which: 'fastingBefore' | 'fastingAfter',
    key: keyof BodyMeasure,
    value: string,
  ) => setM({ ...m, [which]: { ...m[which], [key]: value } })
  const setConsent = <K extends keyof Consent>(key: K, value: Consent[K]) =>
    setM({ ...m, consent: { ...m.consent, [key]: value } })
  const toggleSymptom = (s: string) =>
    set('symptoms', m.symptoms.includes(s) ? m.symptoms.filter((x) => x !== s) : [...m.symptoms, s])

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      set('photo', await resizePhoto(file))
    } catch (err) {
      setError(String((err as Error).message))
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!m.name.trim()) {
      setError('氏名を入力してください。')
      window.scrollTo(0, 0)
      return
    }
    setSaving(true)
    try {
      await saveMember(m)
      go(`/m/${m.id}`)
    } catch (err) {
      setError(`保存できませんでした：${String((err as Error).message ?? err)}`)
      setSaving(false)
      window.scrollTo(0, 0)
    }
  }

  const age = ageOf(m.birthDate)

  return (
    <form onSubmit={onSubmit} className="form" noValidate>
      <div className="page-head">
        <h1>{id ? '会員情報の編集' : '新規会員登録'}</h1>
      </div>
      {error && <p className="error">{error}</p>}

      <fieldset>
        <legend>基本情報</legend>
        <div className="basic">
          <div className="grid">
            <div className="field span2">
              <span className="label">会員種別</span>
              <div className="choices">
                {MEMBER_TYPES.map((t) => (
                  <label key={t} className="choice">
                    <input
                      type="radio"
                      name="memberType"
                      checked={m.memberType === t}
                      onChange={() => set('memberType', t)}
                    />
                    {t}会員
                  </label>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="label">フリガナ</span>
              <input value={m.furigana} onChange={text('furigana')} autoComplete="off" />
            </label>
            <label className="field">
              <span className="label">
                氏名 <em>必須</em>
              </span>
              <input value={m.name} onChange={text('name')} autoComplete="off" required />
            </label>
            <label className="field">
              <span className="label">登録日</span>
              <input type="date" value={m.registeredOn} onChange={text('registeredOn')} />
            </label>
            <label className="field">
              <span className="label">
                生年月日 {age !== null && <span className="age">満{age}歳</span>}
              </span>
              <input type="date" value={m.birthDate} onChange={text('birthDate')} />
            </label>
            <div className="field">
              <span className="label">性別</span>
              <div className="choices">
                {SEXES.map((s) => (
                  <label key={s} className="choice">
                    <input
                      type="radio"
                      name="sex"
                      checked={m.sex === s}
                      onChange={() => set('sex', s)}
                    />
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
                    <input
                      type="radio"
                      name="bloodType"
                      checked={m.bloodType === b}
                      onChange={() => set('bloodType', b)}
                    />
                    {b}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="photo-box">
            {m.photo ? <img src={m.photo} alt="顔写真" /> : <span className="muted">写真</span>}
            <label className="btn small">
              {m.photo ? '写真を変更' : '写真を選ぶ'}
              <input type="file" accept="image/*" capture="user" onChange={onPhoto} hidden />
            </label>
            {m.photo && (
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
            <input
              value={m.postalCode}
              onChange={text('postalCode')}
              inputMode="numeric"
              placeholder="123-4567"
            />
          </label>
          <label className="field">
            <span className="label">電話</span>
            <input type="tel" value={m.phone} onChange={text('phone')} />
          </label>
          <label className="field span2">
            <span className="label">住所</span>
            <input value={m.address} onChange={text('address')} />
          </label>
          <label className="field">
            <span className="label">E-mail</span>
            <input type="email" value={m.email} onChange={text('email')} />
          </label>
          <label className="field">
            <span className="label">携帯メール</span>
            <input type="email" value={m.mobileEmail} onChange={text('mobileEmail')} />
          </label>
          <label className="field">
            <span className="label">職業</span>
            <input value={m.occupation} onChange={text('occupation')} />
          </label>
          <label className="field">
            <span className="label">紹介者</span>
            <input value={m.referrer} onChange={text('referrer')} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>身体の記録</legend>
        <div className="grid">
          <label className="field">
            <span className="label">身長（cm）</span>
            <input value={m.heightCm} onChange={text('heightCm')} inputMode="decimal" />
          </label>
          <label className="field">
            <span className="label">血圧</span>
            <input
              value={m.bloodPressure}
              onChange={text('bloodPressure')}
              placeholder="120/80"
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="measure">
            <thead>
              <tr>
                <th></th>
                <th>体重（kg）</th>
                <th>体脂肪率（%）</th>
                <th>体脂肪量（kg）</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['fastingBefore', '断食前'],
                  ['fastingAfter', '断食後'],
                ] as const
              ).map(([key, label]) => (
                <tr key={key}>
                  <th>{label}</th>
                  {(['weight', 'bodyFatPct', 'bodyFatMass'] as const).map((f) => (
                    <td key={f}>
                      <input
                        value={m[key][f]}
                        onChange={(e) => setMeasure(key, f, e.target.value)}
                        inputMode="decimal"
                        aria-label={`${label} ${f}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset>
        <legend>該当するものにチェックしてください</legend>
        <div className="symptoms">
          {SYMPTOM_ROWS.flat().map((s) => (
            <label key={s} className={m.symptoms.includes(s) ? 'chip on' : 'chip'}>
              <input
                type="checkbox"
                checked={m.symptoms.includes(s)}
                onChange={() => toggleSymptom(s)}
              />
              {s}
            </label>
          ))}
        </div>
        <label className="field">
          <span className="label">詳しい症状・自覚症状</span>
          <textarea rows={5} value={m.symptomDetail} onChange={text('symptomDetail')} />
        </label>
        <label className="field">
          <span className="label">施術後の感想</span>
          <textarea rows={5} value={m.impressions} onChange={text('impressions')} />
        </label>
      </fieldset>

      <fieldset>
        <legend>入会同意書</legend>
        {settings.notice.trim() ? (
          <details className="notice">
            <summary>入会注意事項を読む</summary>
            <div className="notice-body">{settings.notice}</div>
          </details>
        ) : (
          <p className="hint">
            入会注意事項の本文は未設定です。「設定・データ」で登録すると、ここに表示されます。
          </p>
        )}
        <div className="consent-text">
          <p>{settings.orgName}殿</p>
          <p>
            私は、このたび{settings.orgName}
            に入会するにあたり、入会注意事項を十分に理解し、不明な点についての説明を受ける機会を得ました。
          </p>
          <p>また、体質によって効果は異なり、個人差がある事を了承しました。</p>
          <p>私は本日、当研究所へ入会することに同意します。</p>
        </div>
        <label className="choice agree">
          <input
            type="checkbox"
            checked={m.consent.agreed}
            onChange={(e) => setConsent('agreed', e.target.checked)}
          />
          上記に同意します
        </label>
        <div className="grid">
          <label className="field">
            <span className="label">同意日</span>
            <input
              type="date"
              value={m.consent.date}
              onChange={(e) => setConsent('date', e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">氏名</span>
            <input
              value={m.consent.signerName}
              onChange={(e) => setConsent('signerName', e.target.value)}
              placeholder={m.name}
            />
          </label>
          <div className="field span2">
            <span className="label">氏名（自署）</span>
            <SignaturePad value={m.consent.signature} onChange={(v) => setConsent('signature', v)} />
          </div>
          <label className="field">
            <span className="label">代理人氏名</span>
            <input
              value={m.consent.proxyName}
              onChange={(e) => setConsent('proxyName', e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">本人との続柄</span>
            <input
              value={m.consent.proxyRelation}
              onChange={(e) => setConsent('proxyRelation', e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <div className="actions sticky">
        <a className="btn" href={id ? `#/m/${id}` : '#/'}>
          キャンセル
        </a>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </form>
  )
}
