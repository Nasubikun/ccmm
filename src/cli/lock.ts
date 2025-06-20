/**
 * プリセットロック機能の実装
 * 
 * 特定のコミットSHAでプリセットをロックし、
 * vendor ディレクトリにプリセットファイルをコピーして
 * オフライン利用を可能にする
 */

import { join, dirname, relative } from "node:path";
import { copyFile } from "node:fs/promises";
import { readFile, writeFile, ensureDir, fileExists, expandTilde } from "../core/fs.js";
import { makeSlug } from "../core/slug.js";
import { getOriginUrl, isGitRepository } from "../git/index.js";
import { validateAndSetupProject } from "../core/project.js";
import { 
  parseCLAUDEMd, 
  fetchPresets, 
  generateMerged, 
  updateClaudeMd 
} from "./sync.js";
import { generateProjectPaths } from "../core/project.js";
import { Result, Ok, Err } from "../lib/result.js";
import type { 
  LockOptions, 
  ClaudeMdContent, 
  PresetPointer, 
  ProjectPaths,
  PresetInfo,
  VendorInfo
} from "../core/types/index.js";

/**
 * ベンダーディレクトリのパス情報を生成する
 * 
 * @param projectPaths - プロジェクトのパス情報
 * @param sha - ロックするコミットSHA
 * @returns ベンダーディレクトリ情報
 */
export function generateVendorPaths(projectPaths: ProjectPaths, sha: string): VendorInfo {
  const vendorDir = join(projectPaths.projectDir, "vendor", sha);
  
  return {
    path: vendorDir,
    lockedSha: sha,
    files: [] // 後で設定
  };
}

/**
 * プリセットファイルをベンダーディレクトリにコピーする
 * 
 * @param presets - コピーするプリセット情報のリスト
 * @param vendorInfo - ベンダーディレクトリ情報
 * @returns コピー結果
 */
