# Matsuri Master

祭典・屋台向けのローカル完結 PWA です。商品、在庫、セット、営業回、コスト、売上履歴は IndexedDB に保存され、コード編集なしで App 内から変更できます。

## 開発起動

```powershell
cd C:\MatsuriMaster
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## iPad で PWA として使う

1. PC と iPad を同じ Wi-Fi に接続します。
2. PC の IP アドレスを確認し、iPad の Safari で `http://PCのIP:3000` を開きます。
3. Safari の共有ボタンから「ホーム画面に追加」を選びます。
4. 一度開いた後は IndexedDB に保存されたデータが残り、営業中の回も復元されます。

本番運用では `npm run build` 後に HTTPS 配信すると、iPad の PWA とオフライン動作がより安定します。

## App 内で変更できる内容

- 「メニュー・在庫」: 商品、価格、原価、在庫、警告在庫、セットルール
- 「コスト」: 固定費、仕入れ、消耗品、交通費、その他
- 「設定」: 営業回、売上目標、ピークモード、初期化
- 商品ボタン長押し: 現場での在庫調整

## 将来の拡張案

- Dexie Cloud、Supabase、Firebase などへ同期レイヤーを追加
- ユーザー権限、端末 ID、競合解決、監査ログを追加
- 営業終了時にクラウドへ CSV/PDF を自動保存
- 複数端末のリアルタイム注文共有には WebSocket または Realtime DB を追加
