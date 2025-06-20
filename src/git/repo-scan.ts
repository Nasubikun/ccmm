/**
 * GitHubリポジトリ内のプリセットファイル一覧を取得する機能
 * 
 * GitHub APIを使用してリポジトリ内の.mdファイルを再帰的に検索し、
 * プリセットファイルとして利用可能なファイル一覧を返す
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { Result, Ok, Err } from "../lib/result.js";

const execPromise = promisify(exec);

/**
 * プリセットファイル情報
 */
export interface PresetFileInfo {
  /** ファイル名 */
  name: string;
  /** リポジトリ内のパス */
  path: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** SHA */
  sha: string;
}

/**
 * GitHubリポジトリ情報をパースする
 * 
 * @param repoUrl - GitHubリポジトリURL（例: "github.com/owner/repo"）
 * @returns パース結果
 */
export function parseGitHubRepoUrl(repoUrl: string): Result<{owner: string, repo: string}, Error> {
  try {
    // "github.com/owner/repo" 形式をパース
    const parts = repoUrl.replace(/^https?:\/\//, '').split('/');
    
    if (parts.length < 3 || parts[0] !== 'github.com') {
      return Err(new Error(`Invalid GitHub repository URL format: ${repoUrl}`));
    }
    
    const owner = parts[1];
    const repo = parts[2];
    
    if (!owner || !repo) {
      return Err(new Error(`Invalid GitHub repository URL format: ${repoUrl}`));
    }
    
    return Ok({ owner, repo });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * GitHubリポジトリから.mdファイル一覧を取得する
 * 
 * @param repoUrl - GitHubリポジトリURL
 * @returns プリセットファイル一覧
 */
export async function scanPresetFiles(repoUrl: string): Promise<Result<PresetFileInfo[], Error>> {
  try {
    // file:// URLの場合はローカルファイルシステムをスキャン
    if (repoUrl.startsWith('file://')) {
      return await scanLocalPresetFiles(repoUrl);
    }
    
    const parseResult = parseGitHubRepoUrl(repoUrl);
    if (!parseResult.success) {
      return parseResult;
    }
    
    const { owner, repo } = parseResult.data;
    
    // GitHub CLIを使用してファイル一覧を取得
    const ghResult = await tryGetFilesWithGh(owner, repo);
    if (ghResult.success) {
      return ghResult;
    }
    
    // GitHub CLIが失敗した場合、GitHub APIで直接取得
    return await tryGetFilesWithApi(owner, repo);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * GitHub CLIを使用してファイル一覧を取得
 */
async function tryGetFilesWithGh(owner: string, repo: string): Promise<Result<PresetFileInfo[], Error>> {
  try {
    // GitHub CLIが利用可能かチェック
    await execPromise("gh --version");
    
    // Git tree APIでファイル一覧を取得（再帰的）
    const command = `gh api "repos/${owner}/${repo}/git/trees/HEAD?recursive=1" --jq '.tree[] | select(.path | test("\\\\.md$")) | {name: (.path | split("/") | last), path, size, sha}'`;
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      // GitHub CLIのエラーを詳細に処理
      if (stderr.includes("HTTP 404")) {
        return Err(new Error(`Repository ${owner}/${repo} not found or access denied. Please check authentication with 'gh auth login'.`));
      } else if (stderr.includes("HTTP 401") || stderr.includes("authentication")) {
        return Err(new Error(`GitHub authentication failed. Please re-authenticate with 'gh auth login'.`));
      } else if (stderr.includes("HTTP 403")) {
        return Err(new Error(`No access permission to repository ${owner}/${repo}.`));
      } else {
        return Err(new Error(`GitHub CLI failed: ${stderr}`));
      }
    }
    
    // JSONLを解析
    const files: PresetFileInfo[] = [];
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const fileInfo = JSON.parse(line);
        files.push({
          name: fileInfo.name,
          path: fileInfo.path,
          size: fileInfo.size || 0,
          sha: fileInfo.sha
        });
      } catch (parseError) {
        // JSON解析エラーは無視して続行
        continue;
      }
    }
    
    return Ok(files);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * GitHub APIを直接使用してファイル一覧を取得
 */
async function tryGetFilesWithApi(owner: string, repo: string): Promise<Result<PresetFileInfo[], Error>> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers = token ? `-H "Authorization: Bearer ${token}"` : "";
    
    // Git tree APIでファイル一覧を取得
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
    const command = `curl -s ${headers} "${apiUrl}"`;
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      return Err(new Error(`GitHub API request failed: ${stderr}`));
    }
    
    const response = JSON.parse(stdout);
    
    if (response.message) {
      // 認証関連のエラーを詳細に処理
      if (response.message === "Not Found") {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          return Err(new Error(`Cannot access repository ${owner}/${repo}. For private repositories, please set GITHUB_TOKEN environment variable.`));
        } else {
          return Err(new Error(`Repository ${owner}/${repo} not found or access denied. Please check repository name and access permissions.`));
        }
      } else if (response.message === "Bad credentials") {
        return Err(new Error(`GitHub authentication failed. Please check GITHUB_TOKEN environment variable.`));
      } else if (response.message.includes("API rate limit exceeded")) {
        return Err(new Error(`GitHub API rate limit reached. Please wait and retry later, or set GITHUB_TOKEN.`));
      } else {
        return Err(new Error(`GitHub API error: ${response.message}`));
      }
    }
    
    if (!response.tree || !Array.isArray(response.tree)) {
      return Err(new Error("Invalid API response format"));
    }
    
    // .mdファイルのみを抽出
    const mdFiles = response.tree
      .filter((item: any) => item.type === 'blob' && item.path && item.path.endsWith('.md'))
      .map((item: any) => ({
        name: item.path.split('/').pop() || item.path,
        path: item.path,
        size: item.size || 0,
        sha: item.sha
      }));
    
    return Ok(mdFiles);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ローカルディレクトリから.mdファイル一覧を取得する（テスト用）
 * 
 * @param fileUrl - file:// URL
 * @returns プリセットファイル一覧
 */
async function scanLocalPresetFiles(fileUrl: string): Promise<Result<PresetFileInfo[], Error>> {
  try {
    // file:// URLからパスを抽出
    const localPath = fileUrl.replace(/^file:\/\//, '');
    
    const mdFiles: PresetFileInfo[] = [];
    
    // 再帰的にディレクトリをスキャン
    async function scanDirectory(dirPath: string, relativePath: string = ''): Promise<void> {
      try {
        const entries = await readdir(dirPath);
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry);
          const entryRelativePath = relativePath ? join(relativePath, entry) : entry;
          
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            // ディレクトリの場合は再帰的にスキャン
            await scanDirectory(fullPath, entryRelativePath);
          } else if (stats.isFile() && extname(entry) === '.md') {
            // .mdファイルの場合は一覧に追加
            mdFiles.push({
              name: entry,
              path: entryRelativePath,
              size: stats.size,
              sha: 'local-' + Date.now() // ローカルファイル用のダミーSHA
            });
          }
        }
      } catch (error) {
        // ディレクトリアクセスエラーは無視して続行
      }
    }
    
    await scanDirectory(localPath);
    
    return Ok(mdFiles);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}