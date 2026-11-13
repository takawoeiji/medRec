import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  addComment, addLogin, auditOf, changeLoginPhone, consentsOf, coursesOf, createSession, currentDocs,
  getMember, getPhoto, legacyCandidates, legacyOfMember, loginsOf, removeLogin, sessionsOf,
  signConsents, updateLegacy, updateSession,
  type SessionInput,
} from '../api'
import ConsentStep from '../components/ConsentStep'
import Fasting from '../components/Fasting'
import SessionList from '../components/SessionList'
import {
  MODES, ageOf, formatDate, formatDateTime, pendingDocs, showPhone, toE164, today,
  type AuditEntry, type Consent, type ConsentDocument, type FastingCourse, type LegacyDocument,
  type Member, type MemberLogin, type Session,
} from '../types'

interface Loaded {
  member: Member
  photo: string
  docs: ConsentDocument[]
  consents: Consent[]
  logins: MemberLogin[]
  sessions: Session[]
  courses: FastingCourse[]
  papers: LegacyDocument[]
  paperCandidates: LegacyDocument[]
}

export default function StaffMemberDetail({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [signing, setSigning] = useState(false)

  const load = useCallback(async () => {
    try {
      const member = await getMember(id)
      if (!member) return setError('この会員は見つかりませんでした。')
      const [photo, docs, consents, logins, sessions, courses, papers, paperCandidates] = await Promise.all([
        getPhoto(id), currentDocs(), consentsOf(id), loginsOf(id), sessionsOf(id), coursesOf(id),
        legacyOfMember(id), legacyCandidates(member.name, member.phone),
      ])
      setData({ member, photo, docs, consents, logins, sessions, courses, papers, paperCandidates })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">読み込み中…</p>

  const { member: m, photo, docs, consents, logins, sessions, courses, papers, paperCandidates } = data
  const pending = pendingDocs(docs, consents)
  const age = ageOf(m.birth_date)

  if (signing) {
    const proxy = logins.find((l) => l.relation === '代理人')
    return (
      <ConsentStep
        docs={pending}
        memberName={m.name}
        proxy={proxy ? { name: proxy.proxy_name, relation: proxy.proxy_relation } : undefined}
        heading="入会の同意（この端末で署名）"
        lead="この画面を会員ご本人（または代理人）に見せて、文面を読んだうえで署名してもらってください。"
        onCancel={() => setSigning(false)}
        onSign={async (s) => {
          await signConsents(id, s)
          await load()
          setSigning(false)
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  return (
    <section>
      <div className="profile">
        {photo ? <img className="avatar large" src={photo} alt="" /> : <span className="avatar large placeholder">{(m.name || '？').slice(0, 1)}</span>}
        <div className="grow">
          <small className="muted">{m.furigana}</small>
          <h1>{m.name || '（カルテ未入力）'}</h1>
          <div className="tag-row">
            {m.member_class && <span className="tag">{m.member_class}会員</span>}
            {m.is_vip && <span className="tag vip">VIP</span>}
            {m.is_fasting && <span className="tag fast">断食</span>}
            {!m.karte_completed_at && <span className="tag warn">カルテ未入力</span>}
            <span className={pending.length ? 'tag warn' : 'tag ok'}>{pending.length ? '同意未' : '同意済'}</span>
          </div>
        </div>
        <div className="actions">
          <a className="btn" href={`#/m/${id}/print`}>
            登録表・印刷
          </a>
          <a className="btn primary" href={`#/m/${id}/edit`}>
            編集
          </a>
        </div>
      </div>

      <fieldset>
        <legend>療法の記録</legend>
        <SessionEditor
          key={`new-${sessions.length}`}
          initial={{ session_date: today(), mode: '来所', is_vip: m.is_vip, is_fasting: m.is_fasting, note: '' }}
          submitLabel="記録を追加"
          onSave={async (input) => {
            await createSession(id, input)
            await load()
          }}
        />
        <Sessions sessions={sessions} memberId={id} reload={load} />
      </fieldset>

      <Fasting memberId={id} role="staff" courses={courses} reload={load} />

      <fieldset>
        <legend>カルテ</legend>
        <dl className="facts">
          <dt>生年月日</dt>
          <dd>
            {formatDate(m.birth_date)} {age !== null && `（満${age}歳）`} {m.sex} {m.blood_type && `${m.blood_type}型`}
          </dd>
          <dt>住所</dt>
          <dd>
            {m.postal_code && `〒${m.postal_code} `}
            {m.address}
          </dd>
          <dt>電話</dt>
          <dd>{m.phone}</dd>
          <dt>メール</dt>
          <dd>{[m.email, m.mobile_email].filter(Boolean).join(' / ')}</dd>
          <dt>職業・紹介者</dt>
          <dd>{[m.occupation, m.referrer && `紹介：${m.referrer}`].filter(Boolean).join(' ・ ')}</dd>
          <dt>身長・血圧</dt>
          <dd>{[m.height_cm && `${m.height_cm} cm`, m.blood_pressure].filter(Boolean).join(' ・ ')}</dd>
          <dt>該当項目</dt>
          <dd>{m.symptoms.join('、')}</dd>
          <dt>症状</dt>
          <dd className="pre">{m.symptom_detail}</dd>
          <dt>登録日</dt>
          <dd>{formatDate(m.registered_on)}</dd>
        </dl>
      </fieldset>

      <fieldset>
        <legend>入会同意</legend>
        {pending.length > 0 && (
          <div className="callout">
            <p>
              未同意：{pending.map((d) => `${d.title}（第${d.version}版）`).join('、')}
              <br />
              <span className="hint">ご本人がログインすると同意の画面が出ます。この端末で署名してもらうこともできます。</span>
            </p>
            <button type="button" className="btn primary" onClick={() => setSigning(true)}>
              この端末で署名してもらう
            </button>
          </div>
        )}
        {consents.length === 0 ? (
          <p className="muted">同意の記録はありません。</p>
        ) : (
          <ul className="consent-records">
            {consents.map((c) => (
              <li key={c.id}>
                <img src={c.signature} alt="署名" />
                <div>
                  <strong>
                    {c.document?.title} 第{c.document?.version}版
                  </strong>
                  <div>{formatDateTime(c.signed_at)}</div>
                  <div className="hint">
                    {c.signer_type === '代理人' ? `代理人 ${c.proxy_name}（${c.proxy_relation || '続柄未記入'}）／本人 ${c.signer_name}` : `本人 ${c.signer_name}`}
                    {' ・ '}
                    {c.via === 'staff_device' ? 'スタッフの端末で署名' : `本人のログイン（${showPhone(c.phone ?? '')}）`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {(papers.length > 0 || paperCandidates.length > 0) && (
        <fieldset>
          <legend>過去の紙</legend>
          <ul className="login-list">
            {papers.map((d) => (
              <li key={d.id}>
                <a href={`#/papers/d/${d.id}`}>{d.name || d.file_name}</a>
                <span className="hint">{formatDate(d.uploaded_at)} 取り込み</span>
              </li>
            ))}
            {paperCandidates.map((d) => (
              <li key={d.id}>
                <span className="tag warn">候補</span>
                <a href={`#/papers/d/${d.id}`}>{d.name || d.file_name}</a>
                <span className="hint">{d.phone}</span>
                <span className="spacer" />
                <button
                  type="button"
                  className="btn small"
                  onClick={() => updateLegacy(d.id, { member_id: id }).then(load).catch((e) => setError(e.message))}
                >
                  この会員に結び付ける
                </button>
              </li>
            ))}
          </ul>
          {paperCandidates.length > 0 && (
            <p className="hint">候補は、名前か電話番号が同じ紙です。同姓同名の別人のことがあるので、PDF を開いて確かめてから結び付けてください。</p>
          )}
        </fieldset>
      )}

      <Logins memberId={id} logins={logins} reload={load} />
      <History memberId={id} stamp={m.updated_at + sessions.length + logins.length + JSON.stringify(courses).length} />
    </section>
  )
}

function SessionEditor({ initial, submitLabel, onSave, onCancel }: {
  initial: SessionInput
  submitLabel: string
  onSave: (v: SessionInput) => Promise<void>
  onCancel?: () => void
}) {
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!v.session_date) return setError('療法日を入力してください。')
    setBusy(true)
    setError('')
    try {
      await onSave(v)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="session-editor">
      {error && <p className="error">{error}</p>}
      <div className="session-editor-row">
        <label className="field">
          <span className="label">療法日</span>
          <input type="date" value={v.session_date} onChange={(e) => setV({ ...v, session_date: e.target.value })} />
        </label>
        <div className="choices">
          {MODES.map((mode) => (
            <label key={mode} className="choice">
              <input type="radio" name="mode" checked={v.mode === mode} onChange={() => setV({ ...v, mode })} />
              {mode}
            </label>
          ))}
          <label className="choice">
            <input type="checkbox" checked={v.is_vip} onChange={(e) => setV({ ...v, is_vip: e.target.checked })} />
            VIP
          </label>
          <label className="choice">
            <input type="checkbox" checked={v.is_fasting} onChange={(e) => setV({ ...v, is_fasting: e.target.checked })} />
            断食
          </label>
        </div>
      </div>
      <label className="field">
        <span className="label">スタッフのメモ（顧客には表示されません）</span>
        <textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      <div className="actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

function Sessions({ sessions, memberId, reload }: { sessions: Session[]; memberId: string; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const target = sessions.find((s) => s.id === editing)

  if (target) {
    return (
      <div className="callout column">
        <strong>{formatDate(target.session_date)} の記録を修正</strong>
        <SessionEditor
          initial={{
            session_date: target.session_date, mode: target.mode, is_vip: target.is_vip,
            is_fasting: target.is_fasting, note: target.note?.note ?? '',
          }}
          submitLabel="修正を保存"
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await updateSession(target.id, memberId, input, Boolean(target.note))
            await reload()
            setEditing(null)
          }}
        />
      </div>
    )
  }

  return (
    <SessionList
      sessions={sessions}
      role="staff"
      onAddComment={async (sid, body) => {
        await addComment(sid, body)
        await reload()
      }}
      renderActions={(s) => (
        <button type="button" className="btn small ghost" onClick={() => setEditing(s.id)}>
          修正
        </button>
      )}
    />
  )
}

function Logins({ memberId, logins, reload }: { memberId: string; logins: MemberLogin[]; reload: () => Promise<void> }) {
  const [phone, setPhone] = useState('')
  const [relation, setRelation] = useState<'本人' | '代理人'>('本人')
  const [proxyName, setProxyName] = useState('')
  const [proxyRelation, setProxyRelation] = useState('')
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setError('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    const e164 = toE164(phone)
    if (!e164) return setError('携帯電話番号を正しく入力してください。')
    if (relation === '代理人' && !proxyName.trim()) return setError('代理人の氏名を入力してください。')
    run(async () => {
      await addLogin({
        member_id: memberId, phone: e164.slice(1), relation,
        proxy_name: relation === '代理人' ? proxyName.trim() : '',
        proxy_relation: relation === '代理人' ? proxyRelation.trim() : '',
      })
      setPhone('')
      setProxyName('')
      setProxyRelation('')
    })
  }

  const change = (l: MemberLogin) => {
    const input = window.prompt('新しい携帯電話番号を入力してください。', showPhone(l.phone))
    if (input === null) return
    const e164 = toE164(input)
    if (!e164) return setError('携帯電話番号を正しく入力してください。')
    run(() => changeLoginPhone(l.id, e164.slice(1)))
  }

  const remove = (l: MemberLogin) => {
    if (!window.confirm(`${showPhone(l.phone)} からは、この会員の記録を見られなくなります。よろしいですか？`)) return
    run(() => removeLogin(l.id))
  }

  return (
    <fieldset>
      <legend>ログインできる電話番号</legend>
      <p className="hint">ここにある番号で SMS 認証した人だけが、この会員の記録を見られます。番号が変わったときは「番号を変更」で付け替えてください。</p>
      {error && <p className="error">{error}</p>}
      {logins.length === 0 ? (
        <p className="muted">登録なし（ご本人はログインできません）</p>
      ) : (
        <ul className="login-list">
          {logins.map((l) => (
            <li key={l.id}>
              <strong>{showPhone(l.phone)}</strong>
              <span>{l.relation === '代理人' ? `代理人 ${l.proxy_name}（${l.proxy_relation || '続柄未記入'}）` : '本人'}</span>
              <span className="spacer" />
              <button type="button" className="btn small" onClick={() => change(l)}>
                番号を変更
              </button>
              <button type="button" className="btn small ghost danger" onClick={() => remove(l)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="login-add">
        <label className="field">
          <span className="label">番号を追加</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090-1234-5678" />
        </label>
        <label className="field">
          <span className="label">区分</span>
          <select value={relation} onChange={(e) => setRelation(e.target.value as '本人' | '代理人')}>
            <option>本人</option>
            <option>代理人</option>
          </select>
        </label>
        {relation === '代理人' && (
          <>
            <label className="field">
              <span className="label">代理人の氏名</span>
              <input value={proxyName} onChange={(e) => setProxyName(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">続柄</span>
              <input value={proxyRelation} onChange={(e) => setProxyRelation(e.target.value)} />
            </label>
          </>
        )}
        <button className="btn" disabled={!phone.trim()}>
          追加
        </button>
      </form>
    </fieldset>
  )
}

const TABLE_LABEL: Record<string, string> = {
  members: 'カルテ', sessions: '療法記録', fasting_courses: '断食コース', fasting_logs: '断食の記録', session_staff_notes: 'スタッフのメモ', member_logins: 'ログイン電話番号',
}
const ACTION_LABEL = { INSERT: '追加', UPDATE: '変更', DELETE: '削除' }
const FIELD_LABEL: Record<string, string> = {
  member_class: '会員区分', is_vip: 'VIP', is_fasting: '断食', furigana: 'フリガナ', name: '氏名',
  postal_code: '郵便番号', address: '住所', phone: '電話', email: 'E-mail', mobile_email: '携帯メール',
  occupation: '職業', referrer: '紹介者', registered_on: '登録日', birth_date: '生年月日', sex: '性別',
  blood_type: '血液型', height_cm: '身長', blood_pressure: '血圧', symptoms: '該当項目',
  symptom_detail: '症状', karte_completed_at: 'カルテ登録', session_date: '療法日', mode: '来所/遠隔',
  note: 'メモ', start_date: '開始日', planned_days: '予定日数', end_date: '終了日', medication: '服用中の薬',
  medication_declared_at: '服薬の申告', log_date: '日付', weight_kg: '体重', progress: '経過',
  entered_by: '入力者', relation: '区分', proxy_name: '代理人', proxy_relation: '続柄',
}
const HIDDEN = new Set(['id', 'member_id', 'session_id', 'course_id', 'created_at', 'updated_at', 'created_by', 'phone_digits'])

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '（空）'
  if (v === true) return 'あり'
  if (v === false) return 'なし'
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return formatDateTime(v)
  return Array.isArray(v) ? v.join('、') || '（空）' : String(v)
}

function describe(e: AuditEntry): string[] {
  const row = e.new_data ?? e.old_data ?? {}
  const keys = Object.keys(row).filter((k) => !HIDDEN.has(k))
  if (e.action === 'UPDATE' && e.old_data && e.new_data) {
    return keys
      .filter((k) => JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]))
      .map((k) => `${FIELD_LABEL[k] ?? k}：${show(e.old_data![k])} → ${show(e.new_data![k])}`)
  }
  if (e.table_name === 'members') return []
  return keys.filter((k) => row[k] !== '' && row[k] !== false && row[k] !== null).map((k) => `${FIELD_LABEL[k] ?? k}：${show(row[k])}`)
}

function History({ memberId, stamp }: { memberId: string; stamp: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    auditOf(memberId).then(setRows).catch((e) => setError(e.message))
  }, [open, memberId, stamp])

  return (
    <fieldset>
      <legend>変更履歴</legend>
      {!open ? (
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          履歴を表示
        </button>
      ) : error ? (
        <p className="error">{error}</p>
      ) : !rows ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <ul className="history">
          {rows.map((e) => (
            <li key={e.id}>
              <span className="comment-meta">
                {formatDateTime(e.changed_at)} ・ {e.by_staff ? 'スタッフ' : '顧客'} ・ {TABLE_LABEL[e.table_name] ?? e.table_name}を
                {ACTION_LABEL[e.action]}
              </span>
              {describe(e).map((line) => (
                <div key={line} className="pre">
                  {line}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
