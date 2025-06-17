/**
 * ファイルシステム操作のヘルパー関数群
 * 
 * readFile, writeFile, ensureDir, expandTilde などの
 * ファイルシステム操作を Result 型でラップし、
 * エラーハンドリングを型安全に行う
 */

import { readFile as nodeReadFile, writeFile as nodeWriteFile, mkdir, access, constants } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";
import { Result, Ok, Err, tryCatch } from "../lib/result.js";

/**
 * ファイルの内容を読み取る
 * 
 * @param filePath - 読み取るファイルのパス
 * @param encoding - 文字エンコーディング（デフォルト: utf-8）
 * @returns ファイル内容またはエラー
 */
export async function readFile(filePath: string, encoding: BufferEncoding = "utf-8"): Promise<Result<string, Error>> {
  try {
    const content = await nodeReadFile(filePath, encoding);
    return Ok(content);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ファイルに内容を書き込む
 * 必要に応じて親ディレクトリを作成する
 * 
 * @param filePath - 書き込み先ファイルのパス
 * @param content - 書き込む内容
 * @param encoding - 文字エンコーディング（デフォルト: utf-8）
 * @returns 成功またはエラー
 */
export async function writeFile(filePath: string, content: string, encoding: BufferEncoding = "utf-8"): Promise<Result<void, Error>> {
  try {
    // 親ディレクトリを確実に作成
    const parentDir = dirname(filePath);
    const ensureDirResult = await ensureDir(parentDir);
    if (!ensureDirResult.success) {
      return ensureDirResult;
    }
    
    await nodeWriteFile(filePath, content, encoding);
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * ディレクトリが存在するかチェックする
 * 
 * @param dirPath - チェックするディレクトリのパス
 * @returns 存在するかどうか
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * ディレクトリを再帰的に作成する
 * 既に存在する場合は何もしない
 * 
 * @param dirPath - 作成するディレクトリのパス
 * @returns 成功またはエラー
 */
export async function ensureDir(dirPath: string): Promise<Result<void, Error>> {
  try {
    const exists = await dirExists(dirPath);
    if (exists) {
      return Ok(undefined);
    }
    
    await mkdir(dirPath, { recursive: true });
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * チルダ（~）をホームディレクトリのパスに展開する
 * 
 * @param path - 展開するパス
 * @returns 展開されたパス
 * 
 * @example
 * expandTilde("~/.ccmm/config")
 * // => "/Users/username/.ccmm/config" (macOS/Linux)
 * // => "C:\\Users\\username\\.ccmm\\config" (Windows)
 */
export function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

/**
 * パスを絶対パスに解決し、チルダ展開も行う
 * 
 * @param path - 解決するパス
 * @param base - 相対パスの基準ディレクトリ（デフォルト: 現在のワーキングディレクトリ）
 * @returns 絶対パス
 */
export function resolvePath(path: string, base?: string): string {
  const expandedPath = expandTilde(path);
  return resolve(base || process.cwd(), expandedPath);
}

/**
 * ファイルが存在するかチェックする
 * 
 * @param filePath - チェックするファイルのパス
 * @returns 存在するかどうか
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 絶対パスをチルダ（~）記法に縮約する
 * ホームディレクトリで始まる絶対パスを~/で始まるパスに変換する
 * 
 * @param path - 縮約するパス
 * @returns 縮約されたパス
 * 
 * @example
 * contractTilde("/Users/username/.ccmm/config")
 * // => "~/.ccmm/config" (macOS/Linux)
 * contractTilde("/other/path/file")
 * // => "/other/path/file" (ホームディレクトリ以外の場合は変更なし)
 */
export function contractTilde(path: string): string {
  if (!path || typeof path !== 'string') {
    return ''; // undefined や空文字列、非文字列の場合は空文字列を返す
  }
  
  const homeDir = homedir();
  
  // パスを正規化して比較
  const normalizedPath = resolve(path);
  const normalizedHome = resolve(homeDir);
  
  // ホームディレクトリで始まる場合は~/に変換
  if (normalizedPath.startsWith(normalizedHome)) {
    const relativePath = normalizedPath.slice(normalizedHome.length);
    // ディレクトリセパレータを確認
    if (relativePath === '') {
      return '~';
    }
    if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      return '~' + relativePath;
    }
    return '~/' + relativePath;
  }
  
  return path;
}

/**
 * ファイルを安全に読み取る（存在チェック付き）
 * 
 * @param filePath - 読み取るファイルのパス
 * @param encoding - 文字エンコーディング（デフォルト: utf-8）
 * @returns ファイル内容またはエラー
 */
export async function safeReadFile(filePath: string, encoding: BufferEncoding = "utf-8"): Promise<Result<string | null, Error>> {
  const exists = await fileExists(filePath);
  if (!exists) {
    return Ok(null);
  }
  
  const result = await readFile(filePath, encoding);
  if (!result.success) {
    return result;
  }
  
  return Ok(result.data);
}