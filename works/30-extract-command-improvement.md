# Extract コマンドの改善実装

## 実装日時
2025-06-14

## 背景
`ccmm extract` コマンドが staged changes がない場合にエラーを返していたが、ユーザーから staged changes がない場合でも CLAUDE.md から直接選択できるようにしてほしいとの要望があった。

## 問題点
従来の実装では、以下のようなエラーが発生していた：
```
✗ Error: 変更抽出処理に失敗しました: CLAUDE.md に staged changes が見つかりません
```

## 実装内容

### 1. 新しい型定義の追加
`ClaudeMdLine` インターフェースを追加して、staged changes と CLAUDE.md の内容を統一的に扱えるようにした：

```typescript
export interface ClaudeMdLine {
  /** 行番号 */
  lineNumber: number;
  /** 行の内容 */
  content: string;
  /** ソース（staged または file） */
  source: 'staged' | 'file';
}
```

### 2. getClaudeMdContent 関数の実装
CLAUDE.md の内容から抽出可能な行を取得する新しい関数を実装：

- CLAUDE.md の自由記述部分を読み取り
- 空行をスキップ
- import行を除外
- 各行に行番号とソース情報を付与

### 3. extract 関数の改善
staged changes がない場合の処理を追加：

```typescript
if (changes.length === 0) {
  // staged changes がない場合は CLAUDE.md から選択
  if (options.verbose) {
    console.log("staged changes が見つかりません。CLAUDE.md から選択します...");
  }
  
  const claudeMdResult = await getClaudeMdContent(claudeMdPath);
  // ...
}
```

### 4. promptUserSelection 関数の更新
- パラメータを `DiffChange[]` から `ClaudeMdLine[]` に変更
- UI表示で staged/file のソースを区別できるように改善
- staged の行はデフォルトでチェック、file の行はデフォルトでチェックなし

### 5. テストの追加
`getClaudeMdContent` 関数の包括的なテストケースを追加：
- 正常な内容の取得
- 空行のスキップ
- import行の除外
- エラーハンドリング

## 結果
- staged changes がない場合でも、CLAUDE.md から直接行を選択してプリセットに抽出できるようになった
- ユーザーエクスペリエンスが向上し、より柔軟なワークフローが可能になった
- 既存の staged changes を使用する機能は維持されている

## 今後の改善案
- 行番号の表示をより見やすくする
- 選択UI でのフィルタリング機能の追加
- プレビュー機能の実装

---

# Extract コマンドの行選択UI改善実装

## 実装日時
2025-06-14（追加実装）

## 背景
`ccmm extract` コマンドの行選択UIがチェックボックス形式（複数選択）になっていたが、行番号の選択には不適切で使いづらいという問題があった。

## 問題点
従来のチェックボックス式UIの問題：
- 多数の行から個別に選択する必要がある
- 連続した範囲を選択する場合でも一つずつチェックする必要がある
- 視覚的にわかりにくい
- 誤操作しやすい

## 解決方法：範囲選択モードの実装

### UIデザイン
2段階の選択プロセスに変更：
1. **開始行の選択**：リストから開始行を選択
2. **終了行の選択**：開始行以降の行から終了行を選択

### 実装詳細

#### promptUserSelection関数の修正
```typescript
// 1. 範囲選択モードで行を選択
console.log('抽出する行範囲を選択してください:');

// 行番号付きで表示
lines.forEach((line) => {
  console.log(`  ${line.lineNumber}: ${line.content}`);
});

// 開始行を選択
const { startLine } = await inquirer.prompt({
  type: 'list',
  name: 'startLine',
  message: '開始行を選択してください:',
  choices: lines.map((line) => ({
    name: `${line.lineNumber}: ${line.content}`,
    value: line.lineNumber
  }))
});

// 終了行を選択（開始行以降の行のみ表示）
const endLineChoices = lines
  .filter(line => line.lineNumber >= startLine)
  .map((line) => ({
    name: `${line.lineNumber}: ${line.content}`,
    value: line.lineNumber
  }));

const { endLine } = await inquirer.prompt({
  type: 'list',
  name: 'endLine',
  message: '終了行を選択してください:',
  choices: endLineChoices
});

// 選択範囲の行を取得
const selectedLines = lines
  .filter(line => line.lineNumber >= startLine && line.lineNumber <= endLine)
  .map(line => line.content);

// 選択された行の確認表示
console.log(`\n選択範囲: ${startLine}-${endLine}行目（${selectedLines.length}行）\n`);
```

### 改善効果
1. **使いやすさの向上**
   - 連続した行の選択が2クリックで完了
   - 範囲選択が直感的

2. **エラー防止**
   - 逆順選択を自動的に防止（終了行は開始行以降のみ選択可能）
   - 範囲外選択の防止

3. **視覚的な改善**
   - 選択前に全体の行を表示
   - 選択後に範囲を確認表示

## テスト結果
- 既存のテストは全てパス
- extractコマンドの単体テスト：15/15成功
- npm run checkで品質チェック完了

## 結論
範囲選択モードの実装により、`ccmm extract`コマンドの行選択がより直感的で使いやすくなった。連続した行を選択する一般的なユースケースに最適化されており、ユーザーエクスペリエンスが大幅に向上した。