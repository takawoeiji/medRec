import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  addComment, consentsOf, currentDocs, getMember, getPhoto, listMembers, loginsOf, registerMember,
  sessionsOf, setPhoto, signConsents, submitKarte, updateContact,
} from '../api'
import ConsentStep from '../components/ConsentStep'
import KarteForm, { karteFrom } from '../components/KarteForm'
import SessionList from '../components/SessionList'
import {
  ageOf, formatDate, pendingDocs, showPhone,
  type Consent, type ConsentDocument, type Member, type MemberLogin, type Session,
} from '../types'

const go = (path: string) => {
  window.location.hash = path
}

export default function CustomerApp({ route }: { route: string[] }) {
  if (route[0] === 'register') return <Register />
  if (route[0] === 'm' && route[1]) return <MemberGate key={route[1]} id={route[1]} />
  return <Home />
}

/** ログイン直後：結び付いた会員が0人なら新規登録、1人ならその人、複数なら選択 */
function Home() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listMembers()
      .then((ms) => {
        if (ms.length === 1) go(`/m/${ms[0].id}`)
        else setMembers(ms)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!members) return <p className="muted">読み込み中…</p>
  if (members.length === 0) return <Register first />

  return (
    <section>
      <div className="page-head">
        <h1>どなたの記録を開きますか</h1>
      </div>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id}>
            <a href={`#/m/${m.id}`}>
              <span className="avatar placeholder">{(m.name || '？').slice(0, 1)}</span>
              <span className="member-main">
                <small>{m.furigana}</small>
                <strong>{m.name || '（カルテ未入力）'}</strong>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt">
        <a className="btn" href="#/register">
          別の方を新しく登録する
        </a>
      </p>
    </section>
  )
}

/** 新規登録：まず同意。同意が記録されてから、カルテの入力に進む */
function Register({ first = false }: { first?: boolean }) {
  const [docs, setDocs] = useState<ConsentDocument[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    currentDocs().then(setDocs).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!docs) return <p className="muted">読み込み中…</p>

  return (
    <ConsentStep
      docs={docs}
      heading="入会の同意"
      lead="はじめに、次の文面をお読みください。同意と署名のあと、カルテの入力に進みます。"
      onCancel={first ? undefined : () => go('/')}
      onSign={async (s) => {
        const id = await registerMember(s)
        go(`/m/${id}`)
      }}
    />
  )
}

interface Loaded {
  member: Member
  photo: string
  docs: ConsentDocument[]
  consents: Consent[]
  login: MemberLogin | undefined
}

/** 会員ごとの入口：未同意なら同意、カルテ未入力ならカルテ、済んでいればマイページ */
function MemberGate({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const member = await getMember(id)
      if (!member) return setError('この記録は開けません。')
      const [photo, docs, consents, logins] = await Promise.all([
        getPhoto(id), currentDocs(), consentsOf(id), loginsOf(id),
      ])
      setData({ member, photo, docs, consents, login: logins[0] })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">読み込み中…</p>

  const { member, photo, docs, consents, login } = data
  const pending = pendingDocs(docs, consents)

  if (pending.length > 0) {
    return (
      <ConsentStep
        docs={pending}
        memberName={member.name}
        proxy={login?.relation === '代理人' ? { name: login.proxy_name, relation: login.proxy_relation } : undefined}
        heading={consents.length ? '文面が改訂されました' : '入会の同意'}
        lead={
          consents.length
            ? '続けてご利用いただくには、改訂された文面への同意が必要です。'
            : 'はじめに、次の文面をお読みください。同意と署名のあと、カルテの入力に進みます。'
        }
        onSign={async (s) => {
          await signConsents(id, s)
          await load()
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  if (!member.karte_completed_at) {
    const initial = karteFrom(member, photo)
    if (!initial.name) initial.name = consents[0]?.signer_name ?? ''
    return (
      <KarteForm
        mode="customer"
        initial={initial}
        heading="カルテの入力"
        lead="同意を記録しました。続けて、カルテをご記入ください。"
        submitLabel="カルテを登録する"
        onSubmit={async (v) => {
          const { photo: p, member_class: _c, is_vip: _v, is_fasting: _f, phone: _p, registered_on: _r, ...karte } = v
          await submitKarte(id, karte)
          if (p !== photo) await setPhoto(id, p)
          await load()
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  return <MyPage data={data} reload={load} />
}

function MyPage({ data, reload }: { data: Loaded; reload: () => Promise<void> }) {
  const { member, photo, consents } = data
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState('')
  const age = ageOf(member.birth_date)

  const loadSessions = useCallback(
    () => sessionsOf(member.id).then(setSessions).catch((e) => setError(e.message)),
    [member.id],
  )
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  return (
    <section>
      <div className="profile">
        {photo ? <img className="avatar large" src={photo} alt="" /> : <span className="avatar large placeholder">{member.name.slice(0, 1)}</span>}
        <div>
          <small className="muted">{member.furigana}</small>
          <h1>{member.name} 様</h1>
          <div className="tag-row">
            {member.member_class && <span className="tag">{member.member_class}会員</span>}
            {member.is_vip && <span className="tag vip">VIP</span>}
            {member.is_fasting && <span className="tag fast">断食</span>}
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <fieldset>
        <legend>療法の記録と感想</legend>
        {sessions ? (
          <SessionList
            sessions={sessions}
            role="customer"
            onAddComment={async (sid, body) => {
              await addComment(sid, body)
              await loadSessions()
            }}
          />
        ) : (
          <p className="muted">読み込み中…</p>
        )}
      </fieldset>

      <ContactForm member={member} onSaved={reload} />

      <fieldset>
        <legend>登録内容</legend>
        <dl className="facts">
          <dt>生年月日</dt>
          <dd>
            {formatDate(member.birth_date)}
            {age !== null && `（満${age}歳）`}
          </dd>
          <dt>電話</dt>
          <dd>{showPhone(member.phone.replace(/\D/g, ''))}</dd>
          <dt>登録日</dt>
          <dd>{formatDate(member.registered_on)}</dd>
          <dt>入会同意</dt>
          <dd>
            {consents.map((c) => (
              <div key={c.id}>
                {c.document?.title} 第{c.document?.version}版 ・ {formatDate(c.signed_at)}
              </div>
            ))}
          </dd>
        </dl>
        <p className="hint">氏名・生年月日・電話番号の変更は、スタッフにお申し出ください。</p>
      </fieldset>
    </section>
  )
}

function ContactForm({ member, onSaved }: { member: Member; onSaved: () => Promise<void> }) {
  const [v, setV] = useState({
    postal_code: member.postal_code, address: member.address, email: member.email,
    mobile_email: member.mobile_email, occupation: member.occupation,
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== member[k])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await updateContact(member.id, v)
      await onSaved()
      setMsg('連絡先を更新しました。')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const field = (key: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, span = false) => (
    <label className={span ? 'field span2' : 'field'}>
      <span className="label">{label}</span>
      <input value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} {...props} />
    </label>
  )

  return (
    <form onSubmit={save}>
      <fieldset>
        <legend>連絡先の変更</legend>
        {msg && <p className="success">{msg}</p>}
        {error && <p className="error">{error}</p>}
        <div className="grid">
          {field('postal_code', '郵便番号', { inputMode: 'numeric' })}
          {field('occupation', '職業')}
          {field('address', '住所', {}, true)}
          {field('email', 'E-mail', { type: 'email' })}
          {field('mobile_email', '携帯メール', { type: 'email' })}
        </div>
        <div className="actions mt">
          <button className="btn primary" disabled={busy || !dirty}>
            {busy ? '保存中…' : '連絡先を保存'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
