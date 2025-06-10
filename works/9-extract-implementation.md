# 9. Extract コマンド実装

## 実装概要

CLAUDE.md から staged changes を検出し、インタラクティブに選択した行をプリセットファイルに抽出する機能を実装しました。

## 実装したファイル

### src/cli/extract.ts
- git diff --cached での staged changes 取得
- inquirer によるユーザーインタラクション
- プリセットファイルへの追記
- CLAUDE.md からの行削除
- edit コマンドの自動実行

### src/cli/extract.test.ts
- git diff パース機能のテスト
- ファイル操作のテスト
- プリセット選択機能のテスト

### src/cli/index.ts（更新）
- extract コマンドの追加
- ExtractOptions 型の import

## 主要機能

### 1. Staged Changes の検出
```typescript
export async function getStagedChanges(repoPath: string = process.cwd()): Promise<Result<DiffChange[], Error>>
```
- `git diff --cached -U0` で staged changes を取得
- CLAUDE.md ファイルの追加行のみを抽出

### 2. Git Diff のパース
```typescript
export function parseDiffOutput(diffOutput: string): Result<DiffChange[], Error>
```
- diff 出力から追加行（+で始まる行）を解析
- ファイルパス、行番号、内容を構造化

### 3. インタラクティブな選択
```typescript
export async function promptUserSelection(changes: DiffChange[]): Promise<Result<ExtractSelection, Error>>
```
- inquirer チェックボックスで抽出行を選択
- プリセット選択（react.md, typescript.md, カスタム）
- カスタムプリセットの場合は詳細入力

### 4. プリセットファイルへの追記
```typescript
export async function appendToPreset(selection: ExtractSelection): Promise<Result<string, Error>>
```
- 既存ファイルの内容読み取り
- 選択された行を適切な区切りで追記

### 5. CLAUDE.md からの行削除
```typescript
export async function removeFromClaudeMd(selectedLines: string[], claudeMdPath: string): Promise<Result<void, Error>>
```
- CLAUDE.md の構造（自由記述部分 + import行）を保持
- 選択された行のみを削除

### 6. 自動編集機能
- 抽出後にユーザーに確認してプリセットファイルをエディタで開く
- --yes オプションで自動実行

## 使用例

```bash
# 基本的な使用
ccmm extract

# 詳細ログ付き
ccmm extract --verbose

# 確認プロンプトをスキップ
ccmm extract --yes

# ドライランモード
ccmm extract --dry-run
```

## ワークフロー

1. **staged changes 検出**: CLAUDE.md の git add された変更を取得
2. **行選択**: チェックボックス UI で抽出する行を選択
3. **プリセット選択**: react.md, typescript.md, またはカスタムプリセットを選択
4. **抽出実行**: 
   - 選択行をプリセットファイルに追記
   - CLAUDE.md から該当行を削除
5. **編集**: 必要に応じてプリセットファイルをエディタで開く

## エラーハンドリング

- staged changes がない場合の適切なメッセージ
- ファイル操作失敗時のエラー処理
- ユーザー入力の検証
- git コマンド実行エラーの処理

## テストカバレッジ

- git diff パース機能: 11テスト
- ファイル操作: モック化してテスト
- エラーケースの処理
- 型安全性の確保（型アサーション回避）

## 仕様遵守

requirements.md の extract コマンド仕様を完全に実装:
- ✅ git diff --cached で staged changes 取得
- ✅ inquirer チェックボックス UI
- ✅ プリセットファイルへの追記
- ✅ CLAUDE.md からの行削除  
- ✅ edit サブコマンドへの自動ジャンプ

## 品質確認

- テスト: 126個のテストが全て通過
- 型チェック: TypeScript エラーなし
- リント: biome check 通過
- フォーマット: biome format 適用済み