import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

// 画面に埋め込まれるのは公開用の鍵だけ。見える範囲はデータベース側の規則で決まる。
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')
