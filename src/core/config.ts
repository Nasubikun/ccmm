/**
 * ccmm設定管理の統合モジュール
 * 
 * 設定ファイルの読み書き、デフォルト値の管理、
 * 設定のキャッシュ機能を提供し、設定関連処理を一元化
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { expandTilde } from "./fs.js";
import { Result, Ok, Err } from "../lib/result.js";

/**
 * ccmm設定の型定義
 */
export interface CcmmConfig {
  /** デフォルトプリセットリポジトリのURL一覧 */
  defaultPresetRepositories?: string[];
  /** デフォルトで選択されるプリセットファイル一覧 */
  defaultPresets?: string[];
  /** 設定のバージョン（将来の互換性のため） */
  version?: string;
}

/**
 * 設定のキャッシュ
 */
let configCache: CcmmConfig | null = null;
let configCacheTime: number = 0;
const CACHE_DURATION = 5000; // 5秒

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: CcmmConfig = {
  version: "1.0.0",
  defaultPresetRepositories: []
};

/**
 * 設定ファイルのパスを取得する
 * 
 * @returns 設定ファイルの絶対パス
 */
export function getConfigPath(): string {
  return path.join(expandTilde("~/.ccmm"), "config.json");
}

/**
 * ccmmが初期化されているかチェックする
 * 
 * @returns 初期化状態
 */
export function isInitialized(): boolean {
  const ccmmDir = expandTilde("~/.ccmm");
  const configPath = getConfigPath();
  return fs.existsSync(ccmmDir) && fs.existsSync(configPath);
}

/**
 * キャッシュの有効性をチェックする
 * 
 * @returns キャッシュが有効かどうか
 */
function isCacheValid(): boolean {
  return configCache !== null && (Date.now() - configCacheTime) < CACHE_DURATION;
}

/**
 * 設定ファイルを読み込む（キャッシュ機能付き）
 * 
 * @param useCache - キャッシュを使用するかどうか（デフォルト: true）
 * @returns 設定情報またはエラー
 */
export function loadConfig(useCache: boolean = true): Result<CcmmConfig, Error> {
  try {
    // キャッシュが有効な場合はキャッシュを返す
    if (useCache && isCacheValid()) {
      return Ok(configCache!);
    }

    const configPath = getConfigPath();
    
    // 設定ファイルが存在しない場合はデフォルト設定を返す
    if (!fs.existsSync(configPath)) {
      const config = { ...DEFAULT_CONFIG };
      configCache = config;
      configCacheTime = Date.now();
      return Ok(config);
    }

    // 設定ファイルを読み込み
    const content = fs.readFileSync(configPath, "utf-8");
    const config = { ...DEFAULT_CONFIG, ...JSON.parse(content) } as CcmmConfig;
    
    // キャッシュを更新
    configCache = config;
    configCacheTime = Date.now();
    
    return Ok(config);
  } catch (error) {
    return Err(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * 設定ファイルを保存する
 * 
 * @param config - 保存する設定
 * @returns 保存結果
 */
export async function saveConfig(config: CcmmConfig): Promise<Result<void, Error>> {
  try {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    
    // 設定ディレクトリを作成
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // バージョンを設定
    const configWithVersion = {
      ...config,
      version: DEFAULT_CONFIG.version
    };
    
    // ファイルに書き込み
    fs.writeFileSync(configPath, JSON.stringify(configWithVersion, null, 2), "utf-8");
    
    // キャッシュを更新
    configCache = configWithVersion;
    configCacheTime = Date.now();
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 設定を部分的に更新する
 * 
 * @param partialConfig - 更新する設定の一部
 * @returns 更新結果
 */
export async function updateConfig(partialConfig: Partial<CcmmConfig>): Promise<Result<CcmmConfig, Error>> {
  try {
    const currentConfigResult = loadConfig();
    if (!currentConfigResult.success) {
      return currentConfigResult;
    }
    
    const updatedConfig = {
      ...currentConfigResult.data,
      ...partialConfig
    };
    
    const saveResult = await saveConfig(updatedConfig);
    if (!saveResult.success) {
      return Err(saveResult.error);
    }
    
    return Ok(updatedConfig);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * キャッシュをクリアする
 */
export function clearConfigCache(): void {
  configCache = null;
  configCacheTime = 0;
}

/**
 * プロジェクト別設定の型定義
 */
export interface ProjectConfig {
  /** 選択されたプリセット一覧 */
  selectedPresets: {
    /** リポジトリURL */
    repo: string;
    /** ファイルパス */
    file: string;
  }[];
  /** 最終更新日時 */
  lastUpdated: string;
}

/**
 * プロジェクト別のプリセット選択情報を取得する
 * 
 * @param projectSlug - プロジェクトのスラッグ
 * @param commit - コミットハッシュ（デフォルト: "HEAD"）
 * @returns プリセットポインタの配列
 */
export function getProjectPresetPointers(projectSlug: string, commit: string = "HEAD"): Result<import("./types/index.js").PresetPointer[], Error> {
  try {
    // プロジェクト別の設定ファイルパスを生成
    const projectDir = expandTilde(`~/.ccmm/projects/${projectSlug}`);
    const projectConfigPath = path.join(projectDir, "preset-selection.json");
    
    // プロジェクト設定ファイルが存在しない場合は空配列を返す
    if (!fs.existsSync(projectConfigPath)) {
      return Ok([]);
    }
    
    // プロジェクト設定を読み込み
    const content = fs.readFileSync(projectConfigPath, "utf-8");
    const projectConfig: ProjectConfig = JSON.parse(content);
    
    const presetPointers: import("./types/index.js").PresetPointer[] = [];
    
    // 選択されたプリセットファイルをPresetPointerに変換
    if (projectConfig.selectedPresets && Array.isArray(projectConfig.selectedPresets)) {
      for (const preset of projectConfig.selectedPresets) {
        if (preset.repo && preset.file) {
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
      }
    }
    
    return Ok(presetPointers);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プロジェクト別のプリセット選択情報を保存する
 * 
 * @param projectSlug - プロジェクトのスラッグ
 * @param selectedPresets - 選択されたプリセット一覧
 * @returns 保存結果
 */
export async function saveProjectPresetSelection(
  projectSlug: string, 
  selectedPresets: { repo: string; file: string }[]
): Promise<Result<void, Error>> {
  try {
    // プロジェクト別のディレクトリを作成
    const projectDir = expandTilde(`~/.ccmm/projects/${projectSlug}`);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    
    // プロジェクト設定を作成
    const projectConfig: ProjectConfig = {
      selectedPresets,
      lastUpdated: new Date().toISOString()
    };
    
    // ファイルに保存
    const projectConfigPath = path.join(projectDir, "preset-selection.json");
    fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2), "utf-8");
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 設定の妥当性をチェックする
 * 
 * @param config - チェックする設定
 * @returns 妥当性チェック結果
 */
export function validateConfig(config: CcmmConfig): Result<void, Error> {
  try {
    // バージョンチェック
    if (config.version && config.version !== DEFAULT_CONFIG.version) {
      // 将来的にはマイグレーション処理を実装
      console.warn(`Configuration file version mismatch: ${config.version} (expected: ${DEFAULT_CONFIG.version})`);
    }
    
    // プリセットリポジトリURLの妥当性チェック
    if (config.defaultPresetRepositories && config.defaultPresetRepositories.length > 0) {
      for (const repoUrl of config.defaultPresetRepositories) {
        if (!repoUrl.includes('github.com/')) {
          return Err(new Error(`Currently only GitHub repositories are supported: ${repoUrl}`));
        }
      }
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}