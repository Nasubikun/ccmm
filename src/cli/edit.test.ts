/**
 * edit機能のユニットテスト
 * 
 * プリセットファイルのパス構築、ファイル作成、エディタ起動、
 * メイン編集処理の各機能をテストする
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { 
  openInEditor, 
  edit 
} from './edit.js';
import { 
  buildPresetPath, 
  ensurePresetFile
} from '../core/preset.js';
import type { EditOptions } from '../core/types/index.js';

// モックの設定
vi.mock('../core/fs.js');
vi.mock('node:child_process');
vi.mock('../core/project.js');
vi.mock('../core/config.js');
vi.mock('inquirer');

describe('edit機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildPresetPath', () => {
    it('デフォルトのパラメータで正しいパスを構築する', () => {
      const preset = 'react.md';
      const owner = 'myorg';
      
      const result = buildPresetPath(preset, owner);
      
      const expected = join(homedir(), '.ccmm', 'presets', 'github.com', 'myorg', 'CLAUDE-md', 'react.md');
      expect(result).toBe(expected);
    });

    it('カスタムリポジトリ名で正しいパスを構築する', () => {
      const preset = 'typescript.md';
      const owner = 'myorg';
      const repo = 'custom-presets';
      
      const result = buildPresetPath(preset, owner, repo);
      
      const expected = join(homedir(), '.ccmm', 'presets', 'github.com', 'myorg', 'custom-presets', 'typescript.md');
      expect(result).toBe(expected);
    });

    it('カスタムホストで正しいパスを構築する', () => {
      const preset = 'vue.md';
      const owner = 'myorg';
      const repo = 'CLAUDE-md';
      const host = 'gitlab.com';
      
      const result = buildPresetPath(preset, owner, repo, host);
      
      const expected = join(homedir(), '.ccmm', 'presets', 'gitlab.com', 'myorg', 'CLAUDE-md', 'vue.md');
      expect(result).toBe(expected);
    });
  });

  describe('ensurePresetFile', () => {
    const mockFileExists = vi.fn();
    const mockEnsureDir = vi.fn();
    const mockWriteFile = vi.fn();

    beforeEach(async () => {
      const fs = await import('../core/fs.js');
      vi.mocked(fs.fileExists).mockImplementation(mockFileExists);
      vi.mocked(fs.ensureDir).mockImplementation(mockEnsureDir);
      vi.mocked(fs.writeFile).mockImplementation(mockWriteFile);
    });

    it('ファイルが既に存在する場合、何もしない', async () => {
      const filePath = '/path/to/preset.md';
      
      mockFileExists.mockResolvedValue(true);
      
      const result = await ensurePresetFile(filePath);
      
      expect(result.success).toBe(true);
      expect(mockEnsureDir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('ファイルが存在しない場合、親ディレクトリを作成して空ファイルを作成する', async () => {
      const filePath = '/path/to/presets/react.md';
      
      mockFileExists.mockResolvedValue(false);
      mockEnsureDir.mockResolvedValue({ success: true });
      mockWriteFile.mockResolvedValue({ success: true });
      
      const result = await ensurePresetFile(filePath);
      
      expect(result.success).toBe(true);
      expect(mockEnsureDir).toHaveBeenCalledWith('/path/to/presets');
      expect(mockWriteFile).toHaveBeenCalledWith(filePath, '');
    });

    it('ディレクトリ作成に失敗した場合、エラーを返す', async () => {
      const filePath = '/path/to/presets/react.md';
      
      mockFileExists.mockResolvedValue(false);
      mockEnsureDir.mockResolvedValue({ success: false, error: new Error('mkdir failed') });
      
      const result = await ensurePresetFile(filePath);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('mkdir failed');
      }
    });

    it('ファイル作成に失敗した場合、エラーを返す', async () => {
      const filePath = '/path/to/presets/react.md';
      
      mockFileExists.mockResolvedValue(false);
      mockEnsureDir.mockResolvedValue({ success: true });
      mockWriteFile.mockResolvedValue({ success: false, error: new Error('write failed') });
      
      const result = await ensurePresetFile(filePath);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('write failed');
      }
    });
  });

  describe('openInEditor', () => {
    const mockSpawn = vi.fn();

    beforeEach(async () => {
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.spawn).mockImplementation(mockSpawn);
    });

    it('エディタが正常終了した場合、成功を返す', async () => {
      const filePath = '/path/to/preset.md';
      
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            // 成功のexitコード
            setTimeout(() => callback(0), 0);
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);
      
      const result = await openInEditor(filePath);
      
      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String), // EDITOR環境変数の値
        [filePath],
        { stdio: 'inherit', shell: true }
      );
    });

    it('エディタが異常終了した場合、エラーを返す', async () => {
      const filePath = '/path/to/preset.md';
      
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            // 異常終了のexitコード
            setTimeout(() => callback(1), 0);
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);
      
      const result = await openInEditor(filePath);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('exited abnormally');
        expect(result.error.message).toContain('exit code: 1');
      }
    });

    it('エディタの起動でエラーが発生した場合、エラーを返す', async () => {
      const filePath = '/path/to/preset.md';
      
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('spawn failed')), 0);
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);
      
      const result = await openInEditor(filePath);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('spawn failed');
      }
    });

    it('EDITOR環境変数が未設定の場合、viを使用する', async () => {
      const filePath = '/path/to/preset.md';
      const originalEditor = process.env.EDITOR;
      delete process.env.EDITOR;
      delete process.env.VISUAL;
      
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 0);
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);
      
      const result = await openInEditor(filePath);
      
      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'vi',
        [filePath],
        { stdio: 'inherit', shell: true }
      );
      
      // 環境変数を復元
      if (originalEditor) {
        process.env.EDITOR = originalEditor;
      }
    });
  });

  describe('edit (メイン機能)', () => {

    it('プリセット名が指定されていない場合、エラーを返す', async () => {
      const options: EditOptions = { owner: 'myorg' };
      
      const result = await edit('', options);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Please specify preset name');
      }
    });

    it('ownerが指定されていない場合、エラーを返す', async () => {
      const preset = 'react.md';
      const options: EditOptions = {};
      
      const result = await edit(preset, options);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('--owner option');
      }
    });

    it('ドライランモードの場合、実際の操作をスキップする', async () => {
      const preset = 'react.md';
      const options: EditOptions = { 
        owner: 'myorg', 
        dryRun: true 
      };
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const result = await edit(preset, options);
      
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
      
      consoleSpy.mockRestore();
    });

    it('基本的なバリデーションが正しく動作する', async () => {
      const preset = 'react.md';
      const options: EditOptions = { 
        owner: 'myorg',
        repo: 'custom-presets',
        dryRun: true // 実際の操作をスキップ
      };
      
      const result = await edit(preset, options);
      
      expect(result.success).toBe(true);
    });
  });
});