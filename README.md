# ChunBall Remix

Grok Build向けに分離した独立版です。現行ChunBallのGit履歴・本番設定・保存領域は引き継ぎません。

## 開発と検証

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5201 --strictPort
npm run build
npm test
```

静的出力は `dist/`。Service Workerのオフライン機能は開発サーバーではなく、ビルド後のpreviewまたはHTTPS配信で確認します。

元版との決定論的比較を行う場合のみ、読み取り専用の元版ディレクトリを指定します。

```sh
BASELINE_ROOT=/path/to/original npm test
```

## 分離方針

- 維持：下水道、フリー、完全フリー、洗濯機。ギア、ベルト、搬送負荷、摩擦駆動、操作系。
- 除外：コンバインのステージ・機械・描画・専用入口・専用保存情報・専用キャッシュ。
- 元版で全ステージに作用していた反発補正のみ、承認済みの機械非依存な互換接触領域として維持しています（`src/contactCompatibility.ts`）。
- 保存v1〜v3の非コンバイン配置を扱います。保存キーは `chunball.remix.save.slot.*` に分離し、元版データを読み取り・移行・削除しません。
- PWAキャッシュは `chunball-remix-*` のみを削除対象とします。本番版と同じオリジン・同じService Workerスコープへ配信しないでください。

## 新規GitHubリポジトリ作成前

元版とは独立した初回コミットから履歴を開始します。元版のremoteやCloudflareプロジェクトは引き継ぎません。
公開・第三者Remixを許諾するライセンスを所有者が決定し、素材・コードの権利を確認してから公開してください。
`node_modules/`、`dist/`、`.env*`、ログはコミット対象外です。

Grok Buildへの取り込み、Remix公開、GitHub連携は未実施です。取り込み先がVite/TypeScript構成を受け付けることと、その時点の公開条件を確認してから進めてください。
既存依存バージョンは互換性優先で維持しています。公開前に依存脆弱性の別途確認が必要です。

元版基準：`b2f00f121d7aac8c6a47cfd73a6164de9d2ddde9`。
既知事項：64個密集時のFPSによる結果差は継承しています。Safari/iPad実機の分離版検証とGrok上の動作確認は別途必要です。
