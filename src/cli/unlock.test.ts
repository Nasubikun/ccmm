/**
 * unlock機能のユニットテスト
 * 
 * ロック状態検出、プリセット設定復元、
 * HEAD版マージファイル生成の各機能をテストする
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  detectLockState, 
  restorePresetConfiguration, 
  regenerateHeadMerged,
  unlock 
} from './unlock.js';
import type { ClaudeMdContent, ProjectPaths, PresetPointer } from '../core/types/index.js';

// モックの設定
vi.mock('../core/fs.js');
vi.mock('../git/index.js');
vi.mock('./sync.js');
vi.mock('../core/project.js');
vi.mock('./init.js');

describe('unlock機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectLockState', () => {
    const mockFileExists = vi.fn();
    const mockReadFile = vi.fn();
    const mockParseCLAUDEMd = vi.fn();

    beforeEach(async () => {
      const fs = await import('../core/fs.js');
      const sync = await import('./sync.js');
      vi.mocked(fs.fileExists).mockImplementation(mockFileExists);
      vi.mocked(fs.readFile).mockImplementation(mockReadFile);
      vi.mocked(sync.parseCLAUDEMd).mockImplementation(mockParseCLAUDEMd);
    });

    it('CLAUDE.mdが存在しない場合、ロックされていないと判定する', async () => {
      const claudeMdPath = '/project/CLAUDE.md';
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: claudeMdPath,
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };

      mockFileExists.mockResolvedValue(false);

      const result = await detectLockState(claudeMdPath, paths);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isLocked).toBe(false);
        expect(result.data.currentSha).toBeUndefined();
      }
    });

    it('import行がない場合、ロックされていないと判定する', async () => {
      const claudeMdPath = '/project/CLAUDE.md';
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: claudeMdPath,
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };

      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ success: true, data: 'Free content only' });
      mockParseCLAUDEMd.mockReturnValue({ 
        success: true, 
        data: { 
          freeContent: 'Free content only', 
          importLine: null, 
          importInfo: null 
        } 
      });

      const result = await detectLockState(claudeMdPath, paths);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isLocked).toBe(false);
        expect(result.data.currentSha).toBeUndefined();
      }
    });

    it('HEAD版のimport行がある場合、ロックされていないと判定する', async () => {
      const claudeMdPath = '/project/CLAUDE.md';
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: claudeMdPath,
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };
      const mockContent: ClaudeMdContent = {
        freeContent: 'Free content',
        importLine: '@~/.ccmm/projects/test-slug/merged-preset-HEAD.md',
        importInfo: {
          line: '@~/.ccmm/projects/test-slug/merged-preset-HEAD.md',
          pointer: { 
            host: 'github.com', 
            owner: '', 
            repo: '', 
            file: '', 
            commit: 'HEAD' 
          },
          path: '~/.ccmm/projects/test-slug/merged-preset-HEAD.md'
        }
      };

      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ success: true, data: 'content with import' });
      mockParseCLAUDEMd.mockReturnValue({ success: true, data: mockContent });

      const result = await detectLockState(claudeMdPath, paths);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isLocked).toBe(false);
        expect(result.data.currentSha).toBeUndefined();
      }
    });

    it('特定のSHAでロックされている場合、ロック状態を正しく検出する', async () => {
      const claudeMdPath = '/project/CLAUDE.md';
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: claudeMdPath,
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };
      const lockedSha = 'abc123def456';
      const mockContent: ClaudeMdContent = {
        freeContent: 'Free content',
        importLine: `@~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md`,
        importInfo: {
          line: `@~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md`,
          pointer: { 
            host: 'github.com', 
            owner: '', 
            repo: '', 
            file: '', 
            commit: lockedSha 
          },
          path: `~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md`
        }
      };

      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ success: true, data: 'content with locked import' });
      mockParseCLAUDEMd.mockReturnValue({ success: true, data: mockContent });

      const result = await detectLockState(claudeMdPath, paths);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isLocked).toBe(true);
        expect(result.data.currentSha).toBe(lockedSha);
      }
    });

    it('CLAUDE.md読み取りに失敗した場合、エラーを返す', async () => {
      const claudeMdPath = '/project/CLAUDE.md';
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: claudeMdPath,
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };

      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ success: false, error: new Error('read failed') });

      const result = await detectLockState(claudeMdPath, paths);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('read failed');
      }
    });

    it('CLAUDE.md解析に失敗した場合、エラーを返す', async () => {
      const claudeMdPath = '/project/CLAUDE.md';
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: claudeMdPath,
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };

      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ success: true, data: 'invalid content' });
      mockParseCLAUDEMd.mockReturnValue({ success: false, error: new Error('parse failed') });

      const result = await detectLockState(claudeMdPath, paths);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('parse failed');
      }
    });
  });

  describe('restorePresetConfiguration', () => {
    it('デフォルトのプリセット設定を返す（現在の実装）', async () => {
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };
      const lockedSha = 'abc123def456';

      const result = await restorePresetConfiguration(paths, lockedSha);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('regenerateHeadMerged', () => {
    const mockFetchPresets = vi.fn();
    const mockGenerateMerged = vi.fn();

    beforeEach(async () => {
      const sync = await import('./sync.js');
      vi.mocked(sync.fetchPresets).mockImplementation(mockFetchPresets);
      vi.mocked(sync.generateMerged).mockImplementation(mockGenerateMerged);
    });

    it('HEAD版のマージプリセットを正常に再生成する', async () => {
      const presetPointers: PresetPointer[] = [
        {
          host: 'github.com',
          owner: 'myorg',
          repo: 'CLAUDE-md',
          file: 'react.md',
          commit: 'HEAD'
        }
      ];
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-abc123.md'
      };

      const mockPresetInfo = [
        {
          pointer: presetPointers[0],
          localPath: '/home/.ccmm/presets/github.com/myorg/CLAUDE-md/react.md',
          content: 'React preset content'
        }
      ];

      mockFetchPresets.mockResolvedValue({ success: true, data: mockPresetInfo });
      mockGenerateMerged.mockResolvedValue({ success: true, data: {} });

      const result = await regenerateHeadMerged(presetPointers, paths);

      expect(result.success).toBe(true);
      expect(mockFetchPresets).toHaveBeenCalledWith(presetPointers, paths.homePresetDir);
      expect(mockGenerateMerged).toHaveBeenCalledWith(
        mockPresetInfo,
        '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md',
        'HEAD'
      );
    });

    it('プリセット取得に失敗した場合、エラーを返す', async () => {
      const presetPointers: PresetPointer[] = [];
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-abc123.md'
      };

      mockFetchPresets.mockResolvedValue({ success: false, error: new Error('fetch failed') });

      const result = await regenerateHeadMerged(presetPointers, paths);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('fetch failed');
      }
    });

    it('マージファイル生成に失敗した場合、エラーを返す', async () => {
      const presetPointers: PresetPointer[] = [];
      const paths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-abc123.md'
      };

      mockFetchPresets.mockResolvedValue({ success: true, data: [] });
      mockGenerateMerged.mockResolvedValue({ success: false, error: new Error('generate failed') });

      const result = await regenerateHeadMerged(presetPointers, paths);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('generate failed');
      }
    });
  });

  describe('unlock', () => {
    const mockIsGitRepository = vi.fn();
    const mockGetOriginUrl = vi.fn();
    const mockGenerateProjectPaths = vi.fn();
    const mockValidateAndSetupProject = vi.fn();
    const mockFileExists = vi.fn();
    const mockReadFile = vi.fn();
    const mockParseCLAUDEMd = vi.fn();
    const mockFetchPresets = vi.fn();
    const mockFetchLocalPresets = vi.fn();
    const mockGenerateMerged = vi.fn();
    const mockUpdateClaudeMd = vi.fn();
    const mockLoadConfig = vi.fn();

    beforeEach(async () => {
      const git = await import('../git/index.js');
      const sync = await import('./sync.js');
      const project = await import('../core/project.js');
      const fs = await import('../core/fs.js');
      const init = await import('./init.js');
      
      vi.mocked(git.isGitRepository).mockImplementation(mockIsGitRepository);
      vi.mocked(git.getOriginUrl).mockImplementation(mockGetOriginUrl);
      vi.mocked(project.generateProjectPaths).mockImplementation(mockGenerateProjectPaths);
      vi.mocked(project.validateAndSetupProject).mockImplementation(mockValidateAndSetupProject);
      vi.mocked(sync.parseCLAUDEMd).mockImplementation(mockParseCLAUDEMd);
      vi.mocked(sync.fetchPresets).mockImplementation(mockFetchPresets);
      vi.mocked(sync.generateMerged).mockImplementation(mockGenerateMerged);
      vi.mocked(sync.updateClaudeMd).mockImplementation(mockUpdateClaudeMd);
      vi.mocked(fs.fileExists).mockImplementation(mockFileExists);
      vi.mocked(fs.readFile).mockImplementation(mockReadFile);
      vi.mocked(init.loadConfig).mockImplementation(mockLoadConfig);
    });

    it('ロックされた状態から正常にアンロック処理を実行する', async () => {
      const mockPaths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };
      const lockedSha = 'abc123def456';

      // validateAndSetupProject の正しいモック
      mockValidateAndSetupProject.mockResolvedValue({
        success: true,
        data: {
          projectRoot: '/project',
          originUrl: 'https://github.com/myorg/myrepo.git',
          slug: 'test-slug',
          paths: mockPaths
        }
      });
      
      // Mock detectLockState to return locked state
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ 
        success: true, 
        data: `Free content\n\n@~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md` 
      });
      mockParseCLAUDEMd.mockReturnValue({ 
        success: true, 
        data: { 
          freeContent: 'Free content', 
          importLine: `@~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md`, 
          importInfo: {
            line: `@~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md`,
            pointer: { host: 'github.com', owner: '', repo: '', file: '', commit: lockedSha },
            path: `~/.ccmm/projects/test-slug/merged-preset-${lockedSha}.md`
          }
        } 
      });
      
      // Mock regenerateHeadMerged dependencies
      mockLoadConfig.mockReturnValue({ 
        success: true, 
        data: { 
          defaultPresetRepo: 'file:///some/path',
          defaultPresets: ['react.md'] 
        } 
      });
      mockFetchPresets.mockResolvedValue({ success: true, data: [] });
      mockFetchLocalPresets.mockResolvedValue({ success: true, data: [] });
      mockGenerateMerged.mockResolvedValue({ success: true, data: {} });
      mockUpdateClaudeMd.mockResolvedValue({ success: true });

      const result = await unlock();

      expect(result.success).toBe(true);
      expect(mockValidateAndSetupProject).toHaveBeenCalledWith('/Users/jo/dev/ccmm', 'HEAD');
    });

    it('Gitリポジトリでない場合、エラーを返す', async () => {
      mockValidateAndSetupProject.mockResolvedValue({
        success: false,
        error: new Error('現在のディレクトリはGitリポジトリではありません')
      });

      const result = await unlock();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('現在のディレクトリはGitリポジトリではありません');
      }
    });

    it('origin URL取得に失敗した場合、エラーを返す', async () => {
      mockValidateAndSetupProject.mockResolvedValue({
        success: false,
        error: new Error('originURLを取得できませんでした: origin not found')
      });

      const result = await unlock();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('originURLを取得できませんでした');
      }
    });

    it('ロックされていない場合、エラーを返す', async () => {
      const mockPaths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };

      mockValidateAndSetupProject.mockResolvedValue({
        success: true,
        data: {
          projectRoot: '/project',
          originUrl: 'https://github.com/myorg/myrepo.git',
          slug: 'test-slug',
          paths: mockPaths
        }
      });
      
      // Mock detectLockState to return not locked (HEAD commit)
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ 
        success: true, 
        data: 'Free content\n\n@~/.ccmm/projects/test-slug/merged-preset-HEAD.md' 
      });
      mockParseCLAUDEMd.mockReturnValue({ 
        success: true, 
        data: { 
          freeContent: 'Free content', 
          importLine: '@~/.ccmm/projects/test-slug/merged-preset-HEAD.md', 
          importInfo: {
            line: '@~/.ccmm/projects/test-slug/merged-preset-HEAD.md',
            pointer: { host: 'github.com', owner: '', repo: '', file: '', commit: 'HEAD' },
            path: '~/.ccmm/projects/test-slug/merged-preset-HEAD.md'
          }
        } 
      });

      const result = await unlock();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('プリセットはロックされていません');
      }
    });

    it('ロック状態検出に失敗した場合、エラーを返す', async () => {
      const mockPaths: ProjectPaths = {
        root: '/project',
        claudeMd: '/project/CLAUDE.md',
        homePresetDir: '/home/.ccmm/presets',
        projectDir: '/home/.ccmm/projects/test-slug',
        mergedPresetPath: '/home/.ccmm/projects/test-slug/merged-preset-HEAD.md'
      };

      mockValidateAndSetupProject.mockResolvedValue({
        success: true,
        data: {
          projectRoot: '/project',
          originUrl: 'https://github.com/myorg/myrepo.git',
          slug: 'test-slug',
          paths: mockPaths
        }
      });
      
      // Mock detectLockState to fail
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue({ success: false, error: new Error('detect failed') });

      const result = await unlock();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('detect failed');
      }
    });
  });
});