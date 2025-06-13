# GitHub API E2Eテスト実装

## 概要
ccmmツールの実際のGitHub APIを使用したE2E（End-to-End）テストを実装しました。これにより、リアルな環境での動作確認が可能になりました。

## 実装内容

### 1. E2Eテストヘルパー関数（tests/e2e/helpers/github-api.ts）
- GitHub CLI認証状態チェック
- テスト用の一意ID生成
- E2Eテストコンテキスト作成
- GitHub APIレート制限チェック
- テスト環境の前提条件チェック
- テスト後のクリーンアップ処理

### 2. E2Eテストスイート（tests/e2e/github-api.test.ts）
3段階のテストレベルを実装：

#### Level 1: Read-only operations
- プリセットファイルの取得（shallowFetch）テスト
- 実際のGitHub APIを使用してファイルを取得

#### Level 2: Fork-based operations  
- リポジトリのフォークとブランチ作成テスト
- pushコマンドのドライランモード検証

#### Level 3: Full workflow（通常はスキップ）
- 完全なワークフロー（edit → push → PR作成）
- 実際のPRを作成するため、必要時のみ実行

#### Error handling
- 存在しないリポジトリへのアクセス
- 認証エラーハンドリング

### 3. syncコマンドの改善
syncコマンドがGitリポジトリでないディレクトリでも動作するように修正：
- `validateAndSetupProject`関数を更新
- `makeSlugFromPath`関数を追加（ローカルプロジェクト用）

## 実行方法

### 前提条件
1. GitHub CLI認証済み（`gh auth status`で確認）
2. CLAUDE-mdリポジトリへのアクセス権限
3. プロジェクトのビルド済み（`npm run build`）

### テスト実行
```bash
# E2Eテストを実行
npx vitest run tests/e2e/github-api.test.ts

# 詳細レポート付きで実行
npx vitest run tests/e2e/github-api.test.ts --reporter=verbose
```

## 設計のポイント

### 1. 段階的テスト
- Read-only → Fork-based → Full workflowの順に複雑度を上げる
- 破壊的操作は最小限に抑える

### 2. 環境の分離
- 一時ディレクトリを使用してテスト環境を分離
- テスト終了後は確実にクリーンアップ

### 3. 一意性の保証
- タイムスタンプとランダム文字列でテストデータを一意化
- 並行実行時の競合を回避

### 4. エラーハンドリング
- GitHub API認証エラー
- レート制限
- ネットワークエラー

## 今後の拡張案
1. テスト用の専用リポジトリを用意
2. CI/CD環境での自動実行
3. より詳細なアサーション追加
4. パフォーマンステストの追加

## 学んだこと
- GitHub CLIを活用することで認証処理が簡潔に
- E2Eテストでは環境の前提条件チェックが重要
- 実際のAPIを使用するため、適切なクリーンアップが必須
- Gitリポジトリでなくても動作する柔軟な設計が重要