import { fetchAll } from './api'
import { jstDate, jstTime, today, type Member } from './types'

type Row = Record<string, unknown>
type Column<T> = [header: string, value: (row: T) => unknown]

function cell(v: unknown): string {
  const text = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('・') : String(v)
  // 表計算ソフトで数式として実行されないようにする
  const safe = /^[=+\-@\t\r]/.test(text) && typeof v !== 'number' ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const lines = [columns.map(([h]) => cell(h)).join(',')]
  for (const r of rows) lines.push(columns.map(([, f]) => cell(f(r))).join(','))
  // Excel が文字化けしないよう BOM を付ける
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  // 日本語のファイル名は、ブラウザによっては「download」に置き換わるので英数字にする
  a.download = `medrec-${name}-${today()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const flag = (v: unknown) => (v ? '○' : '')
const WHO = 'member:members(name, furigana)'
const who = (r: Row) => (r.member as { name: string; furigana: string } | null) ?? { name: '', furigana: '' }

export const EXPORTS: { key: string; label: string; run: () => Promise<number> }[] = [
  {
    key: 'members',
    label: '会員',
    run: async () => {
      const rows = await fetchAll<Member>('members', '*', 'furigana')
      download('members', toCsv<Member>([
        ['会員区分', (m) => m.member_class], ['VIP', (m) => flag(m.is_vip)], ['断食', (m) => flag(m.is_fasting)],
        ['フリガナ', (m) => m.furigana], ['氏名', (m) => m.name], ['郵便番号', (m) => m.postal_code],
        ['住所', (m) => m.address], ['電話', (m) => m.phone], ['E-mail', (m) => m.email],
        ['携帯メール', (m) => m.mobile_email], ['職業', (m) => m.occupation], ['紹介者', (m) => m.referrer],
        ['登録日', (m) => m.registered_on], ['生年月日', (m) => m.birth_date], ['性別', (m) => m.sex],
        ['血液型', (m) => m.blood_type], ['身長', (m) => m.height_cm], ['血圧', (m) => m.blood_pressure],
        ['該当項目', (m) => m.symptoms], ['詳しい症状・自覚症状', (m) => m.symptom_detail],
        ['カルテ登録', (m) => (m.karte_completed_at ? jstDate(m.karte_completed_at) : '')],
      ], rows))
      return rows.length
    },
  },
  {
    key: 'sessions',
    label: '療法記録',
    run: async () => {
      const rows = await fetchAll<Row>(
        'sessions',
        `id, session_date, mode, is_vip, is_fasting, ticket_book_id, ${WHO}, note:session_staff_notes(note), comments:session_comments(author_role, body, created_at)`,
        'session_date',
      )
      download('sessions', toCsv<Row>([
        ['療法日', (r) => r.session_date], ['フリガナ', (r) => who(r).furigana], ['氏名', (r) => who(r).name],
        ['来所/遠隔', (r) => r.mode], ['VIP', (r) => flag(r.is_vip)], ['断食', (r) => flag(r.is_fasting)],
        ['回数券', (r) => flag(r.ticket_book_id)],
        ['スタッフのメモ', (r) => (r.note as { note: string } | null)?.note ?? ''],
        ['感想', (r) =>
          (r.comments as { author_role: string; body: string; created_at: string }[])
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((c) => `${c.author_role === 'staff' ? '[スタッフ] ' : ''}${c.body}`)
            .join('\n')],
      ], rows))
      return rows.length
    },
  },
  {
    key: 'appointments',
    label: '予約',
    run: async () => {
      const rows = await fetchAll<Row>('appointments', `id, scheduled_at, status, note, ${WHO}`, 'scheduled_at')
      download('appointments', toCsv<Row>([
        ['日付', (r) => jstDate(r.scheduled_at as string)], ['時刻', (r) => jstTime(r.scheduled_at as string)],
        ['フリガナ', (r) => who(r).furigana], ['氏名', (r) => who(r).name], ['状態', (r) => r.status], ['メモ', (r) => r.note],
      ], rows))
      return rows.length
    },
  },
  {
    key: 'payments',
    label: '入金',
    run: async () => {
      const rows = await fetchAll<Row>('payments', `id, paid_on, kind, amount, note, ${WHO}`, 'paid_on')
      download('payments', toCsv<Row>([
        ['入金日', (r) => r.paid_on], ['フリガナ', (r) => who(r).furigana], ['氏名', (r) => who(r).name],
        ['種類', (r) => r.kind], ['金額', (r) => r.amount], ['メモ', (r) => r.note],
      ], rows))
      return rows.length
    },
  },
  {
    key: 'tickets',
    label: '回数券',
    run: async () => {
      const rows = await fetchAll<Row>('ticket_balances', `id, issued_on, expires_on, total_count, used_count, remaining, ${WHO}`, 'issued_on')
      download('tickets', toCsv<Row>([
        ['発行日', (r) => r.issued_on], ['有効期限', (r) => r.expires_on], ['フリガナ', (r) => who(r).furigana],
        ['氏名', (r) => who(r).name], ['枚数', (r) => r.total_count], ['使用済み', (r) => r.used_count], ['残り', (r) => r.remaining],
      ], rows))
      return rows.length
    },
  },
  {
    key: 'fasting',
    label: '断食の記録',
    run: async () => {
      const rows = await fetchAll<Row>(
        'fasting_logs',
        `id, log_date, weight_kg, blood_pressure, progress, entered_by, ${WHO}, course:fasting_courses(start_date, planned_days, end_date, medication)`,
        'log_date',
      )
      const course = (r: Row) => (r.course as Row | null) ?? {}
      download('fasting', toCsv<Row>([
        ['日付', (r) => r.log_date], ['フリガナ', (r) => who(r).furigana], ['氏名', (r) => who(r).name],
        ['体重(kg)', (r) => Number(r.weight_kg)], ['血圧', (r) => r.blood_pressure], ['経過', (r) => r.progress],
        ['入力者', (r) => (r.entered_by === 'staff' ? 'スタッフ' : '顧客')], ['開始日', (r) => course(r).start_date],
        ['予定日数', (r) => course(r).planned_days], ['終了日', (r) => course(r).end_date], ['服用中の薬', (r) => course(r).medication],
      ], rows))
      return rows.length
    },
  },
]
