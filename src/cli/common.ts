/**
 * CLI共通ユーティリティ関数群
 * 
 * エラーハンドリング、メッセージ表示、コマンド実行ラッパーなど
 * CLI全体で共通利用される機能を一元化
 */

import chalk from "chalk";
import { Result } from "../lib/result.js";

/**
 * エラーメッセージを表示する
 * 
 * @param message - エラーメッセージ
 * @param error - エラーオブジェクト（オプション）
 */
export function showError(message: string, error?: Error): void {
  console.error(chalk.red("✗ Error:"), message);
  if (error && process.env.DEBUG) {
    console.error(chalk.gray(error.stack));
  }
}

/**
 * 成功メッセージを表示する
 * 
 * @param message - 成功メッセージ
 */
export function showSuccess(message: string): void {
  console.log(chalk.green("✓"), message);
}

/**
 * 情報メッセージを表示する
 * 
 * @param message - 情報メッセージ
 */
export function showInfo(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/**
 * 警告メッセージを表示する
 * 
 * @param message - 警告メッセージ
 */
export function showWarning(message: string): void {
  console.log(chalk.yellow("⚠"), message);
}

/**
 * CLIコマンドの共通オプション
 */
export interface CommonCliOptions {
  verbose?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}


/**
 * 非同期コマンドを実行し、共通エラーハンドリングを適用する
 * 
 * @param commandName - コマンド名（ログ用）
 * @param commandFn - 実行するコマンド関数
 * @param options - CLI共通オプション
 * @returns Promise<never> - 成功時は何も返さず、エラー時はprocess.exitでプロセス終了
 */
export async function executeCommand<T extends CommonCliOptions>(
  commandName: string,
  commandFn: (options: T) => Promise<Result<string, Error>>,
  options: T
): Promise<never> {
  try {
    if (options.verbose) {
      showInfo(`${commandName}を開始しています...`);
    }
    
    const result = await commandFn(options);
    
    if (result.success) {
      if (result.data.trim()) {
        showSuccess(result.data);
      } else {
        showSuccess(`${commandName}が完了しました`);
      }
    } else {
      showError(`${commandName}処理に失敗しました: ${result.error.message}`, result.error);
      process.exit(1);
    }
    
    // 正常終了
    process.exit(0);
  } catch (error) {
    showError("予期しないエラーが発生しました", error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

/**
 * 詳細モードでの情報表示
 * 
 * @param options - CLI共通オプション
 * @param message - 表示するメッセージ
 */
export function verboseLog(options: CommonCliOptions, message: string): void {
  if (options.verbose) {
    showInfo(message);
  }
}

/**
 * ドライランモードでの動作表示
 * 
 * @param options - CLI共通オプション  
 * @param message - 表示するメッセージ
 * @returns ドライランモードかどうか
 */
export function dryRunLog(options: CommonCliOptions, message: string): boolean {
  if (options.dryRun) {
    console.log(chalk.cyan("[DRY RUN]"), message);
    return true;
  }
  return false;
}

/**
 * プロセス終了時のクリーンアップハンドラーを設定
 */
export function setupProcessHandlers(): void {
  // グローバルエラーハンドリング
  process.on('uncaughtException', (error) => {
    showError("予期しないエラーが発生しました", error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    showError("未処理のPromise拒否が発生しました", reason instanceof Error ? reason : new Error(String(reason)));
    process.exit(1);
  });
}