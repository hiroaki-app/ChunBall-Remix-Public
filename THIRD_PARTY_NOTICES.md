# 第三者コンポーネントの確認記録（草案）

package-lock.jsonのメタデータと、このMacにインストールされている配布物のLICENSE/NOTICEを確認しました。
本体のMITライセンスへの変更によって第三者コードを再ライセンスしません。第三者コードにはそれぞれのライセンスが優先し、既存の著作権・許諾・NOTICE等の表示を保持します。

## 依存関係

現行package.jsonは開発依存としてViteとTypeScriptを指定し、実行時依存の指定はありません。
ただしViteの生成ヘルパーや配布形式に第三者コードが含まれる可能性を含め、配布物ごとに権利表示を保持してください。

| lockfile上のパッケージ | バージョン | 宣言ライセンス |
| --- | --- | --- |
| @esbuild/aix-ppc64 | 0.25.12 | MIT |
| @esbuild/android-arm | 0.25.12 | MIT |
| @esbuild/android-arm64 | 0.25.12 | MIT |
| @esbuild/android-x64 | 0.25.12 | MIT |
| @esbuild/darwin-arm64 | 0.25.12 | MIT |
| @esbuild/darwin-x64 | 0.25.12 | MIT |
| @esbuild/freebsd-arm64 | 0.25.12 | MIT |
| @esbuild/freebsd-x64 | 0.25.12 | MIT |
| @esbuild/linux-arm | 0.25.12 | MIT |
| @esbuild/linux-arm64 | 0.25.12 | MIT |
| @esbuild/linux-ia32 | 0.25.12 | MIT |
| @esbuild/linux-loong64 | 0.25.12 | MIT |
| @esbuild/linux-mips64el | 0.25.12 | MIT |
| @esbuild/linux-ppc64 | 0.25.12 | MIT |
| @esbuild/linux-riscv64 | 0.25.12 | MIT |
| @esbuild/linux-s390x | 0.25.12 | MIT |
| @esbuild/linux-x64 | 0.25.12 | MIT |
| @esbuild/netbsd-arm64 | 0.25.12 | MIT |
| @esbuild/netbsd-x64 | 0.25.12 | MIT |
| @esbuild/openbsd-arm64 | 0.25.12 | MIT |
| @esbuild/openbsd-x64 | 0.25.12 | MIT |
| @esbuild/openharmony-arm64 | 0.25.12 | MIT |
| @esbuild/sunos-x64 | 0.25.12 | MIT |
| @esbuild/win32-arm64 | 0.25.12 | MIT |
| @esbuild/win32-ia32 | 0.25.12 | MIT |
| @esbuild/win32-x64 | 0.25.12 | MIT |
| @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT |
| @rollup/rollup-android-arm-eabi | 4.63.1 | MIT |
| @rollup/rollup-android-arm64 | 4.63.1 | MIT |
| @rollup/rollup-darwin-arm64 | 4.63.1 | MIT |
| @rollup/rollup-darwin-x64 | 4.63.1 | MIT |
| @rollup/rollup-freebsd-arm64 | 4.63.1 | MIT |
| @rollup/rollup-freebsd-x64 | 4.63.1 | MIT |
| @rollup/rollup-linux-arm-gnueabihf | 4.63.1 | MIT |
| @rollup/rollup-linux-arm-musleabihf | 4.63.1 | MIT |
| @rollup/rollup-linux-arm64-gnu | 4.63.1 | MIT |
| @rollup/rollup-linux-arm64-musl | 4.63.1 | MIT |
| @rollup/rollup-linux-loong64-gnu | 4.63.1 | MIT |
| @rollup/rollup-linux-loong64-musl | 4.63.1 | MIT |
| @rollup/rollup-linux-ppc64-gnu | 4.63.1 | MIT |
| @rollup/rollup-linux-ppc64-musl | 4.63.1 | MIT |
| @rollup/rollup-linux-riscv64-gnu | 4.63.1 | MIT |
| @rollup/rollup-linux-riscv64-musl | 4.63.1 | MIT |
| @rollup/rollup-linux-s390x-gnu | 4.63.1 | MIT |
| @rollup/rollup-linux-x64-gnu | 4.63.1 | MIT |
| @rollup/rollup-linux-x64-musl | 4.63.1 | MIT |
| @rollup/rollup-openbsd-x64 | 4.63.1 | MIT |
| @rollup/rollup-openharmony-arm64 | 4.63.1 | MIT |
| @rollup/rollup-win32-arm64-msvc | 4.63.1 | MIT |
| @rollup/rollup-win32-ia32-msvc | 4.63.1 | MIT |
| @rollup/rollup-win32-x64-gnu | 4.63.1 | MIT |
| @rollup/rollup-win32-x64-msvc | 4.63.1 | MIT |
| @types/estree | 1.0.9 | MIT |
| esbuild | 0.25.12 | MIT |
| fdir | 6.5.0 | MIT |
| fsevents | 2.3.3 | MIT |
| nanoid | 3.3.18 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| postcss | 8.5.28 | MIT |
| rollup | 4.63.1 | MIT |
| source-map-js | 1.2.2 | BSD-3-Clause |
| tinyglobby | 0.2.17 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 6.4.5 | MIT |

MIT/ISC/BSD系では著作権・許諾・免責等の表示を保持してください。
Apache-2.0では同ライセンスの条件とNOTICE等を確認してください。
Vite/RollupのLICENSEには同梱ライブラリの別個の表示、TypeScriptにはThirdPartyNoticeTextが含まれます。
パッケージのトップレベルの宣言だけで全内包コードの条件が同一だとは扱っていません。
確認できた配布物の原文をthird-party-licenses/へ複製しました。依存本体はnpm ciで取得します。
他OS向けの任意ネイティブパッケージはlockfileの宣言確認であり、そのバイナリを全て個別監査したものではありません。

## 素材と残る確認

追跡ファイルに画像・音声・フォント等の独立した静的素材はなく、Canvas図形とPWAアイコンはコードで生成しています。
製品ソース内に外部素材取得URLは見つかっていません。これは素材・コードの制作来歴や権利帰属の法的保証ではありません。
寄稿・参考素材・生成AIの利用履歴と、許諾権限を持つ権利者を所有者に確認する必要があります。
依存のセキュリティ監査とは別の確認です。この作業で依存更新は行っていません。
