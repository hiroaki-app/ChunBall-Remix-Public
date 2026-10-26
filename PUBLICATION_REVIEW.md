# MIT公開前の確認事項

## 確定した方針

- 商用制限付き独自ライセンス案は不採用。標準MITライセンス本文へ差し替え。
- 著作権表示はユーザー指定の `Copyright (c) 2026 hiroaki-app` で確定。LICENSEへ反映済み。
- 著作権は保持し、個人利用・改造・再配布・商用利用・別アプリへの利用を許可。
- MITが求める著作権表示と許諾文の保持を求める。作品名表示・本家リンクは別途の義務にしない。
- 改造版・ソースの公開義務は設けない。学校・授業・プログラミング教室での利用・改造を歓迎。
- Xの #ChunBall は任意の案内であり、利用条件ではない。
- 広告/寄付/有料配布や独立アプリの分類について、旧案の事前許可制は設けない。

## 残る確認事項

最終点検で見つかった項目、匿名化・脆弱性修正、新しいPrivateの `hiroaki-app/ChunBall-Remix-Public` への移行方針は [PUBLICATION_AUDIT.md](PUBLICATION_AUDIT.md) を参照してください。既存Privateとバックアップは保持し、旧リモート履歴は置き換えません。新Privateも公開承認までPrivateを維持します。

1. 所有者が許諾権限を持つ範囲、共同制作者・寄稿者・素材・生成AIの制作来歴を確認する。
2. THIRD_PARTY_NOTICES.mdとthird-party-licenses/を保持する。MITへの変更で第三者の別ライセンスやNOTICEを消さない。
3. 他OS向けの任意バイナリ等はlockfileのライセンス宣言確認であり、全配布物の個別監査ではない。
4. **Grok版の「利用について」は旧方針のまま（ユーザー報告）。公開前にMIT方針へ変更する必要がある。今回はGrok側を編集しない。**
5. 既存の配布ZIP等には今回の文書更新は自動反映されない。次に配布する際はLICENSE・README・一覧/チェックサムを更新する。
6. GitHub/Grok等のサービス規約による取扱いは、コードのMIT許諾とは別に確認する。現在のGrok配信内容を検証済みとは記載しない。

独自ライセンス案の許諾窓口・商用境界・独立アプリ境界・追加の表示義務・独自の違反手続は、採用条件から除外しました。
MIT本文に独自の追加条件や草案注記は挿入していません。著作権者名と年のプレースホルダーは解消済みです。

## 参照

- https://opensource.org/license/mit （標準MITライセンス本文）
- https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
- https://x.ai/legal/terms-of-service

この記録は権利帰属や個別の法的有効性の保証ではありません。
元のCloudflare版と本家リポジトリには変更を加えません。

## 今回の検証結果（2026-10-26）

- npm run build: 成功。
- npm test: 通常対象の24スクリプトすべて成功。BASELINE_ROOT未指定の元版比較はスキップ。
- MIT方針の文書チェック: 成功。LICENSE本文に独自の制限・追加条件なし。
- third-party-licenses/の13ファイルは変更前後のSHA-256が一致し、権利表示を保持。
- src/、scripts/、public/、依存・Vite設定に差分なし。
- 上記はMIT文書更新時の検証記録です。その後の履歴整理・依存修正・新Privateへの移行はPUBLICATION_AUDIT.mdと移行完了報告で区別して記録しています。旧履歴のforce-push・Public変更・Grok本番編集は行いません。
