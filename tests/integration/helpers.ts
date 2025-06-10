/**
 * 統合テスト用のヘルパー関数群
 * 一時的なGitリポジトリやファイルシステムの操作をサポート
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface TestContext {
  tempDir: string;
  homeDir: string;
  projectDir: string;
  presetDir: string;
  cleanup: () => Promise<void>;
}

/**
 * テスト用の一時的な環境を作成
 */
export async function createTestContext(): Promise<TestContext> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccmm-test-"));
  const homeDir = path.join(tempDir, "home");
  const projectDir = path.join(tempDir, "project");
  const presetDir = path.join(tempDir, "preset-repo");

  // ディレクトリを作成
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(presetDir, { recursive: true });

  const cleanup = async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  };

  return {
    tempDir,
    homeDir,
    projectDir,
    presetDir,
    cleanup,
  };
}

/**
 * Gitリポジトリを初期化
 */
export async function initGitRepo(repoPath: string, isPreset = false) {
  const prevCwd = process.cwd();
  try {
    process.chdir(repoPath);
    
    execSync("git init", { stdio: "pipe" });
    execSync("git config user.name 'Test User'", { stdio: "pipe" });
    execSync("git config user.email 'test@example.com'", { stdio: "pipe" });
    
    if (isPreset) {
      // プリセットリポジトリの場合、サンプルプリセットファイルを作成
      await fs.writeFile(
        path.join(repoPath, "react.md"),
        "# React プリセット\n- Use React Hooks\n- Use TypeScript"
      );
      await fs.writeFile(
        path.join(repoPath, "typescript.md"),
        "# TypeScript プリセット\n- Use strict mode\n- Enable all strict options"
      );
      
      execSync("git add .", { stdio: "pipe" });
      execSync("git commit -m 'Initial preset files'", { stdio: "pipe" });
    } else {
      // プロジェクトリポジトリの場合、基本的なCLAUDE.mdを作成
      await fs.writeFile(
        path.join(repoPath, "CLAUDE.md"),
        "# プロジェクト固有メモリ\n"
      );
      
      execSync("git add .", { stdio: "pipe" });
      execSync("git commit -m 'Initial CLAUDE.md'", { stdio: "pipe" });
    }
  } finally {
    process.chdir(prevCwd);
  }
}

/**
 * CLI コマンドを実行
 */
export function execCLI(
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
 * ファイルの存在確認
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ファイル内容の読み取り
 */
export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf8");
}

/**
 * CLAUDE.mdの最後の行（インポート行）を取得
 */
export async function getClaudeMdImportLine(projectDir: string): Promise<string | null> {
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  if (!(await fileExists(claudeMdPath))) {
    return null;
  }
  
  const content = await readFile(claudeMdPath);
  const lines = content.split("\n");
  const lastLine = lines[lines.length - 1];
  
  return lastLine.startsWith("@") ? lastLine : null;
}

/**
 * git リモートリポジトリURLを設定
 */
export function setGitRemote(projectDir: string, remoteUrl: string) {
  const prevCwd = process.cwd();
  try {
    process.chdir(projectDir);
    execSync(`git remote add origin ${remoteUrl}`, { stdio: "pipe" });
  } finally {
    process.chdir(prevCwd);
  }
}

/**
 * プロジェクトのslugを計算（makeSlugをインポートして使用）
 */
export function calculateProjectSlug(remoteUrl: string): string {
  // dist ディレクトリからビルド済みモジュールを読み込み
  const { makeSlug } = require("../../dist/core/slug.js");
  return makeSlug(remoteUrl);
}