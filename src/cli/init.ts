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
  showInfo("Running environment checks...");

  const ghCommand = await github.checkGhCommand();
  const githubToken = github.checkGitHubToken();

  if (ghCommand) {
    showSuccess("✓ GitHub CLI (gh) is installed");
  } else {
    showWarning("⚠ GitHub CLI (gh) is not installed");
  }

  if (githubToken) {
    showSuccess("✓ GitHub token is configured");
  } else {
    showWarning("⚠ GitHub token (GITHUB_TOKEN or GITHUB_ACCESS_TOKEN) is not configured");
  }

  let username: string | undefined;
  if (ghCommand) {
    const fetchedUsername = await github.getCurrentGitHubUsername();
    username = fetchedUsername || undefined;
    if (username) {
      showSuccess(`✓ GitHub user: ${username}`);
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
            message: "ccmm is already initialized. Do you want to reinitialize?",
            default: false,
          },
        ]);

        if (!confirmReinit) {
          return Ok("Initialization cancelled");
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
      console.log(chalk.gray(`Created directory: ${ccmmDir}`));
      console.log(chalk.gray(`Created directory: ${presetsDir}`));
      console.log(chalk.gray(`Created directory: ${projectsDir}`));
    }

    // プリセットリポジトリの設定（必須）
    let config: CcmmConfig = {};
    
    showInfo("Setting up preset repositories...");
    
    // GitHub認証済みでユーザー名が取得できる場合
    if (envCheck.username && envCheck.ghCommand && envCheck.githubToken) {
      showInfo(`Checking existence of ${envCheck.username}/CLAUDE-md repository...`);
      
      const userRepoExists = await github.checkRepositoryExists(envCheck.username, "CLAUDE-md");
      
      if (userRepoExists) {
        // ユーザーのリポジトリが存在する場合は自動設定
        const userRepo = `github.com/${envCheck.username}/CLAUDE-md`;
        config.defaultPresetRepositories = [userRepo];
        showSuccess(`✓ Using your CLAUDE-md repository: ${userRepo}`);
        
        // 他のリポジトリも追加するか確認
        if (!options.yes) {
          const { addMore } = await inquirer.prompt([
            {
              type: "confirm",
              name: "addMore",
              message: "Add other preset repositories? (team shared repositories, etc.)",
              default: false,
            },
          ]);

          if (addMore) {
            const { additionalRepos } = await inquirer.prompt([
              {
                type: "input",
                name: "additionalRepos",
                message: "Enter repository URLs to add (comma-separated for multiple):",
                validate: (input: string) => {
                  if (!input.trim()) {
                    return true; // 空でもOK
                  }
                  const repos = input.split(",").map(r => r.trim()).filter(r => r.length > 0);
                  for (const repo of repos) {
                    if (!repo.includes("github.com")) {
                      return `"${repo}" is not a valid GitHub repository URL`;
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
        showWarning(`⚠ ${envCheck.username}/CLAUDE-md repository not found`);
        
        if (!options.yes) {
          const { createRepo } = await inquirer.prompt([
            {
              type: "confirm",
              name: "createRepo",
              message: `Create your dedicated CLAUDE-md repository?\n  A dedicated repository is required for preset management.`,
              default: true,
            },
          ]);

          if (createRepo) {
            try {
              await github.createRepository("CLAUDE-md", "CLAUDE.md presets");
              const userRepo = `github.com/${envCheck.username}/CLAUDE-md`;
              config.defaultPresetRepositories = [userRepo];
              showSuccess(`✓ Created your dedicated CLAUDE-md repository: ${userRepo}`);
              
              // 他のリポジトリも追加するか確認
              const { addMore } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "addMore",
                  message: "Add other preset repositories? (team shared repositories, etc.)",
                  default: false,
                },
              ]);

              if (addMore) {
                const { additionalRepos } = await inquirer.prompt([
                  {
                    type: "input",
                    name: "additionalRepos",
                    message: "Enter repository URLs to add (comma-separated for multiple):",
                    validate: (input: string) => {
                      if (!input.trim()) {
                        return true; // 空でもOK
                      }
                      const repos = input.split(",").map(r => r.trim()).filter(r => r.length > 0);
                      for (const repo of repos) {
                        if (!repo.includes("github.com")) {
                          return `"${repo}" is not a valid GitHub repository URL`;
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
              return Err(new Error(`Failed to create repository: ${error}`));
            }
          } else {
            return Err(new Error("Cannot initialize ccmm without preset repository configuration"));
          }
        } else {
          return Err(new Error("--yes flag specified but preset repository doesn't exist. Please create repository manually first"));
        }
      }
    } else if (envCheck.username) {
      // GitHub認証なし but usernameは取得できた場合
      showWarning("GitHub token is not configured, but username is available");
      showInfo("Repository access will be available after authentication.");
      
      if (!options.yes) {
        const defaultValue = `github.com/${envCheck.username}/CLAUDE-md`;
        const { manualRepo } = await inquirer.prompt([
          {
            type: "input",
            name: "manualRepo",
            message: "Preset repository URL (e.g. github.com/yourname/CLAUDE-md):",
            default: defaultValue,
            validate: (input: string) => {
              if (!input.trim()) {
                return "Preset repository URL is required";
              }
              if (!input.includes("github.com")) {
                return "Please enter a GitHub repository URL";
              }
              return true;
            },
          },
        ]);

        const repos = manualRepo.trim().split(",").map((r: string) => r.trim()).filter((r: string) => r.length > 0);
        config.defaultPresetRepositories = repos;
        
        // リポジトリの存在確認（可能な場合）
        if (envCheck.ghCommand && repos.length > 0) {
          for (const repo of repos) {
            const repoMatch = repo.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (repoMatch) {
              const [, owner, repoName] = repoMatch;
              await github.checkRepositoryExists(owner, repoName);
            }
          }
        }
        
        showInfo("※ Actual repository access will be verified after authentication");
      } else {
        // --yes フラグの場合はデフォルト値で設定
        const defaultValue = `github.com/${envCheck.username}/CLAUDE-md`;
        config.defaultPresetRepositories = [defaultValue];
        showInfo(`Set ${defaultValue} as default repository due to --yes option.`);
        showInfo("※ Actual repository access will be verified after authentication");
      }
    } else {
      // GitHub認証なし & username取得不可の場合
      showWarning("GitHub authentication is not available");
      
      if (!options.yes) {
        showInfo("You can set up preset repositories after authentication.");
        showInfo("You can also manually configure preset repositories.");
        
        const { configChoice } = await inquirer.prompt([
          {
            type: "list",
            name: "configChoice",
            message: "Select initialization method:",
            choices: [
              {
                name: "Basic initialization only (set preset repositories later)",
                value: "basic"
              },
              {
                name: "Manually specify preset repository",
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
              message: "Preset repository URL (e.g. github.com/yourname/CLAUDE-md):",
              validate: (input: string) => {
                if (!input.trim()) {
                  return "Preset repository URL is required";
                }
                if (!input.includes("github.com")) {
                  return "Please enter a GitHub repository URL";
                }
                return true;
              },
            },
          ]);

          const repos = manualRepo.trim().split(",").map((r: string) => r.trim()).filter((r: string) => r.length > 0);
          config.defaultPresetRepositories = repos;
          
          // リポジトリの存在確認（可能な場合）
          if (envCheck.ghCommand && repos.length > 0) {
            for (const repo of repos) {
              const repoMatch = repo.match(/github\.com\/([^\/]+)\/([^\/]+)/);
              if (repoMatch) {
                const [, owner, repoName] = repoMatch;
                await github.checkRepositoryExists(owner, repoName);
              }
            }
          }
          
          showInfo("※ Actual repository access will be verified after authentication");
        } else {
          // 基本初期化のみ - 空の設定
          config.defaultPresetRepositories = [];
          showInfo("Basic initialization completed.");
          showInfo("You can set preset repositories later with 'ccmm config' command.");
        }
      } else {
        // --yes フラグの場合は基本初期化のみ
        config.defaultPresetRepositories = [];
        showInfo("Basic initialization performed due to --yes option.");
        showInfo("Please set preset repositories after authentication setup.");
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
      console.log(chalk.gray(`Created configuration file: ${configPath}`));
    }

    return Ok("ccmm initialization completed");
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

// isInitialized と loadConfig は core/config.ts に移動されました
export { isInitialized, loadConfig } from "../core/config.js";