import { useEffect, useState } from 'react'
import { getSettings } from './db'
import { DEFAULT_SETTINGS, type Settings } from './types'
import MemberList from './components/MemberList'
import MemberForm from './components/MemberForm'
import MemberSheet from './components/MemberSheet'
import SettingsPage from './components/SettingsPage'

type Route =
  | { page: 'list' }
  | { page: 'new' }
  | { page: 'view'; id: string }
  | { page: 'edit'; id: string }
  | { page: 'settings' }

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'new') return { page: 'new' }
  if (parts[0] === 'settings') return { page: 'settings' }
  if (parts[0] === 'm' && parts[1]) {
    return parts[2] === 'edit' ? { page: 'edit', id: parts[1] } : { page: 'view', id: parts[1] }
  }
  return { page: 'list' }
}

export function go(path: string) {
  window.location.hash = path
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
  }, [])

  return (
    <>
      <header className="appbar no-print">
        <a className="brand" href="#/">
          <span className="brand-mark">記</span>
          <span>
            <strong>medRec</strong>
            <small>{settings.orgName} 会員記録</small>
          </span>
        </a>
        <nav>
          <a href="#/" className={route.page === 'list' ? 'active' : ''}>
            会員一覧
          </a>
          <a href="#/new" className={route.page === 'new' ? 'active' : ''}>
            新規登録
          </a>
          <a href="#/settings" className={route.page === 'settings' ? 'active' : ''}>
            設定・データ
          </a>
        </nav>
      </header>
      <main>
        {route.page === 'list' && <MemberList />}
        {route.page === 'new' && <MemberForm key="new" settings={settings} />}
        {route.page === 'edit' && <MemberForm key={route.id} id={route.id} settings={settings} />}
        {route.page === 'view' && <MemberSheet key={route.id} id={route.id} settings={settings} />}
        {route.page === 'settings' && <SettingsPage settings={settings} onSaved={setSettings} />}
      </main>
    </>
  )
}
