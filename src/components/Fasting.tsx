import { useState, type FormEvent } from 'react'
import {
  addFastingLog, createCourse, declareMedication, saveLogAsStaff, updateCourse, updateMember,
  type FastingLogInput,
} from '../api'
import { addDays, daysBetween, formatDate, shortDate, today, type FastingCourse, type FastingLog } from '../types'

interface Props {
  memberId: string
  role: 'customer' | 'staff'
  courses: FastingCourse[]
  reload: () => Promise<unknown>
}

/** 断食の記録。実施中のコースを上に、終了したコースは折りたたんで下に */
export default function Fasting({ memberId, role, courses, reload }: Props) {
  const active = courses.find((c) => !c.end_date)
  const past = courses.filter((c) => c.end_date)

  if (role === 'customer' && courses.length === 0) return null

  return (
    <fieldset>
      <legend>断食の記録</legend>
      {active ? (
        <Course course={active} role={role} memberId={memberId} reload={reload} />
      ) : role === 'staff' ? (
        <StartForm memberId={memberId} reload={reload} />
      ) : (
        <p className="muted">実施中の断食はありません。</p>
      )}
      {past.map((c) => (
        <details key={c.id} className="past-course">
          <summary>
            {formatDate(c.start_date)} 〜 {formatDate(c.end_date)}（{daysBetween(c.start_date, c.end_date!) + 1}日間）
            {c.logs.length > 0 && ` ・ ${c.logs[0].weight_kg} → ${c.logs[c.logs.length - 1].weight_kg} kg`}
          </summary>
          <Course course={c} role={role} memberId={memberId} reload={reload} />
        </details>
      ))}
    </fieldset>
  )
}

function StartForm({ memberId, reload }: { memberId: string; reload: () => Promise<unknown> }) {
  const [start, setStart] = useState(today())
  const [days, setDays] = useState('5')
  const [medication, setMedication] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(days)
    if (!start || !Number.isInteger(n) || n < 1) return setError('開始日と日数を入力してください。')
    setBusy(true)
    setError('')
    try {
      await createCourse({ member_id: memberId, start_date: start, planned_days: n, medication: medication.trim(), note: '' })
      // 一覧で「断食」として抽出できるよう、会員にも印を付ける
      await updateMember(memberId, { is_fasting: true })
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
        <span className="label">開始日</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="field narrow">
        <span className="label">予定日数</span>
        <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label className="field wide">
        <span className="label">服用中の薬（空欄なら、ご本人に申告してもらいます）</span>
        <input value={medication} onChange={(e) => setMedication(e.target.value)} placeholder="例：降圧剤、なし" />
      </label>
      <button className="btn primary" disabled={busy}>
        断食を開始
      </button>
    </form>
  )
}

