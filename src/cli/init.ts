/**
 * ccmmのグローバル初期化処理
 * ~/.ccmmディレクトリ構造の作成とデフォルトプリセットリポジトリの設定
 * ghコマンドとGITHUB_ACCESS_TOKENの確認、ユーザーリポジトリの存在確認を含む
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { expandTilde } from "../core/fs.js";
import { Result, Ok, Err } from "../lib/result.js";
import { saveConfig, isInitialized as configIsInitialized, type CcmmConfig } from "../core/config.js";
import type { CliOptions } from "../core/types/index.js";
import chalk from "chalk";
import inquirer from "inquirer";
import { showInfo, showWarning, showSuccess } from "./common.js";

const execPromise = promisify(exec);

/**
 * GitHub環境チェックの依存関数（テスト時に注入可能）
 */
export interface GitHubDependencies {
  checkGhCommand: () => Promise<boolean>;
  checkGitHubToken: () => boolean;
  getCurrentGitHubUsername: () => Promise<string | null>;
  checkRepositoryExists: (owner: string, repo: string) => Promise<boolean>;
  createRepository: (name: string, description: string) => Promise<void>;
}

/**
 * 環境チェック結果の型
 */
interface EnvironmentCheck {
  ghCommand: boolean;
  githubToken: boolean;
  username?: string;
}


/**
 * デフォルトのGitHub依存関数（本番環境用）
 */
/**
 * テスト環境用のモックGitHub依存関数
 */
export const testGitHubDependencies: GitHubDependencies = {
  async checkGhCommand(): Promise<boolean> {
    return true; // テスト環境では常にtrueを返す
  },

  checkGitHubToken(): boolean {
    return true; // テスト環境では常にtrueを返す
  },

  async getCurrentGitHubUsername(): Promise<string | null> {
    return "testuser"; // テスト用の固定ユーザー名
  },

  async checkRepositoryExists(owner: string, repo: string): Promise<boolean> {
    return true; // テスト環境では常にtrueを返す
  },

  async createRepository(name: string, description: string): Promise<void> {
    // テスト環境では何もしない
  }
};

export const defaultGitHubDependencies: GitHubDependencies = {
  async checkGhCommand(): Promise<boolean> {
    try {
      await execPromise("gh --version");
      return true;
    } catch {
      return false;
    }
  },

  checkGitHubToken(): boolean {
    return !!(process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN);
  },

  async getCurrentGitHubUsername(): Promise<string | null> {
    try {
      const { stdout } = await execPromise("gh api user | grep '\"login\"' | sed 's/.*\"login\": *\"\\([^\"]*\\)\".*/\\1/'");
      return stdout.trim();
    } catch {
      return null;
    }
  },

  async checkRepositoryExists(owner: string, repo: string): Promise<boolean> {
    try {
      await execPromise(`gh api repos/${owner}/${repo} >/dev/null 2>&1`);
      return true;
    } catch {
      return false;
    }
  },

  async createRepository(name: string, description: string): Promise<void> {
    await execPromise(`gh repo create ${name} --public --description "${description}"`);
  }
};

/**
 * 環境チェックを実行し、結果を表示する
 */
async function performEnvironmentChecks(options: CliOptions, github: GitHubDependencies): Promise<EnvironmentCheck> {
  showInfo("環境チェックを実行しています...");

  const ghCommand = await github.checkGhCommand();
  const githubToken = github.checkGitHubToken();

  if (ghCommand) {
    showSuccess("✓ GitHub CLI (gh) がインストールされています");
  } else {
    showWarning("⚠ GitHub CLI (gh) がインストールされていません");
  }

  if (githubToken) {
    showSuccess("✓ GitHub トークンが設定されています");
  } else {
    showWarning("⚠ GitHub トークン (GITHUB_TOKEN または GITHUB_ACCESS_TOKEN) が設定されていません");
  }

  let username: string | undefined;
  if (ghCommand && githubToken) {
    const fetchedUsername = await github.getCurrentGitHubUsername();
    username = fetchedUsername || undefined;
    if (username) {
      showSuccess(`✓ GitHub ユーザー: ${username}`);
    }
  }

  return { ghCommand, githubToken, username };
}

