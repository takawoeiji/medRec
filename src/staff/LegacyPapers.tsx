import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  deleteLegacy, getLegacy, legacyBlobUrl, memberCandidates, pendingLegacy, searchLegacy,
  updateLegacy, uploadLegacy,
} from '../api'
import { formatDate, type LegacyDocument, type Member } from '../types'

const go = (path: string) => {
  window.location.hash = path
}

/** #/papers … 取り込みと検索　#/papers/index … 未入力を順に入力　#/papers/d/:id … 1件を開く */
export default function LegacyPapers({ route }: { route: string[] }) {
  if (route[1] === 'index') return <IndexQueue />
  if (route[1] === 'd' && route[2]) return <OneDocument key={route[2]} id={route[2]} />
  return <Overview initialQuery={route[1] === 'q' ? decodeURIComponent(route[2] ?? '') : ''} />
}

function Overview({ initialQuery }: { initialQuery: string }) {
  const [pending, setPending] = useState<number | null>(null)
  const [q, setQ] = useState(initialQuery)
  const [rows, setRows] = useState<LegacyDocument[] | null>(null)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const loadPending = useCallback(() => pendingLegacy().then((p) => setPending(p.total)).catch(() => {}), [])
  useEffect(() => {
    loadPending()
  }, [loadPending])

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      searchLegacy(q).then((r) => live && setRows(r)).catch((e) => live && setErrors([e.message]))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, pending])

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const failed: string[] = []
    for (let i = 0; i < files.length; i++) {
      setProgress(`取り込み中… ${i + 1} / ${files.length}`)
      try {
        await uploadLegacy(files[i])
      } catch (err) {
        failed.push((err as Error).message)
      }
    }
    setProgress(files.length ? `${files.length - failed.length}件を取り込みました。` : '')
    setErrors(failed)
    await loadPending()
  }

  return (
    <section>
      <div className="page-head">
        <h1>過去の紙</h1>
      </div>

      <fieldset>
        <legend>取り込み</legend>
        <p className="hint">スキャンした PDF をそのまま保管します。1人分を1つの PDF にしてください（1ファイル 25MB まで）。まとめて選べます。</p>
        <div className="actions left">
          <label className="btn primary">
            PDF を選んで取り込む
            <input type="file" accept="application/pdf" multiple hidden onChange={onFiles} />
          </label>
          {pending !== null && pending > 0 && (
            <a className="btn" href="#/papers/index">
              名前と電話番号を入力する（未入力 {pending}件）
            </a>
          )}
        </div>
        {progress && <p className="success mt">{progress}</p>}
        {errors.map((e) => (
          <p key={e} className="error mt">
            {e}
          </p>
        ))}
        {pending === 0 && <p className="hint">未入力の PDF はありません。</p>}
      </fieldset>

      <fieldset>
        <legend>検索</legend>
        <div className="filters">
          <input
            type="search"
            placeholder="名前・フリガナ・電話番号で検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="過去の紙を検索"
          />
        </div>
        {!rows ? (
          <p className="muted">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="muted">{q ? '条件に合う紙はありません。' : '名前を入力済みの紙はまだありません。'}</p>
        ) : (
          <ul className="member-list">
            {rows.map((d) => (
              <li key={d.id}>
                <a href={`#/papers/d/${d.id}`}>
                  <span className="avatar placeholder paper">紙</span>
                  <span className="member-main">
                    <small>{d.furigana}</small>
                    <strong>{d.name || '（名前なし）'}</strong>
                    <span className="meta">{[d.phone, d.note].filter(Boolean).join(' ・ ')}</span>
                  </span>
                  <span className="tags">
                    {d.member ? <span className="tag ok">会員：{d.member.name}</span> : <span className="tag">結び付けなし</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </section>
  )
}

/** PDF を横に表示しながら、名前と電話番号だけを続けて入力していく */
function IndexQueue() {
  const [queue, setQueue] = useState<LegacyDocument[] | null>(null)
  const [total, setTotal] = useState(0)
  const [skipped, setSkipped] = useState<string[]>([])
  const [error, setError] = useState('')

  const load = useCallback(
    () => pendingLegacy().then((p) => (setQueue(p.docs), setTotal(p.total))).catch((e) => setError(e.message)),
    [],
  )
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!queue) return <p className="muted">読み込み中…</p>

  const doc = queue.find((d) => !skipped.includes(d.id))
  if (!doc) {
    return (
      <section>
        <p className="success">
          {total > 0 ? `この回の分は終わりました。「あとで」にした紙が ${total}件残っています。` : '未入力の PDF はありません。'}
        </p>
        <a className="btn" href="#/papers">
          過去の紙に戻る
        </a>
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>
          名前と電話番号の入力 <span className="count">残り {total}件</span>
        </h1>
        <a className="btn" href="#/papers">
          中断する
        </a>
      </div>
      <DocumentEditor
        key={doc.id}
        doc={doc}
        submitLabel="保存して次へ"
        onSaved={load}
        onSkip={() => setSkipped([...skipped, doc.id])}
      />
    </section>
  )
}

function OneDocument({ id }: { id: string }) {
  const [doc, setDoc] = useState<LegacyDocument | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(
    () => getLegacy(id).then((d) => (d ? setDoc(d) : setError('この紙は見つかりませんでした。'))).catch((e) => setError(e.message)),
    [id],
  )
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!doc) return <p className="muted">読み込み中…</p>

  const remove = async () => {
    if (!window.confirm('この PDF を削除します。元に戻せません。よろしいですか？')) return
    try {
      await deleteLegacy(doc)
      go('/papers')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>{doc.name || '過去の紙'}</h1>
        <div className="actions">
          <button type="button" className="btn ghost danger" onClick={remove}>
            削除
          </button>
          <a className="btn" href="#/papers">
            戻る
          </a>
        </div>
      </div>
      <DocumentEditor doc={doc} submitLabel="保存する" onSaved={load} showLink />
    </section>
  )
}

function DocumentEditor({ doc, submitLabel, onSaved, onSkip, showLink }: {
  doc: LegacyDocument
  submitLabel: string
  onSaved: () => Promise<unknown>
  onSkip?: () => void
  showLink?: boolean
}) {
  const [url, setUrl] = useState('')
  const [v, setV] = useState({ name: doc.name, furigana: doc.furigana, phone: doc.phone, note: doc.note })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState<Member[]>([])
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let made = ''
    let live = true
    legacyBlobUrl(doc.storage_path)
      .then((u) => {
        made = u
        if (live) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch((e) => live && setError(`PDF を開けませんでした：${e.message}`))
    nameRef.current?.focus()
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [doc.storage_path])

  useEffect(() => {
    if (!showLink || doc.member_id) return setCandidates([])
    memberCandidates(doc.name, doc.phone).then(setCandidates).catch(() => {})
  }, [showLink, doc.member_id, doc.name, doc.phone])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!v.name.trim() && !v.phone.trim()) return setError('名前か電話番号のどちらかを入力してください。')
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await updateLegacy(doc.id, {
        name: v.name.trim(), furigana: v.furigana.trim(), phone: v.phone.trim(), note: v.note.trim(),
        indexed_at: doc.indexed_at ?? new Date().toISOString(),
      })
      await onSaved()
      setMsg('保存しました。')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const link = async (memberId: string | null) => {
    setError('')
    try {
      await updateLegacy(doc.id, { member_id: memberId })
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const field = (key: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span className="label">{label}</span>
      <input value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} autoComplete="off" {...props} />
    </label>
  )

  return (
    <div className="paper-layout">
      <div className="paper-view">
        {url ? <iframe src={url} title="スキャンした PDF" /> : <p className="muted">PDF を読み込み中…</p>}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="hint">
            PDF を別のタブで開く
          </a>
        )}
      </div>
      <div className="paper-side">
        <form onSubmit={save} className="card">
          {msg && <p className="success">{msg}</p>}
          {error && <p className="error">{error}</p>}
          <label className="field">
            <span className="label">名前</span>
            <input ref={nameRef} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="off" />
          </label>
          {field('furigana', 'フリガナ（任意）')}
          {field('phone', '電話番号', { type: 'tel', inputMode: 'tel' })}
          {field('note', 'メモ（任意）')}
          <div className="actions mt">
            {onSkip && (
              <button type="button" className="btn" onClick={onSkip}>
                あとで
              </button>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? '保存中…' : submitLabel}
            </button>
          </div>
          <p className="hint">
            {doc.file_name} ・ {formatDate(doc.uploaded_at)} 取り込み
          </p>
        </form>

        {showLink && (
          <div className="card">
            <strong>会員との結び付け</strong>
            {doc.member ? (
              <p>
                <a href={`#/m/${doc.member.id}`}>{doc.member.name}</a> に結び付いています。
                <button type="button" className="btn small ghost" onClick={() => link(null)}>
                  外す
                </button>
              </p>
            ) : candidates.length === 0 ? (
              <p className="hint">同じ電話番号・名前の会員は見つかりません。会員の画面からも結び付けられます。</p>
            ) : (
              <ul className="login-list">
                {candidates.map((m) => (
                  <li key={m.id}>
                    <span>
                      <strong>{m.name}</strong> <small className="muted">{m.phone}</small>
                    </span>
                    <span className="spacer" />
                    <button type="button" className="btn small" onClick={() => link(m.id)}>
                      結び付ける
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
