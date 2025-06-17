# 31. Internationalization Analysis - User-Facing Messages

## 概要

CCMMクライアントツールで表示されるすべての日本語メッセージを洗い出し、英語化のための包括的な分析を実施。

## 発見されたメッセージ分類

### 1. コマンド説明文（Command Descriptions）
**ファイル**: `src/cli/index.ts`

| 日本語 | 英語 | 行番号 |
|--------|-------|--------|
| プリセットを同期してCLAUDE.mdを更新する | Sync presets and update CLAUDE.md | 45 |
| ccmmをグローバルに初期化する | Initialize ccmm globally | 59 |
| プリセットを特定のコミットにロックする | Lock presets to a specific commit | 70 |
| プリセットのロックを解除してHEADに戻す | Unlock presets and return to HEAD | 82 |
| プリセットファイルを編集する | Edit preset files | 93 |
| CLAUDE.mdからプリセットへ変更を抽出する | Extract changes from CLAUDE.md to presets | 109 |
| プリセットの変更をリモートリポジトリにプッシュする | Push preset changes to remote repository | 121 |

### 2. オプション説明文（Option Descriptions）
**ファイル**: `src/cli/index.ts`

| 日本語 | 英語 | 行番号 |
|--------|-------|--------|
| 特定のコミットハッシュを使用 | Use specific commit hash | 46 |
| 詳細ログを出力 | Output verbose logs | 47 |
| 確認プロンプトをスキップ | Skip confirmation prompts | 48 |
| 実際の変更を行わずに動作をシミュレート | Simulate operations without making actual changes | 49 |
| プリセット選択プロンプトをスキップして現在の設定を使用 | Skip preset selection prompt and use current settings | 50 |
| プロンプトなしで強制的にプリセットを再選択 | Force preset reselection without prompts | 51 |

### 3. 引数説明文（Argument Descriptions）
**ファイル**: `src/cli/index.ts`

| 日本語 | 英語 | 行番号 |
|--------|-------|--------|
| ロックするコミットハッシュ | Commit hash to lock | 71 |
| 編集するプリセット名（未指定時は選択UI表示） | Preset name to edit (shows selection UI if not specified) | 94 |
| プッシュするプリセット名（未指定時は選択UI表示） | Preset name to push (shows selection UI if not specified) | 122 |

### 4. プロセスメッセージ（Process Messages）
**ファイル**: `src/cli/common.ts`, `src/cli/sync.ts`, `src/cli/init.ts`

| 日本語 | 英語 | ファイル:行番号 |
|--------|-------|-------------|
| ${commandName}を開始しています... | Starting ${commandName}... | common.ts:76 |
| ${commandName}が完了しました | ${commandName} completed | common.ts:85 |
| 環境チェックを実行しています... | Running environment checks... | init.ts:111 |
| プリセットリポジトリを設定しています... | Setting up preset repositories... | init.ts:187 |
| 初回実行のため、プリセットファイルを選択します... | First run, selecting preset files... | sync.ts:302 |
| プリセットの同期が完了しました | Preset synchronization completed | sync.ts:368 |

### 5. エラーメッセージ（Error Messages）
**ファイル**: 各CLIファイル

| 日本語 | 英語 | ファイル:行番号 |
|--------|-------|-------------|
| ${commandName}処理に失敗しました: | ${commandName} processing failed: | common.ts:88 |
| 予期しないエラーが発生しました | An unexpected error occurred | common.ts:95 |
| ccmmが初期化されていません。先に 'ccmm init' を実行してください | ccmm is not initialized. Please run 'ccmm init' first | sync.ts:265 |
| --skip-selection と --reselect オプションは同時に指定できません | --skip-selection and --reselect options cannot be specified simultaneously | sync.ts:260 |
| プリセット名を指定してください | Please specify preset name | edit.ts:265 |
| リポジトリのクローン/フォークに失敗しました: | Failed to clone/fork repository: | push.ts:328 |

### 6. インタラクティブプロンプト（Interactive Prompts）
**ファイル**: `src/cli/init.ts`, `src/cli/sync.ts`, `src/cli/edit.ts`, `src/cli/extract.ts`

| 日本語 | 英語 | ファイル:行番号 |
|--------|-------|-------------|
| ccmmは既に初期化されています。再初期化しますか？ | ccmm is already initialized. Do you want to reinitialize? | init.ts:160 |
| 他のプリセットリポジトリも追加しますか？（チーム共有リポジトリなど） | Add other preset repositories? (team shared repositories, etc.) | init.ts:207 |
| 追加するリポジトリのURLを入力してください（カンマ区切りで複数可）: | Enter repository URLs to add (comma-separated for multiple): | init.ts:217 |
| プリセット設定を変更しますか？ | Do you want to change preset settings? | sync.ts:391 |
| プリセット名を入力してください (例: react.md): | Enter preset name (e.g., react.md): | edit.ts:172 |
| 抽出する行範囲を選択してください: | Select line range to extract: | extract.ts:249 |

### 7. 成功メッセージ（Success Messages）
**ファイル**: 各CLIファイル

| 日本語 | 英語 | ファイル:行番号 |
|--------|-------|-------------|
| プリセット編集が完了しました | Preset editing completed | index.ts:102 |
| プリセットが${sha}でロックされました | Presets locked at ${sha} | lock.ts:281 |
| プリセットのロックが解除されました | Preset lock has been removed | unlock.ts:198 |
| ✓ ${selection.selectedLines.length} 行を ${selection.preset.file} に抽出しました | ✓ Extracted ${selection.selectedLines.length} lines to ${selection.preset.file} | extract.ts:578 |

### 8. 検証メッセージ（Validation Messages）
**ファイル**: `src/cli/init.ts`, `src/cli/extract.ts`

| 日本語 | 英語 | ファイル:行番号 |
|--------|-------|-------------|
| ✓ GitHub CLI (gh) がインストールされています | ✓ GitHub CLI (gh) is installed | init.ts:117 |
| ⚠ GitHub CLI (gh) がインストールされていません | ⚠ GitHub CLI (gh) is not installed | init.ts:119 |
| ✓ GitHub トークンが設定されています | ✓ GitHub token is configured | init.ts:123 |
| \"${repo}\" は有効なGitHubリポジトリURLではありません | \"${repo}\" is not a valid GitHub repository URL | init.ts:225 |
| 少なくとも1行は選択してください | Please select at least one line | extract.ts:294 |

## 統計サマリー

- **総メッセージ数**: 約100個以上
- **主要カテゴリ**:
  - コマンド説明文: 12個
  - オプション説明文: 15個  
  - プロセスメッセージ: 30個
  - エラーメッセージ: 25個
  - インタラクティブプロンプト: 25個
  - その他（成功、検証メッセージ等）: 20個

## 英語化における考慮事項

1. **一貫性の維持**: 同じ概念には統一された英語表現を使用
2. **CLIの慣習**: 他のCLIツールで使われる標準的な表現に合わせる
3. **簡潔性**: コマンドライン表示に適した簡潔な表現
4. **技術用語**: GitHubやGitの標準用語を使用
5. **ユーザビリティ**: エラーメッセージは明確で解決方法を示唆

## 次のステップ

英語化実装のためには、以下の作業が必要:

1. **文字列の外部化**: ハードコードされた文字列を定数化
2. **国際化ライブラリ導入**: i18nライブラリの検討
3. **設定ファイル作成**: 言語別のメッセージ定義
4. **実装と動作確認**: 各コマンドでの表示確認
5. **テスト追加**: 国際化機能のテスト作成