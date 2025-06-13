/**
 * GitHub API E2Eテスト用のヘルパー関数群
 * 
 * GitHub CLIを使用した実際のGitHub APIとの連携テストをサポート
 * 一意なテストデータの生成、クリーンアップ処理、環境チェックを提供
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface E2ETestContext {
  /** テスト用の一意識別子 */
  testId: string; 
  /** テスト用ブランチ名 */
  branchName: string;
  /** テスト用プリセット名 */
  presetName: string;
  /** 一時ディレクトリ */
  tempDir: string;
  /** ホームディレクトリ */
  homeDir: string;
  /** プロジェクトディレクトリ */
  projectDir: string;
  /** テストで使用するリポジトリ情報 */
  repository: {
    owner: string;
    repo: string;
    url: string;
  };
  /** クリーンアップ関数 */
  cleanup: () => Promise<void>;
}

/**
 * GitHub CLI認証状態をチェック
 */
export async function checkGitHubAuth(): Promise<{ authenticated: boolean; user?: string; error?: string }> {
  try {
    const result = execSync("gh auth status", { stdio: "pipe", encoding: "utf8" });
    
    // ユーザー名を取得
    try {
      const userResult = execSync("gh api user --jq .login", { stdio: "pipe", encoding: "utf8" });
      return {
        authenticated: true,
        user: userResult.trim()
      };
    } catch {
      return { authenticated: true };
    }
  } catch (error: any) {
    return {
      authenticated: false,
      error: error.message || "GitHub CLI認証が必要です"
    };
  }
}

/**
 * テスト用の一意な識別子を生成
 */
export function generateTestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `e2e-${timestamp}-${random}`;
}

/**
 * E2Eテスト用のコンテキストを作成
 */
