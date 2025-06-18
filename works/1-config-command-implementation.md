# ccmm config コマンドの実装

## 概要
`ccmm init`で設定した接続先リポジトリのリストを後から編集する機能を実装しました。

## 実装内容

### 新規ファイル
- `src/cli/config.ts` - configコマンドの実装
- `src/cli/config.test.ts` - configコマンドのユニットテスト

### 変更ファイル
- `src/cli/index.ts` - configコマンドの登録

## コマンド構成

### ccmm config list (alias: ls)
現在設定されているプリセットリポジトリの一覧を表示します。

```bash
$ ccmm config list
Configured preset repositories:
  1. github.com/org1/repo1
  2. github.com/org2/repo2
```

### ccmm config add [repository]
新しいプリセットリポジトリを追加します。

```bash
# 引数で指定
$ ccmm config add github.com/myorg/CLAUDE-md

# インタラクティブに入力
$ ccmm config add
? Enter the repository URL (e.g., github.com/owner/repo): github.com/myorg/CLAUDE-md
✓ Added repository: github.com/myorg/CLAUDE-md
```

### ccmm config remove [repository] (alias: rm)
既存のプリセットリポジトリを削除します。

```bash
# 引数で指定
$ ccmm config remove github.com/org1/repo1
? Are you sure you want to remove "github.com/org1/repo1"? (y/N) y
✓ Removed repository: github.com/org1/repo1

# 選択式で削除
$ ccmm config remove
? Select a repository to remove: (Use arrow keys)
❯ github.com/org1/repo1
  github.com/org2/repo2
```

## 実装の詳細

### バリデーション
- リポジトリのフォーマットは `github.com/owner/repo` の形式のみ許可
- 既に登録済みのリポジトリは追加できない
- 存在しないリポジトリは削除できない

### エラーハンドリング
- Result型を使用した型安全なエラーハンドリング
- 適切なエラーメッセージの表示

### テスト
- 各サブコマンドの動作を網羅的にテスト
- モックを使用したインタラクティブUIのテスト
- エラーケースのテスト

## 使用例

```bash
# 初期設定後にリポジトリを追加
$ ccmm config add github.com/company/shared-presets
✓ Added repository: github.com/company/shared-presets

# 不要になったリポジトリを削除
$ ccmm config remove github.com/old-org/deprecated
✓ Removed repository: github.com/old-org/deprecated

# 現在の設定を確認
$ ccmm config list
Configured preset repositories:
  1. github.com/myorg/CLAUDE-md
  2. github.com/company/shared-presets
```