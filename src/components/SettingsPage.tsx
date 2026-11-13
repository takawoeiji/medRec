import { useState, type ChangeEvent, type FormEvent } from 'react'
import { download, exportBackup, importBackup, listMembers, saveSettings, toCsv } from '../db'
import { today, type Settings } from '../types'

interface Props {
  settings: Settings
  onSaved: (s: Settings) => void
}

export default function SettingsPage({ settings, onSaved }: Props) {
  const [draft, setDraft] = useState<Settings>(settings)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const report = (ok: string) => {
    setError('')
    setMsg(ok)
  }
  const fail = (e: unknown) => {
    setMsg('')
    setError(String((e as Error)?.message ?? e))
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await saveSettings(draft)
      onSaved(draft)
      report('設定を保存しました。')
    } catch (err) {
      fail(err)
    }
  }

  const backup = async () => {
    try {
      const data = await exportBackup()
      download(`medrec-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json')
      report(`${data.members.length}名分のバックアップを書き出しました。`)
    } catch (err) {
      fail(err)
    }
  }

  const csv = async () => {
    try {
      const members = await listMembers()
      download(`medrec-members-${today()}.csv`, toCsv(members), 'text/csv;charset=utf-8')
      report(`${members.length}名分の CSV を書き出しました。`)
    } catch (err) {
      fail(err)
    }
  }

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const n = await importBackup(JSON.parse(await file.text()))
      report(`${n}名分を取り込みました（同じ会員は上書き）。`)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <section className="form">
      <div className="page-head">
        <h1>設定・データ</h1>
      </div>
      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <form onSubmit={save}>
        <fieldset>
          <legend>表示する名称と文面</legend>
          <div className="grid">
            <label className="field">
              <span className="label">団体名（同意書の宛名）</span>
              <input
                value={draft.orgName}
                onChange={(e) => setDraft({ ...draft, orgName: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="label">登録表の題名</span>
              <input
                value={draft.formTitle}
                onChange={(e) => setDraft({ ...draft, formTitle: e.target.value })}
              />
            </label>
            <label className="field span2">
              <span className="label">入会注意事項の本文</span>
              <textarea
                rows={12}
                value={draft.notice}
                onChange={(e) => setDraft({ ...draft, notice: e.target.value })}
                placeholder="入会注意事項の原稿を貼り付けてください。登録画面の同意欄に表示されます。"
              />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">
              設定を保存
            </button>
          </div>
        </fieldset>
      </form>

      <fieldset>
        <legend>データの書き出し・取り込み</legend>
        <p className="hint">
          会員の記録はこの端末のブラウザ内にだけ保存され、外部には送信されません。ブラウザのデータを消去すると記録も消えるため、定期的にバックアップを書き出してください。
        </p>
        <div className="actions left">
          <button type="button" className="btn" onClick={backup}>
            バックアップを書き出す（JSON）
          </button>
          <label className="btn">
            バックアップを取り込む
            <input type="file" accept="application/json,.json" onChange={restore} hidden />
          </label>
          <button type="button" className="btn" onClick={csv}>
            一覧を CSV で書き出す
          </button>
        </div>
        <p className="hint">
          バックアップと CSV には氏名・連絡先・健康に関する情報が含まれます。保管場所と共有先にご注意ください。
        </p>
      </fieldset>
    </section>
  )
}
