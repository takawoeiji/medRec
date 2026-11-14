import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { isStaff, signOut } from './api'
import { PhoneLogin, StaffLogin } from './components/Login'
import CustomerApp from './customer/CustomerApp'
import StaffApp from './staff/StaffApp'
import { configured, supabase } from './supabase'
import { ORG_NAME, showPhone } from './types'

const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

export default function App() {
  const [route, setRoute] = useState(parse)
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined)
  const [role, setRole] = useState<'staff' | 'customer' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onHash = () => {
      setRoute(parse())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    setRole(null)
    if (!userId) return
    isStaff(userId)
      .then((staff) => {
        setRole(staff ? 'staff' : 'customer')
        // ログイン画面の番地（#/staff）を残さない
        if (parse()[0] === 'staff') window.location.hash = '/'
      })
      .catch((e) => setError(e.message))
  }, [userId])

  if (!configured) {
    return (
      <main>
        <p className="error">
          接続先が設定されていません。.env に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。
        </p>
      </main>
    )
  }
  if (session === undefined) return <main><p className="muted">読み込み中…</p></main>
  if (!session) return <main>{route[0] === 'staff' ? <StaffLogin /> : <PhoneLogin />}</main>

  const logout = async () => {
    await signOut()
    window.location.hash = '/'
  }

  return (
    <>
      <header className="appbar no-print">
        <a className="brand" href="#/">
          <span className="brand-mark">記</span>
          <span>
            <strong>{ORG_NAME}</strong>
            <small>{role === 'staff' ? 'スタッフ' : showPhone(session.user.phone ?? '')}</small>
          </span>
        </a>
        <nav>
          {role === 'staff' && (
            <>
              <a href="#/" className={route.length === 0 || route[0] === 'm' ? 'active' : ''}>
                会員
              </a>
              <a href="#/appointments" className={route[0] === 'appointments' ? 'active' : ''}>
                予約
              </a>
              <a href="#/papers" className={route[0] === 'papers' ? 'active' : ''}>
                過去の紙
              </a>
              <a href="#/settings" className={route[0] === 'settings' ? 'active' : ''}>
                設定
              </a>
            </>
          )}
          <button type="button" className="btn small ghost" onClick={logout}>
            ログアウト
          </button>
        </nav>
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        {role === 'staff' && <StaffApp route={route} />}
        {role === 'customer' && <CustomerApp route={route} />}
        {!role && !error && <p className="muted">読み込み中…</p>}
      </main>
    </>
  )
}
