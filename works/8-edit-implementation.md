# 8. Edit機能の実装

## 概要
プリセットファイルを$EDITORで編集する機能を実装しました。

## 実装内容

### src/cli/edit.ts
プリセットファイルの編集機能を実装：

1. **buildPresetPath**: プリセットファイルのパス構築
   - 形式: ~/.ccmm/presets/{host}/{owner}/{repo}/{preset}
   - デフォルト: github.com, CLAUDE-md リポジトリ

2. **ensurePresetFile**: ファイル存在確認と新規作成
   - ファイルが存在しない場合、親ディレクトリを作成
   - 空のプリセットファイルを作成

3. **openInEditor**: エディタでファイルを開く
   - $EDITOR または $VISUAL 環境変数を使用
   - 未設定の場合はviをデフォルトとして使用
   - child_process.spawn でエディタプロセスを起動

4. **edit**: メイン編集処理
   - バリデーション（プリセット名、オーナー必須）
   - ドライランモード対応
   - エラーハンドリング（Result型使用）

### src/cli/index.ts
editコマンドをCLIに統合：
- `ccmm edit <preset> --owner <owner> [--repo <repo>]`
- オプション: --verbose, --dry-run, --yes

### src/cli/edit.test.ts
包括的なユニットテストを実装：
- buildPresetPath のパス構築テスト
- ensurePresetFile のファイル作成テスト
- openInEditor のエディタ起動テスト（モック使用）
- edit メイン機能のバリデーションテスト

## 技術的選択理由

1. **child_process.spawn使用**: 
   - stdio: 'inherit' でユーザーの入力を直接エディタに転送
   - shell: true でシェル経由実行

2. **Result型によるエラーハンドリング**:
   - 型安全なエラー処理
   - 既存コードベースとの一貫性

3. **環境変数フォールバック**:
   - $EDITOR → $VISUAL → vi の順でエディタを決定
   - Unix系システムの慣例に従う

## 使用例

```bash
# 基本的な使用
ccmm edit react.md --owner myorg

# カスタムリポジトリ指定
ccmm edit typescript.md --owner myorg --repo custom-presets

# ドライランで確認
ccmm edit vue.md --owner myorg --dry-run
```

## テスト結果
- 全15テストが通過
- コード品質チェック（npm run check）通過
- TypeScript型チェック通過
- Biome linter/formatter通過

## 次のステップ
extract機能とpush機能の実装が残っています。