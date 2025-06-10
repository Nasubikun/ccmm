# 5. Git操作ライブラリの実装

## 概要
ccmmプロジェクトにおけるGit操作のラッパー関数群（`src/git/index.ts`）を実装しました。
simple-gitとGitHub CLIを使用して、HEADコミット取得、ファイルフェッチ、プルリクエスト作成などの機能を提供します。

## 実装内容

### 主要な関数

#### 1. `getHeadSha(repoPath?: string)`
- リポジトリのHEADコミットハッシュを取得
- simple-gitの`revparse(['HEAD'])`を使用
- 現在のディレクトリまたは指定されたパスで動作

#### 2. `shallowFetch(pointer: PresetPointer, localPath: string)`
- リモートリポジトリから特定のファイルを特定のコミットで取得
- **二段階認証戦略**を採用：
  1. `gh api`コマンドで認証済み取得を試行（GitHub CLI認証活用）
  2. 失敗時は`curl`+`GITHUB_TOKEN`でフォールバック
- GitHub API経由でファイル内容を取得（base64デコード）
- Privateリポジトリにも対応（認証次第）

#### 3. `batchFetch(pointers: PresetPointer[], localPaths: string[])`
- 複数のプリセットファイルを一括で取得
- `Promise.all`を使用した並列処理
- エラーハンドリングとバリデーション

#### 4. `openPr(prInfo: PullRequestInfo)`
- GitHub CLIを使用してプルリクエストを作成
- 権限がない場合の自動フォーク機能
- PRのURLを返す

#### 5. その他のユーティリティ関数
- `isGitRepository()`: リポジトリの検証
- `getOriginUrl()`: originリモートURL取得
- `getBranches()`: ローカルブランチ一覧取得
- `createAndCheckoutBranch()`: ブランチ作成とチェックアウト

### 型定義

#### `PullRequestInfo`インターフェース
```typescript
export interface PullRequestInfo {
  title: string;     // PRのタイトル
  body: string;      // PRの本文
  branch: string;    // ブランチ名
  base?: string;     // ベースブランチ（デフォルト: main）
  owner: string;     // リポジトリの所有者
  repo: string;      // リポジトリ名
}
```

### エラーハンドリング
- 全ての関数でResult型を使用
- 外部コマンド（curl、gh）の実行エラーを適切にキャッチ
- GitHub API認証エラーの対応
- 権限不足時のフォーク処理

## テスト実装
`src/git/index.test.ts`で包括的なテストを実装:

### テスト項目
- **getHeadSha**: 正常取得、エラーハンドリング
- **shallowFetch**: gh認証取得、curlフォールバック、認証付きリクエスト、エラー処理
- **batchFetch**: 一括取得、パラメータ検証、部分失敗処理
- **openPr**: PR作成、フォーク処理、GitHub CLI利用不可時の処理
- **isGitRepository**: リポジトリ検証
- **getOriginUrl**: origin URL取得、リモート不存在時の処理
- **getBranches**: ブランチ一覧取得
- **createAndCheckoutBranch**: ブランチ作成とチェックアウト

### モック戦略
- `simple-git`をモック化してGit操作をシミュレート
- `child_process.exec`をモック化して外部コマンド実行をシミュレート
- 成功ケースとエラーケースの両方をテスト

## CLAUDE.mdの規約準拠

### コメント規約
- ファイル先頭に日本語でのspec説明コメントを配置
- 各関数に日本語での説明コメントを追加

### 技術選択
- 関数ベース実装（クラス回避）
- Result型を使用したエラーハンドリング
- simple-gitとGitHub CLIの活用

## 依存関係
- `simple-git`: Git操作
- `child_process`: 外部コマンド実行（curl、gh）
- `../lib/result.js`: Result型
- `../core/types/index.js`: 型定義

## 実行確認
- 全テスト（23個）が成功
- リンターチェック通過
- 既存テストへの影響なし（全58テスト成功）

## 認証戦略の詳細

### 認証優先順位
1. **GitHub CLI認証** (`gh auth login`済み): 
   - `gh api`経由でAPI認証を活用
   - Privateリポジトリにもアクセス可能
   - GitHub.com限定

2. **GITHUB_TOKEN環境変数**:
   - curlの認証ヘッダーで使用
   - GitHub Enterprise対応
   - Personal Access Tokenまたは GitHub Actions token

3. **認証なし**:
   - Publicリポジトリのみアクセス可能

### 動作パターン
- **`gh`認証済み + `GITHUB_TOKEN`なし**: ✅ gh経由でPrivate OK
- **`gh`未認証 + `GITHUB_TOKEN`あり**: ✅ curl経由でPrivate OK  
- **両方なし**: ✅ Public repositoryのみ

## 今後の拡張ポイント
1. GitHub Enterprise Serverサポート
2. 他のGitホスティングサービス（GitLab等）サポート
3. SSH鍵認証のサポート
4. より詳細なエラーメッセージ
5. プログレス表示機能

この実装により、ccmmの要件にあるGit操作機能の基盤が完成しました。