/**
 * プリセットロック機能の実装
 * 
 * 特定のコミットSHAでプリセットをロックし、
 * vendor ディレクトリにプリセットファイルをコピーして
 * オフライン利用を可能にする
 */

import { join, dirname, relative } from "node:path";
import { copyFile } from "node:fs/promises";
import { readFile, writeFile, ensureDir, fileExists } from "../core/fs.js";
import { makeSlug } from "../core/slug.js";
import { getOriginUrl, isGitRepository } from "../git/index.js";
import { 
  parseCLAUDEMd, 
  generateProjectPaths, 
  fetchPresets, 
  generateMerged, 
  updateClaudeMd 
} from "./sync.js";
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
      
      // ソースファイルが存在するかチェック
      const exists = await fileExists(preset.localPath);
      if (!exists) {
        return Err(new Error(`Source preset file not found: ${preset.localPath}`));
      }
      
      // ファイルをコピー
      await copyFile(preset.localPath, vendorFilePath);
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
    
    // merged-preset ファイルが存在する場合、そこからプリセット情報を読み取り
    // 現在の実装では簡略化して空のリストを返す
    // 実際の実装では merged-preset ファイルを解析してプリセット情報を復元する必要がある
    
    return Ok([]);
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
export async function lock(sha: string, options: LockOptions = { sha }): Promise<Result<void, Error>> {
  try {
    const projectRoot = process.cwd();
    
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
    
    // 3. パス情報を生成
    const pathsResult = generateProjectPaths(projectRoot, originResult.data, sha);
    if (!pathsResult.success) {
      return Err(pathsResult.error);
    }
    const paths = pathsResult.data;
    
    // 4. 現在のプリセット設定を取得
    const currentPresetsResult = await getCurrentPresets(paths.claudeMd, paths);
    if (!currentPresetsResult.success) {
      return Err(currentPresetsResult.error);
    }
    const currentPresets = currentPresetsResult.data;
    
    // 5. プリセットが設定されていない場合はエラー
    if (currentPresets.length === 0) {
      return Err(new Error("ロックするプリセットが見つかりません。まず sync コマンドを実行してください"));
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
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}