/**
 * ~/.ccmmディレクトリ構造を初期化する
 */
export async function init(options: CliOptions, github: GitHubDependencies = process.env.NODE_ENV === "test" ? testGitHubDependencies : defaultGitHubDependencies): Promise<Result<string, Error>> {
  try {
    const ccmmDir = expandTilde("~/.ccmm");
    const presetsDir = path.join(ccmmDir, "presets");
    const projectsDir = path.join(ccmmDir, "projects");
    const configPath = path.join(ccmmDir, "config.json");

    // 環境チェックを実行
    const envCheck = await performEnvironmentChecks(options, github);

    // 既に初期化済みかチェック
    if (configIsInitialized()) {
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
          return Ok("初期化をキャンセルしました");
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

    // プリセットリポジトリの設定（必須）
    let config: CcmmConfig = {};
    
    showInfo("プリセットリポジトリを設定しています...");
    
    // GitHub認証済みでユーザー名が取得できる場合
    if (envCheck.username && envCheck.ghCommand) {
      showInfo(`${envCheck.username}/CLAUDE-md リポジトリの存在を確認しています...`);
      
      const userRepoExists = await github.checkRepositoryExists(envCheck.username, "CLAUDE-md");
      
      if (userRepoExists) {
        // ユーザーのリポジトリが存在する場合は自動設定
        const userRepo = `github.com/${envCheck.username}/CLAUDE-md`;
        config.defaultPresetRepositories = [userRepo];
        showSuccess(`✓ あなたのCLAUDE-mdリポジトリを使用します: ${userRepo}`);
        
        // 他のリポジトリも追加するか確認
        if (!options.yes) {
          const { addMore } = await inquirer.prompt([
            {
              type: "confirm",
              name: "addMore",
              message: "他のプリセットリポジトリも追加しますか？（チーム共有リポジトリなど）",
              default: false,
            },
          ]);

          if (addMore) {
            const { additionalRepos } = await inquirer.prompt([
              {
                type: "input",
                name: "additionalRepos",
                message: "追加するリポジトリのURLを入力してください（カンマ区切りで複数可）:",
                validate: (input: string) => {
                  if (!input.trim()) {
                    return true; // 空でもOK
                  }
                  const repos = input.split(",").map(r => r.trim()).filter(r => r.length > 0);
                  for (const repo of repos) {
                    if (!repo.includes("github.com")) {
                      return `"${repo}" は有効なGitHubリポジトリURLではありません`;
                    }
                  }
                  return true;
                },
              },
            ]);

            if (additionalRepos.trim()) {
              const additional = additionalRepos
                .split(",")
                .map((repo: string) => repo.trim())
                .filter((repo: string) => repo.length > 0);
              config.defaultPresetRepositories = [...config.defaultPresetRepositories, ...additional];
            }
          }
        }
      } else {
        // ユーザーのリポジトリが存在しない場合、作成を提案
        showWarning(`⚠ ${envCheck.username}/CLAUDE-md リポジトリが見つかりません`);
        
        if (!options.yes) {
          const { createRepo } = await inquirer.prompt([
            {
              type: "confirm",
              name: "createRepo",
              message: `あなた専用のCLAUDE-mdリポジトリを作成しますか？\n  プリセット管理には専用リポジトリが必要です。`,
              default: true,
            },
          ]);

          if (createRepo) {
            try {
              await github.createRepository("CLAUDE-md", "CLAUDE.md presets");
              const userRepo = `github.com/${envCheck.username}/CLAUDE-md`;
              config.defaultPresetRepositories = [userRepo];
              showSuccess(`✓ あなた専用のCLAUDE-mdリポジトリを作成しました: ${userRepo}`);
              
              // 他のリポジトリも追加するか確認
              const { addMore } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "addMore",
                  message: "他のプリセットリポジトリも追加しますか？（チーム共有リポジトリなど）",
                  default: false,
                },
              ]);

              if (addMore) {
                const { additionalRepos } = await inquirer.prompt([
                  {
                    type: "input",
                    name: "additionalRepos",
                    message: "追加するリポジトリのURLを入力してください（カンマ区切りで複数可）:",
                    validate: (input: string) => {
                      if (!input.trim()) {
                        return true; // 空でもOK
                      }
                      const repos = input.split(",").map(r => r.trim()).filter(r => r.length > 0);
                      for (const repo of repos) {
                        if (!repo.includes("github.com")) {
                          return `"${repo}" は有効なGitHubリポジトリURLではありません`;
                        }
                      }
                      return true;
                    },
                  },
                ]);

                if (additionalRepos.trim()) {
                  const additional = additionalRepos
                    .split(",")
                    .map((repo: string) => repo.trim())
                    .filter((repo: string) => repo.length > 0);
                  config.defaultPresetRepositories = [...config.defaultPresetRepositories, ...additional];
                }
              }
            } catch (error) {
              return Err(new Error(`リポジトリの作成に失敗しました: ${error}`));
            }
          } else {
            return Err(new Error("プリセットリポジトリが設定されていないため、ccmmを初期化できません"));
          }
        } else {
          return Err(new Error("--yesフラグが指定されましたが、プリセットリポジトリが存在しません。先に手動でリポジトリを作成してください"));
        }
      }
    } else {
      // GitHub認証なしの場合
      showWarning("GitHub認証が利用できません");
      
      if (!options.yes) {
        showInfo("認証後にプリセットリポジトリを設定できます。");
        showInfo("手動でプリセットリポジトリを設定することもできます。");
        
        const { configChoice } = await inquirer.prompt([
          {
            type: "list",
            name: "configChoice",
            message: "初期化方法を選択してください:",
            choices: [
              {
                name: "基本的な初期化のみ (後でプリセットリポジトリを設定)",
                value: "basic"
              },
              {
                name: "プリセットリポジトリを手動で指定",
                value: "manual"
              }
            ],
            default: "basic"
          }
        ]);

        if (configChoice === "manual") {
          const { manualRepo } = await inquirer.prompt([
            {
              type: "input",
              name: "manualRepo",
              message: "プリセットリポジトリのURL (例: github.com/yourname/CLAUDE-md):",
              validate: (input: string) => {
                if (!input.trim()) {
                  return "プリセットリポジトリのURLは必須です";
                }
                if (!input.includes("github.com")) {
                  return "GitHub リポジトリのURLを入力してください";
                }
                return true;
              },
            },
          ]);

          const repos = manualRepo.trim().split(",").map((r: string) => r.trim()).filter((r: string) => r.length > 0);
          config.defaultPresetRepositories = repos;
          
          showInfo("※ 実際のリポジトリアクセスは認証後に確認されます");
        } else {
          // 基本初期化のみ - 空の設定
          config.defaultPresetRepositories = [];
          showInfo("基本的な初期化が完了しました。");
          showInfo("後で 'ccmm config' コマンドでプリセットリポジトリを設定できます。");
        }
      } else {
        // --yes フラグの場合は基本初期化のみ
        config.defaultPresetRepositories = [];
        showInfo("認証が利用できないため、基本初期化のみ実行しました。");
        showInfo("後で認証設定後にプリセットリポジトリを設定してください。");
      }
    }

    // 設定ファイルの保存
    if (!options.dryRun) {
      const saveResult = await saveConfig(config);
      if (!saveResult.success) {
        return Err(saveResult.error);
      }
    }

    if (options.verbose) {
      console.log(chalk.gray(`設定ファイルを作成しました: ${configPath}`));
    }

    return Ok("ccmmの初期化が完了しました");
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

// isInitialized と loadConfig は core/config.ts に移動されました
export { isInitialized, loadConfig } from "../core/config.js";