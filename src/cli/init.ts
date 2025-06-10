/**
 * ccmmのグローバル初期化処理
 * ~/.ccmmディレクトリ構造の作成とデフォルトプリセットリポジトリの設定
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { expandTilde } from "../core/fs.js";
import { Result, Ok, Err } from "../lib/result.js";
import type { CliOptions } from "../core/types/index.js";
import chalk from "chalk";
import inquirer from "inquirer";

interface InitConfig {
  defaultPresetRepositories?: string[];
  defaultPresetRepo?: string;
  defaultPresets?: string[];
}

interface InitResult {
  success: boolean;
  message?: string;
  error?: Error;
}

/**
 * ~/.ccmmディレクトリ構造を初期化する
 */
export async function init(options: CliOptions): Promise<InitResult> {
  try {
    const ccmmDir = expandTilde("~/.ccmm");
    const presetsDir = path.join(ccmmDir, "presets");
    const projectsDir = path.join(ccmmDir, "projects");
    const configPath = path.join(ccmmDir, "config.json");

    // 既に初期化済みかチェック
    if (fs.existsSync(ccmmDir) && fs.existsSync(configPath)) {
      if (!options.yes) {
        const { confirmReinit } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmReinit",
            message: "ccmmは既に初期化されています。再初期化しますか？",
            default: false,
          },
        ]);

        if (!confirmReinit) {
          return {
            success: true,
            message: "初期化をキャンセルしました",
          };
        }
      }
    }

    // ディレクトリ作成
    if (!options.dryRun) {
      fs.mkdirSync(ccmmDir, { recursive: true });
      fs.mkdirSync(presetsDir, { recursive: true });
      fs.mkdirSync(projectsDir, { recursive: true });
    }

    if (options.verbose) {
      console.log(chalk.gray(`ディレクトリを作成しました: ${ccmmDir}`));
      console.log(chalk.gray(`ディレクトリを作成しました: ${presetsDir}`));
      console.log(chalk.gray(`ディレクトリを作成しました: ${projectsDir}`));
    }

    // デフォルトプリセットリポジトリの選択
    let config: InitConfig = {};
    
    if (!options.yes) {
      const { useDefaultPresets } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useDefaultPresets",
          message: "デフォルトのプリセットリポジトリを設定しますか？",
          default: true,
        },
      ]);

      if (useDefaultPresets) {
        const { presetRepos } = await inquirer.prompt([
          {
            type: "input",
            name: "presetRepos",
            message: "プリセットリポジトリのURLを入力してください（カンマ区切りで複数可）:",
            default: "github.com/myorg/CLAUDE-md",
            validate: (input: string) => {
              if (!input.trim()) {
                return "リポジトリURLを入力してください";
              }
              return true;
            },
          },
        ]);

        config.defaultPresetRepositories = presetRepos
          .split(",")
          .map((repo: string) => repo.trim())
          .filter((repo: string) => repo.length > 0);
      }
    }

    // 設定ファイルの保存
    if (!options.dryRun) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    }

    if (options.verbose) {
      console.log(chalk.gray(`設定ファイルを作成しました: ${configPath}`));
    }

    return {
      success: true,
      message: "ccmmの初期化が完了しました",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * ccmmの初期化状態を確認する
 */
export function isInitialized(): boolean {
  const ccmmDir = expandTilde("~/.ccmm");
  const configPath = path.join(ccmmDir, "config.json");
  return fs.existsSync(ccmmDir) && fs.existsSync(configPath);
}

/**
 * ccmmの設定を読み込む
 */
export function loadConfig(): Result<InitConfig, Error> {
  try {
    const configPath = expandTilde("~/.ccmm/config.json");
    
    if (!fs.existsSync(configPath)) {
      return Ok({});
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as InitConfig;
    
    return Ok(config);
  } catch (error) {
    return Err(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}