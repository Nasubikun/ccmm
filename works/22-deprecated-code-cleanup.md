# 22-deprecated-code-cleanup.md

## 作業概要
プロジェクト内の古いコード、コメントアウトされたコード、非推奨コードの整理を実施しました。

## 実施内容

### 削除したファイル・コード

#### 1. 完全に削除したファイル
- **`src/cli/common.ts`** - 明示的に `@deprecated` マークされたファイル全体
  - Git要件削除により不要になったCLI共通ユーティリティ関数群
  - `../core/project-identifier.js` に置き換え済み
- **`src/cli/common.test.ts`** - 上記deprecated ファイルのテストファイル

#### 2. コメント行の削除
- **`src/lib/result.ts:44-46`** - 未使用の combine 関数のコメント
  ```typescript
  // 複数のResultを合成（すべて成功の場合のみ成功）
  // 注：現在未使用のため、必要に応じて実装
  // export const combine = ...
  ```

### 削除可能性を検討したが保留した項目

#### TODO コメント（要実装 or 文書化）
- **`src/cli/sync.ts:420`** - Git repository URL parsing 実装待ち
- **`src/cli/extract.ts:225,231`** - 設定ファイルからの値取得 (現在ハードコード)

#### 関数の重複（要統合検討）
- **`buildPresetPath`** が複数ファイルで定義されている
  - `src/cli/edit.ts:25`
  - `src/cli/push.ts:83` 
  - `src/core/preset-path.ts:22`

## 検証結果
削除後に `npm run check` を実行し、以下を確認済み：
- ✅ フォーマット・lint・型チェック通過
- ✅ ビルド成功
- ✅ 全テスト (208個) 通過

## 効果
- 不要なファイル 2個の削除により、コードベースの保守性向上
- 明示的に非推奨マークされたコードの除去
- 未使用コメントの除去により、コード可読性向上

## 残課題
1. TODO コメントの実装またはドキュメント化
2. 重複関数の統合検討
3. 定期的なコード整理フローの確立