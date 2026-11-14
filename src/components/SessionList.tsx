import { useState, type ReactNode } from 'react'
import { formatDate, formatDateTime, type Session } from '../types'

interface Props {
  sessions: Session[]
  role: 'customer' | 'staff'
  onAddComment: (sessionId: string, body: string) => Promise<void>
  /** スタッフ用：編集ボタンなど */
  renderActions?: (s: Session) => ReactNode
}

function CommentBox({ role, onAdd }: { role: Props['role']; onAdd: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const add = async () => {
    setBusy(true)
    setError('')
    try {
      await onAdd(body.trim())
      setBody('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="comment-box">
      {error && <p className="error">{error}</p>}
      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={role === 'customer' ? '療法後の感想をお書きください' : 'スタッフからの追記'}
        maxLength={4000}
        aria-label="感想を追記"
      />
      <div className="comment-foot">
        <span className="hint">追記した内容は、後から編集・削除できません。</span>
        <button type="button" className="btn primary small" disabled={busy || !body.trim()} onClick={add}>
          {busy ? '送信中…' : '追記する'}
        </button>
      </div>
    </div>
  )
}

export default function SessionList({ sessions, role, onAddComment, renderActions }: Props) {
  if (sessions.length === 0) return <p className="muted">療法の記録はまだありません。</p>
  return (
    <ul className="session-list">
      {sessions.map((s) => (
        <li key={s.id} className="session">
          <div className="session-head">
            <strong>{formatDate(s.session_date)}</strong>
            <span className={s.mode === '来所' ? 'tag' : 'tag alt'}>{s.mode}</span>
            {s.is_vip && <span className="tag vip">VIP</span>}
            {s.is_fasting && <span className="tag fast">断食</span>}
            {s.ticket_book_id && <span className="tag muted-tag">回数券</span>}
            <span className="spacer" />
            {renderActions?.(s)}
          </div>
          {role === 'staff' && s.note?.note && (
            <p className="staff-note">
              <span className="label">スタッフのメモ（顧客には表示されません）</span>
              {s.note.note}
            </p>
          )}
          {s.comments.length > 0 && (
            <ul className="comments">
              {s.comments.map((c) => (
                <li key={c.id} className={c.author_role === 'staff' ? 'comment staff' : 'comment'}>
                  <span className="comment-meta">
                    {c.author_role === 'staff' ? 'スタッフ' : role === 'customer' ? 'ご自身' : '顧客'} ・{' '}
                    {formatDateTime(c.created_at)}
                  </span>
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <CommentBox role={role} onAdd={(body) => onAddComment(s.id, body)} />
        </li>
      ))}
    </ul>
  )
}
