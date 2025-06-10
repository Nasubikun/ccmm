# ccmm 実装意図

## 1. ディレクトリ構成の決定理由

### 採用した構成
```
src/
├── cli/         # コマンド実装 (commander.js)
├── core/        # 共通ロジック (types, slug, fs)
├── git/         # GitHub API & simple-git ラッパ
├── ui/          # inquirer など対話UI
└── lib/         # 既存のresult.tsなど共通ライブラリ
```

### 選定理由

1. **シンプルさを優先**
   - requirements.mdでは`packages/`によるmonorepo構成が提案されていたが、単一パッケージプロジェクトにはオーバーエンジニアリング
   - `src/`直下にモジュールを配置することで、import pathが簡潔になる

2. **既存資産の活用**
   - 既存の`src/lib/result.ts`を活かしつつ、新規モジュールを追加
   - CLAUDE.mdの指示に従い、Result型を使用したエラーハンドリングを全体で統一

3. **責務の明確な分離**
   - `cli/`: ユーザーインターフェース層（CLIコマンド）
   - `core/`: ビジネスロジック層（プリセット管理、ファイル操作）
   - `git/`: 外部サービス連携層（GitHub API、Git操作）
   - `ui/`: 対話的UI層（inquirer等）

4. **拡張性の確保**
   - 将来的にVS Code拡張を追加する場合は`src/vscode/`として追加可能
   - 各モジュールが独立しているため、必要に応じて別パッケージに切り出し可能

## 2. 実装方針

### コーディング規約（CLAUDE.mdより）
- 各ファイルの冒頭に日本語で仕様コメントを記載
- クラスを避け、関数ベースで実装
- `src/lib/result.ts`を使用してエラーハンドリング
- BiomeでLint/Format

### 実装順序
1. `core/types.ts` - 型定義
2. `core/slug.ts` - スラッグ生成
3. `core/fs.ts` - ファイル操作ユーティリティ
4. `git/index.ts` - Git/GitHub操作
5. `cli/sync.ts` - 最初のCLIコマンド
6. その他のCLIコマンド

### 技術選定
- TypeScript（ES2022、moduleResolution: node）
- commander.js - CLIフレームワーク
- inquirer - 対話的UI
- simple-git - Git操作
- chalk - ターミナル出力の装飾