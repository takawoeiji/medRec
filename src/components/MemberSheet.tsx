import { useEffect, useState } from 'react'
import { go } from '../App'
import { deleteMember, getMember } from '../db'
import {
  BLOOD_TYPES,
  MEMBER_TYPES,
  SEXES,
  SYMPTOM_ROWS,
  ageOf,
  formatDate,
  type Member,
  type Settings,
} from '../types'

interface Props {
  id: string
  settings: Settings
}

const Box = ({ on, children }: { on: boolean; children: string }) => (
  <span className="box">
    <span className="box-mark">{on ? '☑' : '☐'}</span>
    {children}
  </span>
)

/** 紙の登録表・同意書と同じ体裁の表示／印刷画面 */
export default function MemberSheet({ id, settings }: Props) {
  const [m, setM] = useState<Member | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getMember(id)
      .then((found) => (found ? setM(found) : setError('この会員は見つかりませんでした。')))
      .catch((e) => setError(String(e?.message ?? e)))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!m) return <p className="muted">読み込み中…</p>

  const age = ageOf(m.birthDate)

  const remove = async () => {
    if (!window.confirm(`${m.name || 'この会員'} の記録を削除します。元に戻せません。よろしいですか？`)) return
    await deleteMember(m.id)
    go('/')
  }

  return (
    <section>
      <div className="page-head no-print">
        <h1>{m.name || '（氏名未入力）'}</h1>
        <div className="actions">
          <button type="button" className="btn ghost danger" onClick={remove}>
            削除
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            印刷
          </button>
          <a className="btn primary" href={`#/m/${m.id}/edit`}>
            編集
          </a>
        </div>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <span className="sheet-type">
            {MEMBER_TYPES.map((t, i) => (
              <span key={t}>
                {i > 0 && '・'}
                <span className={m.memberType === t ? 'circled' : ''}>{t}</span>
              </span>
            ))}
            会員
          </span>
          <h2>{settings.formTitle}</h2>
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
                  {m.postalCode && <>〒{m.postalCode}　</>}
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
                <td colSpan={3}>{m.mobileEmail}</td>
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
                <td>{formatDate(m.registeredOn)}</td>
              </tr>
              <tr>
                <th>生年月日</th>
                <td>
                  {formatDate(m.birthDate)}
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
                    <Box key={b} on={m.bloodType === b}>
                      {b}
                    </Box>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="sheet-photo">{m.photo ? <img src={m.photo} alt="顔写真" /> : '写真'}</div>
        </div>

        <table className="sheet-table fixed">
          <tbody>
            <tr>
              <th>身長</th>
              <td>{m.heightCm && `${m.heightCm} cm`}</td>
              <th></th>
              <th>体重</th>
              <th>体脂肪率</th>
              <th>体脂肪量</th>
            </tr>
            <tr>
              <th rowSpan={2}>血圧</th>
              <td rowSpan={2}>{m.bloodPressure}</td>
              <th>断食前</th>
              <td>{m.fastingBefore.weight}</td>
              <td>{m.fastingBefore.bodyFatPct}</td>
              <td>{m.fastingBefore.bodyFatMass}</td>
            </tr>
            <tr>
              <th>断食後</th>
              <td>{m.fastingAfter.weight}</td>
              <td>{m.fastingAfter.bodyFatPct}</td>
              <td>{m.fastingAfter.bodyFatMass}</td>
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
          <p>{m.symptomDetail}</p>
        </div>
        <div className="sheet-free">
          <h3>施術後の感想</h3>
          <p>{m.impressions}</p>
        </div>
      </article>

      <article className="sheet consent-sheet">
        <h2 className="center">入会同意書</h2>
        <p>{settings.orgName}殿</p>
        <p className="indent">
          私は、このたび{settings.orgName}
          に入会するにあたり、入会注意事項を十分に理解し、不明な点についての説明を受ける機会を得ました。
        </p>
        <p className="indent">また、体質によって効果は異なり、個人差がある事を了承しました。</p>
        <p className="indent">私は本日、当研究所へ入会することに同意します。</p>

        {m.consent.agreed ? (
          <div className="consent-sign">
            <p>{formatDate(m.consent.date) || '　　年　　月　　日'}</p>
            <div className="sign-row">
              <span>氏名（自署）</span>
              <span className="sign-line">
                {m.consent.signature ? (
                  <img src={m.consent.signature} alt="自署" />
                ) : (
                  m.consent.signerName || m.name
                )}
              </span>
            </div>
            <div className="sign-row">
              <span>代理人氏名</span>
              <span className="sign-line">{m.consent.proxyName}</span>
              <span>（本人との続柄</span>
              <span className="sign-line short">{m.consent.proxyRelation}</span>
              <span>）</span>
            </div>
          </div>
        ) : (
          <p className="pending">入会同意はまだ記録されていません。</p>
        )}
      </article>
    </section>
  )
}
