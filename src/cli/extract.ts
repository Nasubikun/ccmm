/**
 * CLAUDE.md からプリセットへの変更抽出機能
 * 
 * git diff --cached で staged changes から追加行を取得し、
 * inquirer UI でユーザーが選択した行をプリセットファイルに追記し、
 * CLAUDE.md から対象行を削除する
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import inquirer from "inquirer";
import { readFile, writeFile, fileExists } from "../core/fs.js";
import { parseCLAUDEMd } from "./sync.js";
import { edit } from "./edit.js";
import { buildPresetPath } from "../core/preset.js";
import { Result, Ok, Err } from "../lib/result.js";
import type { ExtractOptions, PresetPointer } from "../core/types/index.js";

const execPromise = promisify(exec);

/**
 * git diff のパース結果
 */
export interface DiffChange {
  /** 行番号 */
  lineNumber: number;
  /** 追加された行の内容 */
  content: string;
  /** 対象ファイルパス */
  filePath: string;
}

/**
 * プリセット選択肢
 */
export interface PresetChoice {
  /** 表示名 */
  name: string;
  /** ファイル名 */
  file: string;
  /** オーナー */
  owner: string;
  /** リポジトリ名 */
  repo: string;
}

/**
 * ユーザーが選択した抽出情報
 */
export interface ExtractSelection {
  /** 選択された行 */
  selectedLines: string[];
  /** 対象プリセット */
  preset: PresetChoice;
}

/**
 * staged changes から CLAUDE.md の追加行を取得する
 * 
 * @param repoPath - リポジトリのパス
 * @returns 追加された行のリストまたはエラー
 */
