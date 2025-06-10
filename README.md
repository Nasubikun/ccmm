# ccmm

**ccmm (Claude Code Memory Manager)** は、Anthropic **Claude Code** の設定ファイル **CLAUDE.md** を  
複数プロジェクト・複数リポジトリ間で再利用／共有するための CLI です。

- ✨ **“自由に書く”** プロジェクト固有メモリと  
  **“共通で使い回す”** プリセットをキレイに分離  
- 🔒 **`lock` コマンド** ひとつでプリセットのバージョンを固定。  
  いつ誰が実行しても同じ SHA を読み込みます  
- 🚀 **1 行だけ** の import で Claude が読むトークンを最小化  
- 🛫 GitHub PR まで自動化：思いついたルールをそのまま上流に “昇格”  

---

## 0. インストール

```bash
npm i -g ccmm   # または pnpm, yarn
```

> **要件**  
> - Node.js 18+  
> - Git / GitHub CLI (`gh`)  
> - 環境変数 `GITHUB_TOKEN` に PAT（repo 権限）をセット

---

## 1. はじめてのセットアップ

```bash
cd YOUR_PROJECT/
ccmm init
```

1. 参照したい CLAUDE-md リポジトリ（例: `myorg/CLAUDE-md`）を選択  
2. 自動で `CLAUDE.md` 末尾に 1 行が追加されます

```diff
+ @~/.ccmm/projects/github.com__myorg__<slug>/merged-preset-HEAD.md
```

> これ以降、**自由に追記してよいのはこの行より上だけ** です。

---

## 2. プリセットを取得・同期する

```bash
ccmm sync
```

- 選択したプリセット（例: `react.md`, `typescript.md`）を
  `$HOME/.ccmm/presets/...` にダウンロード  
- 自動で **merged-preset-HEAD.md** を再生成し、Claude が読むように設定

---

## 3. ルールを“昇格”させる

### 3-1. 思いついたらまず書く

```markdown
# CLAUDE.md に直接追記
- Use eslint-plugin-react
```

### 3-2. `extract` でプリセットへ移動

```bash
git add CLAUDE.md          # 追記をステージ
ccmm extract           # 行ごとに preset を振り分け
```

### 3-3. PR を作る

```bash
ccmm push react.md     # upstream の CLAUDE-md に PR
```

---

## 4. バージョンを固定する（リリース用）

```bash
ccmm lock <commitSHA>
git commit -am "chore: lock CLAUDE presets @<SHA>"
```

- import 行が `merged-preset-<SHA>.md` に置き換わります  
- CI／他メンバーは **これだけ** で同じバージョンを取得：

```bash
ccmm sync              # lock 付きプロジェクトなら自動で固定版を読む
```

解除したいときは：

```bash
ccmm unlock            # HEAD バージョンに戻す
```

---

## 5. よくある質問

| Q | A |
|---|---|
| Claude が `$HOME/.ccmm` を読んでしまいませんか？ | 読み込み対象は **CLAUDE.md に書かれたパスだけ**。`ccmm` が挿入するのは 1 行のみなので安全です。 |
| プリセットを直接編集したい | `ccmm edit react.md` で `$EDITOR` が開きます。その後 `ccmm push` で PR。 |
| 名前が衝突するファイルは？ | パスに `<host>/<owner>/<repo>/file.md` が入るので共存できます。 |
| lock したままプリセットを更新したい | `ccmm unlock` → `ccmm sync` → 動作確認 → `ccmm lock <newSHA>` で再固定。 |

---

## 6. コマンド一覧（抜粋）

| コマンド | 説明 |
|----------|------|
| `ccmm init` | 初回セットアップ（参照リポジトリ選択） |
| `ccmm sync` | プリセット取得・merged ファイル再生成 |
| `ccmm extract` | 追加行をプリセットへ振り分け |
| `ccmm edit <file>` | プリセットファイルをエディタで開く |
| `ccmm push [file]` | 変更分を GitHub PR |
| `ccmm lock <sha>` | プリセットの commit を固定 |
| `ccmm unlock` | HEAD 追従モードに戻す |

---

## 7. アンインストール

```bash
npm rm -g ccmm
rm -rf ~/.ccmm        # キャッシュごと削除（任意）
```

---

開発 Issue や改善提案は [GitHub Discussions](https://github.com/your-org/ccmm/discussions) へどうぞ！  
Happy Claude Coding 🚀
