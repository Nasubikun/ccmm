/**
 * プロジェクト管理とGit前処理の共通ユーティリティ関数群
 * 
 * Git リポジトリの検証、パス情報生成、プロジェクトセットアップなど
 * sync, lock, unlock コマンドで共通する前処理ロジックを統合
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { Result, Ok, Err } from "../lib/result.js";
import { isGitRepository, getOriginUrl } from "../git/index.js";
import type { ProjectPaths, ProjectInfo } from "./types/index.js";
import { makeSlug } from "./slug.js";

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
 * プロジェクトの基本情報
 */
export interface ProjectSetupResult {
  /** プロジェクトのルートディレクトリ */
  projectRoot: string;
  /** Git origin URL */
  originUrl: string;
  /** プロジェクト slug */
  slug: string;
  /** パス情報 */
  paths: ProjectPaths;
}

/**
 * プロジェクトのGit前処理を実行し、パス情報を生成する
 * sync, lock, unlock で共通するロジックを統合
 * 
 * @param projectRoot - プロジェクトのルートディレクトリ（デフォルト: process.cwd()）
 * @param commit - コミットハッシュまたはHEAD（デフォルト: "HEAD"）
 * @returns プロジェクト設定結果またはエラー
 */
export async function validateAndSetupProject(
  projectRoot: string = process.cwd(), 
  commit: string = "HEAD"
): Promise<Result<ProjectSetupResult, Error>> {
  try {
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
    
    const originUrl = originResult.data;
    
    // 3. プロジェクトスラッグを生成
    const slug = makeSlug(originUrl);
    
    // 4. パス情報を生成
    const pathsResult = generateProjectPaths(projectRoot, originUrl, commit);
    if (!pathsResult.success) {
      return Err(pathsResult.error);
    }
    
    const setupResult: ProjectSetupResult = {
      projectRoot,
      originUrl,
      slug,
      paths: pathsResult.data
    };
    
    return Ok(setupResult);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プロジェクト情報を完全な形で構築する
 * 
 * @param projectRoot - プロジェクトのルートディレクトリ
 * @param commit - コミットハッシュまたはHEAD
 * @returns 完全なプロジェクト情報またはエラー
 */
export async function createProjectInfo(
  projectRoot: string = process.cwd(),
  commit: string = "HEAD"
): Promise<Result<ProjectInfo, Error>> {
  try {
    const setupResult = await validateAndSetupProject(projectRoot, commit);
    if (!setupResult.success) {
      return setupResult;
    }
    
    const { originUrl, slug, paths } = setupResult.data;
    
    const projectInfo: ProjectInfo = {
      slug,
      originUrl,
      paths
      // currentPresets は呼び出し側で設定
    };
    
    return Ok(projectInfo);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プロジェクトが ccmm で管理されているかチェックする
 * 
 * @param projectRoot - プロジェクトのルートディレクトリ
 * @returns 管理状態の情報またはエラー
 */
export async function checkProjectManagement(
  projectRoot: string = process.cwd()
): Promise<Result<{ isManaged: boolean; hasClaudeMd: boolean }, Error>> {
  try {
    const setupResult = await validateAndSetupProject(projectRoot);
    if (!setupResult.success) {
      return setupResult;
    }
    
    const { paths } = setupResult.data;
    
    // CLAUDE.md の存在確認
    const { fileExists } = await import("./fs.js");
    const hasClaudeMd = await fileExists(paths.claudeMd);
    
    // merged-preset ファイルの存在確認
    const mergedPresetExists = await fileExists(paths.mergedPresetPath);
    
    return Ok({
      isManaged: mergedPresetExists,
      hasClaudeMd
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プロジェクトのクリーンアップ（開発・テスト用）
 * 
 * @param projectRoot - プロジェクトのルートディレクトリ
 * @returns クリーンアップ結果
 */
export async function cleanupProject(
  projectRoot: string = process.cwd()
): Promise<Result<void, Error>> {
  try {
    const setupResult = await validateAndSetupProject(projectRoot);
    if (!setupResult.success) {
      return setupResult;
    }
    
    const { paths } = setupResult.data;
    
    // プロジェクトディレクトリの削除
    // 注意: これは開発・テスト用途のみで使用すること
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execPromise = promisify(exec);
    
    try {
      await execPromise(`rm -rf "${paths.projectDir}"`);
    } catch {
      // ディレクトリが存在しない場合は無視
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}