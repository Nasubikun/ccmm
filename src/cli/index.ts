#!/usr/bin/env node

/**
 * ccmm CLI のメインエントリーポイント
 * 
 * Commander.js を使用してCLIコマンドを定義し、
 * 各サブコマンド（sync, lock, unlock, edit, extract, push）を実装
 */

import { program } from "commander";
import { sync } from "./sync.js";
import { lock } from "./lock.js";
import { unlock } from "./unlock.js";
import { edit } from "./edit.js";
import { extract } from "./extract.js";
import { push } from "./push.js";
import { init } from "./init.js";
import { 
  showError, 
  showSuccess, 
  showInfo, 
  executeCommand, 
  setupProcessHandlers 
} from "./common.js";
import { Ok } from "../lib/result.js";
import type { SyncOptions, LockOptions, CliOptions, EditOptions, ExtractOptions, PushOptions } from "../core/types/index.js";

// パッケージ情報
const packageInfo = {
  name: "ccmm",
  version: "1.0.0",
  description: "CLAUDE.md Manager - Manage CLAUDE.md presets across projects"
};


// CLI設定
program
  .name(packageInfo.name)
  .description(packageInfo.description)
  .version(packageInfo.version);

// sync コマンド
program
  .command("sync")
  .description("プリセットを同期してCLAUDE.mdを更新する")
  .option("-c, --commit <sha>", "特定のコミットハッシュを使用")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (options: SyncOptions) => {
    await executeCommand("プリセット同期", sync, options);
  });

// init コマンド
program
  .command("init")
  .description("ccmmをグローバルに初期化する")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (options: CliOptions) => {
    await executeCommand("ccmm初期化", init, options);
  });

// lock コマンド
program
  .command("lock")
  .description("プリセットを特定のコミットにロックする")
  .argument("<sha>", "ロックするコミットハッシュ")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (sha: string, options: LockOptions) => {
    await executeCommand("プリセットロック", (opts) => lock(sha, { ...opts, sha }), options);
  });

// unlock コマンド
program
  .command("unlock")
  .description("プリセットのロックを解除してHEADに戻す")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (options: CliOptions) => {
    await executeCommand("プリセットアンロック", unlock, options);
  });

// edit コマンド
program
  .command("edit")
  .description("プリセットファイルを編集する")
  .argument("<preset>", "編集するプリセット名")
  .option("--owner <owner>", "リポジトリオーナーを指定")
  .option("--repo <repo>", "リポジトリ名を指定")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (preset: string, options: EditOptions) => {
    await executeCommand("プリセット編集", (opts) => edit(preset, opts).then(result => 
      result.success ? Ok(`プリセット ${preset} の編集が完了しました`) : result
    ), options);
  });

// extract コマンド
program
  .command("extract")
  .description("CLAUDE.mdからプリセットへ変更を抽出する")
  .option("--preset <preset>", "対象プリセットファイル")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (options: ExtractOptions) => {
    await executeCommand("変更抽出", extract, options);
  });

// push コマンド
program
  .command("push")
  .description("プリセットの変更をリモートリポジトリにプッシュする")
  .argument("<preset>", "プッシュするプリセット名")
  .option("--owner <owner>", "リポジトリオーナーを指定")
  .option("--repo <repo>", "リポジトリ名を指定")
  .option("--title <title>", "プルリクエストのタイトル")
  .option("--body <body>", "プルリクエストの本文")
  .option("--branch <branch>", "ブランチ名を指定")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (preset: string, options: PushOptions & EditOptions) => {
    await executeCommand("プリセットプッシュ", (opts) => push(preset, opts), options);
  });

// グローバルエラーハンドリングを設定
setupProcessHandlers();

// CLI実行
program.parse();