function Course({ course: c, role, memberId, reload }: { course: FastingCourse; role: Props['role']; memberId: string; reload: () => Promise<unknown> }) {
  const [editing, setEditing] = useState<FastingLog | null>(null)
  const [error, setError] = useState('')
  const active = !c.end_date
  const lastDay = c.end_date ?? today()
  const dayNo = Math.min(daysBetween(c.start_date, lastDay) + 1, 999)
  const first = c.logs[0]
  const logged = new Set(c.logs.map((l) => l.log_date))
  // 開始日から今日までで、まだ記録のない日（新しい順）
  const missing: string[] = []
  for (let d = lastDay; d >= c.start_date && missing.length < 60; d = addDays(d, -1)) {
    if (!logged.has(d)) missing.push(d)
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const end = () => {
    if (!window.confirm('この断食コースを今日で終了します。よろしいですか？')) return
    run(() => updateCourse(c.id, { end_date: today() }))
  }
  const editMedication = () => {
    const input = window.prompt('服用中の薬', c.medication)
    if (input === null) return
    run(() => updateCourse(c.id, { medication: input.trim(), medication_declared_at: c.medication_declared_at ?? new Date().toISOString() }))
  }
  const editDays = () => {
    const input = window.prompt('予定日数', String(c.planned_days))
    const n = Number(input)
    if (input === null || !Number.isInteger(n) || n < 1) return
    run(() => updateCourse(c.id, { planned_days: n }))
  }

  return (
    <div className="course">
      <div className="course-head">
        <div>
          <strong>
            {active ? `断食 ${dayNo}日目` : '終了'}
            <span className="count">予定 {c.planned_days}日間</span>
          </strong>
          <div className="hint">
            {formatDate(c.start_date)} 開始
            {active ? ` ・ 終了予定 ${formatDate(addDays(c.start_date, c.planned_days - 1))}` : ` ・ ${formatDate(c.end_date)} 終了`}
          </div>
        </div>
        {role === 'staff' && active && (
          <div className="actions">
            <button type="button" className="btn small" onClick={editDays}>
              日数を変更
            </button>
            <button type="button" className="btn small" onClick={end}>
              終了する
            </button>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="medication">
        <span className="label">服用中の薬</span>
        {c.medication_declared_at ? (
          <span className="pre">{c.medication || '（記入なし）'}</span>
        ) : role === 'customer' && active ? (
          <MedicationForm courseId={c.id} reload={reload} />
        ) : (
          <span className="tag warn">未申告</span>
        )}
        {role === 'staff' && (
          <button type="button" className="btn small ghost" onClick={editMedication}>
            変更
          </button>
        )}
      </div>

      {(active || role === 'staff') && missing.length > 0 && !editing && (
        <LogForm
          key={`new-${c.logs.length}`}
          dates={missing}
          role={role}
          submitLabel="記録する"
          onSave={(input) => (role === 'staff' ? saveLogAsStaff(c.id, memberId, input) : addFastingLog(c.id, input)).then(reload)}
        />
      )}
      {active && missing.length === 0 && !editing && <p className="success">今日までの記録は入力済みです。</p>}
      {editing && (
        <div className="callout column">
          <strong>{formatDate(editing.log_date)} の記録を訂正</strong>
          <LogForm
            dates={[editing.log_date]}
            role="staff"
            initial={editing}
            submitLabel="訂正を保存"
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              await saveLogAsStaff(c.id, memberId, input)
              await reload()
              setEditing(null)
            }}
          />
        </div>
      )}

      {c.logs.length > 0 && (
        <div className="table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>体重</th>
                <th>開始比</th>
                <th>血圧</th>
                <th>経過</th>
                {role === 'staff' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {[...c.logs].reverse().map((l) => {
                const diff = Math.round((l.weight_kg - first.weight_kg) * 10) / 10
                return (
                  <tr key={l.id}>
                    <td>
                      {shortDate(l.log_date)}
                      <small>{daysBetween(c.start_date, l.log_date) + 1}日目</small>
                    </td>
                    <td className="num">{Number(l.weight_kg).toFixed(1)} kg</td>
                    <td className="num">{l.id === first.id ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`}</td>
                    <td>{l.blood_pressure}</td>
                    <td className="pre">{l.progress}</td>
                    {role === 'staff' && (
                      <td>
                        <button type="button" className="btn small ghost" onClick={() => setEditing(l)}>
                          訂正
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MedicationForm({ courseId, reload }: { courseId: string; reload: () => Promise<unknown> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await declareMedication(courseId, text)
      await reload()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="medication-form">
      {error && <p className="error">{error}</p>}
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="薬の名前。なければ「なし」" aria-label="服用中の薬" />
      <button className="btn primary small" disabled={busy || !text.trim()}>
        申告する
      </button>
    </form>
  )
}

function LogForm({ dates, role, initial, submitLabel, onSave, onCancel }: {
  dates: string[]
  role: Props['role']
  initial?: FastingLog
  submitLabel: string
  onSave: (input: FastingLogInput) => Promise<unknown>
  onCancel?: () => void
}) {
  const [date, setDate] = useState(dates[0])
  const [weight, setWeight] = useState(initial ? String(initial.weight_kg) : '')
  const [bp, setBp] = useState(initial?.blood_pressure ?? '')
  const [progress, setProgress] = useState(initial?.progress ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const w = Number(weight)
    if (!weight.trim() || Number.isNaN(w)) return setError('体重を入力してください。')
    if (w < 20 || w > 300) return setError('体重の値を確認してください（kg）。')
    setBusy(true)
    setError('')
    try {
      await onSave({ log_date: date, weight_kg: w, blood_pressure: bp.trim(), progress: progress.trim() })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="log-form">
      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <label className="field">
          <span className="label">日付</span>
          <select value={date} onChange={(e) => setDate(e.target.value)} disabled={dates.length === 1}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
                {d === today() ? '（今日）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span className="label">
            体重（kg） <em>必須</em>
          </span>
          <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="56.2" />
        </label>
        <label className="field narrow">
          <span className="label">血圧（任意）</span>
          <input value={bp} onChange={(e) => setBp(e.target.value)} placeholder="120/80" />
        </label>
      </div>
      <label className="field">
        <span className="label">経過（体調、気づいたこと）</span>
        <textarea rows={2} value={progress} onChange={(e) => setProgress(e.target.value)} maxLength={4000} />
      </label>
      <div className="comment-foot">
        <span className="hint">{role === 'customer' ? '記録した内容は、後から変更できません。' : '訂正した内容は履歴に残ります。'}</span>
        <span className="actions">
          {onCancel && (
            <button type="button" className="btn small" onClick={onCancel}>
              キャンセル
            </button>
          )}
          <button className="btn primary small" disabled={busy}>
            {busy ? '保存中…' : submitLabel}
          </button>
        </span>
      </div>
    </form>
  )
}
