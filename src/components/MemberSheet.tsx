import { useEffect, useState } from 'react'
import { consentsOf, coursesOf, getMember, getPhoto, sessionsOf } from '../api'
import {
  BLOOD_TYPES, FORM_TITLE, MEMBER_CLASSES, ORG_NAME, SEXES, SYMPTOM_ROWS, ageOf, formatDate,
  type Consent, type FastingCourse, type Member, type Session,
} from '../types'

const Box = ({ on, children }: { on: boolean; children: string }) => (
  <span className="box">
    <span className="box-mark">{on ? '☑' : '☐'}</span>
    {children}
  </span>
)

/** 紙の登録表・同意書と同じ体裁の表示／印刷画面（スタッフ用） */
export default function MemberSheet({ id }: { id: string }) {
  const [data, setData] = useState<{ m: Member; photo: string; consents: Consent[]; sessions: Session[]; courses: FastingCourse[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getMember(id), getPhoto(id), consentsOf(id), sessionsOf(id), coursesOf(id)])
      .then(([m, photo, consents, sessions, courses]) =>
        m ? setData({ m, photo, consents, sessions, courses }) : setError('この会員は見つかりませんでした。'),
      )
      .catch((e) => setError(e.message))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">読み込み中…</p>

  const { m, photo, consents, sessions, courses } = data
  // 断食前・断食後の体重は、記録のあるいちばん新しいコースの最初と最後
  const course = courses.find((c) => c.logs.length > 0)
  const before = course?.logs[0]
  const after = course && course.logs.length > 1 ? course.logs[course.logs.length - 1] : undefined
  const age = ageOf(m.birth_date)
  // 感想は古い順に並べる
  const impressions = [...sessions]
    .reverse()
    .flatMap((s) => s.comments.filter((c) => c.author_role === 'customer').map((c) => ({ ...c, date: s.session_date })))
  // 同じ署名でまとめて同意したものは1枚にまとめる
  const signings = consents.reduce<Consent[][]>((groups, c) => {
    const g = groups.find((x) => x[0].signature === c.signature && x[0].signed_at === c.signed_at)
    if (g) g.push(c)
    else groups.push([c])
    return groups
  }, [])

  return (
    <section>
      <div className="page-head no-print">
        <h1>{m.name || '（カルテ未入力）'}</h1>
        <div className="actions">
          <a className="btn" href={`#/m/${id}`}>
            戻る
          </a>
          <button type="button" className="btn primary" onClick={() => window.print()}>
            印刷
          </button>
        </div>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <span className="sheet-type">
            {MEMBER_CLASSES.map((t, i) => (
              <span key={t}>
                {i > 0 && '・'}
                <span className={m.member_class === t ? 'circled' : ''}>{t}</span>
              </span>
            ))}
            会員
            {m.is_vip && <span className="mark">VIP</span>}
            {m.is_fasting && <span className="mark">断食</span>}
          </span>
          <h2>{FORM_TITLE}</h2>
        </header>

        <div className="sheet-top">
          <table className="sheet-table">
            <tbody>
              <tr>
                <th>フリガナ</th>
                <td colSpan={3}>{m.furigana}</td>
              </tr>
              <tr>
                <th>氏名</th>
                <td colSpan={3} className="big">
                  {m.name}
                </td>
              </tr>
              <tr>
                <th>住所</th>
                <td colSpan={3}>
                  {m.postal_code && <>〒{m.postal_code}　</>}
                  {m.address}
                </td>
              </tr>
              <tr>
                <th>電話</th>
                <td colSpan={3}>{m.phone}</td>
              </tr>
              <tr>
                <th>E-mail</th>
                <td colSpan={3}>{m.email}</td>
              </tr>
              <tr>
                <th>携帯メール</th>
                <td colSpan={3}>{m.mobile_email}</td>
              </tr>
              <tr>
                <th>職業</th>
                <td>{m.occupation}</td>
                <th>紹介者</th>
                <td>{m.referrer}</td>
              </tr>
            </tbody>
          </table>
          <table className="sheet-table side">
            <tbody>
              <tr>
                <th>登録日</th>
                <td>{formatDate(m.registered_on)}</td>
              </tr>
              <tr>
                <th>生年月日</th>
                <td>
                  {formatDate(m.birth_date)}
                  {age !== null && <>（満{age}歳）</>}
                </td>
              </tr>
              <tr>
                <th>性別</th>
                <td>
                  {SEXES.map((s) => (
                    <Box key={s} on={m.sex === s}>
                      {s}
                    </Box>
                  ))}
                </td>
              </tr>
              <tr>
                <th>血液型</th>
                <td>
                  {BLOOD_TYPES.map((b) => (
                    <Box key={b} on={m.blood_type === b}>
                      {b}
                    </Box>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="sheet-photo">{photo ? <img src={photo} alt="顔写真" /> : '写真'}</div>
        </div>

        <table className="sheet-table fixed">
          <tbody>
            <tr>
              <th>身長</th>
              <td>{m.height_cm && `${m.height_cm} cm`}</td>
              <th>血圧</th>
              <td>{m.blood_pressure}</td>
            </tr>
            <tr>
              <th>断食前 体重</th>
              <td>{before && `${Number(before.weight_kg).toFixed(1)} kg（${formatDate(before.log_date)}）`}</td>
              <th>断食後 体重</th>
              <td>{after && `${Number(after.weight_kg).toFixed(1)} kg（${formatDate(after.log_date)}）`}</td>
            </tr>
          </tbody>
        </table>

        <table className="sheet-table symptoms-table">
          <tbody>
            {SYMPTOM_ROWS.map((row) => (
              <tr key={row[0]}>
                {row.map((s) => (
                  <td key={s} className={m.symptoms.includes(s) ? 'checked' : ''}>
                    <span>{s}</span>
                    <span className="box-mark">{m.symptoms.includes(s) ? '☑' : '☐'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sheet-free">
          <h3>詳しい症状・自覚症状</h3>
          <p>{m.symptom_detail}</p>
        </div>
        <div className="sheet-free">
          <h3>施術後の感想</h3>
          {impressions.map((c) => (
            <p key={c.id}>
              <span className="sheet-date">{formatDate(c.date)}</span> {c.body}
            </p>
          ))}
        </div>
      </article>

      {signings.length === 0 && (
        <article className="sheet consent-sheet">
          <h2 className="center">入会同意書</h2>
          <p className="pending">入会同意はまだ記録されていません。</p>
        </article>
      )}
      {signings.map((group) => {
        const c = group[0]
        return (
          <article key={c.id} className="sheet consent-sheet">
            <h2 className="center">入会同意書</h2>
            <p>{ORG_NAME}殿</p>
            <p className="indent">私は、次の文面を十分に理解し、不明な点についての説明を受ける機会を得たうえで、これに同意します。</p>
            <ul className="consent-docs">
              {group.map((g) => (
                <li key={g.id}>
                  {g.document?.title}（第{g.document?.version}版）
                </li>
              ))}
            </ul>
            <div className="consent-sign">
              <p>{formatDate(c.signed_at)}</p>
              <div className="sign-row">
                <span>氏名{c.signer_type === '本人' && '（自署）'}</span>
                <span className="sign-line">
                  {c.signer_type === '本人' ? <img src={c.signature} alt="自署" /> : c.signer_name}
                </span>
              </div>
              <div className="sign-row">
                <span>代理人氏名</span>
                <span className="sign-line">
                  {c.signer_type === '代理人' && (
                    <>
                      <img src={c.signature} alt="代理人の署名" />
                      {c.proxy_name}
                    </>
                  )}
                </span>
                <span>（本人との続柄</span>
                <span className="sign-line short">{c.proxy_relation}</span>
                <span>）</span>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}
