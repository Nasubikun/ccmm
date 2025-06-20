# ccmm edit コマンドのインタラクティブ選択機能実装

## 実装日時
2025-06-15

## 問題点
pushコマンドと同様に、`ccmm edit`を引数なしで実行した際、エラーメッセージ`error: missing required argument 'preset'`だけでは何をすべきかわからず、使いづらい。

## 解決策
editコマンド向けのインタラクティブ選択を実装：
- 引数なしで`ccmm edit`を実行した場合、利用可能なプリセット一覧を表示し、インタラクティブに選択
- 「新しいプリセットを作成」オプションを追加
- owner/repoの自動推測機能

## pushとeditの違いの分析

| 観点 | push | edit |
|------|------|------|
| **目的** | 変更済みプリセットをリモートへプッシュ | プリセットファイルを編集 |
| **前提条件** | 変更が存在すること | 変更の有無は問わない |
| **対象** | 既存のプリセットのみ | 既存＋新規作成も可能 |
| **フィルタリング** | 変更のあるものだけ表示 | すべて表示（＋新規作成オプション） |

## 実装内容

### 1. CLI定義の変更 (src/cli/index.ts)
```typescript
// preset引数をオプショナルに変更
.argument("[preset]", "編集するプリセット名（未指定時は選択UI表示）")
```

### 2. 新規追加関数 (src/cli/edit.ts)

#### getEditablePresets関数
- プロジェクトの現在のプリセット一覧を取得
- 全てのプリセットを表示（変更の有無に関わらず）

#### guessDefaultOwnerRepo関数
- 既存プリセットから最頻出のowner/repoを推測
- 新規作成時のデフォルト値として使用

#### selectPresetForEdit関数
- inquirerを使用してインタラクティブな選択UI提供
- 「新しいプリセットを作成」オプションを含む

#### inputNewPresetInfo関数
- 新規プリセット作成時の情報入力
- プリセット名、owner、repoの検証付き入力

### 3. edit関数の改修
- 引数なし・空文字列の場合の処理を追加
- プリセット未設定時の新規作成フロー
- owner/repoの自動推測ロジック

## 動作例

### 引数なしで実行（既存プリセットあり）
```bash
$ ccmm edit
? 編集するプリセットを選択してください:
❯ react.md (myorg/CLAUDE-md)
  typescript.md (myorg/CLAUDE-md) 
  nextjs.md (myorg/CLAUDE-md)
  ─────────────────────────
  📝 新しいプリセットを作成...
```

### 新規作成選択時
```bash
? プリセット名を入力してください (例: react.md): vue.md
? リポジトリオーナーを入力してください: myorg
? リポジトリ名を入力してください: (CLAUDE-md) CLAUDE-md
✓ プリセット 'vue.md' の編集が完了しました
```

### プリセット未設定時
```bash
$ ccmm edit
プリセットが設定されていません。

? 新しいプリセットを作成しますか？ Yes
[新規作成フロー...]
```

### owner/repo自動推測
```bash
$ ccmm edit new-preset.md
既存のプリセットから推測: owner=myorg, repo=CLAUDE-md
[エディタで編集...]
```

## テスト結果
- edit.test.ts: 全15テスト成功
- pushコマンドとの差別化が適切に実装されている
- 新規作成フローが正常に動作

## 改善された機能
1. **柔軟な編集開始** - プリセット名を覚えなくても編集可能
2. **新規作成サポート** - インタラクティブに新しいプリセットを作成
3. **スマートな設定推測** - 既存プリセットからowner/repoを自動推測
4. **わかりやすいガイダンス** - 状況に応じた適切な案内

## 今後の改善案
- プリセットテンプレートの提供
- 最近編集したプリセットの履歴表示
- プリセットのプレビュー機能