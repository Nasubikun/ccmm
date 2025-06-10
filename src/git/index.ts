/**
 * Git操作のラッパー関数群
 * 
 * HEADコミットハッシュの取得、特定ファイルのフェッチ、プルリクエストの作成など
 * simple-gitとGitHub CLIを使用してGit操作を型安全に実行する
 */

import { simpleGit, type SimpleGit } from "simple-git";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Result, Ok, Err } from "../lib/result.js";
import type { PresetPointer, GitOperationResult } from "../core/types/index.js";

const execPromise = promisify(exec);

/**
 * リポジトリのHEADコミットハッシュを取得する
 * 
 * @param repoPath - リポジトリのパス（省略時は現在のディレクトリ）
 * @returns HEADコミットハッシュまたはエラー
 */
export async function getHeadSha(repoPath?: string): Promise<Result<string, Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath || process.cwd());
    const sha = await git.revparse(['HEAD']);
    return Ok(sha.trim());
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * リモートリポジトリから特定のファイルを特定のコミットで取得する
 * 
 * @param pointer - プリセットポインタ（リポジトリとファイル情報）
 * @param localPath - 保存先のローカルパス
 * @returns 操作結果
 */
export async function shallowFetch(
  pointer: PresetPointer,
  localPath: string
): Promise<Result<GitOperationResult, Error>> {
  try {
    const { host, owner, repo, file, commit } = pointer;
    
    // まずghコマンドを使って認証済みで取得を試行
    const ghResult = await tryFetchWithGh(pointer, localPath);
    if (ghResult.success) {
      return ghResult;
    }
    
    // ghが失敗した場合、curl + tokenでフォールバック
    return await tryFetchWithCurl(pointer, localPath);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * GitHub CLIを使用してファイルを取得する
 */
async function tryFetchWithGh(
  pointer: PresetPointer,
  localPath: string
): Promise<Result<GitOperationResult, Error>> {
  try {
    const { host, owner, repo, file, commit } = pointer;
    
    // github.com以外は対応しない
    if (host !== "github.com") {
      return Err(new Error("gh command only supports github.com"));
    }
    
    // ghコマンドが利用可能かチェック
    await execPromise("gh --version");
    
    // gh api でファイル内容を取得
    const command = `gh api repos/${owner}/${repo}/contents/${file}?ref=${commit} --jq .content | base64 -d > "${localPath}"`;
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr && !stderr.includes("Downloading")) {
      return Err(new Error(`gh fetch failed: ${stderr}`));
    }
    
    return Ok({
      success: true,
      data: {
        method: "gh",
        localPath,
        commit,
        output: stdout,
      },
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * curlとGitHub tokenを使用してファイルを取得する
 */
async function tryFetchWithCurl(
  pointer: PresetPointer,
  localPath: string
): Promise<Result<GitOperationResult, Error>> {
  try {
    const { host, owner, repo, file, commit } = pointer;
    
    // GitHubのraw URLを構築
    const rawUrl = `https://${host}/${owner}/${repo}/${commit}/${file}`;
    
    // GitHub API tokenが利用可能な場合は認証付きでリクエスト
    const token = process.env.GITHUB_TOKEN;
    const headers = token ? `-H "Authorization: Bearer ${token}"` : "";
    
    const command = `curl -s -L ${headers} "${rawUrl}" -o "${localPath}"`;
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      return Err(new Error(`Failed to fetch file: ${stderr}`));
    }
    
    return Ok({
      success: true,
      data: {
        method: "curl",
        url: rawUrl,
        localPath,
        commit,
        output: stdout,
      },
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 複数のプリセットファイルを一括で取得する
 * 
 * @param pointers - プリセットポインタの配列
 * @param localPaths - 保存先のローカルパス配列
 * @returns 操作結果の配列
 */
export async function batchFetch(
  pointers: PresetPointer[],
  localPaths: string[]
): Promise<Result<GitOperationResult[], Error>> {
  if (pointers.length !== localPaths.length) {
    return Err(new Error("Pointers and local paths arrays must have the same length"));
  }
  
  try {
    const results = await Promise.all(
      pointers.map((pointer, index) => shallowFetch(pointer, localPaths[index]!))
    );
    
    // エラーが含まれているかチェック
    const errors: Error[] = [];
    const successes: GitOperationResult[] = [];
    
    for (const result of results) {
      if (result.success) {
        successes.push(result.data);
      } else {
        errors.push(result.error);
      }
    }
    
    if (errors.length > 0) {
      return Err(new Error(`Batch fetch failed: ${errors.map(e => e.message).join(", ")}`));
    }
    
    return Ok(successes);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プルリクエスト作成の情報
 */
export interface PullRequestInfo {
  /** PRのタイトル */
  title: string;
  /** PRの本文 */
  body: string;
  /** ブランチ名 */
  branch: string;
  /** ベースブランチ（省略時は main） */
  base?: string;
  /** リポジトリの所有者 */
  owner: string;
  /** リポジトリ名 */
  repo: string;
}

/**
 * GitHub CLIを使用してプルリクエストを作成する
 * 
 * @param prInfo - プルリクエスト情報
 * @returns 作成されたPRのURLまたはエラー
 */
export async function openPr(prInfo: PullRequestInfo): Promise<Result<string, Error>> {
  try {
    // GitHub CLIが利用可能かチェック
    await execPromise("gh --version");
    
    const { title, body, branch, base = "main", owner, repo } = prInfo;
    
    // リポジトリの指定
    const repoFlag = `--repo ${owner}/${repo}`;
    
    // PRの作成コマンド
    const command = [
      "gh pr create",
      repoFlag,
      `--title "${title}"`,
      `--body "${body}"`,
      `--head ${branch}`,
      `--base ${base}`,
      "--web"
    ].join(" ");
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr && !stderr.includes("Opening")) {
      // 権限がない場合、フォークを試行
      if (stderr.includes("permission") || stderr.includes("not found")) {
        return await createPrWithFork(prInfo);
      }
      return Err(new Error(`Failed to create PR: ${stderr}`));
    }
    
    // PRのURLを抽出
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
    const prUrl = urlMatch ? urlMatch[0] : stdout.trim();
    
    return Ok(prUrl);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * フォーク先リポジトリからプルリクエストを作成する
 * 
 * @param prInfo - プルリクエスト情報
 * @returns 作成されたPRのURLまたはエラー
 */
async function createPrWithFork(prInfo: PullRequestInfo): Promise<Result<string, Error>> {
  try {
    const { title, body, branch, base = "main", owner, repo } = prInfo;
    
    // フォークを作成
    const forkCommand = `gh repo fork ${owner}/${repo} --clone=false`;
    await execPromise(forkCommand);
    
    // 現在のユーザー名を取得
    const { stdout: currentUser } = await execPromise("gh api user --jq .login");
    const username = currentUser.trim();
    
    // フォーク先からPRを作成
    const command = [
      "gh pr create",
      `--repo ${owner}/${repo}`,
      `--title "${title}"`,
      `--body "${body}"`,
      `--head ${username}:${branch}`,
      `--base ${base}`,
      "--web"
    ].join(" ");
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr && !stderr.includes("Opening")) {
      return Err(new Error(`Failed to create PR from fork: ${stderr}`));
    }
    
    // PRのURLを抽出
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
    const prUrl = urlMatch ? urlMatch[0] : stdout.trim();
    
    return Ok(prUrl);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * リポジトリが存在するかチェックする
 * 
 * @param repoPath - リポジトリのパス
 * @returns リポジトリが存在するかどうか
 */
export async function isGitRepository(repoPath: string): Promise<Result<boolean, Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath);
    await git.status();
    return Ok(true);
  } catch (error) {
    return Ok(false); // Git関連のエラーでもfalseとして処理
  }
}

/**
 * リモートリポジトリのorigin URLを取得する
 * 
 * @param repoPath - リポジトリのパス（省略時は現在のディレクトリ）
 * @returns origin URLまたはエラー
 */
export async function getOriginUrl(repoPath?: string): Promise<Result<string, Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath || process.cwd());
    const remotes = await git.getRemotes(true);
    
    const origin = remotes.find(remote => remote.name === "origin");
    if (!origin) {
      return Err(new Error("No origin remote found"));
    }
    
    const url = origin.refs.fetch || origin.refs.push;
    if (!url) {
      return Err(new Error("Origin remote has no URL"));
    }
    
    return Ok(url);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ブランチの情報
 */
export interface BranchInfo {
  /** ブランチ名 */
  name: string;
  /** 現在のブランチかどうか */
  current: boolean;
  /** コミットハッシュ */
  commit: string;
}

/**
 * ローカルブランチの一覧を取得する
 * 
 * @param repoPath - リポジトリのパス（省略時は現在のディレクトリ）
 * @returns ブランチ情報の配列またはエラー
 */
export async function getBranches(repoPath?: string): Promise<Result<BranchInfo[], Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath || process.cwd());
    const branches = await git.branchLocal();
    
    const branchInfos: BranchInfo[] = branches.all.map(branchName => ({
      name: branchName,
      current: branchName === branches.current,
      commit: branches.branches[branchName]?.commit || "",
    }));
    
    return Ok(branchInfos);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 新しいブランチを作成し、チェックアウトする
 * 
 * @param branchName - 作成するブランチ名
 * @param repoPath - リポジトリのパス（省略時は現在のディレクトリ）
 * @returns 操作結果
 */
export async function createAndCheckoutBranch(
  branchName: string,
  repoPath?: string
): Promise<Result<void, Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath || process.cwd());
    await git.checkoutLocalBranch(branchName);
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}