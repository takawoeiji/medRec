// スタッフのログインを作る。
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-staff.mjs <メール> <パスワード> [名前]
// service_role キーは全データを読める鍵なので、このコマンドを実行する端末以外に置かないこと。
import { createClient } from '@supabase/supabase-js'

const [email, password, name = 'スタッフ'] = process.argv.slice(2)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!email || !password || !url || !key) {
  console.error('使い方: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-staff.mjs <メール> <パスワード> [名前]')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false } })
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (error) throw error
const { error: e2 } = await admin.from('staff').insert({ user_id: data.user.id, name })
if (e2) throw e2
console.log(`スタッフを作成しました: ${email}`)
