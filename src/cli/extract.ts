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
 * CLAUDE.md から抽出可能な行情報
 */
export interface ClaudeMdLine {
  /** 行番号 */
  lineNumber: number;
  /** 行の内容 */
  content: string;
  /** ソース（staged または file） */
  source: 'staged' | 'file';
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
 * CLAUDE.md の内容から抽出可能な行を取得する
 * 
 * @param claudeMdPath - CLAUDE.md ファイルのパス
 * @returns 抽出可能な行のリストまたはエラー
 */
export async function getClaudeMdContent(claudeMdPath: string): Promise<Result<ClaudeMdLine[], Error>> {
  try {
    // CLAUDE.md を読み取り
    const readResult = await readFile(claudeMdPath);
    if (!readResult.success) {
      return Err(new Error(`Failed to read CLAUDE.md: ${readResult.error.message}`));
    }
    
    // 内容を解析
    const parseResult = parseCLAUDEMd(readResult.data);
    if (!parseResult.success) {
      return Err(parseResult.error);
    }
    
    const { freeContent } = parseResult.data;
    
    // 自由記述部分を行に分割
    const lines = freeContent.split('\n');
    const claudeMdLines: ClaudeMdLine[] = [];
    
    lines.forEach((line, index) => {
      // 空行はスキップ
      if (line.trim()) {
        claudeMdLines.push({
          lineNumber: index + 1,
          content: line,
          source: 'file'
        });
      }
    });
    
    return Ok(claudeMdLines);
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
        name: "react.md - Preset for React projects",
        file: "react.md",
        owner: "myorg", // TODO: 設定ファイルから取得
        repo: "CLAUDE-md"
      },
      {
        name: "typescript.md - Preset for TypeScript projects", 
        file: "typescript.md",
        owner: "myorg", // TODO: 設定ファイルから取得
        repo: "CLAUDE-md"
      },
      {
        name: "Other preset (manual input)",
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
 * @param lines - 選択可能な行のリスト（staged changes または CLAUDE.md の内容）
 * @returns ユーザーの選択結果またはエラー
 */
export async function promptUserSelection(lines: ClaudeMdLine[]): Promise<Result<ExtractSelection, Error>> {
  try {
    if (lines.length === 0) {
      return Err(new Error("No extractable lines available"));
    }
    
    // プリセット選択肢を取得
    const presetsResult = await getPresetChoices();
    if (!presetsResult.success) {
      return Err(presetsResult.error);
    }
    
    // 1. 範囲選択モードで行を選択
    console.log('Select line range to extract:');
    
    // 行番号付きで表示
    lines.forEach((line) => {
      console.log(`  ${line.lineNumber}: ${line.content}`);
    });
    console.log('');
    
    // 開始行を選択
    const lineNumbers = lines.map(line => line.lineNumber);
    const { startLine } = await inquirer.prompt({
      type: 'list',
      name: 'startLine',
      message: 'Select start line:',
      choices: lines.map((line) => ({
        name: `${line.lineNumber}: ${line.content}`,
        value: line.lineNumber
      }))
    });
    
    // 終了行を選択（開始行以降の行のみ表示）
    const endLineChoices = lines
      .filter(line => line.lineNumber >= startLine)
      .map((line) => ({
        name: `${line.lineNumber}: ${line.content}`,
        value: line.lineNumber
      }));
    
    const { endLine } = await inquirer.prompt({
      type: 'list',
      name: 'endLine',
      message: 'Select end line:',
      choices: endLineChoices
    });
    
    // 選択範囲の行を取得
    const selectedLines = lines
      .filter(line => line.lineNumber >= startLine && line.lineNumber <= endLine)
      .map(line => line.content);
    
    // 選択された行の確認表示
    console.log(`\nSelected range: lines ${startLine}-${endLine} (${selectedLines.length} lines)\n`);
    
    // 選択された行の検証
    if (!selectedLines || selectedLines.length === 0) {
      return Err(new Error('Please select at least one line'));
    }
    
    // 2. 対象プリセットを選択
    const { presetName } = await inquirer.prompt({
      type: 'list',
      name: 'presetName',
      message: 'Select destination preset:',
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
        message: 'Enter preset file name (e.g. myproject.md):'
      });
      
      // ファイル名の検証
      if (!fileInfo.file || !fileInfo.file.trim()) {
        return Err(new Error('Please enter file name'));
      }
      if (!fileInfo.file.endsWith('.md')) {
        return Err(new Error('.md extension required'));
      }
      
      const ownerInfo = await inquirer.prompt({
        type: 'input',
        name: 'owner',
        message: 'Enter repository owner:'
      });
      
      // オーナー名の検証
      if (!ownerInfo.owner || !ownerInfo.owner.trim()) {
        return Err(new Error('Please enter owner name'));
      }
      
      const repoInfo = await inquirer.prompt({
        type: 'input',
        name: 'repo',
        message: 'Enter repository name (default: CLAUDE-md):',
        default: 'CLAUDE-md'
      });
      
      const customInfo = {
        file: fileInfo.file,
        owner: ownerInfo.owner,
        repo: repoInfo.repo
      };
      
      selectedPreset = {
        name: `${customInfo.file} - Custom preset`,
        file: customInfo.file,
        owner: customInfo.owner,
        repo: customInfo.repo
      };
    }
    
    if (!selectedPreset) {
      return Err(new Error("Failed to select preset"));
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
      return Err(new Error(`Failed to read CLAUDE.md: ${readResult.error.message}`));
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
export async function extract(options: ExtractOptions = {}): Promise<Result<string, Error>> {
  try {
    const projectRoot = process.cwd();
    const claudeMdPath = join(projectRoot, 'CLAUDE.md');
    
    if (options.verbose) {
      console.log("Extracting staged changes from CLAUDE.md...");
    }
    
    // 1. staged changes を取得
    const changesResult = await getStagedChanges(projectRoot);
    if (!changesResult.success) {
      return Err(changesResult.error);
    }
    
    const changes = changesResult.data;
    let linesToExtract: ClaudeMdLine[] = [];
    
    if (changes.length === 0) {
      // staged changes がない場合は CLAUDE.md から選択
      if (options.verbose) {
        console.log("No staged changes found. Selecting from CLAUDE.md...");
      }
      
      const claudeMdResult = await getClaudeMdContent(claudeMdPath);
      if (!claudeMdResult.success) {
        return Err(claudeMdResult.error);
      }
      
      linesToExtract = claudeMdResult.data;
      if (linesToExtract.length === 0) {
        return Err(new Error("No extractable content found in CLAUDE.md"));
      }
      
      if (options.verbose) {
        console.log(`Found ${linesToExtract.length} lines in CLAUDE.md`);
      }
    } else {
      // staged changes を ClaudeMdLine 形式に変換
      linesToExtract = changes.map(change => ({
        lineNumber: change.lineNumber,
        content: change.content,
        source: 'staged' as const
      }));
      
      if (options.verbose) {
        console.log(`Found ${changes.length} staged changes`);
      }
    }
    
    // ドライランモードの場合は実際の操作をスキップ
    if (options.dryRun) {
      console.log("[DRY RUN] The following lines will be extracted:");
      linesToExtract.forEach(line => {
        console.log(`  ${line.source === 'staged' ? '[staged] ' : ''}${line.lineNumber}: ${line.content}`);
      });
      return Ok("[DRY RUN] Extraction operation simulated");
    }
    
    // 2. ユーザーに選択させる（--yesの場合は自動選択）
    let selection: ExtractSelection;
    
    if (options.yes) {
      // --yes オプションが指定されている場合は全ての行を自動選択
      const presetChoicesResult = await getPresetChoices();
      if (!presetChoicesResult.success) {
        return Err(presetChoicesResult.error);
      }
      
      const presetChoices = presetChoicesResult.data;
      const defaultPreset = presetChoices[0]; // 最初のプリセットを選択
      
      if (!defaultPreset) {
        return Err(new Error("No available presets found"));
      }
      
      selection = {
        selectedLines: linesToExtract.map(line => line.content),
        preset: defaultPreset
      };
      
      if (options.verbose) {
        console.log(`Auto-selected: Extracting ${linesToExtract.length} lines to ${defaultPreset.file}`);
      }
    } else {
      const selectionResult = await promptUserSelection(linesToExtract);
      if (!selectionResult.success) {
        return Err(selectionResult.error);
      }
      selection = selectionResult.data;
    }
    
    if (options.verbose) {
      console.log(`Extracting ${selection.selectedLines.length} lines to ${selection.preset.file}`);
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
      console.log(`✓ Extracted ${selection.selectedLines.length} lines to ${selection.preset.file}`);
      console.log(`✓ Removed target lines from CLAUDE.md`);
    }
    
    // 5. 自動でeditコマンドを実行
    if (!options.yes) {
      const { shouldEdit } = await inquirer.prompt({
        type: 'confirm',
        name: 'shouldEdit',
        message: `Open ${selection.preset.file} in editor?`,
        default: true
      });
      
      if (shouldEdit) {
        const editResult = await edit(selection.preset.file, {
          owner: selection.preset.owner,
          repo: selection.preset.repo,
          verbose: options.verbose
        });
        
        if (!editResult.success) {
          console.warn(`Failed to edit in editor: ${editResult.error.message}`);
        }
      }
    } else {
      // --yes オプションが指定されている場合
      // テスト環境（NODE_ENV=test）ではエディタをスキップ
      if (process.env.NODE_ENV !== 'test') {
        await edit(selection.preset.file, {
          owner: selection.preset.owner,
          repo: selection.preset.repo,
          verbose: options.verbose
        });
      } else if (options.verbose) {
        console.log("Skipped automatic editor execution due to test environment");
      }
    }
    
    return Ok(`Extracted ${selection.selectedLines.length} lines to ${selection.preset.file}`);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}