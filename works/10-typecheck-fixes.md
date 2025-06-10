# TypeScript型チェックエラーの修正

## 概要
TypeScriptの型チェックで発生していたエラーを修正しました。主に配列アクセスや正規表現のマッチ結果において、`undefined`の可能性がある値を適切に処理するための修正を行いました。

## 修正内容

### 1. 正規表現マッチ結果の非null断言 (src/core/slug.ts)
正規表現のマッチ結果は`string | undefined`を返すため、マッチが成功している場合でも型システムは`undefined`の可能性を考慮します。`if`文でチェック済みの箇所では非null断言演算子(`!`)を使用しました。

```typescript
// 修正前
if (httpsMatch) {
  return {
    host: httpsMatch[1],  // Type 'string | undefined' is not assignable to type 'string'
    owner: httpsMatch[2],
    repo: httpsMatch[3],
  };
}

// 修正後
if (httpsMatch) {
  return {
    host: httpsMatch[1]!,
    owner: httpsMatch[2]!,
    repo: httpsMatch[3]!,
  };
}
```

### 2. 配列アクセスの非null断言
配列アクセスは`T | undefined`を返すため、インデックスが有効であることが保証されている場合でも非null断言が必要です。

```typescript
// 修正前
for (let i = 0; i < pointers.length; i++) {
  const pointer = pointers[i];  // Object is possibly 'undefined'
  const localPath = localPaths[i];
}

// 修正後
for (let i = 0; i < pointers.length; i++) {
  const pointer = pointers[i]!;
  const localPath = localPaths[i]!;
}
```

### 3. 条件付き型チェックの追加 (src/cli/sync.ts)
`lastLine`が`undefined`の可能性があるため、追加の条件チェックを追加しました。

```typescript
// 修正前
if (match) {
  importLine = lastLine;  // Type 'string | undefined' is not assignable to type 'string | null'
}

// 修正後
if (match && lastLine) {
  importLine = lastLine;
}
```

### 4. テストファイルの修正
テストファイルでも同様に配列アクセスに非null断言を追加しました。

```typescript
// 修正前
expect(result.data[0].content).toBe('preset content');

// 修正後
expect(result.data[0]!.content).toBe('preset content');
```

## 修正したファイル
- `src/core/slug.ts` - 正規表現マッチ結果の非null断言
- `src/cli/sync.ts` - 条件チェックの追加と非null断言
- `src/cli/extract.ts` - 正規表現マッチ結果の非null断言
- `src/cli/lock.ts` - 配列アクセスの非null断言
- `src/git/index.ts` - 配列アクセスの非null断言
- `src/cli/extract.test.ts` - テストでの配列アクセスの非null断言
- `src/cli/lock.test.ts` - テストでの配列アクセスの非null断言
- `src/cli/sync.test.ts` - テストでの配列アクセスの非null断言
- `src/git/index.test.ts` - テストでの配列アクセスの非null断言

## 結果
すべての型チェックエラーが解決され、`npm run check`（テスト、型チェック、リント、フォーマット）が正常に完了しました。

## 今後の改善点
- 配列アクセスが安全であることをより明示的に保証するヘルパー関数の導入を検討
- 正規表現のマッチ結果を安全に扱うユーティリティ関数の作成を検討