export async function getStagedChanges(repoPath: string = process.cwd()): Promise<Result<DiffChange[], Error>> {
  try {
    // git diff --cached -U0 で staged changes を取得（コンテキスト行なし）
    const { stdout, stderr } = await execPromise("git diff --cached -U0", { cwd: repoPath });
    
    if (stderr) {
      return Err(new Error(`git diff failed: ${stderr}`));
    }
    
    if (!stdout.trim()) {
      return Ok([]); // staged changes がない場合
    }
    
    return parseDiffOutput(stdout);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * git diff の出力をパースして追加行を抽出する
 * 
 * @param diffOutput - git diff の出力
 * @returns パースされた変更情報
 */
export function parseDiffOutput(diffOutput: string): Result<DiffChange[], Error> {
  try {
    const lines = diffOutput.split('\n');
    const changes: DiffChange[] = [];
    let currentFile = '';
    let currentLineNumber = 0;
    
    for (const line of lines) {
      // ファイルヘッダー: +++ b/path/to/file
      if (line.startsWith('+++ b/')) {
        currentFile = line.substring(6); // "+++ b/" を削除
        continue;
      }
      
      // ハンクヘッダー: @@ -0,0 +1,2 @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        currentLineNumber = parseInt(hunkMatch[1]!, 10);
        continue;
      }
      
      // 追加行: +content
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const content = line.substring(1); // "+" を削除
        
        // CLAUDE.md のみを対象とする
        if (currentFile.endsWith('CLAUDE.md')) {
          changes.push({
            lineNumber: currentLineNumber,
            content,
            filePath: currentFile
          });
        }
        
        currentLineNumber++;
        continue;
      }
      
      // 既存行（スキップ）
      if (line.startsWith(' ')) {
        currentLineNumber++;
      }
    }
    
    return Ok(changes);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 利用可能なプリセット選択肢を取得する
 * 
 * @returns プリセット選択肢のリストまたはエラー
 */
export async function getPresetChoices(): Promise<Result<PresetChoice[], Error>> {
  try {
    // 現在は固定値だが、将来は設定ファイルから読み取り可能
    const choices: PresetChoice[] = [
      {
        name: "react.md - React プロジェクト用プリセット",
        file: "react.md",
        owner: "myorg", // TODO: 設定ファイルから取得
        repo: "CLAUDE-md"
      },
      {
        name: "typescript.md - TypeScript プロジェクト用プリセット", 
        file: "typescript.md",
        owner: "myorg", // TODO: 設定ファイルから取得
        repo: "CLAUDE-md"
      },
      {
        name: "その他のプリセット（手動入力）",
        file: "custom",
        owner: "custom",
        repo: "custom"
      }
    ];
    
    return Ok(choices);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * inquirer を使用してユーザーに抽出する行とプリセットを選択させる
 * 
 * @param changes - 追加された行のリスト
 * @returns ユーザーの選択結果またはエラー
 */
export async function promptUserSelection(changes: DiffChange[]): Promise<Result<ExtractSelection, Error>> {
  try {
    if (changes.length === 0) {
      return Err(new Error("抽出可能な追加行がありません"));
    }
    
    // プリセット選択肢を取得
    const presetsResult = await getPresetChoices();
    if (!presetsResult.success) {
      return Err(presetsResult.error);
    }
    
    // 1. 抽出する行を選択
    const lineChoices = changes.map((change, index) => ({
      name: `${change.lineNumber}: ${change.content}`,
      value: change.content,
      checked: true // デフォルトでチェック
    }));
    
    const { selectedLines } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selectedLines',
      message: 'プリセットに抽出する行を選択してください:',
      choices: lineChoices
    });
    
    // 選択された行の検証
    if (!selectedLines || selectedLines.length === 0) {
      return Err(new Error('少なくとも1行は選択してください'));
    }
    
    // 2. 対象プリセットを選択
    const { presetName } = await inquirer.prompt({
      type: 'list',
      name: 'presetName',
      message: '抽出先のプリセットを選択してください:',
      choices: presetsResult.data.map(choice => ({
        name: choice.name,
        value: choice.file
      }))
    });
    
    // 3. カスタムプリセットの場合は詳細を入力
    let selectedPreset = presetsResult.data.find(p => p.file === presetName);
    
    if (presetName === 'custom') {
      const fileInfo = await inquirer.prompt({
        type: 'input',
        name: 'file',
        message: 'プリセットファイル名を入力してください（例: myproject.md）:'
      });
      
      // ファイル名の検証
      if (!fileInfo.file || !fileInfo.file.trim()) {
        return Err(new Error('ファイル名を入力してください'));
      }
      if (!fileInfo.file.endsWith('.md')) {
        return Err(new Error('.md 拡張子が必要です'));
      }
      
      const ownerInfo = await inquirer.prompt({
        type: 'input',
        name: 'owner',
        message: 'リポジトリオーナーを入力してください:'
      });
      
      // オーナー名の検証
      if (!ownerInfo.owner || !ownerInfo.owner.trim()) {
        return Err(new Error('オーナー名を入力してください'));
      }
      
      const repoInfo = await inquirer.prompt({
        type: 'input',
        name: 'repo',
        message: 'リポジトリ名を入力してください（デフォルト: CLAUDE-md）:',
        default: 'CLAUDE-md'
      });
      
      const customInfo = {
        file: fileInfo.file,
        owner: ownerInfo.owner,
        repo: repoInfo.repo
      };
      
      selectedPreset = {
        name: `${customInfo.file} - カスタムプリセット`,
        file: customInfo.file,
        owner: customInfo.owner,
        repo: customInfo.repo
      };
    }
    
    if (!selectedPreset) {
      return Err(new Error("プリセットの選択に失敗しました"));
    }
    
    return Ok({
      selectedLines,
      preset: selectedPreset
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 選択された行をプリセットファイルに追記する
 * 
 * @param selection - ユーザーの選択結果
 * @returns 追記結果またはエラー
 */
export async function appendToPreset(selection: ExtractSelection): Promise<Result<string, Error>> {
  try {
    const { selectedLines, preset } = selection;
    
    // プリセットファイルのパスを構築
    const presetPath = buildPresetPath(preset.file, preset.owner, preset.repo);
    
    // 既存のファイル内容を読み取り
    let existingContent = '';
    const exists = await fileExists(presetPath);
    if (exists) {
      const readResult = await readFile(presetPath);
      if (readResult.success) {
        existingContent = readResult.data;
      }
    }
    
    // 追記する内容を生成
    const newContent = selectedLines.join('\n');
    const separator = existingContent.trim() ? '\n\n' : '';
    const updatedContent = existingContent + separator + newContent;
    
    // ファイルに書き込み
    const writeResult = await writeFile(presetPath, updatedContent);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }
    
    return Ok(presetPath);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * CLAUDE.md から選択された行を削除する
 * 
 * @param selectedLines - 削除する行のリスト
 * @param claudeMdPath - CLAUDE.md ファイルのパス
 * @returns 削除結果またはエラー
 */
export async function removeFromClaudeMd(selectedLines: string[], claudeMdPath: string): Promise<Result<void, Error>> {
  try {
    // CLAUDE.md を読み取り
    const readResult = await readFile(claudeMdPath);
    if (!readResult.success) {
      return Err(new Error(`CLAUDE.md の読み取りに失敗しました: ${readResult.error.message}`));
    }
    
    // 内容を解析
    const parseResult = parseCLAUDEMd(readResult.data);
    if (!parseResult.success) {
      return Err(parseResult.error);
    }
    
    const { freeContent, importLine } = parseResult.data;
    
    // 自由記述部分から選択された行を削除
    const lines = freeContent.split('\n');
    const filteredLines = lines.filter(line => !selectedLines.includes(line));
    
    // 新しい内容を構築
    let newContent = filteredLines.join('\n').trim();
    
    // import行がある場合は追加
    if (importLine) {
      if (newContent) {
        newContent += '\n\n';
      }
      newContent += importLine;
    }
    
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
 * メイン抽出処理
 * 
 * @param options - 抽出オプション
 * @returns 抽出結果またはエラー
 */
export async function extract(options: ExtractOptions = {}): Promise<Result<void, Error>> {
  try {
    const projectRoot = process.cwd();
    const claudeMdPath = join(projectRoot, 'CLAUDE.md');
    
    if (options.verbose) {
      console.log("CLAUDE.md から staged changes を抽出しています...");
    }
    
    // 1. staged changes を取得
    const changesResult = await getStagedChanges(projectRoot);
    if (!changesResult.success) {
      return Err(changesResult.error);
    }
    
    const changes = changesResult.data;
    if (changes.length === 0) {
      return Err(new Error("CLAUDE.md に staged changes が見つかりません"));
    }
    
    if (options.verbose) {
      console.log(`${changes.length} 行の追加を検出しました`);
    }
    
    // ドライランモードの場合は実際の操作をスキップ
    if (options.dryRun) {
      console.log("[DRY RUN] 以下の行が抽出される予定です:");
      changes.forEach(change => {
        console.log(`  ${change.lineNumber}: ${change.content}`);
      });
      return Ok(undefined);
    }
    
    // 2. ユーザーに選択させる
    const selectionResult = await promptUserSelection(changes);
    if (!selectionResult.success) {
      return Err(selectionResult.error);
    }
    
    const selection = selectionResult.data;
    
    if (options.verbose) {
      console.log(`${selection.selectedLines.length} 行を ${selection.preset.file} に抽出します`);
    }
    
    // 3. プリセットファイルに追記
    const appendResult = await appendToPreset(selection);
    if (!appendResult.success) {
      return Err(appendResult.error);
    }
    
    const presetPath = appendResult.data;
    
    // 4. CLAUDE.md から対象行を削除
    const removeResult = await removeFromClaudeMd(selection.selectedLines, claudeMdPath);
    if (!removeResult.success) {
      return Err(removeResult.error);
    }
    
    if (options.verbose) {
      console.log(`✓ ${selection.selectedLines.length} 行を ${selection.preset.file} に抽出しました`);
      console.log(`✓ CLAUDE.md から対象行を削除しました`);
    }
    
    // 5. 自動でeditコマンドを実行
    if (!options.yes) {
      const { shouldEdit } = await inquirer.prompt({
        type: 'confirm',
        name: 'shouldEdit',
        message: `${selection.preset.file} をエディタで開きますか？`,
        default: true
      });
      
      if (shouldEdit) {
        const editResult = await edit(selection.preset.file, {
          owner: selection.preset.owner,
          repo: selection.preset.repo,
          verbose: options.verbose
        });
        
        if (!editResult.success) {
          console.warn(`エディタでの編集に失敗しました: ${editResult.error.message}`);
        }
      }
    } else {
      // --yes オプションが指定されている場合は自動でエディタを開く
      await edit(selection.preset.file, {
        owner: selection.preset.owner,
        repo: selection.preset.repo,
        verbose: options.verbose
      });
    }
    
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}