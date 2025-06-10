/**
 * プリセットファイルの変更をリモートリポジトリにプッシュする機能
 * 
 * ローカルで編集されたプリセットファイルとアップストリームの内容を比較し、
 * 差分がある場合は新しいブランチを作成してプルリクエストを開く
 */

import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { simpleGit, type SimpleGit } from "simple-git";
import { readFile, writeFile, fileExists } from "../core/fs.js";
import { Result, Ok, Err } from "../lib/result.js";
import { 
  shallowFetch, 
  openPr, 
  createAndCheckoutBranch,
  type PullRequestInfo 
} from "../git/index.js";
import type { 
  PresetPointer, 
  PushOptions,
  EditOptions
} from "../core/types/index.js";

const execPromise = promisify(exec);

/**
 * プリセットファイルのパスから PresetPointer を構築する
 * 
 * @param presetPath - プリセットファイルのローカルパス
 * @returns PresetPointer または エラー
 */
export function parsePresetPath(presetPath: string): Result<PresetPointer, Error> {
  try {
    // ~/.ccmm/presets/github.com/owner/repo/file.md
    const homeDir = homedir();
    const presetsDir = join(homeDir, ".ccmm", "presets");
    
    if (!presetPath.startsWith(presetsDir)) {
      return Err(new Error("プリセットファイルのパスが正しくありません"));
    }
    
    // プリセットディレクトリからの相対パスを取得
    const relativePath = presetPath.substring(presetsDir.length + 1);
    const parts = relativePath.split("/");
    
    if (parts.length < 4) {
      return Err(new Error("プリセットファイルのパス形式が無効です"));
    }
    
    const [host, owner, repo, ...fileParts] = parts;
    const file = fileParts.join("/");
    
    if (!host || !owner || !repo || !file) {
      return Err(new Error("プリセットファイルのパス形式が無効です"));
    }
    
    const pointer: PresetPointer = {
      host,
      owner,
      repo,
      file,
      commit: "HEAD"
    };
    
    return Ok(pointer);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プリセット名からローカルファイルパスを構築する
 * 
 * @param preset - プリセット名（例: react.md）
 * @param owner - リポジトリオーナー
 * @param repo - リポジトリ名（デフォルト: CLAUDE-md）
 * @param host - ホスト名（デフォルト: github.com）
 * @returns ローカルファイルパス
 */
export function buildPresetPath(
  preset: string,
  owner: string,
  repo: string = "CLAUDE-md",
  host: string = "github.com"
): string {
  const homeDir = homedir();
  return join(homeDir, ".ccmm", "presets", host, owner, repo, preset);
}

/**
 * 2つのファイル内容を比較して差分があるかチェックする
 * 
 * @param content1 - 1つ目のファイル内容
 * @param content2 - 2つ目のファイル内容
 * @returns 差分があるかどうか
 */
export function hasContentDiff(content1: string, content2: string): boolean {
  // 改行の差異を正規化
  const normalize = (content: string) => content.trim().replace(/\r\n/g, '\n');
  return normalize(content1) !== normalize(content2);
}

/**
 * アップストリームファイルの内容を取得する
 * 
 * @param pointer - プリセットポインタ
 * @returns アップストリームの内容またはエラー
 */
export async function fetchUpstreamContent(pointer: PresetPointer): Promise<Result<string, Error>> {
  try {
    // 一時ファイルパスを生成
    const tempDir = join(homedir(), ".ccmm", "temp");
    const tempPath = join(tempDir, `${Date.now()}-${basename(pointer.file)}`);
    
    // 一時ディレクトリを作成
    await execPromise(`mkdir -p "${tempDir}"`);
    
    // アップストリームからファイルを取得
    const fetchResult = await shallowFetch(pointer, tempPath);
    if (!fetchResult.success) {
      return Err(fetchResult.error);
    }
    
    // ファイル内容を読み取り
    const contentResult = await readFile(tempPath);
    if (!contentResult.success) {
      return Err(contentResult.error);
    }
    
    // 一時ファイルを削除
    try {
      await execPromise(`rm -f "${tempPath}"`);
    } catch {
      // 削除エラーは無視
    }
    
    return Ok(contentResult.data);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 新しいブランチ名を生成する
 * 
 * @param preset - プリセット名
 * @returns ブランチ名
 */
export function generateBranchName(preset: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const safeName = preset.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/\.md$/, '');
  return `ccmm-update-${safeName}-${timestamp}`;
}

/**
 * リポジトリの変更をコミットする
 * 
 * @param repoPath - リポジトリのパス
 * @param files - コミットするファイルのリスト
 * @param message - コミットメッセージ
 * @returns コミット結果
 */
export async function commitChanges(
  repoPath: string,
  files: string[],
  message: string
): Promise<Result<string, Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath);
    
    // ファイルをステージング
    for (const file of files) {
      await git.add(file);
    }
    
    // コミット実行
    const result = await git.commit(message);
    
    if (!result.commit) {
      return Err(new Error("コミットの作成に失敗しました"));
    }
    
    return Ok(result.commit);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ブランチをリモートにプッシュする
 * 
 * @param repoPath - リポジトリのパス  
 * @param branch - プッシュするブランチ名
 * @param remote - リモート名（デフォルト: origin）
 * @returns プッシュ結果
 */
export async function pushBranch(
  repoPath: string,
  branch: string,
  remote: string = "origin"
): Promise<Result<void, Error>> {
  try {
    const git: SimpleGit = simpleGit(repoPath);
    await git.push(remote, branch, { "--set-upstream": null });
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * GitHub連携ワークフローを実行する
 * 
 * @param pointer - プリセットポインタ
 * @param content - 新しいファイル内容
 * @param preset - プリセット名
 * @param options - pushオプション
 * @returns PR URLまたはエラー
 */
export async function executeGitHubWorkflow(
  pointer: PresetPointer,
  content: string,
  preset: string,
  options: PushOptions & EditOptions
): Promise<Result<string, Error>> {
  try {
    // 一時ディレクトリを作成
    const tempDir = join(homedir(), ".ccmm", "temp", `push-${Date.now()}`);
    
    // リポジトリをクローンまたはフォーク
    const repoUrl = `https://github.com/${pointer.owner}/${pointer.repo}.git`;
    let workingDir: string;
    
    try {
      // 直接クローンを試行
      await execPromise(`mkdir -p "${tempDir}"`);
      await execPromise(`git clone "${repoUrl}" "${tempDir}/repo"`);
      workingDir = join(tempDir, "repo");
      
      if (options.verbose) {
        console.log(`リポジトリをクローンしました: ${repoUrl}`);
      }
    } catch (cloneError) {
      // クローンに失敗した場合、フォークを試行
      try {
        await execPromise(`gh repo fork "${pointer.owner}/${pointer.repo}" --clone=false`);
        
        // 現在のユーザー名を取得
        const { stdout: currentUser } = await execPromise("gh api user --jq .login");
        const username = currentUser.trim();
        
        // フォーク先からクローン
        const forkUrl = `https://github.com/${username}/${pointer.repo}.git`;
        await execPromise(`git clone "${forkUrl}" "${tempDir}/repo"`);
        workingDir = join(tempDir, "repo");
        
        // 元のリポジトリをupstreamとして追加
        const git: SimpleGit = simpleGit(workingDir);
        await git.addRemote("upstream", repoUrl);
        
        if (options.verbose) {
          console.log(`リポジトリをフォークしてクローンしました: ${forkUrl}`);
        }
      } catch (forkError) {
        return Err(new Error(`リポジトリのクローン/フォークに失敗しました: ${forkError}`));
      }
    }
    
    try {
      // ブランチを作成してチェックアウト
      const branchName = options.branch || generateBranchName(preset);
      const checkoutResult = await createAndCheckoutBranch(branchName, workingDir);
      if (!checkoutResult.success) {
        return Err(checkoutResult.error);
      }
      
      if (options.verbose) {
        console.log(`ブランチを作成しました: ${branchName}`);
      }
      
      // ファイルを更新
      const targetFilePath = join(workingDir, pointer.file);
      const writeResult = await writeFile(targetFilePath, content);
      if (!writeResult.success) {
        return Err(writeResult.error);
      }
      
      if (options.verbose) {
        console.log(`ファイルを更新しました: ${pointer.file}`);
      }
      
      // コミットを作成
      const commitMessage = options.title || `Update ${preset} via ccmm`;
      const commitResult = await commitChanges(workingDir, [pointer.file], commitMessage);
      if (!commitResult.success) {
        return Err(commitResult.error);
      }
      
      if (options.verbose) {
        console.log(`コミットを作成しました: ${commitResult.data}`);
      }
      
      // ブランチをプッシュ
      const pushResult = await pushBranch(workingDir, branchName);
      if (!pushResult.success) {
        return Err(pushResult.error);
      }
      
      if (options.verbose) {
        console.log(`ブランチをプッシュしました: ${branchName}`);
      }
      
      // PRを作成
      const prInfo: PullRequestInfo = {
        title: options.title || `Update ${preset} via ccmm`,
        body: options.body || `ccmm経由で ${preset} プリセットファイルを更新しました。\n\n自動生成されたプルリクエストです。`,
        branch: branchName,
        owner: pointer.owner,
        repo: pointer.repo
      };
      
      const prResult = await openPr(prInfo);
      if (!prResult.success) {
        return Err(prResult.error);
      }
      
      if (options.verbose) {
        console.log(`プルリクエストを作成しました: ${prResult.data}`);
      }
      
      return Ok(prResult.data);
    } finally {
      // 一時ディレクトリをクリーンアップ
      try {
        await execPromise(`rm -rf "${tempDir}"`);
      } catch {
        // クリーンアップエラーは無視
      }
    }
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * メインのpush処理
 * 
 * @param preset - プッシュするプリセット名
 * @param options - pushオプション
 * @returns 処理結果
 */
export async function push(preset: string, options: PushOptions & EditOptions = {}): Promise<Result<string, Error>> {
  try {
    if (!preset) {
      return Err(new Error("プリセット名を指定してください"));
    }
    
    // プリセットファイルのパスを構築（owner オプションは必須）
    if (!options.owner) {
      return Err(new Error("--owner オプションでリポジトリオーナーを指定してください"));
    }
    
    const localPath = buildPresetPath(preset, options.owner, options.repo);
    
    // ローカルファイルの存在確認
    const exists = await fileExists(localPath);
    if (!exists) {
      return Err(new Error(`プリセットファイルが見つかりません: ${localPath}`));
    }
    
    // ローカルファイルの内容を読み取り
    const localContentResult = await readFile(localPath);
    if (!localContentResult.success) {
      return Err(localContentResult.error);
    }
    
    // プリセットポインタを構築
    const pointerResult = parsePresetPath(localPath);
    if (!pointerResult.success) {
      return Err(pointerResult.error);
    }
    const pointer = pointerResult.data;
    
    // アップストリームの内容を取得
    const upstreamContentResult = await fetchUpstreamContent(pointer);
    if (!upstreamContentResult.success) {
      return Err(new Error(`アップストリームファイルの取得に失敗: ${upstreamContentResult.error.message}`));
    }
    
    // 差分をチェック
    const hasDiff = hasContentDiff(localContentResult.data, upstreamContentResult.data);
    if (!hasDiff) {
      return Ok("変更がないため、プッシュする必要はありません");
    }
    
    // ドライランモードの場合は実際の操作をスキップ
    if (options.dryRun) {
      return Ok(`[DRY RUN] ${preset} の変更をプッシュする予定です`);
    }
    
    if (options.verbose) {
      console.log(`差分を検出しました。${preset} の変更をプッシュします...`);
    }
    
    // GitHub連携処理を実行
    const workflowResult = await executeGitHubWorkflow(
      pointer,
      localContentResult.data,
      preset,
      options
    );
    
    if (!workflowResult.success) {
      return Err(workflowResult.error);
    }
    
    return Ok(workflowResult.data);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}