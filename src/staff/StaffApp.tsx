import { useEffect, useMemo, useState } from 'react'
import {
  addLogin, createMember, getMember, getPhoto, listMembers, setPhoto, updateMember,
  currentDocs, type MemberRow,
} from '../api'
import KarteForm, { emptyKarte, karteFrom, type KarteValues } from '../components/KarteForm'
import MemberSheet from '../components/MemberSheet'
import { MEMBER_CLASSES, ageOf, formatDate, pendingDocs, toE164, type ConsentDocument } from '../types'
import StaffMemberDetail from './StaffMemberDetail'
import StaffSettings from './StaffSettings'

const go = (path: string) => {
  window.location.hash = path
}

export default function StaffApp({ route }: { route: string[] }) {
  if (route[0] === 'new') return <MemberEdit />
  if (route[0] === 'settings') return <StaffSettings />
  if (route[0] === 'm' && route[1]) {
    if (route[2] === 'edit') return <MemberEdit key={route[1]} id={route[1]} />
    if (route[2] === 'print') return <MemberSheet key={route[1]} id={route[1]} />
    return <StaffMemberDetail key={route[1]} id={route[1]} />
  }
  return <Members />
}

function Members() {
  const [q, setQ] = useState('')
  const [vip, setVip] = useState(false)
  const [fasting, setFasting] = useState(false)
  const [cls, setCls] = useState('')
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  const [docs, setDocs] = useState<ConsentDocument[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    currentDocs().then(setDocs).catch(() => {})
  }, [])

  // 入力が止まってから検索する
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      listMembers({ q, vip, fasting, cls })
        .then((r) => live && (setRows(r), setError('')))
        .catch((e) => live && setError(e.message))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, vip, fasting, cls])

  const filtered = Boolean(q || vip || fasting || cls)
  const list = useMemo(() => rows ?? [], [rows])

  return (
    <section>
      <div className="page-head">
        <h1>
          会員一覧 {rows && <span className="count">{list.length}名{list.length >= 300 && '（上限）'}</span>}
        </h1>
        <a className="btn primary" href="#/new">
          ＋ 会員を追加
        </a>
      </div>
      <div className="filters">
        <input
          type="search"
          placeholder="氏名・フリガナ・電話番号で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="会員を検索"
        />
        <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="会員区分">
          <option value="">すべての区分</option>
          {MEMBER_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}会員
            </option>
          ))}
        </select>
        <label className={vip ? 'chip on' : 'chip'}>
          <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} />
          VIP
        </label>
        <label className={fasting ? 'chip on' : 'chip'}>
          <input type="checkbox" checked={fasting} onChange={(e) => setFasting(e.target.checked)} />
          断食
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {!rows ? (
        <p className="muted">読み込み中…</p>
      ) : list.length === 0 ? (
        <p className="muted">{filtered ? '条件に合う会員はいません。' : 'まだ会員が登録されていません。'}</p>
      ) : (
        <ul className="member-list">
          {list.map((m) => {
            const age = ageOf(m.birth_date)
            const consented = docs.length > 0 && pendingDocs(docs, m.consents).length === 0
            return (
              <li key={m.id}>
                <a href={`#/m/${m.id}`}>
                  <span className="avatar placeholder">{(m.name || '？').slice(0, 1)}</span>
                  <span className="member-main">
                    <small>{m.furigana}</small>
                    <strong>{m.name || '（カルテ未入力）'}</strong>
                    <span className="meta">
                      {[m.sex, age !== null ? `${age}歳` : '', m.phone, `登録 ${formatDate(m.registered_on)}`]
                        .filter(Boolean)
                        .join(' ・ ')}
                    </span>
                  </span>
                  <span className="tags">
                    <span className="tag-row">
                      {m.member_class && <span className="tag">{m.member_class}</span>}
                      {m.is_vip && <span className="tag vip">VIP</span>}
                      {m.is_fasting && <span className="tag fast">断食</span>}
                    </span>
                    <span className="tag-row">
                      {!m.karte_completed_at && <span className="tag warn">カルテ未</span>}
                      <span className={consented ? 'tag ok' : 'tag warn'}>{consented ? '同意済' : '同意未'}</span>
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** スタッフによる会員の追加・編集（携帯を持たない方の代理入力もここ） */
function MemberEdit({ id }: { id?: string }) {
  const [initial, setInitial] = useState<{ v: KarteValues; incomplete: boolean } | null>(
    id ? null : { v: emptyKarte(), incomplete: false },
  )
  const [error, setError] = useState('')
  const [allowLogin, setAllowLogin] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([getMember(id), getPhoto(id)])
      .then(([m, photo]) =>
        m ? setInitial({ v: karteFrom(m, photo), incomplete: !m.karte_completed_at }) : setError('この会員は見つかりませんでした。'),
      )
      .catch((e) => setError(e.message))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!initial) return <p className="muted">読み込み中…</p>

  const save = async ({ photo, ...fields }: KarteValues) => {
    const input = { ...fields, name: fields.name.trim() }
    if (id) {
      await updateMember(id, input, initial.incomplete)
      if (photo !== initial.v.photo) await setPhoto(id, photo)
      go(`/m/${id}`)
      return
    }
    const newId = await createMember(input)
    if (photo) await setPhoto(newId, photo)
    const e164 = toE164(input.phone)
    if (allowLogin && e164) {
      await addLogin({ member_id: newId, phone: e164.slice(1), relation: '本人', proxy_name: '', proxy_relation: '' })
    }
    go(`/m/${newId}`)
  }

  return (
    <KarteForm
      mode="staff"
      initial={initial.v}
      heading={id ? '会員情報の編集' : '会員の追加'}
      lead={id ? '変更した内容は履歴に残ります。' : '追加したあと、会員の画面で入会同意の署名をもらってください。'}
      submitLabel="保存する"
      cancelHref={id ? `#/m/${id}` : '#/'}
      onSubmit={save}
      extra={
        !id && (
          <fieldset>
            <legend>ご本人のログイン</legend>
            <label className="choice">
              <input type="checkbox" checked={allowLogin} onChange={(e) => setAllowLogin(e.target.checked)} />
              上の電話番号で、ご本人がログインできるようにする
            </label>
            <p className="hint">携帯電話をお持ちでない方は、チェックを外してください。あとから会員の画面で追加・変更できます。</p>
          </fieldset>
        )
      }
    />
  )
}
