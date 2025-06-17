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
import inquirer from "inquirer";
import { readFile, writeFile, fileExists } from "../core/fs.js";
import { buildPresetPath, parsePresetPath, hasContentDiff } from "../core/preset.js";
import { Result, Ok, Err } from "../lib/result.js";
import { 
  shallowFetch, 
  openPr, 
  createAndCheckoutBranch,
  type PullRequestInfo 
} from "../git/index.js";
import { validateAndSetupProject } from "../core/project.js";
import { getProjectPresetPointers } from "../core/config.js";
import type { 
  PresetPointer, 
  PushOptions,
  EditOptions
} from "../core/types/index.js";

const execPromise = promisify(exec);

/**
 * プッシュ可能なプリセット情報
 */
interface PushablePreset {
  /** プリセット名 */
  name: string;
  /** プリセットポインタ */
  pointer: PresetPointer;
  /** ローカルファイルパス */
  localPath: string;
  /** 変更があるかどうか */
  hasChanges: boolean;
}

/**
 * プロジェクトのプリセット一覧を取得し、変更のあるものをフィルタリングする
 * 
 * @param options - pushオプション
 * @returns プッシュ可能なプリセット一覧またはエラー
 */
export async function getPushablePresets(options: PushOptions & EditOptions = {}): Promise<Result<PushablePreset[], Error>> {
  try {
    // プロジェクトの設定を取得
    const setupResult = await validateAndSetupProject();
    if (!setupResult.success) {
      return Err(setupResult.error);
    }
    
    const { slug } = setupResult.data;
    
    // プロジェクトのプリセット一覧を取得
    const pointersResult = getProjectPresetPointers(slug);
    if (!pointersResult.success) {
      return Err(pointersResult.error);
    }
    
    const pointers = pointersResult.data;
    if (pointers.length === 0) {
      return Ok([]);
    }
    
    const pushablePresets: PushablePreset[] = [];
    
    // 各プリセットをチェック
    for (const pointer of pointers) {
      const localPath = buildPresetPath(pointer.file, pointer.owner, pointer.repo);
      
      // ローカルファイルの存在確認
      const exists = await fileExists(localPath);
      if (!exists) {
        continue; // 存在しないファイルはスキップ
      }
      
      // ローカルファイルの内容を読み取り
      const localContentResult = await readFile(localPath);
      if (!localContentResult.success) {
        continue; // 読み取りエラーはスキップ
      }
      
      let hasChanges = false;
      
      try {
        // アップストリームの内容を取得
        const upstreamContentResult = await fetchUpstreamContent(pointer);
        if (upstreamContentResult.success) {
          // 差分をチェック
          hasChanges = hasContentDiff(localContentResult.data, upstreamContentResult.data);
        } else {
          // アップストリームが存在しない場合も変更ありとみなす
          hasChanges = true;
        }
      } catch {
        // エラーが発生した場合も変更ありとみなす
        hasChanges = true;
      }
      
      pushablePresets.push({
        name: pointer.file,
        pointer,
        localPath,
        hasChanges
      });
    }
    
    return Ok(pushablePresets);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * インタラクティブにプリセットを選択する
 * 
 * @param presets - 選択可能なプリセット一覧
 * @returns 選択されたプリセット名またはエラー
 */
export async function selectPresetInteractive(presets: PushablePreset[]): Promise<Result<string, Error>> {
  try {
    if (presets.length === 0) {
      return Err(new Error("No pushable presets available"));
    }
    
    // 単一プリセットの場合は自動選択
    if (presets.length === 1) {
      const preset = presets[0];
      if (!preset) {
        return Err(new Error("Invalid preset information"));
      }
      
      console.log(`Auto-selected preset '${preset.name}'`);
      return Ok(preset.name);
    }
    
    // 複数プリセットの場合は選択UI表示
    const choices = presets.map(preset => ({
      name: `${preset.name} (${preset.pointer.owner}/${preset.pointer.repo})${preset.hasChanges ? ' *has changes' : ''}`,
      value: preset.name,
      disabled: !preset.hasChanges
    }));
    
    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'preset',
      message: 'Select preset to push:',
      choices
    }]);
    
    return Ok(answer.preset);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
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
      return Err(new Error("Failed to create commit"));
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
        console.log(`Cloned repository: ${repoUrl}`);
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
          console.log(`Forked and cloned repository: ${forkUrl}`);
        }
      } catch (forkError) {
        return Err(new Error(`Failed to clone/fork repository: ${forkError}`));
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
        console.log(`Created branch: ${branchName}`);
      }
      
      // ファイルを更新
      const targetFilePath = join(workingDir, pointer.file);
      const writeResult = await writeFile(targetFilePath, content);
      if (!writeResult.success) {
        return Err(writeResult.error);
      }
      
      if (options.verbose) {
        console.log(`Updated file: ${pointer.file}`);
      }
      
      // コミットを作成
      const commitMessage = options.title || `Update ${preset} via ccmm`;
      const commitResult = await commitChanges(workingDir, [pointer.file], commitMessage);
      if (!commitResult.success) {
        return Err(commitResult.error);
      }
      
      if (options.verbose) {
        console.log(`Created commit: ${commitResult.data}`);
      }
      
      // ブランチをプッシュ
      const pushResult = await pushBranch(workingDir, branchName);
      if (!pushResult.success) {
        return Err(pushResult.error);
      }
      
      if (options.verbose) {
        console.log(`Pushed branch: ${branchName}`);
      }
      
      // PRを作成
      const prInfo: PullRequestInfo = {
        title: options.title || `Update ${preset} via ccmm`,
        body: options.body || `Updated ${preset} preset file via ccmm.\n\nThis is an automatically generated pull request.`,
        branch: branchName,
        owner: pointer.owner,
        repo: pointer.repo
      };
      
      const prResult = await openPr(prInfo);
      if (!prResult.success) {
        return Err(prResult.error);
      }
      
      if (options.verbose) {
        console.log(`Created pull request: ${prResult.data}`);
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
    let selectedPreset: string = preset;
    let selectedPresetInfo: PushablePreset | undefined;
    
    // プリセットが指定されていない場合、インタラクティブに選択
    if (!preset || preset.trim() === '') {
      // プロジェクトがGitリポジトリであるかチェック
      try {
        const setupResult = await validateAndSetupProject();
        if (!setupResult.success) {
          // Gitリポジトリでない場合などは、通常のエラーメッセージを返す
          return Err(new Error("Please specify preset name"));
        }
      } catch {
        return Err(new Error("Please specify preset name"));
      }
      
      // プッシュ可能なプリセット一覧を取得
      const presetsResult = await getPushablePresets(options);
      if (!presetsResult.success) {
        // プリセット取得に失敗した場合も、わかりやすいエラーメッセージを返す
        return Err(new Error("Please specify preset name"));
      }
      
      const presets = presetsResult.data;
      
      if (presets.length === 0) {
        return Err(new Error(
          "No pushable presets available.\n" +
          "Please first set up presets with 'ccmm sync' and edit them with 'ccmm edit'."
        ));
      }
      
      // 変更のあるプリセットのみフィルタリング
      const changedPresets = presets.filter(p => p.hasChanges);
      
      if (changedPresets.length === 0) {
        console.log("\nAvailable presets:");
        presets.forEach(p => {
          console.log(`  - ${p.name} (${p.pointer.owner}/${p.pointer.repo})`);
        });
        return Err(new Error("\nNo presets with changes found.\nPlease edit presets with 'ccmm edit <preset>' and then run again."));
      }
      
      // インタラクティブに選択
      const selectionResult = await selectPresetInteractive(changedPresets);
      if (!selectionResult.success) {
        return Err(selectionResult.error);
      }
      
      selectedPreset = selectionResult.data;
      selectedPresetInfo = changedPresets.find(p => p.name === selectedPreset);
      
      if (!selectedPresetInfo) {
        return Err(new Error("Selected preset information not found"));
      }
    }
    
    // 以降は既存の処理を流用するが、selectedPresetInfoがある場合はそれを優先
    let localPath: string;
    let pointer: PresetPointer;
    
    if (selectedPresetInfo) {
      localPath = selectedPresetInfo.localPath;
      pointer = selectedPresetInfo.pointer;
    } else {
      // 従来の処理（プリセット名が直接指定された場合）
      if (!options.owner) {
        // ownerが指定されていない場合、プロジェクトから推測を試みる
        const presetsResult = await getPushablePresets(options);
        if (presetsResult.success) {
          const matchingPreset = presetsResult.data.find(p => p.name === selectedPreset);
          if (matchingPreset) {
            localPath = matchingPreset.localPath;
            pointer = matchingPreset.pointer;
          } else {
            return Err(new Error(`Preset '${selectedPreset}' not found. Please specify repository owner with --owner option.`));
          }
        } else {
          return Err(new Error("Please specify repository owner with --owner option"));
        }
      } else {
        localPath = buildPresetPath(selectedPreset, options.owner, options.repo);
        
        // ローカルファイルの存在確認
        const exists = await fileExists(localPath);
        if (!exists) {
          return Err(new Error(`Preset file not found: ${localPath}`));
        }
        
        // プリセットポインタを構築
        const pointerResult = parsePresetPath(localPath);
        if (!pointerResult.success) {
          return Err(pointerResult.error);
        }
        pointer = pointerResult.data;
      }
    }
    
    // ローカルファイルの内容を読み取り
    const localContentResult = await readFile(localPath);
    if (!localContentResult.success) {
      return Err(localContentResult.error);
    }
    
    // アップストリームの内容を取得
    const upstreamContentResult = await fetchUpstreamContent(pointer);
    if (!upstreamContentResult.success) {
      return Err(new Error(`Failed to fetch upstream file: ${upstreamContentResult.error.message}`));
    }
    
    // 差分をチェック
    const hasDiff = hasContentDiff(localContentResult.data, upstreamContentResult.data);
    if (!hasDiff) {
      return Ok("No changes to push");
    }
    
    // ドライランモードの場合は実際の操作をスキップ
    if (options.dryRun) {
      return Ok(`[DRY RUN] Will push changes for ${preset}`);
    }
    
    if (options.verbose) {
      console.log(`Detected changes. Pushing changes for ${preset}...`);
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