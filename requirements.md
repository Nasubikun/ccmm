──────────────────────────────────────────────────────
ccmm  ―  TypeScript 実装ガイド (2025-06-10)
──────────────────────────────────────────────────────
目的
└─ プロジェクトごとの **CLAUDE.md** に
     1 行だけ preset インポート行を挿入／更新し
     個人 or チーム共通プリセットを $HOME 側で管理する。

## !important
実装者は必ず以下のページの内容を理解し、Claude CodeとCLAUDE.mdの挙動について把握してから実装を進めること。
- https://docs.anthropic.com/en/docs/claude-code/overview
- https://docs.anthropic.com/en/docs/claude-code/memory
この実装計画を信じすぎないようにしてください。プロジェクト作成前にドラフトとして作成されたものです。実装中、より賢明な方法がある場合はこのドキュメントを無視して、そちらを優先してください。

======================================================
1. プロジェクト側の約束
======================================================
各プロジェクトの repo-root/CLAUDE.md は次の 3 ブロックで構成する：

① 自由記述 (プロジェクト固有の指示)
② 空行 1行
③ 自動管理行（ccmm が管理）★必ず最後の1行
   @~/.ccmm/projects/<slug>/merged-preset-<SHA>.md

* <slug> = プロジェクトのGit origin URLから生成される一意識別子
* <SHA>  = プリセットのコミットハッシュ (HEAD または具体的なSHA)
* 注意: ③の行は ccmm sync/lock/unlock コマンドのみが変更する

======================================================
2. $HOME 側のレイアウト
======================================================
$HOME/.ccmm/                      ← ccmm init で作成される
├─ config.json                    ← グローバル設定（デフォルトリポジトリ等）
├─ presets/                       ← プリセットファイルのキャッシュ
│   └─ github.com/myorg/CLAUDE-md/
│         ├─ react.md
│         └─ typescript.md
└─ projects/                      ← プロジェクト固有のファイル
    └─ <slug>/                    ← 各プロジェクトごとのディレクトリ
        ├─ merged-preset-<SHA>.md ← import行のみ記載（自動生成）
        └─ vendor/<SHA>/…         ← lock時のプリセットコピー

======================================================
3. TypeScript プロジェクト構成例
======================================================
packages/
├─ cli/              コマンド実装 (commander.js)
├─ core/             共通ロジック (fs/git/path/slug)
├─ git/              GitHub API & simple-git ラッパ
└─ ui/               inquirer など対話 UI

tsconfig.json  は “moduleResolution=node”, ES2022 推奨

======================================================
4. 型定義 (core/types.ts 抜粋)
======================================================
export interface PresetPointer {
  host:   string;           // github.com
  owner:  string;           // myorg
  repo:   string;           // CLAUDE-md
  file:   string;           // react.md
  commit: string;           // HEAD or 42d9eaf
}

export interface ProjectPaths {
  root:              string; // repo-root
  claudeMd:          string; // root/CLAUDE.md
  homePresetDir:     string; // ~/.ccmm/presets/…
  projectDir:        string; // ~/.ccmm/projects/<slug>
  mergedPresetPath:  string; // …/merged-preset-<SHA>.md
}

======================================================
5. ユーティリティ
======================================================
core/slug.ts
└─ export function makeSlug(originUrl: string): string

core/fs.ts
└─ helpers: readFile, writeFile, ensureDir, expandTilde

git/index.ts
└─ wrappers: getHeadSha(), shallowFetch(file, sha), openPr()

======================================================
6. CLI コマンド実装例
======================================================

cli/init.ts   (グローバル初期化)
───────────
目的: ccmm自体の初回セットアップ（プロジェクトごとではない）
1. ~/.ccmm/ ディレクトリ構造を作成
   - ~/.ccmm/presets/    (プリセットファイルのキャッシュ)
   - ~/.ccmm/projects/   (プロジェクト固有ファイル)
