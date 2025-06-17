/**
 * プリセットアンロック機能の実装
 * 
 * ロックされたプリセットを解除し、merged-preset-HEAD.mdを再生成して
 * リモートの最新プリセットを使用する状態に戻す
 */

import { readFile, fileExists } from "../core/fs.js";
import { getOriginUrl, isGitRepository } from "../git/index.js";
import { validateAndSetupProject } from "../core/project.js";
import { getProjectPresetPointers } from "../core/config.js";
import { 
  parseCLAUDEMd, 
  fetchPresets, 
  generateMerged, 
  updateClaudeMd 
} from "./sync.js";
import { generateProjectPaths } from "../core/project.js";
import { Result, Ok, Err } from "../lib/result.js";
import type { 
  CliOptions, 
  ClaudeMdContent, 
  PresetPointer, 
  ProjectPaths,
  PresetInfo
} from "../core/types/index.js";

/**
 * 現在のロック状態を検出する
 * 
 * @param claudeMdPath - CLAUDE.mdファイルのパス  
 * @param paths - プロジェクトのパス情報
 * @returns ロック状態の情報
 */
export async function detectLockState(
  claudeMdPath: string, 
  paths: ProjectPaths
): Promise<Result<{ isLocked: boolean; currentSha?: string }, Error>> {
  try {
    // CLAUDE.mdが存在しない場合はロックされていない
    const exists = await fileExists(claudeMdPath);
    if (!exists) {
      return Ok({ isLocked: false });
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
    
    // import行がない場合はロックされていない
    if (!content.importInfo) {
      return Ok({ isLocked: false });
    }
    
    // import行のコミット情報をチェック
    const commit = content.importInfo.pointer.commit;
    
    // ロック状態の判定：
    // 1. merged-preset-<具体的なSHA>.md の場合はロック済み（短縮SHAも含む）
    // 2. merged-preset-HEAD.md の場合でも、vendor/が存在する場合はロック済み
    const importPath = content.importInfo.path;
    const isLockedBySha = commit !== "HEAD" && commit.length >= 7; // 7文字以上のSHA（短縮も含む）
    const isLockedByVendor = importPath.includes("/vendor/");
    const isLocked = isLockedBySha || isLockedByVendor;
    
    return Ok({ 
      isLocked, 
      currentSha: isLocked ? commit : undefined 
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ロックされた状態から元のプリセット設定を復元する
 * 
 * @param paths - プロジェクトのパス情報
 * @param slug - プロジェクトのスラッグ
 * @param lockedSha - ロックされているSHA（オプション）
 * @returns 復元されたプリセット情報
 */
export async function restorePresetConfiguration(
  paths: ProjectPaths, 
  slug: string,
  lockedSha?: string
): Promise<Result<PresetPointer[], Error>> {
  try {
    // プリセット設定をプロジェクト別設定から復元
    const presetPointersResult = getProjectPresetPointers(slug, "HEAD");
    if (presetPointersResult.success) {
      return presetPointersResult;
    }
    
    // プロジェクト設定が無い場合は空のプリセットリストを返す
    return Ok([]);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * HEAD版のmerged-preset-HEAD.mdを再生成する
 * 
 * @param presetPointers - 復元するプリセットポインタのリスト
 * @param paths - プロジェクトのパス情報
 * @returns 再生成結果
 */
export async function regenerateHeadMerged(
  presetPointers: PresetPointer[], 
  paths: ProjectPaths
): Promise<Result<void, Error>> {
  try {
    // HEAD版のパス情報を生成
    const headPaths = {
      ...paths,
      mergedPresetPath: paths.mergedPresetPath.replace(/-[^-]+\.md$/, "-HEAD.md")
    };
    
    // 1. プリセットを取得（最新版）
    const fetchResult = await fetchPresets(presetPointers, paths.homePresetDir);
    
    if (!fetchResult.success) {
      return Err(fetchResult.error);
    }
    
    // 2. HEAD版のマージプリセットを生成
    const generateResult = await generateMerged(
      fetchResult.data, 
      headPaths.mergedPresetPath, 
      "HEAD"
    );
    if (!generateResult.success) {
      return Err(generateResult.error);
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * メインのアンロック処理
 * 
 * @param options - アンロックオプション
 * @returns アンロック結果
 */
export async function unlock(options: CliOptions = {}): Promise<Result<string, Error>> {
  try {
    // 1-3. Git前処理とプロジェクトセットアップ（HEAD版用）
    const setupResult = await validateAndSetupProject(process.cwd(), "HEAD");
    if (!setupResult.success) {
      return setupResult;
    }
    const { paths, slug } = setupResult.data;
    
    // 4. 現在のロック状態を検出
    const lockStateResult = await detectLockState(paths.claudeMd, paths);
    if (!lockStateResult.success) {
      return Err(lockStateResult.error);
    }
    const lockState = lockStateResult.data;
    
    // 5. ロックされていない場合は何もしない
    if (!lockState.isLocked) {
      return Err(new Error("Presets are not locked"));
    }
    
    // 6. プリセット設定を復元
    const restoreResult = await restorePresetConfiguration(paths, slug, lockState.currentSha);
    if (!restoreResult.success) {
      return Err(restoreResult.error);
    }
    const presetPointers = restoreResult.data;
    
    // 7. HEAD版のmerged-preset-HEAD.mdを再生成
    const regenerateResult = await regenerateHeadMerged(presetPointers, paths);
    if (!regenerateResult.success) {
      return Err(regenerateResult.error);
    }
    
    // 8. CLAUDE.mdのimport行をHEAD版に更新
    const updateResult = await updateClaudeMd(paths.claudeMd, paths.mergedPresetPath);
    if (!updateResult.success) {
      return Err(updateResult.error);
    }
    
    return Ok("Preset lock has been removed");
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}