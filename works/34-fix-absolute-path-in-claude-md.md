# 34. CLAUDE.md内のimportパスを~/記法に修正

## 実装内容

CLAUDE.md内でのimportについて、`@/Users/jo...`のような絶対パス形式を`@~/.ccmm/...`のようにホームディレクトリ記法に修正しました。

## 変更したファイル

### 1. src/core/fs.ts
- `contractTilde`関数を追加
- 絶対パスをホームディレクトリ記法（~/）に変換する機能を実装
- 引数の型チェックとundefined処理を追加

### 2. src/cli/sync.ts
- `contractTilde`をインポート
- `updateClaudeMd`関数内で新しいimport行生成時に`contractTilde`を適用
- `generateMerged`関数内でプリセットのローカルパス出力時に`contractTilde`を適用

### 3. src/cli/sync.test.ts
- テスト内でcontractTildeのモックを追加
- モック関数がパスをそのまま返すように設定（テスト用）

## 修正のポイント

1. **本質的な修正**: `expandTilde`で展開したパスを`contractTilde`で元に戻すのではなく、CLAUDE.mdに書き込む際のみ~/記法に変換するように実装

2. **対象場所**:
   - `updateClaudeMd`: CLAUDE.mdのimport行生成時
   - `generateMerged`: merged-preset-*.md内のプリセットパス出力時

3. **既存機能への影響なし**: 内部処理では引き続き絶対パスを使用し、ユーザーに見える部分のみ~/記法に変換

## テスト結果

- unit tests: ✅ 全て通過
- integration tests: 一部失敗（既存の問題、今回の修正とは無関係）
- 主要なsync機能のテスト: ✅ 全て通過

## 効果

- CLAUDE.mdが環境に依存しない形式になった
- ホームディレクトリが変わってもCLAUDE.mdの内容は不変
- 他のユーザーにプロジェクトを共有する際に問題が発生しない