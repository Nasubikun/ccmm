──────────────────────────────────────────────────────
ccmm  ―  TypeScript 実装ガイド (2025-06-10)
──────────────────────────────────────────────────────
目的
└─ プロジェクトごとの **CLAUDE.md** に
     1 行だけ preset インポート行を挿入／更新し
     個人 or チーム共通プリセットを $HOME 側で管理する。

======================================================
1. プロジェクト側の約束
======================================================
repo-root/CLAUDE.md は次の 3 ブロックで構成する。

① 自由記述 (好きに書く)
② 空行 1
③ 自動エリア（ccmm が管理）★絶対に 1 行
   @~/.ccmm/projects/<slug>/merged-preset-<SHA>.md

* <slug> = host__owner__repo-git-<originSHA> をハッシュ化
* <SHA>   = preset を固定する Git commit (HEAD なら "HEAD")

======================================================
2. $HOME 側のレイアウト
======================================================
$HOME/.ccmm/
├─ presets/                       ← CLAUDE-md 実体 (read-only cache)
│   └─ github.com/myorg/CLAUDE-md/
│         ├─ react.md
│         └─ typescript.md
└─ projects/
    └─ <slug>/
        ├─ merged-preset-<SHA>.md ← only @imports (machine-generated)
        └─ vendor/<SHA>/…         ← lock 時に実体コピー (git 無視)

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

cli/sync.ts
───────────
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
# clone 済みリポで
$ ccmm init
$ ccmm sync                  # import 行追加
$ echo "- Use eslint" >> CLAUDE.md
$ git add CLAUDE.md
$ ccmm extract               # 行を react.md へ昇格
$ ccmm edit react.md         # 直接修正
$ ccmm push react.md         # PR 作成
$ ccmm lock $(git rev-parse HEAD:CLAUDE-md/react.md)
$ git commit -am "lock presets"
$ ccmm sync                  # 他メンバーはこれだけで再現
