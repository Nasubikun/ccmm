/**
 * ccmm（Claude Code Markdown Manager）の型定義
 * 
 * プロジェクトごとのCLAUDE.mdにプリセットインポート行を管理し、
 * 個人またはチーム共通プリセットを$HOME側で管理するためのツールの型定義
 */

import type { Result } from "../../lib/result";

/**
 * GitHubリポジトリ内のプリセットファイルを指す情報
 * 例: github.com/myorg/CLAUDE-md/react.md@HEAD
 */
export interface PresetPointer {
  /** ホスト名（例: github.com） */
  host: string;
  /** オーナー名（例: myorg） */
  owner: string;
  /** リポジトリ名（例: CLAUDE-md） */
  repo: string;
  /** ファイル名（例: react.md） */
  file: string;
  /** コミットハッシュまたはHEAD */
  commit: string;
}

/**
 * プロジェクトおよびプリセット管理に関連するパス情報
 */
export interface ProjectPaths {
  /** プロジェクトのルートディレクトリ */
  root: string;
  /** プロジェクトのCLAUDE.mdファイルパス */
  claudeMd: string;
  /** ホームディレクトリのプリセット格納ディレクトリ */
  homePresetDir: string;
  /** プロジェクト固有の設定ディレクトリ（~/.ccmm/projects/<slug>） */
  projectDir: string;
  /** マージされたプリセットファイルのパス */
  mergedPresetPath: string;
}

/**
 * プリセットインポート行の解析結果
 */
export interface PresetImport {
  /** インポート行全体 */
  line: string;
  /** 解析されたプリセットポインタ */
  pointer: PresetPointer;
  /** ファイルパス（@の後の部分） */
  path: string;
}

/**
 * CLAUDE.mdファイルの解析結果
 */
export interface ClaudeMdContent {
  /** 自由記述部分の内容 */
  freeContent: string;
  /** 自動管理されるインポート行 */
  importLine: string | null;
  /** インポート行が存在する場合、その解析結果 */
  importInfo: PresetImport | null;
}

/**
 * プリセット情報
 */
export interface PresetInfo {
  /** プリセットポインタ */
  pointer: PresetPointer;
  /** ローカルファイルパス */
  localPath: string;
  /** ファイルの内容 */
  content?: string;
  /** 最終更新日時 */
  lastModified?: Date;
}

/**
 * マージされたプリセットの情報
 */
export interface MergedPreset {
  /** マージされたプリセットファイルのパス */
  path: string;
  /** 含まれるプリセットのリスト */
  presets: PresetInfo[];
  /** 対象のコミットハッシュまたはHEAD */
  commit: string;
}

/**
 * プロジェクト情報
 */
export interface ProjectInfo {
  /** プロジェクトのslug（ハッシュ化されたID） */
  slug: string;
  /** GitリポジトリのoriginURL */
  originUrl: string;
  /** プロジェクトのパス情報 */
  paths: ProjectPaths;
  /** 現在のプリセット設定 */
  currentPresets?: PresetInfo[];
}

/**
 * Git操作の結果
 */
export interface GitOperationResult {
  /** 操作が成功したかどうか */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 追加情報 */
  data?: Record<string, unknown>;
}

/**
 * CLI操作のオプション
 */
export interface CliOptions {
  /** 詳細ログを出力するか */
  verbose?: boolean;
  /** 確認プロンプトをスキップするか */
  yes?: boolean;
  /** ドライランモード（実際の変更を行わない） */
  dryRun?: boolean;
}

/**
 * sync コマンドのオプション
 */
export interface SyncOptions extends CliOptions {
  /** 特定のコミットハッシュを使用 */
  commit?: string;
  /** プリセット選択プロンプトをスキップして現在の設定を使用 */
  skipSelection?: boolean;
  /** プロンプトなしで強制的にプリセットを再選択 */
  reselect?: boolean;
}

/**
 * lock コマンドのオプション
 */
export interface LockOptions extends CliOptions {
  /** ロックするコミットハッシュ */
  sha: string;
}

/**
 * edit コマンドのオプション
 */
export interface EditOptions extends CliOptions {
  /** リポジトリ名の指定 */
  repo?: string;
  /** オーナー名の指定 */
  owner?: string;
}

/**
 * extract コマンドのオプション
 */
export interface ExtractOptions extends CliOptions {
  /** 対象プリセットファイル */
  preset?: string;
}

/**
 * push コマンドのオプション
 */
export interface PushOptions extends CliOptions {
  /** PRのタイトル */
  title?: string;
  /** PRの本文 */
  body?: string;
  /** ブランチ名 */
  branch?: string;
}

/**
 * 操作結果の共通型
 */
export type OperationResult<T> = Result<T, Error>;

/**
 * ファイル操作の結果
 */
export interface FileOperationResult {
  /** 操作対象のファイルパス */
  path: string;
  /** 操作の種類 */
  operation: 'create' | 'update' | 'delete' | 'read';
  /** 成功したかどうか */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * プリセットのバージョン情報
 */
export interface PresetVersion {
  /** コミットハッシュ */
  sha: string;
  /** コミットメッセージ */
  message: string;
  /** コミット日時 */
  date: Date;
  /** 作者 */
  author: string;
}

/**
 * vendorディレクトリ情報
 */
export interface VendorInfo {
  /** vendorディレクトリのパス */
  path: string;
  /** ロックされたコミットハッシュ */
  lockedSha: string;
  /** 含まれるプリセットファイル */
  files: string[];
}