# ccmm リファクタリング提案書

## 概要

ccmmコードベースの分析を行い、以下の観点から改善点を特定しました：
- コードの重複
- 責任の分離
- エラーハンドリングの一貫性
- モジュール間の依存関係
- 共通化可能な処理

## 1. 特定された主要な問題点

### 1.1 コードの重複

#### a) プリセットパス構築の重複
```typescript
// src/cli/edit.ts
export function buildPresetPath(
  preset: string,
  owner: string,
  repo: string = "CLAUDE-md",
  host: string = "github.com"
): string {
  const homeDir = homedir();
  return join(homeDir, ".ccmm", "presets", host, owner, repo, preset);
}

// src/cli/push.ts
export function buildPresetPath(
  preset: string,
  owner: string,
  repo: string = "CLAUDE-md",
  host: string = "github.com"
): string {
  const homeDir = homedir();
  return join(homeDir, ".ccmm", "presets", host, owner, repo, preset);
}
```

#### b) Git操作の重複パターン
```typescript
// 複数のCLIコマンドで同様のパターン
const projectRoot = process.cwd();
const isGitResult = await isGitRepository(projectRoot);
if (!isGitResult.success || !isGitResult.data) {
  return Err(new Error("現在のディレクトリはGitリポジトリではありません"));
}
```

#### c) エラーハンドリングの重複
```typescript
// try-catch と Result 型の混在使用
try {
  // 処理
} catch (error) {
  return Err(error instanceof Error ? error : new Error(String(error)));
}
```

### 1.2 責任分離の問題

#### a) CLI層でのビジネスロジック実装
- `sync.ts`、`lock.ts`、`extract.ts` などのCLIコマンドファイルに、本来コア層で実装すべきビジネスロジックが混在
- 例：`parseCLAUDEMd`、`generateProjectPaths` などは core 層に移動すべき

#### b) ファイルシステム操作の分散
- `fs.ts` にファイル操作の基本機能があるが、各CLIコマンドで直接 `node:fs` を使用している箇所が存在
- 例：`push.ts` での `copyFile` の直接使用

### 1.3 エラーハンドリングの一貫性欠如

#### a) Result型の不完全な使用
- `lib/result.ts` があるにも関わらず、一部でtry-catchのみの実装
- エラーメッセージの形式が統一されていない

#### b) エラーメッセージの国際化
- 日本語と英語のエラーメッセージが混在

### 1.4 モジュール構造の問題

#### a) 循環依存の可能性
- CLI層からcore層、core層から他のCLI関数への依存

#### b) 不明確な責任範囲
- `git/index.ts` にGit操作とGitHub API操作が混在

## 2. リファクタリング提案

### 2.1 優先度：高 - 即座に対応すべき項目

#### 提案1: 共通ユーティリティ層の作成
**影響範囲**: 全体
**作業量**: 中

```typescript
// src/core/preset-path.ts
/**
 * プリセット関連のパス操作を統一的に扱うユーティリティ
 */
export function buildPresetPath(...) { }
export function parsePresetPath(...) { }
export function getPresetHome() { }
```

#### 提案2: CLI共通処理の抽出
**影響範囲**: CLI層
**作業量**: 小

```typescript
// src/cli/common.ts
/**
 * CLI コマンド共通の初期化処理
 */
export async function initializeGitContext(projectRoot: string) {
  const isGitResult = await isGitRepository(projectRoot);
  if (!isGitResult.success || !isGitResult.data) {
    return Err(new Error("現在のディレクトリはGitリポジトリではありません"));
  }
  
  const originResult = await getOriginUrl(projectRoot);
  if (!originResult.success) {
    return Err(new Error(`originURLを取得できませんでした: ${originResult.error.message}`));
  }
  
  return Ok({ projectRoot, originUrl: originResult.data });
}
```

#### 提案3: ビジネスロジックのcore層への移動
**影響範囲**: sync.ts、lock.ts
**作業量**: 大

```typescript
// src/core/claude-md.ts
export function parseCLAUDEMd(...) { }
export function generateProjectPaths(...) { }
export function updateClaudeMd(...) { }

// src/core/preset.ts
export function fetchPresets(...) { }
export function generateMerged(...) { }
```

### 2.2 優先度：中 - 計画的に対応すべき項目

#### 提案4: エラーハンドリングの統一
**影響範囲**: 全体
**作業量**: 中

```typescript
// src/lib/errors.ts
export class CcmmError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

export const ErrorCodes = {
  NOT_GIT_REPO: 'NOT_GIT_REPO',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  // ...
} as const;

// src/lib/error-messages.ts
export const ErrorMessages = {
  [ErrorCodes.NOT_GIT_REPO]: {
    ja: '現在のディレクトリはGitリポジトリではありません',
    en: 'Current directory is not a Git repository'
  },
  // ...
};
```

#### 提案5: Git操作の責任分離
**影響範囲**: git/index.ts
**作業量**: 中

```typescript
// src/git/repository.ts - ローカルGit操作
// src/git/github.ts - GitHub API操作
// src/git/fetch.ts - リモートフェッチ操作
```

### 2.3 優先度：低 - 長期的に改善すべき項目

#### 提案6: テストの共通化
**影響範囲**: テストファイル
**作業量**: 小

```typescript
// tests/helpers/test-utils.ts
export function createTestRepository() { }
export function mockGitOperations() { }
export function assertResult<T>(result: Result<T, Error>, expected: T) { }
```

#### 提案7: 設定管理の統一
**影響範囲**: init.ts、その他設定読み込み箇所
**作業量**: 中

```typescript
// src/core/config.ts
export class ConfigManager {
  private static instance: ConfigManager;
  
  static getInstance(): ConfigManager { }
  load(): Result<Config, Error> { }
  save(config: Config): Result<void, Error> { }
}
```

## 3. 実装順序の提案

1. **第1フェーズ**（1週間）
   - 共通ユーティリティ層の作成
   - CLI共通処理の抽出
   - 既存テストの動作確認

2. **第2フェーズ**（2週間）
   - ビジネスロジックのcore層への移動
   - エラーハンドリングの統一
   - 移動した機能のテスト追加

3. **第3フェーズ**（1週間）
   - Git操作の責任分離
   - 設定管理の統一
   - 全体的な整合性確認

## 4. リスクと対策

### リスク1: 既存機能の破壊
**対策**: 
- 各フェーズごとに全テストを実行
- リファクタリング前にテストカバレッジを向上

### リスク2: APIの変更による影響
**対策**:
- 内部実装の変更に留め、公開APIは維持
- 必要に応じて移行用のラッパー関数を提供

## 5. 期待される効果

1. **保守性の向上**
   - コードの重複削減により、バグ修正が一箇所で済む
   - 責任の明確化により、変更箇所が特定しやすくなる

2. **拡張性の向上**
   - 新しいプリセットソースの追加が容易に
   - 新しいCLIコマンドの追加時の定型処理が削減

3. **テスタビリティの向上**
   - ビジネスロジックが分離されることで単体テストが書きやすくなる
   - モックの作成が容易に

4. **開発効率の向上**
   - 共通処理の再利用により、新機能開発が高速化
   - エラーハンドリングの統一により、デバッグが容易に

## まとめ

本提案では、ccmmコードベースの品質向上のための具体的なリファクタリング手法を提示しました。優先度に基づいた段階的な実装により、リスクを最小限に抑えながら、保守性・拡張性・テスタビリティの向上を実現できます。

特に重要なのは、コードの重複を削減し、各モジュールの責任を明確にすることです。これにより、将来的な機能追加や変更が容易になり、開発効率が大幅に向上することが期待されます。