import { useState, type FormEvent } from 'react'
import { ORG_NAME, type ConsentDocument, type SignInput } from '../types'
import SignaturePad from './SignaturePad'

interface Props {
  docs: ConsentDocument[]
  /** 会員の氏名が分かっていれば初期値にする */
  memberName?: string
  /** 代理人としてログインしている場合の初期値 */
  proxy?: { name: string; relation: string }
  heading: string
  lead?: string
  onSign: (s: SignInput) => Promise<void>
  onCancel?: () => void
}

/** 文面を読む → 同意にチェック → 署名。カルテの入力より前に必ず通る */
export default function ConsentStep({ docs, memberName, proxy, heading, lead, onSign, onCancel }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [signerType, setSignerType] = useState<'本人' | '代理人'>(proxy ? '代理人' : '本人')
  const [signerName, setSignerName] = useState(memberName ?? '')
  const [proxyName, setProxyName] = useState(proxy?.name ?? '')
  const [proxyRelation, setProxyRelation] = useState(proxy?.relation ?? '')
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const allChecked = docs.every((d) => checked[d.id])
  const isProxy = signerType === '代理人'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!allChecked) return setError('すべての文面を読み、同意にチェックを入れてください。')
    if (!signerName.trim()) return setError('会員ご本人の氏名を入力してください。')
    if (isProxy && !proxyName.trim()) return setError('代理人の氏名を入力してください。')
    if (!signature) return setError('署名欄に署名してください。')
    setBusy(true)
    setError('')
    try {
      await onSign({
        signerType,
        signerName: signerName.trim(),
        proxyName: isProxy ? proxyName.trim() : '',
        proxyRelation: isProxy ? proxyRelation.trim() : '',
        signature,
      })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
      window.scrollTo(0, 0)
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="page-head">
        <h1>{heading}</h1>
      </div>
      {lead && <p className="lead">{lead}</p>}
      {error && <p className="error">{error}</p>}

      {docs.map((d) => (
        <fieldset key={d.id}>
          <legend>
            {d.title} <span className="ver">第{d.version}版</span>
          </legend>
          <div className="notice-body" tabIndex={0}>
            {d.body}
          </div>
          <label className="choice agree">
            <input
              type="checkbox"
              checked={Boolean(checked[d.id])}
              onChange={(e) => setChecked({ ...checked, [d.id]: e.target.checked })}
            />
            「{d.title}」を読み、同意します
          </label>
        </fieldset>
      ))}

      <fieldset>
        <legend>署名</legend>
        <p className="consent-to">{ORG_NAME} 殿</p>
        <div className="field">
          <span className="label">署名する方</span>
          <div className="choices">
            {(['本人', '代理人'] as const).map((t) => (
              <label key={t} className="choice">
                <input type="radio" name="signerType" checked={signerType === t} onChange={() => setSignerType(t)} />
                {t === '本人' ? '会員ご本人' : '代理人'}
              </label>
            ))}
          </div>
        </div>
        <div className="grid">
          <label className={isProxy ? 'field' : 'field span2'}>
            <span className="label">会員ご本人の氏名</span>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} autoComplete="off" />
          </label>
          {isProxy && (
            <>
              <label className="field">
                <span className="label">代理人の氏名</span>
                <input value={proxyName} onChange={(e) => setProxyName(e.target.value)} autoComplete="off" />
              </label>
              <label className="field">
                <span className="label">ご本人との続柄</span>
                <input value={proxyRelation} onChange={(e) => setProxyRelation(e.target.value)} placeholder="例：子、配偶者" />
              </label>
            </>
          )}
          <div className="field span2">
            <span className="label">{isProxy ? '代理人の署名' : '氏名（自署）'}</span>
            <SignaturePad value={signature} onChange={setSignature} />
          </div>
        </div>
        <p className="hint">同意した日時、署名、同意した文面の版が記録されます。記録は後から変更できません。</p>
      </fieldset>

      <div className="actions sticky">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            戻る
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? '記録中…' : '同意して進む'}
        </button>
      </div>
    </form>
  )
}
