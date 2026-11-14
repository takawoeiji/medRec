import { useEffect, useState, type FormEvent } from 'react'
import { addPayment, deletePayment, getSettings, issueTickets, updateTicket } from '../api'
import { PAYMENT_KINDS, addMonths, formatDate, today, yen, type AppSettings, type Payment, type TicketBalance } from '../types'

interface Props {
  memberId: string
  tickets: TicketBalance[]
  payments: Payment[]
  reload: () => Promise<unknown>
}

/** 回数券と入金（スタッフ専用。入金は顧客には見えない） */
export default function MemberMoney({ memberId, tickets, payments, reload }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState('')
  const t = today()

  useEffect(() => {
    getSettings().then(setSettings).catch((e) => setError(e.message))
  }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const extend = (b: TicketBalance) => {
    const input = window.prompt('新しい有効期限（例：2027-01-31）', b.expires_on)
    if (input === null) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return setError('有効期限は 2027-01-31 の形で入力してください。')
    run(() => updateTicket(b.id, { expires_on: input.trim() }))
  }
  const remove = (p: Payment) => {
    if (!window.confirm(`${formatDate(p.paid_on)} の ${p.kind} ${yen(p.amount)} を削除します。よろしいですか？`)) return
    run(() => deletePayment(p.id))
  }

  return (
    <>
      <fieldset>
        <legend>回数券</legend>
        {error && <p className="error">{error}</p>}
        {tickets.length === 0 ? (
          <p className="muted">発行した回数券はありません。</p>
        ) : (
          <ul className="login-list">
            {tickets.map((b) => {
              const expired = b.expires_on < t
              return (
                <li key={b.id}>
                  <strong className={b.remaining === 0 || expired ? 'muted' : ''}>
                    残り {b.remaining} / {b.total_count}枚
                  </strong>
                  <span>
                    {formatDate(b.issued_on)} 発行 ・ 期限 {formatDate(b.expires_on)}
                  </span>
                  {expired && b.remaining > 0 && <span className="tag warn">期限切れ</span>}
                  {b.remaining === 0 && <span className="tag muted-tag">使い切り</span>}
                  <span className="spacer" />
                  <button type="button" className="btn small" onClick={() => extend(b)}>
                    期限を変更
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {settings && <IssueForm key={tickets.length} memberId={memberId} settings={settings} reload={reload} />}
      </fieldset>

      <fieldset>
        <legend>入金</legend>
        <p className="hint">入金の記録は、顧客のマイページには表示されません。</p>
        <PaymentForm key={payments.length} memberId={memberId} reload={reload} />
        {payments.length > 0 && (
          <div className="table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>入金日</th>
                  <th>種類</th>
                  <th>金額</th>
                  <th>メモ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paid_on)}</td>
                    <td>{p.kind}</td>
                    <td className="num">{yen(p.amount)}</td>
                    <td className="pre">{p.note}</td>
                    <td>
                      <button type="button" className="btn small ghost danger" onClick={() => remove(p)}>
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>合計</th>
                  <td className="num">
                    <strong>{yen(payments.reduce((sum, p) => sum + p.amount, 0))}</strong>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </fieldset>
    </>
  )
}

function IssueForm({ memberId, settings, reload }: { memberId: string; settings: AppSettings; reload: () => Promise<unknown> }) {
  const [issued, setIssued] = useState(today())
  const [count, setCount] = useState(String(settings.ticket_count))
  const [expires, setExpires] = useState(addMonths(today(), settings.ticket_valid_months))
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(count)
    if (!issued || !expires || !Number.isInteger(n) || n < 1) return setError('発行日・枚数・有効期限を入力してください。')
    if (expires < issued) return setError('有効期限が発行日より前になっています。')
    setBusy(true)
    setError('')
    try {
      await issueTickets({
        member_id: memberId, issued_on: issued, total_count: n, expires_on: expires,
        amount: amount.trim() ? Number(amount) : null,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="inline-form mt">
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span className="label">発行日</span>
        <input
          type="date"
          value={issued}
          onChange={(e) => {
            setIssued(e.target.value)
            // 発行日を動かしたら、期限も既定の月数で引き直す
            if (e.target.value) setExpires(addMonths(e.target.value, settings.ticket_valid_months))
          }}
        />
      </label>
      <label className="field narrow">
        <span className="label">枚数</span>
        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label className="field">
        <span className="label">有効期限</span>
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">金額（入力すると入金も記録）</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="円" />
      </label>
      <button className="btn primary" disabled={busy}>
        回数券を発行
      </button>
    </form>
  )
}

function PaymentForm({ memberId, reload }: { memberId: string; reload: () => Promise<unknown> }) {
  const [paidOn, setPaidOn] = useState(today())
  const [kind, setKind] = useState<Payment['kind']>('療法費')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!paidOn || !amount.trim()) return setError('入金日と金額を入力してください。')
    setBusy(true)
    setError('')
    try {
      await addPayment({ member_id: memberId, paid_on: paidOn, kind, amount: Number(amount), note: note.trim(), ticket_book_id: null })
      await reload()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="inline-form">
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span className="label">入金日</span>
        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </label>
      <label className="field narrow">
        <span className="label">種類</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as Payment['kind'])}>
          {PAYMENT_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">金額（円）</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label className="field wide">
        <span className="label">メモ（任意）</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn primary" disabled={busy}>
        入金を記録
      </button>
    </form>
  )
}
