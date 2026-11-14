import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { appointmentsBetween, createAppointment, updateAppointment } from '../api'
import { addDays, dayLabel, fromJst, jstDate, jstTime, today, type Appointment } from '../types'

const STATUS_CLASS: Record<string, string> = { 予定: 'tag', 来院: 'tag ok', 来院なし: 'tag warn', 取消: 'tag muted-tag' }

/** 予約1件。来院したかの記録と、日時の変更 */
export function AppointmentRow({ a, showMember, reload }: { a: Appointment; showMember?: boolean; reload: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(jstDate(a.scheduled_at))
  const [time, setTime] = useState(jstTime(a.scheduled_at))
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      await reload()
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const set = (status: Appointment['status']) => run(() => updateAppointment(a.id, { status }))

  return (
    <li className="appt">
      <div className="appt-main">
        <strong className="appt-time">
          {!showMember && `${dayLabel(jstDate(a.scheduled_at))} `}
          {jstTime(a.scheduled_at)}
        </strong>
        {showMember && a.member && (
          <a href={`#/m/${a.member.id}`} className="appt-name">
            {a.member.name || '（氏名未入力）'}
          </a>
        )}
        <span className={STATUS_CLASS[a.status]}>{a.status}</span>
        {a.note && <span className="hint">{a.note}</span>}
        <span className="spacer" />
        {a.status === '予定' ? (
          <span className="actions">
            <button type="button" className="btn small primary" onClick={() => set('来院')}>
              来院
            </button>
            <button type="button" className="btn small" onClick={() => set('来院なし')}>
              来院なし
            </button>
            <button type="button" className="btn small" onClick={() => setEditing(!editing)}>
              日時変更
            </button>
            <button type="button" className="btn small ghost danger" onClick={() => set('取消')}>
              取消
            </button>
          </span>
        ) : (
          <button type="button" className="btn small ghost" onClick={() => set('予定')}>
            予定に戻す
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {editing && (
        <form
          className="inline-form mt"
          onSubmit={(e) => {
            e.preventDefault()
            if (date && time) run(() => updateAppointment(a.id, { scheduled_at: fromJst(date, time) }))
          }}
        >
          <label className="field">
            <span className="label">新しい日付</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field narrow">
            <span className="label">時刻</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <button className="btn primary">変更を保存</button>
        </form>
      )}
    </li>
  )
}

/** 会員の画面に置く、予約の追加欄 */
export function AppointmentForm({ memberId, reload }: { memberId: string; reload: () => Promise<unknown> }) {
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('10:00')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!date || !time) return setError('日付と時刻を入力してください。')
    setBusy(true)
    setError('')
    try {
      await createAppointment(memberId, fromJst(date, time), note.trim())
      await reload()
      setNote('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="inline-form">
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span className="label">来所予定日</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field narrow">
        <span className="label">時刻</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="field wide">
        <span className="label">メモ（任意）</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn primary" disabled={busy}>
        予約を追加
      </button>
    </form>
  )
}

/** 予約の一覧（スタッフ）。過去で「予定」のままのものを先頭に出す */
export default function Appointments() {
  const [rows, setRows] = useState<Appointment[] | null>(null)
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const t = today()

  const load = useCallback(
    () =>
      appointmentsBetween(fromJst(addDays(t, -30), '00:00'), fromJst(addDays(t, 120), '00:00'))
        .then(setRows)
        .catch((e) => setError(e.message)),
    [t],
  )
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!rows) return <p className="muted">読み込み中…</p>

  const overdue = rows.filter((a) => a.status === '予定' && jstDate(a.scheduled_at) < t)
  const upcoming = rows.filter((a) => jstDate(a.scheduled_at) >= t && (showDone || a.status !== '取消'))
  const days = [...new Set(upcoming.map((a) => jstDate(a.scheduled_at)))]

  return (
    <section>
      <div className="page-head">
        <h1>予約</h1>
        <label className="choice">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          取消も表示
        </label>
      </div>
      <p className="hint">予約の追加は、会員の画面から行います。</p>

      {overdue.length > 0 && (
        <fieldset className="attention">
          <legend>来院の記録が未入力（{overdue.length}件）</legend>
          <ul className="appt-list">
            {overdue.map((a) => (
              <li key={a.id} className="appt-group">
                <span className="hint">{dayLabel(jstDate(a.scheduled_at))}</span>
                <ul className="appt-list">
                  <AppointmentRow a={a} showMember reload={load} />
                </ul>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {days.length === 0 && <p className="muted">今日以降の予約はありません。</p>}
      {days.map((d) => (
        <fieldset key={d}>
          <legend>
            {dayLabel(d)}
            {d === t && <span className="ver">今日</span>}
          </legend>
          <ul className="appt-list">
            {upcoming
              .filter((a) => jstDate(a.scheduled_at) === d)
              .map((a) => (
                <AppointmentRow key={a.id} a={a} showMember reload={load} />
              ))}
          </ul>
        </fieldset>
      ))}
    </section>
  )
}
