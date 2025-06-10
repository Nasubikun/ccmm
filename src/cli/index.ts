#!/usr/bin/env node

/**
 * ccmm CLI のメインエントリーポイント
 * 
 * Commander.js を使用してCLIコマンドを定義し、
 * 各サブコマンド（sync, lock, unlock, edit, extract, push）を実装
 */

import { program } from "commander";
import chalk from "chalk";
import { sync } from "./sync.js";
import { lock } from "./lock.js";
import { unlock } from "./unlock.js";
import { edit } from "./edit.js";
import type { SyncOptions, LockOptions, CliOptions, EditOptions } from "../core/types/index.js";

// パッケージ情報
const packageInfo = {
  name: "ccmm",
  version: "1.0.0",
  description: "CLAUDE.md Manager - Manage CLAUDE.md presets across projects"
};

/**
 * エラーメッセージを表示する
 */
function showError(message: string, error?: Error): void {
  console.error(chalk.red("✗ Error:"), message);
  if (error && process.env.DEBUG) {
    console.error(chalk.gray(error.stack));
  }
}

/**
 * 成功メッセージを表示する
 */
function showSuccess(message: string): void {
  console.log(chalk.green("✓"), message);
}

/**
 * 情報メッセージを表示する
 */
function showInfo(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

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
    try {
      if (options.verbose) {
        showInfo("プリセット同期を開始しています...");
      }
      
      const result = await sync(options);
      
      if (result.success) {
        showSuccess("プリセットの同期が完了しました");
        if (options.verbose) {
          showInfo("CLAUDE.mdが更新されました");
        }
      } else {
        showError("同期処理に失敗しました", result.error);
        process.exit(1);
      }
    } catch (error) {
      showError("予期しないエラーが発生しました", error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

// init コマンド (将来の実装用)
program
  .command("init")
  .description("新しいプロジェクトでccmmを初期化する")
  .action(() => {
    showInfo("init コマンドは未実装です");
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
    try {
      if (options.verbose) {
        showInfo(`プリセットを ${sha} でロックしています...`);
      }
      
      const result = await lock(sha, { ...options, sha });
      
      if (result.success) {
        showSuccess(`プリセットが ${sha} でロックされました`);
        if (options.verbose) {
          showInfo("CLAUDE.mdがベンダー版に更新されました");
        }
      } else {
        showError("ロック処理に失敗しました", result.error);
        process.exit(1);
      }
    } catch (error) {
      showError("予期しないエラーが発生しました", error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

// unlock コマンド
program
  .command("unlock")
  .description("プリセットのロックを解除してHEADに戻す")
  .option("-v, --verbose", "詳細ログを出力")
  .option("-y, --yes", "確認プロンプトをスキップ")
  .option("--dry-run", "実際の変更を行わずに動作をシミュレート")
  .action(async (options: CliOptions) => {
    try {
      if (options.verbose) {
        showInfo("プリセットのロックを解除しています...");
      }
      
      const result = await unlock(options);
      
      if (result.success) {
        showSuccess("プリセットのロックが解除されました");
        if (options.verbose) {
          showInfo("CLAUDE.mdがHEAD版に更新されました");
        }
      } else {
        showError("アンロック処理に失敗しました", result.error);
        process.exit(1);
      }
    } catch (error) {
      showError("予期しないエラーが発生しました", error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
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
    try {
      if (options.verbose) {
        showInfo(`プリセット ${preset} の編集を開始しています...`);
      }
      
      const result = await edit(preset, options);
      
      if (result.success) {
        showSuccess(`プリセット ${preset} の編集が完了しました`);
      } else {
        showError("編集処理に失敗しました", result.error);
        process.exit(1);
      }
    } catch (error) {
      showError("予期しないエラーが発生しました", error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

// extract コマンド (将来の実装用)
program
  .command("extract")
  .description("CLAUDE.mdからプリセットへ変更を抽出する")
  .action(() => {
    showInfo("extract コマンドは未実装です");
  });

// push コマンド (将来の実装用)
program
  .command("push")
  .description("プリセットの変更をリモートリポジトリにプッシュする")
  .argument("<preset>", "プッシュするプリセット名")
  .action((preset: string) => {
    showInfo(`push コマンドは未実装です (preset: ${preset})`);
  });

// グローバルエラーハンドリング
process.on('uncaughtException', (error) => {
  showError("予期しないエラーが発生しました", error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  showError("未処理のPromise拒否が発生しました", reason instanceof Error ? reason : new Error(String(reason)));
  process.exit(1);
});

// CLI実行
program.parse();