/**
 * sync機能のユニットテスト
 * 
 * CLAUDE.md解析、プリセット取得、マージファイル生成、
 * CLAUDE.md更新の各機能をテストする
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { 
  parseCLAUDEMd, 
  fetchPresets, 
  generateMerged, 
  updateClaudeMd,
  sync 
} from './sync.js';
import { generateProjectPaths } from '../core/project.js';
import type { PresetPointer, PresetInfo } from '../core/types/index.js';

// モックの設定
vi.mock('../core/fs.js');
vi.mock('../git/index.js');

describe('sync機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseCLAUDEMd', () => {
    it('自由記述のみの場合、正しく解析する', () => {
      const content = `これは自由記述です。
好きに書けます。`;

      const result = parseCLAUDEMd(content);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.freeContent).toBe(content);
        expect(result.data.importLine).toBeNull();
        expect(result.data.importInfo).toBeNull();
      }
    });

    it('import行がある場合、正しく解析する', () => {
      const content = `これは自由記述です。

@~/.ccmm/projects/github__myorg__myrepo-git-abc123/merged-preset-HEAD.md`;

      const result = parseCLAUDEMd(content);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.freeContent).toBe('これは自由記述です。');
        expect(result.data.importLine).toBe('@~/.ccmm/projects/github__myorg__myrepo-git-abc123/merged-preset-HEAD.md');
        expect(result.data.importInfo).not.toBeNull();
        expect(result.data.importInfo?.pointer.commit).toBe('HEAD');
      }
    });

    it('SHA指定のimport行を正しく解析する', () => {
      const content = `自由記述

@~/.ccmm/projects/test-slug/merged-preset-abc123def.md`;

      const result = parseCLAUDEMd(content);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.importInfo?.pointer.commit).toBe('abc123def');
      }
    });

    it('空の内容を正しく処理する', () => {
      const content = '';

      const result = parseCLAUDEMd(content);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.freeContent).toBe('');
        expect(result.data.importLine).toBeNull();
      }
    });
  });

  describe('generateProjectPaths', () => {
    it('正しいパス情報を生成する', () => {
      const projectRoot = '/path/to/project';
      const originUrl = 'https://github.com/myorg/myrepo.git';
      const commit = 'HEAD';

      const result = generateProjectPaths(projectRoot, originUrl, commit);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const paths = result.data;
        expect(paths.root).toBe(projectRoot);
        expect(paths.claudeMd).toBe(join(projectRoot, 'CLAUDE.md'));
        expect(paths.mergedPresetPath).toContain('merged-preset-HEAD.md');
        expect(paths.projectDir).toContain('.ccmm/projects/');
      }
    });

    it('特定のコミットハッシュで正しいパスを生成する', () => {
      const projectRoot = '/path/to/project';
      const originUrl = 'https://github.com/myorg/myrepo.git';
      const commit = 'abc123def456';

      const result = generateProjectPaths(projectRoot, originUrl, commit);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mergedPresetPath).toContain('merged-preset-abc123def456.md');
      }
    });
  });

  describe('fetchPresets', () => {
    const mockReadFile = vi.fn();
    const mockEnsureDir = vi.fn();
    const mockBatchFetch = vi.fn();

    beforeEach(async () => {
      const fs = await import('../core/fs.js');
      const git = await import('../git/index.js');
      vi.mocked(fs.readFile).mockImplementation(mockReadFile);
      vi.mocked(fs.ensureDir).mockImplementation(mockEnsureDir);
      vi.mocked(git.batchFetch).mockImplementation(mockBatchFetch);
    });

    it('空のプリセットリストを正しく処理する', async () => {
      const result = await fetchPresets([], '/home/.ccmm/presets');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('プリセットを正常に取得する', async () => {
      const pointers: PresetPointer[] = [
        {
          host: 'github.com',
          owner: 'myorg',
          repo: 'CLAUDE-md',
          file: 'react.md',
          commit: 'HEAD'
        }
      ];
      const homePresetDir = '/home/.ccmm/presets';

      mockEnsureDir.mockResolvedValue({ success: true });
      mockBatchFetch.mockResolvedValue({ success: true });
      mockReadFile.mockResolvedValue({ success: true, data: 'preset content' });

      const result = await fetchPresets(pointers, homePresetDir);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.content).toBe('preset content');
        expect(result.data[0]!.pointer).toEqual(pointers[0]);
      }
    });

    it('ディレクトリ作成に失敗した場合、エラーを返す', async () => {
      const pointers: PresetPointer[] = [
        {
          host: 'github.com',
          owner: 'myorg', 
          repo: 'CLAUDE-md',
          file: 'react.md',
          commit: 'HEAD'
        }
      ];

      mockEnsureDir.mockResolvedValue({ success: false, error: new Error('mkdir failed') });

      const result = await fetchPresets(pointers, '/home/.ccmm/presets');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('mkdir failed');
      }
    });
  });

  describe('generateMerged', () => {
    const mockWriteFile = vi.fn();

    beforeEach(async () => {
      const fs = await import('../core/fs.js');
      vi.mocked(fs.writeFile).mockImplementation(mockWriteFile);
    });

    it('プリセットの内容を正しくマージする', async () => {
      const presets: PresetInfo[] = [
        {
          pointer: { host: 'github.com', owner: 'myorg', repo: 'CLAUDE-md', file: 'react.md', commit: 'HEAD' },
          localPath: '/path/to/react.md',
          content: 'React preset content'
        },
        {
          pointer: { host: 'github.com', owner: 'myorg', repo: 'CLAUDE-md', file: 'typescript.md', commit: 'HEAD' },
          localPath: '/path/to/typescript.md',
          content: 'TypeScript preset content'
        }
      ];
      const mergedPresetPath = '/path/to/merged-preset-HEAD.md';
      const commit = 'HEAD';

      mockWriteFile.mockResolvedValue({ success: true });

      const result = await generateMerged(presets, mergedPresetPath, commit);
      
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        mergedPresetPath,
        '@/path/to/react.md\n@/path/to/typescript.md'
      );
      
      if (result.success) {
        expect(result.data.path).toBe(mergedPresetPath);
        expect(result.data.presets).toEqual(presets);
        expect(result.data.commit).toBe(commit);
      }
    });

    it('ローカルパスがあるプリセットの@import行を生成する', async () => {
      const presets: PresetInfo[] = [
        {
          pointer: { host: 'github.com', owner: 'myorg', repo: 'CLAUDE-md', file: 'react.md', commit: 'HEAD' },
          localPath: '/path/to/react.md',
          content: 'React preset content'
        },
        {
          pointer: { host: 'github.com', owner: 'myorg', repo: 'CLAUDE-md', file: 'empty.md', commit: 'HEAD' },
          localPath: '/path/to/empty.md',
          content: undefined
        }
      ];

      mockWriteFile.mockResolvedValue({ success: true });

      const result = await generateMerged(presets, '/path/to/merged.md', 'HEAD');
      
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/path/to/merged.md',
        '@/path/to/react.md\n@/path/to/empty.md'
      );
    });

    it('ファイル書き込みに失敗した場合、エラーを返す', async () => {
      const presets: PresetInfo[] = [];
      
      mockWriteFile.mockResolvedValue({ success: false, error: new Error('write failed') });

      const result = await generateMerged(presets, '/path/to/merged.md', 'HEAD');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('write failed');
      }
    });
  });

  describe('updateClaudeMd', () => {
    const mockReadFile = vi.fn();
    const mockWriteFile = vi.fn();

    beforeEach(async () => {
      const fs = await import('../core/fs.js');
      vi.mocked(fs.readFile).mockImplementation(mockReadFile);
      vi.mocked(fs.writeFile).mockImplementation(mockWriteFile);
    });

    it('新規CLAUDE.mdを作成する', async () => {
      const claudeMdPath = '/path/to/CLAUDE.md';
      const mergedPresetPath = '~/.ccmm/projects/test/merged-preset-HEAD.md';

      mockReadFile.mockResolvedValue({ success: false, error: new Error('File not found') });
      mockWriteFile.mockResolvedValue({ success: true });

      const result = await updateClaudeMd(claudeMdPath, mergedPresetPath);
      
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        claudeMdPath,
        `@${mergedPresetPath}`
      );
    });

    it('既存のCLAUDE.mdを更新する', async () => {
      const claudeMdPath = '/path/to/CLAUDE.md';
      const mergedPresetPath = '~/.ccmm/projects/test/merged-preset-HEAD.md';
      const existingContent = {
        freeContent: 'これは自由記述です。',
        importLine: '@old-import-line',
        importInfo: null
      };

      mockWriteFile.mockResolvedValue({ success: true });

      const result = await updateClaudeMd(claudeMdPath, mergedPresetPath, existingContent);
      
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        claudeMdPath,
        `これは自由記述です。\n\n@${mergedPresetPath}`
      );
    });

    it('空の自由記述の場合、import行のみを書き込む', async () => {
      const claudeMdPath = '/path/to/CLAUDE.md';
      const mergedPresetPath = '~/.ccmm/projects/test/merged-preset-HEAD.md';
      const existingContent = {
        freeContent: '',
        importLine: null,
        importInfo: null
      };

      mockWriteFile.mockResolvedValue({ success: true });

      const result = await updateClaudeMd(claudeMdPath, mergedPresetPath, existingContent);
      
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        claudeMdPath,
        `@${mergedPresetPath}`
      );
    });
  });
});