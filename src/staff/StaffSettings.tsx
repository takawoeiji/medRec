import { useCallback, useEffect, useState } from 'react'
import { allDocs, publishDoc } from '../api'
import { formatDate, type ConsentDocument } from '../types'

const KINDS = [
  { kind: 'privacy', label: '個人情報の取り扱いについて' },
  { kind: 'admission', label: '入会注意事項' },
] as const

export default function StaffSettings() {
  const [docs, setDocs] = useState<ConsentDocument[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => allDocs().then(setDocs).catch((e) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!docs) return <p className="muted">読み込み中…</p>

  return (
    <section className="form">
      <div className="page-head">
        <h1>同意文面</h1>
      </div>
      <p className="lead">
        文面を改訂すると新しい版として保存され、過去の版と、過去の同意の記録はそのまま残ります。改訂後は、すべての会員に次回ログイン時の再同意を求めます。
      </p>
      {KINDS.map(({ kind, label }) => (
        <DocEditor key={kind} kind={kind} label={label} versions={docs.filter((d) => d.kind === kind)} onSaved={load} />
      ))}
    </section>
  )
}

function DocEditor({ kind, label, versions, onSaved }: {
  kind: string
  label: string
  versions: ConsentDocument[]
  onSaved: () => Promise<unknown>
}) {
  const current = versions[0]
  const [title, setTitle] = useState(current?.title ?? label)
  const [body, setBody] = useState(current?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const dirty = title !== (current?.title ?? label) || body !== (current?.body ?? '')
  const next = (current?.version ?? 0) + 1

  const publish = async () => {
    if (!title.trim() || !body.trim()) return setError('題名と本文を入力してください。')
    if (!window.confirm(`「${title}」を第${next}版として公開します。すべての会員に再同意を求めることになります。よろしいですか？`)) return
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await publishDoc(kind, next, title.trim(), body)
      await onSaved()
      setMsg(`第${next}版を公開しました。`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset>
      <legend>
        {label} <span className="ver">現在 第{current?.version ?? 0}版</span>
      </legend>
      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span className="label">題名</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field mt">
        <span className="label">本文</span>
        <textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="actions mt">
        <button type="button" className="btn primary" disabled={busy || !dirty} onClick={publish}>
          {busy ? '公開中…' : `第${next}版として公開`}
        </button>
      </div>
      <p className="hint">
        版の履歴：{versions.map((d) => `第${d.version}版（${formatDate(d.created_at)}）`).join('、')}
      </p>
    </fieldset>
  )
}
