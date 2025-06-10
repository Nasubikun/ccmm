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
import { Result, Ok, Err } from "../lib/result.js";
import { isInitialized } from "./init.js";
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
 * プロジェクトのパス情報を生成する
 * 
 * @param projectRoot - プロジェクトのルートディレクトリ
 * @param originUrl - GitリポジトリのoriginURL  
 * @param commit - コミットハッシュまたはHEAD
 * @returns パス情報
 */
export function generateProjectPaths(projectRoot: string, originUrl: string, commit: string): Result<ProjectPaths, Error> {
  try {
    const slug = makeSlug(originUrl);
    const homeDir = homedir();
    const ccmmHome = join(homeDir, '.ccmm');
    
    const paths: ProjectPaths = {
      root: projectRoot,
      claudeMd: join(projectRoot, 'CLAUDE.md'),
      homePresetDir: join(ccmmHome, 'presets'),
      projectDir: join(ccmmHome, 'projects', slug),
      mergedPresetPath: join(ccmmHome, 'projects', slug, `merged-preset-${commit}.md`)
    };
    
    return Ok(paths);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ローカルファイルシステムからプリセットファイルを取得する（file://用）
 * 
 * @param pointers - 取得するプリセットポインタのリスト
 * @param homePresetDir - プリセット保存先のベースディレクトリ
 * @returns 取得結果
 */
export async function fetchLocalPresets(pointers: PresetPointer[], homePresetDir: string): Promise<Result<PresetInfo[], Error>> {
  try {
    if (pointers.length === 0) {
      return Ok([]);
    }
    
    const presetInfos: PresetInfo[] = [];
    
    for (const pointer of pointers) {
      // ローカルパスを生成
      const localPath = join(homePresetDir, pointer.host, pointer.owner, pointer.repo, pointer.file);
      
      // 親ディレクトリを作成
      const dir = dirname(localPath);
      const ensureDirResult = await ensureDir(dir);
      if (!ensureDirResult.success) {
        return Err(ensureDirResult.error);
      }
      
      // configからソースパスを取得
      const { loadConfig } = await import("./init.js");
      const configResult = loadConfig();
      
      if (!configResult.success || !configResult.data.defaultPresetRepo) {
        return Err(new Error("Config not found for local preset source"));
      }
      
      const sourcePath = configResult.data.defaultPresetRepo.replace("file://", "");
      const sourceFile = join(sourcePath, pointer.file);
      
      // ファイルが存在することを確認
      const sourceExists = await fileExists(sourceFile);
      if (!sourceExists) {
        return Err(new Error(`Source preset file not found: ${sourceFile}`));
      }
      
      // ファイルをコピー
      const readResult = await readFile(sourceFile);
      if (!readResult.success) {
        return Err(new Error(`Failed to read preset file: ${readResult.error.message}`));
      }
      
      const writeResult = await writeFile(localPath, readResult.data);
      if (!writeResult.success) {
        return Err(new Error(`Failed to write preset file: ${writeResult.error.message}`));
      }
      
      presetInfos.push({
        pointer,
        localPath,
        content: readResult.data
      });
    }
    
    return Ok(presetInfos);
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
export async function sync(options: SyncOptions = {}): Promise<Result<void, Error>> {
  try {
    const projectRoot = process.cwd();
    
    // 0. ccmmが初期化されているか確認
    if (!isInitialized()) {
      return Err(new Error("ccmmが初期化されていません。先に 'ccmm init' を実行してください"));
    }
    
    // 1. Gitリポジトリの確認
    const isGitResult = await isGitRepository(projectRoot);
    if (!isGitResult.success || !isGitResult.data) {
      return Err(new Error("現在のディレクトリはGitリポジトリではありません"));
    }
    
    // 2. originURLを取得
    const originResult = await getOriginUrl(projectRoot);
    if (!originResult.success) {
      return Err(new Error(`originURLを取得できませんでした: ${originResult.error.message}`));
    }
    
    // 3. コミットハッシュを決定
    const commit = options.commit || "HEAD";
    
    // 4. パス情報を生成
    const pathsResult = generateProjectPaths(projectRoot, originResult.data, commit);
    if (!pathsResult.success) {
      return Err(pathsResult.error);
    }
    const paths = pathsResult.data;
    
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
    
    // 6. プリセットを決定（config.jsonからデフォルトプリセットを読み取り）
    const presetPointers: PresetPointer[] = [];
    
    // config.jsonからデフォルトプリセットを読み取り
    try {
      const { loadConfig } = await import("./init.js");
      const configResult = loadConfig();
      
      if (configResult.success) {
        const config = configResult.data;
        
        // デフォルトプリセットリポジトリとプリセットが設定されている場合
        if (config.defaultPresetRepo && config.defaultPresets) {
          const repoUrl = config.defaultPresetRepo;
          
          // file:// プロトコルの場合の特別処理
          if (repoUrl.startsWith("file://")) {
            const localPath = repoUrl.replace("file://", "");
            
            for (const presetFile of config.defaultPresets) {
              presetPointers.push({
                host: "localhost",
                owner: "local",
                repo: "presets",
                file: presetFile,
                commit: commit
              });
            }
          } else {
            // 通常のGitリポジトリの場合（将来の拡張用）
            // TODO: GitリポジトリURLのパース実装
          }
        }
      }
    } catch (error) {
      // config読み取りエラーは警告のみ（syncは続行）
      if (options.verbose) {
        console.warn("Warning: Could not load preset config:", error);
      }
    }
    
    // 7. プリセットを取得
    let fetchResult: Result<PresetInfo[], Error>;
    
    // file://プロトコルの場合は直接ファイルコピー
    if (presetPointers.length > 0 && presetPointers[0]?.host === "localhost") {
      fetchResult = await fetchLocalPresets(presetPointers, paths.homePresetDir);
    } else {
      fetchResult = await fetchPresets(presetPointers, paths.homePresetDir);
    }
    
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
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}