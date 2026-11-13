import { useState, type FormEvent } from 'react'
import { sendOtp, staffSignIn, verifyOtp } from '../api'
import { ORG_NAME, toE164 } from '../types'

/** 顧客：携帯電話番号と SMS の認証コードでログイン */
export function PhoneLogin() {
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const e164 = toE164(phone)
    if (!e164) return setError('携帯電話番号を正しく入力してください。')
    run(async () => {
      await sendOtp(e164)
      setSentTo(e164)
      setCode('')
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    run(() => verifyOtp(sentTo, code.trim()))
  }

  return (
    <div className="login">
      <h1>{ORG_NAME}</h1>
      <p className="muted">会員登録・マイページ</p>
      {error && <p className="error">{error}</p>}
      {!sentTo ? (
        <form onSubmit={send} className="card">
          <label className="field">
            <span className="label">携帯電話番号</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="090-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </label>
          <p className="hint">この番号に、SMS で6桁の認証コードを送ります。</p>
          <button className="btn primary block" disabled={busy}>
            {busy ? '送信中…' : '認証コードを送る'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="card">
          <label className="field">
            <span className="label">SMS に届いた6桁のコード</span>
            <input
              className="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          <button className="btn primary block" disabled={busy || code.length < 6}>
            {busy ? '確認中…' : 'ログイン'}
          </button>
          <button type="button" className="btn ghost block" onClick={() => setSentTo('')}>
            電話番号を入力し直す
          </button>
        </form>
      )}
      <p className="login-foot">
        <a href="#/staff">スタッフの方はこちら</a>
      </p>
    </div>
  )
}

/** スタッフ：メールアドレスとパスワードでログイン */
export function StaffLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await staffSignIn(email.trim(), password)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <h1>{ORG_NAME}</h1>
      <p className="muted">スタッフ ログイン</p>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit} className="card">
        <label className="field">
          <span className="label">メールアドレス</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="label">パスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn primary block" disabled={busy || !email || !password}>
          {busy ? '確認中…' : 'ログイン'}
        </button>
      </form>
      <p className="login-foot">
        <a href="#/">会員の方はこちら</a>
      </p>
    </div>
  )
}
