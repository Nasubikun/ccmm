# 23. 高優先度リファクタリング実装

## 概要

requirements.md と purpose.md の要件に基づき、コードベース全体の深い分析を行い、不要な実装と重複コードの削除、モジュール間責任境界の明確化を実施しました。

## 分析結果

### 🔴 高優先度問題の特定

1. **重複関数の統合**
   - `cli/edit.ts:25` と `cli/push.ts:83` の `buildPresetPath` 関数が重複
   - `cli/push.ts` に `parsePresetPath`, `hasContentDiff` も重複

2. **CLIエラーハンドリングの重複**
   - `cli/index.ts:31-50` の `showError/showSuccess/showInfo` 関数
   - 各コマンドで同一のtry-catchパターンが重複（66-87行、96-114行等）

3. **Git前処理ロジックの重複**
   - `sync.ts:356-375`, `lock.ts:237-254`, `unlock.ts:188-204` で同一パターン
   ```typescript
   // 重複パターン:
   const isGitResult = await isGitRepository(projectRoot);
   const originResult = await getOriginUrl(projectRoot);
   const pathsResult = generateProjectPaths(projectRoot, originResult.data, commit);
   ```

## 実装したリファクタリング

### 1. プリセット関数統合 (`core/preset.ts`)

```typescript
/**
 * プリセット管理の共通ユーティリティ関数群
 */
export function buildPresetPath(
  preset: string,
  owner: string,
  repo: string = "CLAUDE-md",
  host: string = "github.com"
): string {
  const homeDir = homedir();
  return join(homeDir, ".ccmm", "presets", host, owner, repo, preset);
}

export function parsePresetPath(presetPath: string): Result<PresetPointer, Error> {
  // 統合されたパース処理
}

export function hasContentDiff(content1: string, content2: string): boolean {
  // 統合された差分比較
}

export async function ensurePresetFile(filePath: string): Promise<Result<void, Error>> {
  // 統合されたファイル作成処理
}
```

**変更ファイル:**
- `cli/edit.ts` - 重複関数削除、新しいimport追加
- `cli/push.ts` - 重複関数削除、新しいimport追加
- `cli/extract.ts` - import修正
- `cli/push.test.ts` - import修正
- `cli/edit.test.ts` - import修正

### 2. CLI共通ユーティリティ (`cli/common.ts`)

```typescript
/**
 * CLI共通ユーティリティ関数群
 */
export function showError(message: string, error?: Error): void {
  console.error(chalk.red("✗ Error:"), message);
  if (error && process.env.DEBUG) {
    console.error(chalk.gray(error.stack));
  }
}

export async function executeCommand<T extends CommonCliOptions>(
  commandName: string,
  commandFn: (options: T) => Promise<Result<void, Error>> | Promise<CommandResult>,
  options: T
): Promise<never> {
  // 統一されたコマンド実行とエラーハンドリング
}

export function setupProcessHandlers(): void {
  // グローバルエラーハンドリング設定
}
```

**変更ファイル:**
- `cli/index.ts` - 重複関数削除、新しい共通関数使用

### 3. Git前処理統合 (`core/project.ts`)

```typescript
/**
 * プロジェクト管理とGit前処理の共通ユーティリティ関数群
 */
export async function validateAndSetupProject(
  projectRoot: string = process.cwd(), 
  commit: string = "HEAD"
): Promise<Result<ProjectSetupResult, Error>> {
  // 1. Gitリポジトリの確認
  const isGitResult = await isGitRepository(projectRoot);
  if (!isGitResult.success || !isGitResult.data) {
    return Err(new Error("現在のディレクトリはGitリポジトリではありません"));
  }
  
  // 2. originURLを取得
  const originResult = await getOriginUrl(projectRoot);
  if (!originResult.success) {
    return Err(new Error(`originURLを取得できませんでした: ${originResult.error.message}`));
  }
  
  // 3. プロジェクトスラッグを生成
  const slug = makeSlug(originResult.data);
  
  // 4. パス情報を生成
  const pathsResult = generateProjectPaths(projectRoot, originResult.data, commit);
  if (!pathsResult.success) {
    return Err(pathsResult.error);
  }
  
  return Ok({
    projectRoot,
    originUrl: originResult.data,
    slug,
    paths: pathsResult.data
  });
}
```

**変更ファイル:**
- `cli/sync.ts` - 前処理ロジック置換
- `cli/lock.ts` - 前処理ロジック置換  
- `cli/unlock.ts` - 前処理ロジック置換

## 成果

### 量的改善
- **コード行数削減**: 約150行（重複コード除去）
- **重複関数削除**: 8個の重複関数を統合
- **共通モジュール作成**: 3個の新モジュール

### 質的改善
- ✅ **責任境界の明確化**: preset, CLI, project 機能の分離
- ✅ **保守性向上**: 一箇所変更で全体に影響する仕組み
- ✅ **テスタビリティ向上**: 共通機能の独立テストが可能
- ✅ **一貫性向上**: エラーハンドリングとメッセージ表示の統一

### アーキテクチャ改善
```
Before:
cli/edit.ts    ←→ cli/push.ts    (重複あり)
cli/sync.ts   ←→ cli/lock.ts     (重複あり)
cli/index.ts  (重複エラーハンドリング)

After:
                core/preset.ts   (統合)
              ↗              ↖
cli/edit.ts                    cli/push.ts
              ↘              ↗
                core/project.ts (統合)
              ↗              ↖
cli/sync.ts                    cli/lock.ts
              ↘              ↗
                cli/common.ts   (統合)
                      ↑
                cli/index.ts
```

## テスト結果

```
✓ Test Files  15 passed (15)
✓ Tests  172 passed (172)
✓ Duration  5.80s

全172テストが通過し、機能の完全性を保持
```

## 今後の改善提案

### 中優先度（将来実装推奨）
1. **プリセット設定復元の統合**
   - `sync.ts:390-430` と `unlock.ts:96-127` の config.json 読み込み処理統合
   - → `core/config.ts` に設定管理機能を集約

2. **Git差分解析の分離**
   - `extract.ts:64-136` の Git diff 解析は複雑すぎ
   - → `core/diff.ts` に Git差分処理を分離

3. **UI関連の分離**
   - `extract.ts:179-283` のinquirer処理がCLI層に散在
   - → `ui/prompts.ts` に対話型UI機能を集約

## まとめ

requirements.md と purpose.md の要件に沿って、Claude Code プリセット管理ツールとしての保守性と一貫性を大幅に向上させました。特に重複コード排除とモジュール責任境界の明確化により、将来的な機能拡張とメンテナンスが容易になりました。