# 13. push コマンドの実装

## 概要

pushコマンドは、ローカルで編集されたプリセットファイルの変更をアップストリームリポジトリに反映させる機能です。差分がある場合は、自動的にブランチを作成してプルリクエストを開きます。

## 実装したファイル

### 1. src/cli/push.ts
- **メイン機能**: push()
- **ユーティリティ関数**:
  - parsePresetPath(): プリセットファイルパスからPresetPointerを構築
  - buildPresetPath(): プリセット名からローカルファイルパスを構築
  - hasContentDiff(): ファイル内容の差分比較
  - fetchUpstreamContent(): アップストリームファイルの取得
  - generateBranchName(): 一意なブランチ名の生成
  - executeGitHubWorkflow(): GitHub連携ワークフローの実行
  - commitChanges(): Git コミットの作成
  - pushBranch(): ブランチのプッシュ

### 2. src/cli/push.test.ts
- 18個のテストケースを実装（5個は統合テスト向けにスキップ）
- parsePresetPath, buildPresetPath, hasContentDiff, generateBranchName のテスト
- push関数の基本的なバリデーションテスト

### 3. src/cli/index.ts への追加
- pushコマンドのCLI定義を追加
- Commander.jsパターンに従った実装

## 設計思想

### 差分ベースの自動判定
```typescript
// ローカルとアップストリームの内容を比較
const hasDiff = hasContentDiff(localContent, upstreamContent);
if (!hasDiff) {
  return Ok("変更がないため、プッシュする必要はありません");
}
```

### フォーク対応の GitHub 連携
```typescript
try {
  // 直接クローンを試行
  await execPromise(`git clone "${repoUrl}" "${tempDir}/repo"`);
} catch (cloneError) {
  // クローンに失敗した場合、フォークを試行
  await execPromise(`gh repo fork "${pointer.owner}/${pointer.repo}" --clone=false`);
}
```

### 一意なブランチ名生成
```typescript
export function generateBranchName(preset: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const safeName = preset.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/\.md$/, '');
  return `ccmm-update-${safeName}-${timestamp}`;
}
```

## 使用方法

### 基本的な使用法
```bash
ccmm push react.md --owner myorg
```

### カスタマイズされた使用法
```bash
ccmm push typescript.md --owner myorg --repo custom-presets \
  --title "Update TypeScript configuration" \
  --body "Added strict null checks and updated compiler options" \
  --branch "feature/typescript-update"
```

### ドライランでの確認
```bash
ccmm push vue.md --owner myorg --dry-run --verbose
```

## ワークフロー統合

pushコマンドは、requirements.mdで定義された以下のワークフローと統合されます：

1. **extract → edit → push フロー**
   ```bash
   echo "- Use strict TypeScript" >> CLAUDE.md
   git add CLAUDE.md
   ccmm extract              # 行をプリセットへ昇格
   ccmm edit react.md        # 直接修正
   ccmm push react.md        # PR 作成
   ```

2. **プリセット更新フロー**
   ```bash
   ccmm edit react.md --owner myorg    # プリセットを編集
   ccmm push react.md --owner myorg    # 変更をプッシュ
   ```

## GitHub連携の詳細

### 認証方法
1. GitHub CLI (`gh`) を優先使用
2. GITHUB_TOKEN 環境変数のフォールバック

### 権限がない場合の対応
1. リポジトリの自動フォーク (`gh repo fork`)
2. フォーク先からのプルリクエスト作成

### プルリクエストの自動作成
```typescript
const prInfo: PullRequestInfo = {
  title: options.title || `Update ${preset} via ccmm`,
  body: options.body || `ccmm経由で ${preset} プリセットファイルを更新しました。`,
  branch: branchName,
  owner: pointer.owner,
  repo: pointer.repo
};
```

## 一時ファイル管理

```typescript
const tempDir = join(homedir(), ".ccmm", "temp", `push-${Date.now()}`);
// 作業後のクリーンアップ
try {
  await execPromise(`rm -rf "${tempDir}"`);
} catch {
  // クリーンアップエラーは無視
}
```

## エラーハンドリング

- Result型による型安全なエラーハンドリング
- 詳細なエラーメッセージによるユーザビリティ向上
- 段階的なフォールバック処理

## テスト戦略

### 単体テスト
- ユーティリティ関数の詳細テスト
- エラーケースの網羅的テスト

### 統合テスト（今後）
- GitHub API との実際の連携テスト
- end-to-end ワークフローのテスト

## 今後の拡張ポイント

1. **バッチ処理**: 複数プリセットの一括プッシュ
2. **設定ファイル**: デフォルトリポジトリやPR テンプレートの設定
3. **レビュー統合**: プルリクエストレビューの自動依頼
4. **統計機能**: プッシュ頻度やマージ率の分析

## 実装の品質

- ✅ 155個のテストがパス
- ✅ TypeScript 型チェック完了
- ✅ Biome リント/フォーマット適用済み
- ✅ 既存機能への影響なし

pushコマンドの実装により、ccmmの core workflow である「extract → edit → push → lock」の最後のピースが完成しました。