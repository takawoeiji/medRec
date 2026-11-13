# medRec

会員登録表と入会同意書を電子化し、来所ごとの療法記録を残す Web アプリです。

## 利用者と見える範囲

| 利用者 | ログイン | できること |
|---|---|---|
| 顧客 | 携帯電話番号（SMS の認証コード） | 入会同意 → カルテの入力、連絡先の変更、療法記録の閲覧と感想の追記。自分に結び付いた会員の記録だけ |
| スタッフ | メールアドレスとパスワード | 全会員の検索・編集、療法記録、同意文面の改訂、登録表の印刷 |

見える範囲は画面ではなくデータベースの規則（`supabase/migrations/`）で決まります。

- 顧客は、同意を記録するまでカルテを入力できません。
- 同意の記録と感想は、誰であっても変更・削除できません。
- スタッフによる修正は変更履歴に残ります。
- 代理人や家族は、同じ会員に電話番号を追加して扱います（会員の画面の「ログインできる電話番号」）。

## 現在の範囲（第1段階）

ログイン、入会同意、カルテ、会員検索（氏名・電話・区分・VIP・断食）、療法記録と感想、登録表と同意書の印刷。

未着手：過去の紙 PDF の保管と検索、断食の管理、予約、入金と回数券、CSV。

## 手元で動かす

Docker が必要です。

```bash
npm install
```

```bash
SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local-dev npx supabase start
```

起動時に表示される `API_URL` と `ANON_KEY` を `.env.local` に書きます（書式は `.env.example`）。

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<表示された SERVICE_ROLE_KEY> node scripts/create-staff.mjs staff@example.com <パスワード>
```

```bash
npm run dev
```

手元では SMS は送られません。`090-1111-0001`〜`0003` に認証コード `123456` でログインできます（`supabase/config.toml` の `test_otp`）。

アクセス制限の検証（顧客2人とスタッフでログインし、見える範囲と書ける範囲を確かめます）:

```bash
npm run test:access
```

## 本番に出すとき

1. Supabase で東京リージョンのプロジェクトを作る。
2. `npx supabase link` のあと `npx supabase db push` でデータベース定義を反映する。
3. Supabase の Authentication 設定で Phone を有効にし、SMS 送信サービス（Twilio など）の情報を入れる。テスト用の固定コードは設定しない。
4. `scripts/create-staff.mjs` でスタッフのログインを作る。
5. ホスティング側に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定して `npm run build` の出力（`dist/`）を配信する。

`service_role` キーは全データを読める鍵です。画面側の設定やリポジトリには入れないでください。

同意文面は仮のものが入っています。スタッフでログインし「同意文面」から正式な原稿を公開してください。
