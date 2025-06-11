/**
 * プリセット管理の共通ユーティリティ関数群
 * 
 * プリセットファイルのパス構築、設定管理、ファイル操作など
 * プリセット関連の機能を一元化して重複を排除
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, fileExists, ensureDir } from "./fs.js";
import { Result, Ok, Err } from "../lib/result.js";
import type { PresetPointer, PresetInfo } from "./types/index.js";

/**
 * プリセットファイルのローカルパスを構築する
 * 
 * @param preset - プリセットファイル名（例: react.md）
 * @param owner - リポジトリオーナー（例: myorg）
 * @param repo - リポジトリ名（デフォルト: CLAUDE-md）
 * @param host - ホスト名（デフォルト: github.com）
 * @returns プリセットファイルの絶対パス
 * 
 * @example
 * buildPresetPath("react.md", "myorg")
 * // => "/Users/username/.ccmm/presets/github.com/myorg/CLAUDE-md/react.md"
 */
export function buildPresetPath(
  preset: string,
  owner: string,
  repo: string = "CLAUDE-md",
  host: string = "github.com"
): string {
  const homeDir = homedir();
  return join(homeDir, ".ccmm", "presets", host, owner, repo, preset);
}

/**
 * プリセットファイルのパスから PresetPointer を構築する
 * 
 * @param presetPath - プリセットファイルのローカルパス
 * @returns PresetPointer または エラー
 */
export function parsePresetPath(presetPath: string): Result<PresetPointer, Error> {
  try {
    // ~/.ccmm/presets/github.com/owner/repo/file.md
    const homeDir = homedir();
    const presetsDir = join(homeDir, ".ccmm", "presets");
    
    if (!presetPath.startsWith(presetsDir)) {
      return Err(new Error("プリセットファイルのパスが正しくありません"));
    }
    
    // プリセットディレクトリからの相対パスを取得
    const relativePath = presetPath.substring(presetsDir.length + 1);
    const parts = relativePath.split("/");
    
    if (parts.length < 4) {
      return Err(new Error("プリセットファイルのパス形式が無効です"));
    }
    
    const [host, owner, repo, ...fileParts] = parts;
    const file = fileParts.join("/");
    
    if (!host || !owner || !repo || !file) {
      return Err(new Error("プリセットファイルのパス形式が無効です"));
    }
    
    const pointer: PresetPointer = {
      host,
      owner,
      repo,
      file,
      commit: "HEAD"
    };
    
    return Ok(pointer);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プリセットファイルの存在確認と必要に応じた新規作成
 * 
 * @param filePath - プリセットファイルのパス
 * @returns 成功またはエラー
 */
export async function ensurePresetFile(filePath: string): Promise<Result<void, Error>> {
  try {
    const exists = await fileExists(filePath);
    
    if (!exists) {
      // 親ディレクトリを作成
      const ensureDirResult = await ensureDir(filePath.substring(0, filePath.lastIndexOf("/")));
      if (!ensureDirResult.success) {
        return ensureDirResult;
      }
      
      // 空のファイルを作成
      const writeResult = await writeFile(filePath, "");
      if (!writeResult.success) {
        return writeResult;
      }
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 2つのファイル内容を比較して差分があるかチェックする
 * 
 * @param content1 - 1つ目のファイル内容
 * @param content2 - 2つ目のファイル内容
 * @returns 差分があるかどうか
 */
export function hasContentDiff(content1: string, content2: string): boolean {
  // 改行の差異を正規化
  const normalize = (content: string) => content.trim().replace(/\r\n/g, '\n');
  return normalize(content1) !== normalize(content2);
}

/**
 * プリセットファイルを安全に読み取る
 * 
 * @param filePath - 読み取るプリセットファイルのパス
 * @returns ファイル内容またはエラー
 */
export async function readPresetFile(filePath: string): Promise<Result<string, Error>> {
  try {
    const exists = await fileExists(filePath);
    if (!exists) {
      return Err(new Error(`プリセットファイルが見つかりません: ${filePath}`));
    }
    
    return await readFile(filePath);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * プリセットファイルに内容を書き込む
 * 
 * @param filePath - 書き込み先プリセットファイルのパス
 * @param content - 書き込む内容
 * @returns 成功またはエラー
 */
export async function writePresetFile(filePath: string, content: string): Promise<Result<void, Error>> {
  try {
    // 親ディレクトリを確実に作成
    const ensureResult = await ensurePresetFile(filePath);
    if (!ensureResult.success) {
      return ensureResult;
    }
    
    return await writeFile(filePath, content);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}