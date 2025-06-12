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
  /** メインのプリセットリポジトリ */
  defaultPresetRepo?: string;
  /** デフォルトで使用するプリセットファイル一覧 */
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
  defaultPresetRepositories: [],
  defaultPresets: []
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
 * デフォルトプリセットポインタを取得する
 * 
 * @param commit - コミットハッシュ（デフォルト: "HEAD"）
 * @returns プリセットポインタの配列
 */
export function getDefaultPresetPointers(commit: string = "HEAD"): Result<import("./types/index.js").PresetPointer[], Error> {
  const configResult = loadConfig();
  if (!configResult.success) {
    return configResult;
  }
  
  const config = configResult.data;
  const presetPointers: import("./types/index.js").PresetPointer[] = [];
  
  if (config.defaultPresetRepo && config.defaultPresets) {
    const repoUrl = config.defaultPresetRepo;
    
    // file:// プロトコルの場合の特別処理
    if (repoUrl.startsWith("file://")) {
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
  
  return Ok(presetPointers);
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
      console.warn(`設定ファイルのバージョンが異なります: ${config.version} (期待値: ${DEFAULT_CONFIG.version})`);
    }
    
    // デフォルトプリセットの妥当性チェック
    if (config.defaultPresets && config.defaultPresets.length > 0) {
      if (!config.defaultPresetRepo) {
        return Err(new Error("defaultPresetsが設定されていますが、defaultPresetRepoが設定されていません"));
      }
      
      // プリセットファイル名の妥当性チェック
      for (const preset of config.defaultPresets) {
        if (!preset.endsWith('.md')) {
          return Err(new Error(`プリセットファイル名は.mdで終わる必要があります: ${preset}`));
        }
      }
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}