/**
 * CLAUDE.md プリセット同期機能の実装
 * 
 * プロジェクトのCLAUDE.mdファイルにプリセットインポート行を挿入・更新し、
 * ~/.ccmm/ 配下でプリセットファイルを管理する同期処理を実装
 */

import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, ensureDir, expandTilde, fileExists } from "../core/fs.js";
import { makeSlug } from "../core/slug.js";
import { getOriginUrl, isGitRepository, shallowFetch, batchFetch } from "../git/index.js";
import { validateAndSetupProject, generateProjectPaths } from "../core/project.js";
import { Result, Ok, Err } from "../lib/result.js";
import { isInitialized, loadConfig, getProjectPresetPointers, saveProjectPresetSelection } from "../core/config.js";
import { scanPresetFiles } from "../git/repo-scan.js";
import inquirer from "inquirer";
import type { 
  ClaudeMdContent, 
  PresetImport, 
  PresetPointer, 
  ProjectPaths, 
  SyncOptions,
  PresetInfo,
  MergedPreset
} from "../core/types/index.js";

/**
 * CLAUDE.mdファイルの内容を解析する
 * 
 * @param content - CLAUDE.mdファイルの内容
 * @returns 解析結果（自由記述部分とimport行）
 */
export function parseCLAUDEMd(content: string): Result<ClaudeMdContent, Error> {
  try {
    const lines = content.split('\n');
    
    // 最後の行をチェック（自動エリア）
    const lastLine = lines[lines.length - 1];
    let importLine: string | null = null;
    let importInfo: PresetImport | null = null;
    let freeContentLines = lines;
    
    // import行の形式: @<path>/merged-preset-<SHA>.md (絶対パスも対応)
    const importPattern = /^@(.+\/merged-preset-([^/]+)\.md)$/;
    const match = lastLine?.match(importPattern);
    
    if (match && lastLine) {
      importLine = lastLine;
      const [, path, sha] = match;
      
      if (!path || !sha) {
        return Err(new Error("Invalid import line format"));
      }
      
      // import行からPresetPointerを解析（簡略化版 - 実際のプリセット情報は別途取得）
      const pointer: PresetPointer = {
        host: "github.com", // デフォルト値
        owner: "", // merged-presetからは直接取得できない
        repo: "",
        file: "",
        commit: sha === "HEAD" ? "HEAD" : sha
      };
      
      importInfo = {
        line: importLine!,
        pointer,
        path: path
      };
      
      // 自由記述部分を抽出（最後の行とその前の空行を除外）
      freeContentLines = lines.slice(0, -1);
      
      // 最後が空行の場合はそれも除外
      if (freeContentLines.length > 0 && freeContentLines[freeContentLines.length - 1] === '') {
        freeContentLines = freeContentLines.slice(0, -1);
      }
    }
    
    const freeContent = freeContentLines.join('\n');
    
    return Ok({
      freeContent,
      importLine,
      importInfo
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}



/**
 * 指定されたプリセットポインタリストからプリセットファイルを取得する
 * 
 * @param pointers - 取得するプリセットポインタのリスト
 * @param homePresetDir - プリセット保存先のベースディレクトリ
 * @returns 取得結果
 */
export async function fetchPresets(pointers: PresetPointer[], homePresetDir: string): Promise<Result<PresetInfo[], Error>> {
  try {
    if (pointers.length === 0) {
      return Ok([]);
    }
    
    // 各プリセットのローカルパスを生成
    const localPaths = pointers.map(pointer => 
      join(homePresetDir, pointer.host, pointer.owner, pointer.repo, pointer.file)
    );
    
    // 親ディレクトリを作成
    for (const localPath of localPaths) {
      const dir = dirname(localPath);
      const ensureDirResult = await ensureDir(dir);
      if (!ensureDirResult.success) {
        return Err(ensureDirResult.error);
      }
    }
    
    // プリセットファイルを一括取得
    const fetchResult = await batchFetch(pointers, localPaths);
    if (!fetchResult.success) {
      return Err(fetchResult.error);
    }
    
    // PresetInfo形式で結果を返す
    const presetInfos: PresetInfo[] = [];
    for (let i = 0; i < pointers.length; i++) {
      const pointer = pointers[i]!;
      const localPath = localPaths[i]!;
      
      // ファイルの内容を読み取り
      const contentResult = await readFile(localPath);
      const content = contentResult.success ? contentResult.data : "";
      
      presetInfos.push({
        pointer,
        localPath,
        content,
        lastModified: new Date()
      });
    }
    
    return Ok(presetInfos);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 取得したプリセット情報からmerged-preset-<SHA>.mdファイルを生成する
 * @import行のリストとして生成し、lock機能との整合性を保つ
 * 
 * @param presets - プリセット情報のリスト
 * @param mergedPresetPath - 生成するマージファイルのパス
 * @param commit - コミットハッシュ
 * @returns 生成結果
 */
export async function generateMerged(presets: PresetInfo[], mergedPresetPath: string, commit: string): Promise<Result<MergedPreset, Error>> {
  try {
    // プリセットの@import行を生成（lock機能との整合性のため）
    const importLines = presets
      .filter(preset => preset.localPath) // ローカルパスがあるもののみ
      .map(preset => `@${preset.localPath}`);
    
    // @import行のリストをファイルに書き込み
    const mergedContent = importLines.join('\n');
    
    const writeResult = await writeFile(mergedPresetPath, mergedContent);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }
    
    const merged: MergedPreset = {
      path: mergedPresetPath,
      presets,
      commit
    };
    
    return Ok(merged);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * CLAUDE.mdファイルの自動エリア（最後の行）を更新する
 * 
 * @param claudeMdPath - CLAUDE.mdファイルのパス
 * @param mergedPresetPath - 新しいマージプリセットファイルのパス
 * @param existingContent - 既存のCLAUDE.md解析結果（オプション）
 * @returns 更新結果
 */
export async function updateClaudeMd(
  claudeMdPath: string, 
  mergedPresetPath: string, 
  existingContent?: ClaudeMdContent
): Promise<Result<void, Error>> {
  try {
    let content: ClaudeMdContent;
    
    if (existingContent) {
      content = existingContent;
    } else {
      // CLAUDE.mdを読み取って解析
      const readResult = await readFile(claudeMdPath);
      if (!readResult.success) {
        // ファイルが存在しない場合は新規作成
        content = {
          freeContent: "",
          importLine: null,
          importInfo: null
        };
      } else {
        const parseResult = parseCLAUDEMd(readResult.data);
        if (!parseResult.success) {
          return Err(parseResult.error);
        }
        content = parseResult.data;
      }
    }
    
    // 新しいimport行を生成
    const newImportLine = `@${mergedPresetPath}`;
    
    // 新しいCLAUDE.md内容を生成
    let newContent = content.freeContent;
    
    // 自由記述部分がある場合は空行を追加
    if (newContent.trim().length > 0) {
      newContent += '\n\n';
    }
    
    // import行を追加
    newContent += newImportLine;
    
    // ファイルに書き込み
    const writeResult = await writeFile(claudeMdPath, newContent);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * メイン同期処理
 * 
 * @param options - 同期オプション
 * @returns 同期結果
 */
export async function sync(options: SyncOptions = {}): Promise<Result<string, Error>> {
  try {
    // 0. ccmmが初期化されているか確認
    if (!isInitialized()) {
      return Err(new Error("ccmmが初期化されていません。先に 'ccmm init' を実行してください"));
    }
    
    // 1-4. Git前処理とプロジェクトセットアップ
    const commit = options.commit || "HEAD";
    const setupResult = await validateAndSetupProject(process.cwd(), commit);
    if (!setupResult.success) {
      return setupResult;
    }
    const { paths, slug } = setupResult.data;
    
    // 5. 既存のCLAUDE.mdを解析
    let existingContent: ClaudeMdContent | undefined;
    const claudeMdExists = await fileExists(paths.claudeMd);
    if (claudeMdExists) {
      const readResult = await readFile(paths.claudeMd);
      if (readResult.success) {
        const parseResult = parseCLAUDEMd(readResult.data);
        if (parseResult.success) {
          existingContent = parseResult.data;
        }
      }
    }
    
    // 6. プリセットを決定（プロジェクト別の設定から読み取り）
    const presetPointersResult = getProjectPresetPointers(slug, commit);
    if (!presetPointersResult.success) {
      if (options.verbose) {
        console.warn("Warning: Could not load project preset config:", presetPointersResult.error.message);
      }
    }
    let presetPointers = presetPointersResult.success ? presetPointersResult.data : [];

    // 6a. 初回実行時（プリセットポインタが空）の場合、インタラクティブ選択
    if (presetPointers.length === 0) {
      const interactiveResult = await runInteractivePresetSelection(slug, commit);
      if (!interactiveResult.success) {
        return interactiveResult;
      }
      presetPointers = interactiveResult.data;
    }
    
    // 7. プリセットを取得
    const fetchResult = await fetchPresets(presetPointers, paths.homePresetDir);
    
    if (!fetchResult.success) {
      return Err(fetchResult.error);
    }
    
    // 8. マージプリセットを生成
    const generateResult = await generateMerged(fetchResult.data, paths.mergedPresetPath, commit);
    if (!generateResult.success) {
      return Err(generateResult.error);
    }
    
    // 9. CLAUDE.mdを更新
    const updateResult = await updateClaudeMd(paths.claudeMd, paths.mergedPresetPath, existingContent);
    if (!updateResult.success) {
      return Err(updateResult.error);
    }
    
    return Ok("プリセットの同期が完了しました");
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * インタラクティブなプリセットファイル選択を実行する
 * 
 * @param projectSlug - プロジェクトのスラッグ
 * @param commit - コミットハッシュ
 * @returns 選択されたプリセットポインタの配列
 */
async function runInteractivePresetSelection(
  projectSlug: string, 
  commit: string
): Promise<Result<PresetPointer[], Error>> {
  try {
    console.log("初回実行です。使用するプリセットファイルを選択してください。");
    
    // グローバル設定から利用可能なリポジトリを取得
    const configResult = loadConfig();
    if (!configResult.success) {
      return Err(new Error("設定ファイルの読み込みに失敗しました"));
    }
    
    const config = configResult.data;
    if (!config.defaultPresetRepositories || config.defaultPresetRepositories.length === 0) {
      return Err(new Error("デフォルトプリセットリポジトリが設定されていません。'ccmm init' を実行してください"));
    }
    
    // 各リポジトリからプリセットファイル一覧を取得
    const allPresetFiles: Array<{repo: string, file: string, path: string}> = [];
    const failedRepos: Array<{repo: string, error: string}> = [];
    
    for (const repoUrl of config.defaultPresetRepositories) {
      console.log(`${repoUrl} からプリセットファイルを取得中...`);
      
      const scanResult = await scanPresetFiles(repoUrl);
      if (!scanResult.success) {
        const errorMessage = scanResult.error.message;
        failedRepos.push({ repo: repoUrl, error: errorMessage });
        
        // 認証関連のエラーかどうかを判断
        if (errorMessage.includes("GITHUB_TOKEN") || errorMessage.includes("認証")) {
          console.error(`❌ ${repoUrl}: ${errorMessage}`);
        } else {
          console.warn(`⚠️  ${repoUrl}: ${errorMessage}`);
        }
        continue;
      }
      
      console.log(`✅ ${repoUrl}: ${scanResult.data.length}個のプリセットファイルを発見`);
      
      for (const fileInfo of scanResult.data) {
        allPresetFiles.push({
          repo: repoUrl,
          file: fileInfo.path,
          path: fileInfo.path
        });
      }
    }
    
    if (allPresetFiles.length === 0) {
      // すべてのリポジトリが失敗した場合、詳細なエラー情報を提供
      const authErrors = failedRepos.filter(f => f.error.includes("GITHUB_TOKEN") || f.error.includes("認証"));
      
      if (authErrors.length > 0) {
        return Err(new Error(
          `プリセットファイルを取得できませんでした。認証が必要です。\n\n` +
          `解決方法:\n` +
          `1. GitHub CLI: 'gh auth login' を実行\n` +
          `2. 環境変数: GITHUB_TOKEN を設定\n\n` +
          `失敗したリポジトリ:\n${authErrors.map(f => `- ${f.repo}`).join('\n')}`
        ));
      } else {
        return Err(new Error(
          `利用可能なプリセットファイルが見つかりませんでした。\n\n` +
          `失敗したリポジトリ:\n${failedRepos.map(f => `- ${f.repo}: ${f.error}`).join('\n')}`
        ));
      }
    }
    
    // inquirer でマルチセレクト UI を表示
    const choices = allPresetFiles.map(preset => ({
      name: `${preset.file} (${preset.repo})`,
      value: { repo: preset.repo, file: preset.file },
      checked: false
    }));
    
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedPresets',
        message: '使用するプリセットファイルを選択してください:',
        choices,
        validate: (input) => {
          if (input.length === 0) {
            return '少なくとも1つのプリセットファイルを選択してください';
          }
          return true;
        }
      }
    ]);
    
    const selectedPresets = answers.selectedPresets as Array<{repo: string, file: string}>;
    
    // 選択結果をプロジェクト別設定に保存
    const saveResult = await saveProjectPresetSelection(projectSlug, selectedPresets);
    if (!saveResult.success) {
      return Err(saveResult.error);
    }
    
    console.log(`${selectedPresets.length}個のプリセットファイルが選択されました。`);
    
    // PresetPointer 配列に変換
    const presetPointers: PresetPointer[] = [];
    
    for (const preset of selectedPresets) {
      // GitHub URLをパース
      const urlParts = preset.repo.replace(/^https?:\/\//, '').split('/');
      if (urlParts.length >= 3 && urlParts[0] === 'github.com') {
        presetPointers.push({
          host: urlParts[0]!,
          owner: urlParts[1]!,
          repo: urlParts[2]!,
          file: preset.file,
          commit: commit
        });
      }
    }
    
    return Ok(presetPointers);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}