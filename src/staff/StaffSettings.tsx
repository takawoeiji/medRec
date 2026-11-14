import { useCallback, useEffect, useState } from 'react'
import { allDocs, getSettings, publishDoc, saveSettings } from '../api'
import { EXPORTS } from '../csv'
import { formatDate, type AppSettings, type ConsentDocument } from '../types'

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
        <h1>設定</h1>
      </div>
      <TicketSettings />
      <Exports />
      <h2 className="section-title">同意文面</h2>
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

function TicketSettings() {
  const [saved, setSaved] = useState<AppSettings | null>(null)
  const [count, setCount] = useState('')
  const [months, setMonths] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSaved(s)
        setCount(String(s.ticket_count))
        setMonths(String(s.ticket_valid_months))
      })
      .catch((e) => setError(e.message))
  }, [])

  const save = async () => {
    const next = { ticket_count: Number(count), ticket_valid_months: Number(months) }
    if (!(next.ticket_count >= 1 && next.ticket_count <= 100 && next.ticket_valid_months >= 1 && next.ticket_valid_months <= 60)) {
      return setError('枚数は1〜100、有効期限は1〜60か月で入力してください。')
    }
    setMsg('')
    setError('')
    try {
      await saveSettings(next)
      setSaved(next)
      setMsg('保存しました。次に発行する回数券から適用されます。')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const dirty = saved && (count !== String(saved.ticket_count) || months !== String(saved.ticket_valid_months))

  return (
    <fieldset>
      <legend>回数券</legend>
      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <label className="field narrow">
          <span className="label">1冊の枚数</span>
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field narrow">
          <span className="label">有効期限（か月）</span>
          <input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} />
        </label>
        <button type="button" className="btn primary" disabled={!dirty} onClick={save}>
          保存
        </button>
      </div>
      <p className="hint">発行時の初期値です。発行済みの回数券は変わりません。期限は1冊ごとに会員の画面で変更できます。</p>
    </fieldset>
  )
}

function Exports() {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const run = async (x: (typeof EXPORTS)[number]) => {
    setBusy(x.key)
    setMsg('')
    setError('')
    try {
      const n = await x.run()
      setMsg(`${x.label}を ${n}件、CSV に書き出しました。`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <fieldset>
      <legend>CSV の書き出し</legend>
      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <div className="actions left">
        {EXPORTS.map((x) => (
          <button key={x.key} type="button" className="btn" disabled={Boolean(busy)} onClick={() => run(x)}>
            {busy === x.key ? '書き出し中…' : x.label}
          </button>
        ))}
      </div>
      <p className="hint">CSV には氏名・連絡先・健康に関する情報が含まれます。保管場所と共有先にご注意ください。</p>
    </fieldset>
  )
}
