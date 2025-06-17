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
  .description("Sync presets and update CLAUDE.md")
  .option("-c, --commit <sha>", "Use specific commit hash")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .option("-s, --skip-selection", "Skip preset selection prompt and use current settings")
  .option("-r, --reselect", "Force preset reselection without prompts")
  .action(async (options: SyncOptions) => {
    await executeCommand("Preset sync", sync, options);
  });

// init コマンド
program
  .command("init")
  .description("Initialize ccmm globally")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .action(async (options: CliOptions) => {
    await executeCommand("ccmm initialization", init, options);
  });

// lock コマンド
program
  .command("lock")
  .description("Lock presets to a specific commit")
  .argument("<sha>", "Commit hash to lock")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .action(async (sha: string, options: LockOptions) => {
    await executeCommand("Preset lock", (opts) => lock(sha, { ...opts, sha }), options);
  });

// unlock コマンド
program
  .command("unlock")
  .description("Unlock presets and return to HEAD")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .action(async (options: CliOptions) => {
    await executeCommand("Preset unlock", unlock, options);
  });

// edit コマンド
program
  .command("edit")
  .description("Edit preset files")
  .argument("[preset]", "Preset name to edit (shows selection UI if not specified)")
  .option("--owner <owner>", "リポジトリオーナーを指定")
  .option("--repo <repo>", "リポジトリ名を指定")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .action(async (preset: string | undefined, options: EditOptions) => {
    await executeCommand("Preset edit", (opts) => edit(preset || "", opts).then(result => 
      result.success ? Ok(`Preset editing completed`) : result
    ), options);
  });

// extract コマンド
program
  .command("extract")
  .description("Extract changes from CLAUDE.md to presets")
  .option("--preset <preset>", "対象プリセットファイル")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .action(async (options: ExtractOptions) => {
    await executeCommand("Change extraction", extract, options);
  });

// push コマンド
program
  .command("push")
  .description("Push preset changes to remote repository")
  .argument("[preset]", "Preset name to push (shows selection UI if not specified)")
  .option("--owner <owner>", "リポジトリオーナーを指定")
  .option("--repo <repo>", "リポジトリ名を指定")
  .option("--title <title>", "プルリクエストのタイトル")
  .option("--body <body>", "プルリクエストの本文")
  .option("--branch <branch>", "ブランチ名を指定")
  .option("-v, --verbose", "Output verbose logs")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate operations without making actual changes")
  .action(async (preset: string | undefined, options: PushOptions & EditOptions) => {
    await executeCommand("Preset push", (opts) => push(preset || "", opts), options);
  });

// グローバルエラーハンドリングを設定
setupProcessHandlers();

// CLI実行
program.parse();