2. ~/.ccmm/config.json を作成
   - デフォルトのプリセットリポジトリ設定（オプション）
3. 実行タイミング
   - 各ユーザーが ccmm を使い始める時に1回だけ実行
   - プロジェクトディレクトリとは無関係

cli/sync.ts   (プロジェクトへのプリセット適用)
───────────
目的: 現在のプロジェクトのCLAUDE.mdにプリセットを適用
前提: ccmm init 実行済み、現在のディレクトリがGitリポジトリ
1. 解析
   - ルート CLAUDE.md を読み、現在の import 行を解析
   - HEAD or lock SHA を決定
2. fetchPresets()
   - 選択された preset を shallowFetch で取得
   - 保存先: ~/.ccmm/presets/<host>/<owner>/<repo>/<file>
3. generateMerged()
   - import 行だけを書いた merged-preset-<SHA>.md を作成
4. updateClaudeMd()
   - 自動エリア (最後の行) を新 import 行に差替え

cli/lock.ts   (lock <sha>)
───────────
- vendorDir = ~/.ccmm/projects/<slug>/vendor/<sha>/
- 各 preset ファイルを vendorDir にコピー
- merged-preset-<sha>.md の import を vendor 相対パスに書き換え
- CLAUDE.md の import 行も置換

cli/unlock.ts
────────────
- merged-preset-HEAD.md を再生成
- vendorDir を無視 (削除せず OK)
- CLAUDE.md の import 行を HEAD 版へ

cli/edit.ts   (edit react.md --repo myorg)
─────────────
- path = ~/.ccmm/presets/github.com/myorg/CLAUDE-md/react.md
- spawn $EDITOR path

cli/extract.ts
──────────────
1. diffLines = execSync("git diff --cached -U0 repo-root/CLAUDE.md")
2. 追加行だけ抽出 → inquirer チェックボックス UI
3. ユーザーが選んだ preset ファイルへ追記
4. ルート CLAUDE.md から対象行を削除
5. 自動で edit サブコマンドにジャンプ

cli/push.ts
───────────
- diff ＝ fs.diff(presetLocalPath, upstreamFile)
- if diff: create branch → commit → openPr()

======================================================
7. Git 操作ライブラリ
======================================================
- simple-git で clone/fetch/commit
- 公式 GitHub CLI (`gh`) が入っていれば
    exec(`gh pr create …`) で PR 自動作成
- 権限無い場合は `gh repo fork` を呼びフォーク先から PR

======================================================
8. VS Code 拡張 (任意)
======================================================
- 保存時: 変更行を検出 → pop-up で “extract now?” を提示
- コマンドパレット: "ccmm: Sync", "ccmm: Lock HEAD"

======================================================
9. 実装開始手順
======================================================
① `pnpm init`
② `pnpm add commander inquirer simple-git chalk`
③ packages/core からユーティリティ作成
④ cli/sync.ts を最初に仕上げ → ルート import 行が動くか確認
⑤ lock/unlock → edit → extract → push の順で拡充
⑥ GitHub PAT を環境変数 `GITHUB_TOKEN` に

======================================================
10. 動作テスト例
======================================================
# 初回のみ（グローバル初期化）
$ ccmm init                  # ~/.ccmm/ を作成、デフォルトリポジトリ設定

# clone 済みリポで（プロジェクトごと）
$ cd my-project              # Gitリポジトリに移動
$ ccmm sync                  # CLAUDE.md に import 行追加
$ echo "- Use eslint" >> CLAUDE.md
$ git add CLAUDE.md
$ ccmm extract               # 行を react.md へ昇格
$ ccmm edit react.md         # 直接修正
$ ccmm push react.md         # PR 作成
$ ccmm lock $(git rev-parse HEAD:CLAUDE-md/react.md)
$ git commit -am "lock presets"
$ ccmm sync                  # 他メンバーはこれだけで再現
