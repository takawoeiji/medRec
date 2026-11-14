// アクセス制限の検証。手元の Supabase（npx supabase start）に対して実行する。
//   npm run test:access
// 顧客A・顧客B・スタッフの3者でログインし、見える範囲と書ける範囲を確かめる。
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
if (!env.API_URL.includes('127.0.0.1')) throw new Error('手元の環境以外では実行しません')
const mk = (key) => createClient(env.API_URL, key, { auth: { persistSession: false } })
const admin = mk(env.SERVICE_ROLE_KEY)

let failed = 0
const ok = (cond, label) => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`)
  if (!cond) failed++
}
const SIG = 'data:image/png;base64,iVBORw0KGgo='
const sign = (type = '本人', proxy = '') => ({
  p_signer_type: type, p_signer_name: 'テスト', p_proxy_name: proxy,
  p_proxy_relation: proxy ? '子' : '', p_signature: SIG, p_user_agent: 'test',
})

async function customer(phone) {
  const c = mk(env.ANON_KEY)
  let r = await c.auth.signInWithOtp({ phone })
  if (r.error) throw r.error
  r = await c.auth.verifyOtp({ phone, token: '123456', type: 'sms' })
  if (r.error) throw r.error
  return c
}

// --- 準備
const stamp = Date.now()
const email = `staff${stamp}@example.com`
const { data: su } = await admin.auth.admin.createUser({ email, password: 'pw-123456', email_confirm: true })
await admin.from('staff').insert({ user_id: su.user.id, name: 'テストスタッフ' })
const staff = mk(env.ANON_KEY)
await staff.auth.signInWithPassword({ email, password: 'pw-123456' })
const anon = mk(env.ANON_KEY)
const A = await customer('+819011110001')
const B = await customer('+819011110002')

console.log('未ログイン')
ok((await anon.from('members').select('id')).error !== null, '会員を読めない')
ok((await anon.from('consent_documents').select('id')).error !== null, '同意文面も読めない')
ok((await anon.rpc('register_member', sign())).error !== null, '登録できない')

console.log('同意 → カルテ の順序')
let r = await A.rpc('register_member', { ...sign(), p_signature: '' })
ok(r.error !== null, '署名なしでは登録できない')
r = await A.rpc('register_member', sign())
ok(!r.error && r.data, '同意と署名で会員が作られる')
const a1 = r.data
r = await A.from('consents').select('document_id, via, phone').eq('member_id', a1)
ok(r.data?.length === 2 && r.data.every((c) => c.via === 'customer_login' && c.phone === '819011110001'),
  '2種類の文面への同意が、電話番号つきで記録される')
r = await A.rpc('submit_karte', { p_member: a1, p: { name: '' } })
ok(r.error !== null, '氏名なしのカルテは受け付けない')
r = await A.rpc('submit_karte', { p_member: a1, p: { name: '検証 一郎', furigana: 'ケンショウ イチロウ', birth_date: '1970-01-02', sex: '男', symptoms: ['肩こり', '腰痛'] } })
ok(!r.error, 'カルテを登録できる')
r = await A.rpc('submit_karte', { p_member: a1, p: { name: '書き換え' } })
ok(r.error !== null, '登録済みのカルテは顧客から上書きできない')

console.log('顧客は自分の情報だけ')
r = await B.rpc('register_member', sign('代理人', '検証 花子'))
const b1 = r.data
ok(!r.error && b1, '代理人として登録できる')
r = await A.from('members').select('id')
ok(r.data?.length === 1 && r.data[0].id === a1, 'Aには自分の会員だけが見える')
r = await B.from('members').select('id').eq('id', a1)
ok(r.data?.length === 0, 'BはAの会員を読めない')
r = await B.from('consents').select('id').eq('member_id', a1)
ok(r.data?.length === 0, 'BはAの同意記録を読めない')
r = await B.rpc('update_contact', { p_member: a1, p: { address: '改ざん' } })
ok(r.error !== null, 'BはAの連絡先を変更できない')
r = await B.rpc('sign_consents', { p_member: a1, ...sign() })
ok(r.error !== null, 'BはAの同意に署名できない')
r = await A.from('members').update({ name: '直接書き換え', is_vip: true }).eq('id', a1).select()
ok((r.data?.length ?? 0) === 0, '顧客は会員の表を直接は書き換えられない')
r = await A.rpc('update_contact', { p_member: a1, p: { address: '東京都千代田区1-1', name: '改名' } })
const m = (await A.from('members').select('name, address').eq('id', a1).single()).data
ok(!r.error && m.address === '東京都千代田区1-1' && m.name === '検証 一郎', '連絡先は直せるが、氏名は変わらない')
r = await A.from('member_logins').insert({ member_id: b1, phone: '819011110001' })
ok(r.error !== null, '顧客は他人の会員に自分の番号を結び付けられない')
r = await A.from('staff').insert({ user_id: (await A.auth.getUser()).data.user.id })
ok(r.error !== null, '顧客は自分をスタッフにできない')

console.log('療法記録と感想')
r = await A.from('sessions').insert({ member_id: a1, mode: '来所' })
ok(r.error !== null, '顧客は療法記録を作れない')
r = await staff.from('sessions').insert({ member_id: a1, mode: '来所', is_vip: true }).select().single()
ok(!r.error, 'スタッフは療法記録を作れる')
const s1 = r.data.id
await staff.from('session_staff_notes').insert({ session_id: s1, member_id: a1, note: '内部メモ' })
r = await A.from('session_staff_notes').select('note')
ok(r.data?.length === 0, 'スタッフのメモは顧客に見えない')
r = await A.from('session_comments').insert({ session_id: s1, body: '楽になりました', author_role: 'staff' }).select().single()
ok(!r.error && r.data.author_role === 'customer' && r.data.member_id === a1, '顧客は感想を追記でき、書いた人は偽れない')
const c1 = r.data.id
r = await B.from('session_comments').insert({ session_id: s1, body: '他人の書き込み' })
ok(r.error !== null, 'BはAの療法記録に感想を書けない')
r = await A.from('session_comments').update({ body: '書き換え' }).eq('id', c1).select()
ok((r.data?.length ?? 0) === 0, '顧客は感想を編集できない')
r = await staff.from('session_comments').update({ body: '書き換え' }).eq('id', c1).select()
ok((r.data?.length ?? 0) === 0, 'スタッフも感想を編集できない')
r = await admin.from('session_comments').delete().eq('id', c1)
ok(r.error !== null, '管理者の鍵でも感想は削除できない')
r = await admin.from('consents').update({ signer_name: '改ざん' }).eq('member_id', a1)
ok(r.error !== null, '管理者の鍵でも同意の記録は変更できない')

console.log('スタッフ')
r = await staff.from('members').select('id').in('id', [a1, b1])
ok(r.data?.length === 2, '全会員を読める')
r = await staff.from('members').update({ is_vip: true, member_class: '特別' }).eq('id', a1).select()
ok(r.data?.length === 1, '会員を編集できる')
r = await staff.from('audit_log').select('action, table_name, by_staff').eq('member_id', a1)
ok(r.data?.some((x) => x.table_name === 'members' && x.action === 'UPDATE' && x.by_staff), '編集の履歴が残る')
r = await A.from('audit_log').select('id')
ok(r.data?.length === 0, '履歴は顧客に見えない')

console.log('電話番号の付け替えと文面の改訂')
await staff.from('member_logins').update({ phone: '819011110003' }).eq('member_id', a1)
r = await A.from('members').select('id')
ok(r.data?.length === 0, '番号を付け替えると、古い番号からは見えなくなる')
const C = await customer('+819011110003')
r = await C.from('members').select('id')
ok(r.data?.length === 1 && r.data[0].id === a1, '新しい番号でログインすると見える')
const ver = ((await staff.from('consent_documents').select('version').eq('kind', 'admission').order('version', { ascending: false }).limit(1)).data[0].version) + 1
r = await staff.from('consent_documents').insert({ kind: 'admission', version: ver, title: '入会注意事項', body: `改訂 ${ver}` })
ok(!r.error, 'スタッフは新しい版を追加できる')
r = await C.rpc('update_contact', { p_member: a1, p: { address: 'x' } })
ok(r.error !== null, '改訂後は、再同意するまで更新できない')
r = await C.rpc('sign_consents', { p_member: a1, ...sign() })
ok(!r.error && r.data === 1, '未同意の1件だけに再同意が記録される')
r = await C.rpc('update_contact', { p_member: a1, p: { address: '再同意後' } })
ok(!r.error, '再同意後は更新できる')

console.log('断食')
r = await C.from('fasting_courses').insert({ member_id: a1, planned_days: 5 })
ok(r.error !== null, '顧客は断食コースを作れない')
r = await staff.from('fasting_courses').insert({ member_id: a1, planned_days: 5 }).select().single()
ok(!r.error, 'スタッフは断食コースを作れる')
const fc = r.data
r = await staff.from('fasting_courses').insert({ member_id: a1, planned_days: 3 })
ok(r.error !== null, '実施中のコースは1つまで')
const day = fc.start_date
r = await C.rpc('add_fasting_log', { p_course: fc.id, p_date: day, p_weight: 5.62, p_blood_pressure: '', p_progress: '' })
ok(r.error !== null, 'ありえない体重は受け付けない')
r = await C.rpc('add_fasting_log', { p_course: fc.id, p_date: '2099-01-01', p_weight: 56.2, p_blood_pressure: '', p_progress: '' })
ok(r.error !== null, '未来の日付は記録できない')
r = await C.rpc('add_fasting_log', { p_course: fc.id, p_date: day, p_weight: 56.2, p_blood_pressure: '', p_progress: '空腹感あり' })
ok(!r.error, '顧客は当日の体重と経過を記録できる')
r = await C.rpc('add_fasting_log', { p_course: fc.id, p_date: day, p_weight: 50, p_blood_pressure: '', p_progress: '' })
ok(r.error !== null, '同じ日の記録は顧客から上書きできない')
r = await C.from('fasting_logs').update({ weight_kg: 50 }).eq('course_id', fc.id).select()
ok((r.data?.length ?? 0) === 0, '顧客は記録を直接は書き換えられない')
r = await B.rpc('add_fasting_log', { p_course: fc.id, p_date: day, p_weight: 60, p_blood_pressure: '', p_progress: '' })
ok(r.error !== null, 'Bは他人のコースに記録できない')
r = await B.from('fasting_logs').select('id').eq('course_id', fc.id)
ok(r.data?.length === 0, 'Bは他人の断食記録を読めない')
r = await C.rpc('declare_medication', { p_course: fc.id, p_text: '降圧剤' })
ok(!r.error, '顧客は服薬を申告できる')
r = await C.rpc('declare_medication', { p_course: fc.id, p_text: 'なし' })
ok(r.error !== null, '申告は1回だけ（変更はスタッフ）')
r = await staff.from('fasting_logs').update({ weight_kg: 56.0 }).eq('course_id', fc.id).select()
ok(r.data?.length === 1 && r.data[0].entered_by === 'customer', 'スタッフは訂正でき、入力者の記録は変わらない')
r = await staff.from('audit_log').select('id').eq('member_id', a1).eq('table_name', 'fasting_logs').eq('action', 'UPDATE')
ok(r.data?.length === 1, '訂正の履歴が残る')
await staff.from('fasting_courses').update({ end_date: day }).eq('id', fc.id)
r = await C.rpc('add_fasting_log', { p_course: fc.id, p_date: day, p_weight: 55, p_blood_pressure: '', p_progress: '' })
ok(r.error !== null, '終了したコースには顧客から記録できない')

console.log('過去の紙')
const pdf = new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' })
const path = `test/${stamp}.pdf`
r = await C.storage.from('legacy-papers').upload(path, pdf)
ok(r.error !== null, '顧客はPDFを保管できない')
r = await staff.storage.from('legacy-papers').upload(path, pdf)
ok(!r.error, 'スタッフはPDFを保管できる')
r = await staff.storage.from('legacy-papers').upload(`test/${stamp}.txt`, new Blob(['x'], { type: 'text/plain' }))
ok(r.error !== null, 'PDF以外は保管できない')
r = await staff.from('legacy_documents').insert({ storage_path: path, file_name: 'a.pdf', name: '検証 一郎', phone: '090-1111-0003', member_id: a1 }).select().single()
ok(!r.error && r.data.phone_digits === '09011110003', 'スタッフは名前と電話を登録できる')
r = await C.from('legacy_documents').select('id')
ok(r.data?.length === 0, '本人に結び付いていても、顧客には過去の紙は見えない')
r = await C.storage.from('legacy-papers').download(path)
ok(r.error !== null, '顧客はPDFを取り出せない')
r = await anon.storage.from('legacy-papers').download(path)
ok(r.error !== null, '未ログインではPDFを取り出せない')
r = await staff.storage.from('legacy-papers').download(path)
ok(!r.error && r.data.size > 0, 'スタッフはPDFを取り出せる')

console.log('予約')
r = await C.from('appointments').insert({ member_id: a1, scheduled_at: '2030-01-10T01:00:00Z' })
ok(r.error !== null, '顧客は予約を作れない')
r = await staff.from('appointments').insert({ member_id: a1, scheduled_at: '2030-01-10T01:00:00Z' }).select().single()
ok(!r.error && r.data.status === '予定', 'スタッフは予約を作れる')
const ap = r.data.id
r = await C.from('appointments').select('id, status')
ok(r.data?.length === 1, '顧客は自分の予約を見られる')
r = await B.from('appointments').select('id')
ok(r.data?.length === 0, 'Bは他人の予約を見られない')
r = await C.from('appointments').update({ status: '取消' }).eq('id', ap).select()
ok((r.data?.length ?? 0) === 0, '顧客は予約を変更できない')
await staff.from('appointments').update({ scheduled_at: '2030-01-11T02:00:00Z' }).eq('id', ap)
await staff.from('appointments').update({ status: '来院' }).eq('id', ap)
r = await staff.from('audit_log').select('id').eq('member_id', a1).eq('table_name', 'appointments').eq('action', 'UPDATE')
ok(r.data?.length === 2, '日時の変更と来院の記録が履歴に残る')

console.log('回数券と入金')
r = await C.from('ticket_books').insert({ member_id: a1, total_count: 11, expires_on: '2099-01-01' })
ok(r.error !== null, '顧客は回数券を発行できない')
r = await staff.from('ticket_books').insert({ member_id: a1, issued_on: day, total_count: 2, expires_on: day }).select().single()
ok(!r.error, 'スタッフは回数券を発行できる')
const tb = r.data.id
r = await staff.from('payments').insert({ member_id: a1, kind: '回数券', amount: 50000, ticket_book_id: tb })
ok(!r.error, 'スタッフは入金を記録できる')
r = await C.from('payments').select('id')
ok(r.data?.length === 0, '入金は顧客に見えない')
r = await C.from('payments').insert({ member_id: a1, kind: '療法費', amount: 1 })
ok(r.error !== null, '顧客は入金を記録できない')
r = await staff.from('sessions').insert({ member_id: b1, mode: '来所', session_date: day, ticket_book_id: tb })
ok(r.error !== null, '他の会員の回数券は使えない')
r = await staff.from('sessions').insert({ member_id: a1, mode: '来所', session_date: '2099-01-01', ticket_book_id: tb })
ok(r.error !== null, '期限を過ぎた日には使えない')
r = await staff.from('sessions').insert({ member_id: a1, mode: '来所', session_date: day, ticket_book_id: tb }).select().single()
ok(!r.error, '回数券を1枚使って療法記録を作れる')
const ts1 = r.data.id
await staff.from('sessions').insert({ member_id: a1, mode: '遠隔', session_date: day, ticket_book_id: tb })
r = await staff.from('sessions').insert({ member_id: a1, mode: '来所', session_date: day, ticket_book_id: tb })
ok(r.error !== null, '残りがなければ使えない')
r = await C.from('ticket_balances').select('remaining, used_count').eq('id', tb).single()
ok(r.data?.remaining === 0 && r.data?.used_count === 2, '顧客は自分の回数券の残数を見られる')
r = await B.from('ticket_balances').select('id')
ok(r.data?.length === 0, 'Bは他人の回数券を見られない')
r = await staff.from('ticket_books').update({ total_count: 1 }).eq('id', tb).select()
ok(r.error !== null, '使用済みより少ない枚数にはできない')
await staff.from('sessions').update({ ticket_book_id: null }).eq('id', ts1)
r = await staff.from('ticket_balances').select('remaining').eq('id', tb).single()
ok(r.data?.remaining === 1, '療法記録から外すと残数が戻る')
r = await C.from('app_settings').update({ value: 99 }).eq('key', 'ticket_count').select()
ok((r.data?.length ?? 0) === 0, '顧客は設定を変更できない')

console.log(failed ? `\n${failed} 件が失敗しました` : '\nすべて通りました')
process.exit(failed ? 1 : 0)