export async function copyPresetsToVendor(
  presets: PresetInfo[], 
  vendorInfo: VendorInfo
): Promise<Result<VendorInfo, Error>> {
  try {
    // ベンダーディレクトリを作成
    const ensureDirResult = await ensureDir(vendorInfo.path);
    if (!ensureDirResult.success) {
      return Err(ensureDirResult.error);
    }
    
    const vendorFiles: string[] = [];
    
    // 各プリセットファイルをベンダーディレクトリにコピー
    for (const preset of presets) {
      const { pointer } = preset;
      const vendorFileName = `${pointer.host}_${pointer.owner}_${pointer.repo}_${pointer.file}`;
      const vendorFilePath = join(vendorInfo.path, vendorFileName);
      
      // ソースファイルが存在するかチェック（チルダ展開対応）
      const expandedLocalPath = expandTilde(preset.localPath);
      const exists = await fileExists(expandedLocalPath);
      if (!exists) {
        return Err(new Error(`Source preset file not found: ${preset.localPath}`));
      }
      
      // ファイルをコピー
      await copyFile(expandedLocalPath, vendorFilePath);
      vendorFiles.push(vendorFileName);
    }
    
    return Ok({
      ...vendorInfo,
      files: vendorFiles
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ベンダーディレクトリ内のファイルパスを使用してmerged-presetファイルを生成する
 * 
 * @param presets - プリセット情報のリスト
 * @param vendorInfo - ベンダーディレクトリ情報
 * @param mergedPresetPath - 生成するマージファイルのパス
 * @returns 生成結果
 */
export async function generateVendorMerged(
  presets: PresetInfo[], 
  vendorInfo: VendorInfo, 
  mergedPresetPath: string
): Promise<Result<void, Error>> {
  try {
    const vendorRelativePaths: string[] = [];
    
    // 各プリセットのベンダーパスを相対パスで生成
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i]!;
      const vendorFileName = vendorInfo.files[i]!;
      const vendorFilePath = join(vendorInfo.path, vendorFileName);
      
      // merged-preset-<sha>.md からの相対パスを計算
      const relativePath = relative(dirname(mergedPresetPath), vendorFilePath);
      vendorRelativePaths.push(`@${relativePath}`);
    }
    
    // merge-preset-<sha>.md ファイルの内容を生成
    const mergedContent = vendorRelativePaths.join('\n');
    
    // ファイルに書き込み
    const writeResult = await writeFile(mergedPresetPath, mergedContent);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 現在のプリセット設定を取得する（CLAUDE.mdから解析）
 * 
 * @param claudeMdPath - CLAUDE.mdファイルのパス
 * @param paths - プロジェクトのパス情報
 * @returns 現在のプリセット情報
 */
export async function getCurrentPresets(
  claudeMdPath: string, 
  paths: ProjectPaths
): Promise<Result<PresetInfo[], Error>> {
  try {
    // CLAUDE.mdが存在しない場合は空のリストを返す
    const exists = await fileExists(claudeMdPath);
    if (!exists) {
      return Ok([]);
    }
    
    // CLAUDE.mdを読み取って解析
    const readResult = await readFile(claudeMdPath);
    if (!readResult.success) {
      return Err(readResult.error);
    }
    
    const parseResult = parseCLAUDEMd(readResult.data);
    if (!parseResult.success) {
      return Err(parseResult.error);
    }
    
    const content = parseResult.data;
    
    // import行がない場合は空のリストを返す
    if (!content.importInfo) {
      return Ok([]);
    }
    
    // merged-preset ファイルからプリセット情報を読み取り
    const mergedPresetPath = expandTilde(content.importInfo.path);
    
    // merged-preset ファイルが存在することを確認
    const mergedExists = await fileExists(mergedPresetPath);
    if (!mergedExists) {
      return Err(new Error(`Merged preset file not found: ${mergedPresetPath}`));
    }
    
    // merged-preset ファイルの内容を読み取り
    const mergedContent = await readFile(mergedPresetPath);
    if (!mergedContent.success) {
      return Err(mergedContent.error);
    }
    
    // @import行をプリセット情報に変換
    const importLines = mergedContent.data.split('\n').filter(line => line.startsWith('@'));
    const presetInfos: PresetInfo[] = [];
    
    for (const line of importLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('@')) continue;
      
      const presetPath = trimmedLine.substring(1); // @を除去
      
      // プリセットファイルが存在するか確認
      const expandedPresetPath = expandTilde(presetPath);
      const presetExists = await fileExists(expandedPresetPath);
      if (presetExists) {
        const presetContent = await readFile(expandedPresetPath);
        if (presetContent.success) {
          // 簡略化されたPresetPointer（実際のプリセット操作に必要な最小限の情報）
          const pointer: PresetPointer = {
            host: "localhost", // file://の場合
            owner: "local",
            repo: "presets", 
            file: presetPath.split('/').pop() || '',
            commit: content.importInfo.pointer.commit
          };
          
          presetInfos.push({
            pointer,
            localPath: presetPath,
            content: presetContent.data
          });
        }
      }
    }
    
    return Ok(presetInfos);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * メインのロック処理
 * 
 * @param sha - ロックするコミットSHA
 * @param options - ロックオプション
 * @returns ロック結果
 */
export async function lock(sha: string, options: LockOptions = { sha }): Promise<Result<string, Error>> {
  try {
    // 1-3. Git前処理とプロジェクトセットアップ
    const setupResult = await validateAndSetupProject(process.cwd(), sha);
    if (!setupResult.success) {
      return setupResult;
    }
    const { paths } = setupResult.data;
    
    // 4. 現在のプリセット設定を取得
    const currentPresetsResult = await getCurrentPresets(paths.claudeMd, paths);
    if (!currentPresetsResult.success) {
      return Err(currentPresetsResult.error);
    }
    const currentPresets = currentPresetsResult.data;
    
    // 5. プリセットが設定されていない場合はエラー
    if (currentPresets.length === 0) {
      return Err(new Error("No presets found to lock. Please run sync command first"));
    }
    
    // 6. ベンダーディレクトリ情報を生成
    const vendorInfo = generateVendorPaths(paths, sha);
    
    // 7. プリセットファイルをベンダーディレクトリにコピー
    const copyResult = await copyPresetsToVendor(currentPresets, vendorInfo);
    if (!copyResult.success) {
      return Err(copyResult.error);
    }
    const updatedVendorInfo = copyResult.data;
    
    // 8. ベンダー版のmerged-preset-<sha>.mdを生成
    const generateVendorResult = await generateVendorMerged(
      currentPresets, 
      updatedVendorInfo, 
      paths.mergedPresetPath
    );
    if (!generateVendorResult.success) {
      return Err(generateVendorResult.error);
    }
    
    // 9. CLAUDE.mdのimport行を更新
    const updateResult = await updateClaudeMd(paths.claudeMd, paths.mergedPresetPath);
    if (!updateResult.success) {
      return Err(updateResult.error);
    }
    
    return Ok(`Presets locked at ${sha}`);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}