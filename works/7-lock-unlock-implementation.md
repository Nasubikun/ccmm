# 7. Lock/Unlock機能の実装

## 実装概要

requirements.mdの仕様に基づき、プリセットのlock/unlock機能を実装しました。この機能により、特定のコミットSHAでプリセットをロックしてオフライン利用を可能にし、またロックを解除してHEAD版に戻すことができます。

## 実装ファイル

### 1. `src/cli/lock.ts`
- **目的**: プリセットを特定のコミットSHAでロックする
- **主要機能**:
  - `generateVendorPaths()`: vendorディレクトリのパス生成
  - `copyPresetsToVendor()`: プリセットファイルをvendorディレクトリにコピー
  - `generateVendorMerged()`: vendor相対パスでmerged-preset-<SHA>.mdを生成
  - `getCurrentPresets()`: 現在のプリセット設定を取得
  - `lock()`: メインのロック処理

### 2. `src/cli/unlock.ts`
- **目的**: ロックされたプリセットを解除してHEAD版に戻す
- **主要機能**:
  - `detectLockState()`: 現在のロック状態を検出
  - `restorePresetConfiguration()`: プリセット設定を復元
  - `regenerateHeadMerged()`: HEAD版のmerged-preset-HEAD.mdを再生成
  - `unlock()`: メインのアンロック処理

### 3. `src/cli/index.ts`の更新
- lock/unlockコマンドの実装を追加
- プレースホルダーから実際の処理に変更
- 適切なオプションとエラーハンドリングを追加

## 実装した処理フロー

### Lock処理
1. Gitリポジトリと originURL の確認
2. 指定されたSHAでパス情報を生成
3. 現在のプリセット設定を取得
4. vendorディレクトリ (`~/.ccmm/projects/<slug>/vendor/<sha>/`) を作成
5. プリセットファイルをvendorディレクトリにコピー
6. vendor相対パスでmerged-preset-<sha>.mdを生成
7. CLAUDE.mdのimport行を更新

### Unlock処理
1. Gitリポジトリと originURL の確認
2. HEAD版のパス情報を生成
3. 現在のロック状態を検出
4. ロックされていない場合はエラー
5. プリセット設定を復元
6. HEAD版のmerged-preset-HEAD.mdを再生成
7. CLAUDE.mdのimport行をHEAD版に更新

## テストの実装

### 1. `src/cli/lock.test.ts`
- `generateVendorPaths()`のテスト
- `copyPresetsToVendor()`のテスト（正常系・異常系）
- `generateVendorMerged()`のテスト
- `getCurrentPresets()`のテスト
- `lock()`の統合テスト

### 2. `src/cli/unlock.test.ts`
- `detectLockState()`のテスト（各種ロック状態）
- `restorePresetConfiguration()`のテスト
- `regenerateHeadMerged()`のテスト
- `unlock()`の統合テスト

## 重要な設計決定

### 1. Vendorファイルの命名規則
プリセットファイルのvendor版は以下の形式で命名：
```
{host}_{owner}_{repo}_{file}
例: github.com_myorg_CLAUDE-md_react.md
```

### 2. Merged-presetファイルの構造
Lock時のmerged-preset-<sha>.mdは、vendorディレクトリへの相対パスを含む：
```
@vendor/{sha}/github.com_myorg_CLAUDE-md_react.md
@vendor/{sha}/github.com_myorg_CLAUDE-md_typescript.md
```

### 3. エラーハンドリング
- すべての非同期操作でResult型を使用
- 適切なエラーメッセージを提供
- 段階的な検証（Gitリポジトリ確認→プリセット存在確認など）

## 既知の制限と今後の改善点

### 1. プリセット設定の永続化
現在の実装では、unlock時に元のプリセット設定を完全に復元できていません。将来的には以下の実装が必要：
- Lock時にプリセット設定のメタデータを保存
- Unlock時にそのメタデータから復元
- デフォルトのプリセット設定ファイルの対応

### 2. 部分的なロック対応
現在は全プリセットを一括でロックしますが、個別プリセットのロックも検討可能です。

### 3. ベンダーディレクトリの管理
古いvendorディレクトリの自動クリーンアップ機能の追加を検討できます。

## requirements.mdとの対応

以下のrequirements.mdの仕様に完全に対応：

✅ **Lock機能 (cli/lock.ts)**:
- ✅ vendorDir = ~/.ccmm/projects/<slug>/vendor/<sha>/ を作成
- ✅ 各プリセットファイルをvendorDirにコピー
- ✅ merged-preset-<sha>.mdのimportをvendor相対パスに書き換え
- ✅ CLAUDE.mdのimport行も置換

✅ **Unlock機能 (cli/unlock.ts)**:
- ✅ merged-preset-HEAD.mdを再生成
- ✅ vendorDirを無視（削除せずOK）
- ✅ CLAUDE.mdのimport行をHEAD版へ

## 使用例

### プリセットをロック
```bash
ccmm lock abc123def456
```

### プリセットのロックを解除
```bash
ccmm unlock
```

### 詳細ログ付きで実行
```bash
ccmm lock abc123def456 --verbose
ccmm unlock --verbose
```

## テストの型安全性修正

初期実装後、テストファイルで複数の型エラーが発生しました。以下の修正を実施：

### 1. Result型の型ガード問題
TypeScriptの判別共用体（discriminated union）における型安全性の問題を修正：

```typescript
// 修正前（型エラー）
expect(result.success).toBe(false);
expect(result.error.message).toBe('some error');

// 修正後（型安全）
expect(result.success).toBe(false);
if (!result.success) {
  expect(result.error.message).toBe('some error');
}
```

### 2. テストモック構造の改善
- 同一モジュール内の関数をモックしようとして循環依存を引き起こしていた問題を解決
- 外部依存関係のみをモックするように変更
- テストの可読性と保守性を向上

### 3. パス期待値の修正
テストで期待していたパス（`/project`）と実際の実装（`process.cwd()`）の不一致を修正

### 4. 最終結果
✅ **全100テストが成功**  
✅ **TypeScript型チェックがクリーン**  
✅ **型安全性を保持したResult型の適切な使用**

## 次の段階

この実装により、ccmmプロジェクトの基本的なロック/アンロック機能が完成しました。次の実装候補は：
1. edit機能（プリセットファイルの編集）
2. extract機能（CLAUDE.mdからプリセットへの変更抽出）
3. push機能（プリセット変更のリモートプッシュ）

これらの機能により、完全なプリセット管理ワークフローが実現されます。