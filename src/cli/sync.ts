/**
 * CLAUDE.md プリセット同期機能の実装
 * 
 * プロジェクトのCLAUDE.mdファイルにプリセットインポート行を挿入・更新し、
 * ~/.ccmm/ 配下でプリセットファイルを管理する同期処理を実装
 */

import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, ensureDir, expandTilde, fileExists, contractTilde } from "../core/fs.js";
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
    // プリセットの@import行を生成（lock機能との整合性のため、絶対パスを~/形式に変換）
    const importLines = presets
      .filter(preset => preset.localPath) // ローカルパスがあるもののみ
      .map(preset => `@${contractTilde(preset.localPath)}`);
    
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
    
    // 新しいimport行を生成（絶対パスを~/形式に変換）
    const newImportLine = `@${contractTilde(mergedPresetPath)}`;
    
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
    // 0. オプションの検証
    if (options.skipSelection && options.reselect) {
      return Err(new Error("--skip-selection and --reselect options cannot be specified simultaneously"));
    }

    // 1. ccmmが初期化されているか確認
    if (!isInitialized()) {
      return Err(new Error("ccmm is not initialized. Please run 'ccmm init' first"));
    }
    
    // 2. Git前処理とプロジェクトセットアップ
    const commit = options.commit || "HEAD";
    const setupResult = await validateAndSetupProject(process.cwd(), commit);
    if (!setupResult.success) {
      return setupResult;
    }
    const { paths, slug } = setupResult.data;
    
    // 3. 既存のCLAUDE.mdを解析
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
    
    // 4. プリセットを決定（プロジェクト別の設定から読み取り）
    const presetPointersResult = getProjectPresetPointers(slug, commit);
    if (!presetPointersResult.success) {
      if (options.verbose) {
        console.warn("Warning: Could not load project preset config:", presetPointersResult.error.message);
      }
    }
    let presetPointers = presetPointersResult.success ? presetPointersResult.data : [];

    // 5. プリセット選択の処理
    if (presetPointers.length === 0) {
      // 初回実行時 - 必ずインタラクティブ選択
      if (options.verbose) {
        console.log("First run, selecting preset files...");
      }
      const interactiveResult = await runInteractivePresetSelection(slug, commit, options);
      if (!interactiveResult.success) {
        return interactiveResult;
      }
      presetPointers = interactiveResult.data;
    } else {
      // 既存設定がある場合の処理
      if (options.reselect) {
        // --reselect: 強制的に再選択
        if (options.verbose) {
          console.log("--reselect option specified, reselecting presets...");
        }
        const interactiveResult = await runInteractivePresetSelection(slug, commit, options);
        if (!interactiveResult.success) {
          return interactiveResult;
        }
        presetPointers = interactiveResult.data;
      } else if (options.skipSelection) {
        // --skip-selection: 現在の設定をそのまま使用
        if (options.verbose) {
          console.log("--skip-selection option specified, using current settings");
        }
      } else {
        // デフォルト: プロンプトで確認
        const promptResult = await promptForReselection(presetPointers);
        if (!promptResult.success) {
          return Err(promptResult.error);
        }
        
        if (promptResult.data) {
          // ユーザーが再選択を希望
          const interactiveResult = await runInteractivePresetSelection(slug, commit, options);
          if (!interactiveResult.success) {
            return interactiveResult;
          }
          presetPointers = interactiveResult.data;
        } else {
          // 現在の設定を維持
          if (options.verbose) {
            console.log("Maintaining current preset settings");
          }
        }
      }
    }
    
    // 6. プリセットを取得
    const fetchResult = await fetchPresets(presetPointers, paths.homePresetDir);
    
    if (!fetchResult.success) {
      return Err(fetchResult.error);
    }
    
    // 7. マージプリセットを生成
    const generateResult = await generateMerged(fetchResult.data, paths.mergedPresetPath, commit);
    if (!generateResult.success) {
      return Err(generateResult.error);
    }
    
    // 8. CLAUDE.mdを更新
    const updateResult = await updateClaudeMd(paths.claudeMd, paths.mergedPresetPath, existingContent);
    if (!updateResult.success) {
      return Err(updateResult.error);
    }
    
    return Ok("Preset synchronization completed");
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 現在のプリセット設定を表示して再選択するかプロンプトで確認する
 * 
 * @param presetPointers - 現在のプリセットポインタのリスト
 * @returns 再選択するかどうかの結果
 */
