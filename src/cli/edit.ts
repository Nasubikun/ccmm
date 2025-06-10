/**
 * プリセットファイルの編集機能
 * 
 * 指定されたプリセットファイルを$EDITORで開いて編集する
 * パス: ~/.ccmm/presets/github.com/{owner}/{repo}/{preset}
 * ファイルが存在しない場合は新規作成する
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeFile, ensureDir, fileExists } from "../core/fs.js";
import { Result, Ok, Err } from "../lib/result.js";
import type { EditOptions } from "../core/types/index.js";

/**
 * プリセットファイルのパスを構築する
 * 
 * @param preset - プリセットファイル名（例: react.md）
 * @param owner - リポジトリオーナー（例: myorg）
 * @param repo - リポジトリ名（例: CLAUDE-md）
 * @param host - ホスト名（デフォルト: github.com）
 * @returns プリセットファイルの絶対パス
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
 * エディタでファイルを開く
 * 
 * @param filePath - 編集するファイルのパス
 * @returns 編集完了の結果
 */
export async function openInEditor(filePath: string): Promise<Result<void, Error>> {
  return new Promise((resolve) => {
    const editor = process.env.EDITOR || process.env.VISUAL || "vi";
    
    const editorProcess = spawn(editor, [filePath], {
      stdio: "inherit", // ユーザーの入力を直接エディタに転送
      shell: true
    });
    
    editorProcess.on("exit", (code) => {
      if (code === 0) {
        resolve(Ok(undefined));
      } else {
        resolve(Err(new Error(`エディタが異常終了しました (exit code: ${code})`)));
      }
    });
    
    editorProcess.on("error", (error) => {
      resolve(Err(error));
    });
  });
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
 * メイン編集処理
 * 
 * @param preset - 編集するプリセット名
 * @param options - 編集オプション
 * @returns 編集結果
 */
export async function edit(preset: string, options: EditOptions = {}): Promise<Result<void, Error>> {
  try {
    // 必須パラメータのバリデーション
    if (!preset) {
      return Err(new Error("プリセット名を指定してください"));
    }
    
    if (!options.owner) {
      return Err(new Error("--owner オプションでリポジトリオーナーを指定してください"));
    }
    
    // プリセットファイルのパスを構築
    const presetPath = buildPresetPath(
      preset,
      options.owner,
      options.repo || "CLAUDE-md"
    );
    
    if (options.verbose) {
      console.log(`プリセットファイル: ${presetPath}`);
    }
    
    // ドライランモードの場合は実際の操作をスキップ
    if (options.dryRun) {
      console.log(`[DRY RUN] ${presetPath} をエディタで開く予定です`);
      return Ok(undefined);
    }
    
    // ファイルの存在確認と必要に応じた作成
    const ensureResult = await ensurePresetFile(presetPath);
    if (!ensureResult.success) {
      return Err(new Error(`プリセットファイルの準備に失敗しました: ${ensureResult.error.message}`));
    }
    
    // エディタでファイルを開く
    const editResult = await openInEditor(presetPath);
    if (!editResult.success) {
      return Err(new Error(`エディタでの編集に失敗しました: ${editResult.error.message}`));
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}