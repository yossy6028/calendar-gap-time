# カレンダー空き時間検索システム

Googleカレンダーの全カレンダーを対象に、指定期間の空き時間を自動計算・表示するWebアプリです。

## 主な機能
- Googleアカウントでログインし、全カレンダーの予定を自動取得
- 指定した期間の「空き時間」を30分単位で自動計算
- 「特に希望する日・時間帯」を複数指定して、その時間帯だけの空き枠も抽出
- 予定の前後10分バッファを考慮して空き枠を判定
- サブカレンダー（例：趣味カレンダー等）の予定も全て反映
- UIはMUI（Material-UI）＋dayjsでモダン＆日本語対応

## セットアップ手順

1. **リポジトリをクローン**
   ```sh
   git clone https://github.com/yossy6028/calendar-gap-time.git
   cd calendar-gap-time
   ```
2. **依存パッケージのインストール**
   ```sh
   cd client
   npm install
   ```
3. **アプリの起動**
   ```sh
   npm start
   ```
   ブラウザで `http://localhost:3000` を開いてください。

## 使い方
1. 「希望期間を選択」で空き時間を調べたい期間をカレンダーで指定
2. 必要に応じて「特に希望する日・時間帯」を追加
3. 「Googleでログインして予定取得」ボタンでGoogle認証
4. 指定期間・条件に合致する空き時間が自動で表示されます

## 依存技術
- React 18
- MUI (Material-UI) v7
- @mui/x-date-pickers, @mui/x-date-pickers-pro
- dayjs
- Google Calendar API

## 注意点
- Google認証時、`https://www.googleapis.com/auth/calendar.readonly` のスコープが必要です
- 予定の前後10分はバッファとして空き枠から除外されます
- 30分単位で空き枠を計算します
- サブカレンダーも自動で合算されます

## 開発・コントリビュート
Pull Request・Issue歓迎です！

---

何か不明点があれば、[GitHubのIssue](https://github.com/yossy6028/calendar-gap-time/issues) までご連絡ください。 