async function promptForReselection(presetPointers: PresetPointer[]): Promise<Result<boolean, Error>> {
  try {
    console.log("\nCurrent preset settings:");
    presetPointers.forEach((pointer, index) => {
      console.log(`  ${index + 1}. ${pointer.file} (${pointer.owner}/${pointer.repo}@${pointer.commit})`);
    });
    console.log("");

    const { shouldReselect } = await inquirer.prompt({
      type: 'confirm',
      name: 'shouldReselect',
      message: 'Do you want to change preset settings?',
      default: false
    });

    return Ok(shouldReselect);
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
  commit: string,
  options: SyncOptions = {}
): Promise<Result<PresetPointer[], Error>> {
  try {
    console.log("First run. Please select preset files to use.");
    
    // グローバル設定から利用可能なリポジトリを取得
    const configResult = loadConfig();
    if (!configResult.success) {
      return Err(new Error("Failed to load configuration file"));
    }
    
    const config = configResult.data;
    if (!config.defaultPresetRepositories || config.defaultPresetRepositories.length === 0) {
      return Err(new Error("Default preset repositories are not configured. Please run 'ccmm init'"));
    }
    
    // 各リポジトリからプリセットファイル一覧を取得
    const allPresetFiles: Array<{repo: string, file: string, path: string}> = [];
    const failedRepos: Array<{repo: string, error: string}> = [];
    
    for (const repoUrl of config.defaultPresetRepositories) {
      console.log(`Fetching preset files from ${repoUrl}...`);
      
      const scanResult = await scanPresetFiles(repoUrl);
      if (!scanResult.success) {
        const errorMessage = scanResult.error.message;
        failedRepos.push({ repo: repoUrl, error: errorMessage });
        
        // 認証関連のエラーかどうかを判断
        if (errorMessage.includes("GITHUB_TOKEN") || errorMessage.includes("auth")) {
          console.error(`❌ ${repoUrl}: ${errorMessage}`);
        } else {
          console.warn(`⚠️  ${repoUrl}: ${errorMessage}`);
        }
        continue;
      }
      
      console.log(`✅ ${repoUrl}: Found ${scanResult.data.length} preset files`);
      
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
          `Could not fetch preset files. Authentication required.\n\n` +
          `Solutions:\n` +
          `1. GitHub CLI: Run 'gh auth login'\n` +
          `2. Environment variable: Set GITHUB_TOKEN\n\n` +
          `Failed repositories:\n${authErrors.map(f => `- ${f.repo}`).join('\n')}`
        ));
      } else {
        return Err(new Error(
          `No available preset files found.\n\n` +
          `Failed repositories:\n${failedRepos.map(f => `- ${f.repo}: ${f.error}`).join('\n')}`
        ));
      }
    }
    
    let selectedPresets: Array<{repo: string, file: string}>;
    
    // --yes フラグまたは自動選択の場合
    if (options.yes || options.skipSelection) {
      if (config.defaultPresets && config.defaultPresets.length > 0) {
        // defaultPresetsから自動選択
        selectedPresets = allPresetFiles
          .filter(preset => config.defaultPresets?.includes(preset.file))
          .map(preset => ({ repo: preset.repo, file: preset.file }));
        
        if (selectedPresets.length === 0) {
          return Err(new Error(
            `Default presets (${config.defaultPresets.join(', ')}) not found.\n` +
            `Available presets: ${allPresetFiles.map(p => p.file).join(', ')}`
          ));
        }
        
        console.log(`✅ Auto-selected default presets: ${selectedPresets.map(p => p.file).join(', ')}`);
      } else {
        // defaultPresetsが設定されていない場合は全て選択
        selectedPresets = allPresetFiles.map(preset => ({ repo: preset.repo, file: preset.file }));
        console.log(`✅ Selected all available presets: ${selectedPresets.map(p => p.file).join(', ')}`);
      }
    } else {
      // インタラクティブモード
      const choices = allPresetFiles.map(preset => ({
        name: `${preset.file} (${preset.repo})`,
        value: { repo: preset.repo, file: preset.file },
        checked: config.defaultPresets ? config.defaultPresets.includes(preset.file) : false
      }));
      
      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedPresets',
          message: 'Select preset files to use:',
          choices,
          validate: (input) => {
            if (input.length === 0) {
              return 'Please select at least one preset file';
            }
            return true;
          }
        }
      ]);
      
      selectedPresets = answers.selectedPresets;
    }
    
    // 選択結果をプロジェクト別設定に保存
    const saveResult = await saveProjectPresetSelection(projectSlug, selectedPresets);
    if (!saveResult.success) {
      return Err(saveResult.error);
    }
    
    console.log(`${selectedPresets.length} preset files selected.`);
    
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