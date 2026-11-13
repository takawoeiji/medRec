import { useEffect, useMemo, useState } from 'react'
import { listMembers } from '../db'
import { MEMBER_TYPES, ageOf, formatDate, type Member } from '../types'

export default function MemberList() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')

  useEffect(() => {
    listMembers()
      .then(setMembers)
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (members ?? [])
      .filter((m) => !type || m.memberType === type)
      .filter(
        (m) =>
          !needle ||
          [m.name, m.furigana, m.phone, m.address, m.email, m.mobileEmail, m.referrer]
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja'))
  }, [members, q, type])

  if (error) return <p className="error">データを読み込めませんでした：{error}</p>
  if (!members) return <p className="muted">読み込み中…</p>

  return (
    <section>
      <div className="page-head">
        <h1>
          会員一覧 <span className="count">{members.length}名</span>
        </h1>
        <a className="btn primary" href="#/new">
          ＋ 新規登録
        </a>
      </div>

      {members.length === 0 ? (
        <div className="empty">
          <p>まだ会員が登録されていません。</p>
          <a className="btn primary" href="#/new">
            最初の会員を登録する
          </a>
        </div>
      ) : (
        <>
          <div className="filters">
            <input
              type="search"
              placeholder="氏名・フリガナ・電話・住所で検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="会員を検索"
            />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="会員種別">
              <option value="">すべての種別</option>
              {MEMBER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}会員
                </option>
              ))}
            </select>
          </div>

          {shown.length === 0 ? (
            <p className="muted">条件に合う会員はいません。</p>
          ) : (
            <ul className="member-list">
              {shown.map((m) => {
                const age = ageOf(m.birthDate)
                return (
                  <li key={m.id}>
                    <a href={`#/m/${m.id}`}>
                      {m.photo ? (
                        <img className="avatar" src={m.photo} alt="" />
                      ) : (
                        <span className="avatar placeholder">{(m.name || '?').slice(0, 1)}</span>
                      )}
                      <span className="member-main">
                        <small>{m.furigana}</small>
                        <strong>{m.name || '（氏名未入力）'}</strong>
                        <span className="meta">
                          {[
                            m.sex,
                            age !== null ? `${age}歳` : '',
                            m.phone,
                            m.registeredOn ? `登録 ${formatDate(m.registeredOn)}` : '',
                          ]
                            .filter(Boolean)
                            .join(' ・ ')}
                        </span>
                      </span>
                      <span className="tags">
                        {m.memberType && <span className="tag">{m.memberType}会員</span>}
                        <span className={m.consent.agreed ? 'tag ok' : 'tag warn'}>
                          {m.consent.agreed ? '同意済' : '同意未'}
                        </span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