export async function createE2ETestContext(
  owner: string = "Nasubikun", 
  repo: string = "CLAUDE-md"
): Promise<E2ETestContext> {
  const testId = generateTestId();
  const branchName = `test/ccmm-e2e-${testId}`;
  const presetName = `test-preset-${testId}.md`;
  
  // 一時ディレクトリを作成
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccmm-e2e-"));
  const homeDir = path.join(tempDir, "home");
  const projectDir = path.join(tempDir, "project");
  
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  
  const repository = {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}.git`
  };
  
  const cleanup = async () => {
    try {
      // ブランチが存在する場合は削除を試行
      await cleanupTestBranch(repository, branchName);
    } catch {
      // ブランチクリーンアップエラーは無視
    }
    
    try {
      // 一時ディレクトリを削除
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ディレクトリ削除エラーは無視
    }
  };
  
  return {
    testId,
    branchName,
    presetName,
    tempDir,
    homeDir,
    projectDir,
    repository,
    cleanup
  };
}

/**
 * テスト用ブランチをクリーンアップ
 */
export async function cleanupTestBranch(
  repository: { owner: string; repo: string },
  branchName: string
): Promise<void> {
  try {
    // 現在のユーザーを取得
    const userResult = execSync("gh api user --jq .login", { stdio: "pipe", encoding: "utf8" });
    const currentUser = userResult.trim();
    
    // フォーク先のブランチ削除を試行
    try {
      execSync(
        `gh api -X DELETE repos/${currentUser}/${repository.repo}/git/refs/heads/${branchName}`,
        { stdio: "pipe" }
      );
    } catch {
      // ブランチが存在しない場合は無視
    }
  } catch {
    // ユーザー取得エラーも無視
  }
}

/**
 * GitHub APIの制限チェック
 */
export async function checkGitHubRateLimit(): Promise<{
  remaining: number;
  limit: number;
  resetTime: Date;
}> {
  const result = execSync("gh api rate_limit", { stdio: "pipe", encoding: "utf8" });
  const data = JSON.parse(result);
  
  return {
    remaining: data.rate.remaining,
    limit: data.rate.limit,
    resetTime: new Date(data.rate.reset * 1000)
  };
}

/**
 * リポジトリが存在するかフォーク可能かチェック
 */  
export async function checkRepositoryAccess(
  owner: string,
  repo: string
): Promise<{ accessible: boolean; canFork: boolean; error?: string }> {
  try {
    // リポジトリ情報を取得
    execSync(`gh api repos/${owner}/${repo}`, { stdio: "pipe" });
    
    // フォーク可能かチェック
    try {
      // 既にフォークが存在するかチェック
      const userResult = execSync("gh api user --jq .login", { stdio: "pipe", encoding: "utf8" });
      const currentUser = userResult.trim();
      
      try {
        execSync(`gh api repos/${currentUser}/${repo}`, { stdio: "pipe" });
        // フォークが既に存在
        return { accessible: true, canFork: true };
      } catch {
        // フォークが存在しない場合、フォーク可能
        return { accessible: true, canFork: true };
      }
    } catch {
      return { accessible: true, canFork: false };
    }
  } catch (error: any) {
    return {
      accessible: false,
      canFork: false,
      error: `リポジトリ ${owner}/${repo} にアクセスできません`
    };
  }
}

/**
 * CLI実行用のヘルパー（E2E用）
 */
export function execCLIE2E(
  command: string,
  cwd: string,
  env: Record<string, string> = {}
): { stdout: string; stderr: string; exitCode: number } {
  const builtCliPath = path.resolve(process.cwd(), "dist/cli/index.js");
  
  try {
    const stdout = execSync(`node ${builtCliPath} ${command}`, {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: error.status || 1,
    };
  }
}

/**
 * PRが作成されたかチェック
 */
export async function checkPRExists(
  owner: string,
  repo: string,
  branchName: string
): Promise<{ exists: boolean; url?: string; number?: number }> {
  try {
    // 現在のユーザーを取得
    const userResult = execSync("gh api user --jq .login", { stdio: "pipe", encoding: "utf8" });
    const currentUser = userResult.trim();
    
    // PRを検索
    const searchQuery = `repo:${owner}/${repo} is:pr head:${currentUser}:${branchName}`;
    const result = execSync(
      `gh api search/issues -q "${searchQuery}" --jq '.items[0] | {url: .html_url, number: .number}'`,
      { stdio: "pipe", encoding: "utf8" }
    );
    
    const data = JSON.parse(result);
    if (data.url) {
      return {
        exists: true,
        url: data.url,
        number: data.number
      };
    }
    
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * テスト用のプリセットファイル内容を生成
 */
export function generateTestPresetContent(testId: string): string {
  return `# Test Preset ${testId}

This is a test preset file created by ccmm E2E tests.

## Test Instructions
- Use TypeScript strict mode
- Include test ID: ${testId}
- Generated at: ${new Date().toISOString()}

## Cleanup
This file should be automatically cleaned up after tests.
`;
}

/**
 * E2Eテストの前提条件をチェック
 */
export async function checkE2EPrerequisites(): Promise<{
  ready: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  
  // GitHub CLI認証チェック
  const auth = await checkGitHubAuth();
  if (!auth.authenticated) {
    issues.push(`GitHub CLI認証が必要です: ${auth.error || "gh auth loginを実行してください"}`);
  }
  
  // レート制限チェック
  try {
    const rateLimit = await checkGitHubRateLimit();
    if (rateLimit.remaining < 10) {
      issues.push(`GitHub APIレート制限が不足しています。残り: ${rateLimit.remaining}`);
    }
  } catch {
    issues.push("GitHub APIレート制限の確認に失敗しました");
  }
  
  // ビルド状態チェック
  const builtCliPath = path.resolve(process.cwd(), "dist/cli/index.js");
  try {
    await fs.access(builtCliPath);
  } catch {
    issues.push("CLIがビルドされていません。npm run buildを実行してください");
  }
  
  return {
    ready: issues.length === 0,
    issues
  };
}