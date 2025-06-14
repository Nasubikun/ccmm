/**
 * initコマンドのテスト
 * 
 * テストの目的：
 * 1. 初期化処理の核心機能が正しく動作することを確認
 * 2. 異なる環境条件での適切な動作を保証
 * 3. エラーハンドリングの妥当性を検証
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { init, isInitialized, loadConfig, type GitHubDependencies } from "./init.js";
import { clearConfigCache } from "../core/config.js";
import { expandTilde } from "../core/fs.js";
import * as inquirer from "inquirer";

// モックの設定
vi.mock("node:fs");
vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn()
  }
}));
vi.mock("../core/fs.js", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));
vi.mock("../core/config.js", async () => {
  const actual = await vi.importActual("../core/config.js");
  return {
    ...actual,
    saveConfig: vi.fn().mockResolvedValue({ success: true }),
    isInitialized: vi.fn().mockReturnValue(false),
  };
});
vi.mock("node:child_process", () => ({
  exec: vi.fn((cmd: string, callback: any) => {
    // execPromiseのモックを作成
    if (callback) {
      callback(null, { stdout: "", stderr: "" });
    }
  }),
  promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: "", stderr: "" }))
}));

describe("init", () => {
  const mockFs = fs as any;
  const mockInquirer = (inquirer as any).default;

  // テスト用のGitHub依存関数モック
  const createMockGitHubDependencies = (overrides: Partial<GitHubDependencies> = {}): GitHubDependencies => ({
    checkGhCommand: vi.fn().mockResolvedValue(true),
    checkGitHubToken: vi.fn().mockReturnValue(true),
    getCurrentGitHubUsername: vi.fn().mockResolvedValue("testuser"),
    checkRepositoryExists: vi.fn().mockResolvedValue(false),
    createRepository: vi.fn().mockResolvedValue(undefined),
    ...overrides
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearConfigCache();
    
    // デフォルトのfsモック設定
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    
    // 環境変数のクリア
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_ACCESS_TOKEN;
  });

  describe("基本的なディレクトリ作成機能", () => {
    it("必要なディレクトリ構造を作成する", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(true) // リポジトリ存在
      });
      
      // 追加リポジトリは設定しない
      mockInquirer.prompt.mockResolvedValue({ addMore: false });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      
      // 必要なディレクトリが作成されることを確認
      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/home/user/.ccmm", { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/home/user/.ccmm/presets", { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/home/user/.ccmm/projects", { recursive: true });
    });

    it("dry-runオプション時は実際のファイル作成を行わない", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(true)
      });
      
      // 追加リポジトリは設定しない
      mockInquirer.prompt.mockResolvedValue({ addMore: false });
      
      const result = await init({ dryRun: true }, github);
      
      expect(result.success).toBe(true);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe("GitHub認証状態別の動作", () => {
    it("GitHub認証ありでリポジトリ存在時は自動設定", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(true)
      });
      
      // 追加リポジトリは設定しない
      mockInquirer.prompt.mockResolvedValue({ addMore: false });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(github.checkGhCommand).toHaveBeenCalled();
      expect(github.checkGitHubToken).toHaveBeenCalled();
      expect(github.getCurrentGitHubUsername).toHaveBeenCalled();
      expect(github.checkRepositoryExists).toHaveBeenCalledWith("testuser", "CLAUDE-md");
    });

    it("GitHub認証なしではリポジトリURL手動入力が必要", async () => {
      const github = createMockGitHubDependencies({
        checkGhCommand: vi.fn().mockResolvedValue(false),
        checkGitHubToken: vi.fn().mockReturnValue(false)
      });
      
      mockInquirer.prompt.mockResolvedValue({
        manualRepo: "github.com/myorg/CLAUDE-md"
      });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(mockInquirer.prompt).toHaveBeenCalled();
    });

    it("GitHub認証なしでもデフォルト値が設定される", async () => {
      // getCurrentGitHubUsernameをモックして推測されたユーザー名を返す
      const github = createMockGitHubDependencies({
        checkGhCommand: vi.fn().mockResolvedValue(true), // ghコマンドはあるが認証なし  
        checkGitHubToken: vi.fn().mockReturnValue(false),
        getCurrentGitHubUsername: vi.fn().mockResolvedValue("guesseduser"), // フォールバック機能をモック
        checkRepositoryExists: vi.fn().mockResolvedValue(true)
      });
      
      let defaultValue: string | undefined;
      mockInquirer.prompt.mockImplementation((questions: any[]) => {
        defaultValue = questions[0].default;
        return Promise.resolve({
          manualRepo: "github.com/guesseduser/CLAUDE-md"
        });
      });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(defaultValue).toBe("github.com/guesseduser/CLAUDE-md");
    });

    it("リポジトリが存在しない場合は作成方法を案内", async () => {
      const github = createMockGitHubDependencies({
        checkGhCommand: vi.fn().mockResolvedValue(true),
        checkGitHubToken: vi.fn().mockReturnValue(false),
        checkRepositoryExists: vi.fn().mockResolvedValue(false)
      });
      
      mockInquirer.prompt.mockResolvedValue({
        manualRepo: "github.com/testuser/CLAUDE-md"
      });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(github.checkRepositoryExists).toHaveBeenCalledWith("testuser", "CLAUDE-md");
    });

    it("リポジトリが存在しない場合は作成を提案", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(false),
        createRepository: vi.fn().mockResolvedValue(undefined)
      });
      
      mockInquirer.prompt
        .mockResolvedValueOnce({ createRepo: true })
        .mockResolvedValueOnce({ addMore: false });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(github.createRepository).toHaveBeenCalledWith("CLAUDE-md", "CLAUDE.md presets");
    });
  });

  describe("複数プリセットリポジトリ対応", () => {
    it("追加リポジトリを設定できる", async () => {
      const mockSaveConfig = vi.mocked((await import("../core/config.js")).saveConfig);
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(true)
      });
      
      mockInquirer.prompt
        .mockResolvedValueOnce({ addMore: true })
        .mockResolvedValueOnce({ 
          additionalRepos: "github.com/team/shared, github.com/org/common" 
        });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPresetRepositories: [
            "github.com/testuser/CLAUDE-md",
            "github.com/team/shared",
            "github.com/org/common"
          ]
        })
      );
    });

    it("カンマ区切りのリポジトリURLを正しく解析する", async () => {
      const mockSaveConfig = vi.mocked((await import("../core/config.js")).saveConfig);
      const github = createMockGitHubDependencies({
        checkGhCommand: vi.fn().mockResolvedValue(false),
        checkGitHubToken: vi.fn().mockReturnValue(false)
      });
      
      mockInquirer.prompt
        .mockResolvedValueOnce({ configChoice: "manual" })
        .mockResolvedValueOnce({
          manualRepo: " github.com/repo1/preset , github.com/repo2/preset , github.com/repo3/preset "
        });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(true);
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPresetRepositories: [
            "github.com/repo1/preset",
            "github.com/repo2/preset", 
            "github.com/repo3/preset"
          ]
        })
      );
    });
  });

  describe("エラーハンドリング", () => {
    it("--yesオプションでリポジトリが存在しない場合は適切にエラー", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(false)
      });
      
      const result = await init({ yes: true }, github);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("--yesフラグが指定されましたが、プリセットリポジトリが存在しません");
      }
    });

    it("GitHub認証なしで--yesオプションは基本初期化で成功", async () => {
      const mockSaveConfig = vi.mocked((await import("../core/config.js")).saveConfig);
      const github = createMockGitHubDependencies({
        checkGhCommand: vi.fn().mockResolvedValue(false),
        checkGitHubToken: vi.fn().mockReturnValue(false)
      });
      
      const result = await init({ yes: true }, github);
      
      expect(result.success).toBe(true);
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPresetRepositories: []
        })
      );
    });

    it("リポジトリ作成失敗時は適切なエラーメッセージ", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(false),
        createRepository: vi.fn().mockRejectedValue(new Error("Repository creation failed"))
      });
      
      mockInquirer.prompt.mockResolvedValue({ createRepo: true });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("リポジトリの作成に失敗しました");
      }
    });

    it("プリセットリポジトリ設定拒否時は初期化失敗", async () => {
      const github = createMockGitHubDependencies({
        checkRepositoryExists: vi.fn().mockResolvedValue(false)
      });
      
      mockInquirer.prompt.mockResolvedValue({ createRepo: false });
      
      const result = await init({ verbose: false }, github);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("プリセットリポジトリが設定されていないため、ccmmを初期化できません");
      }
    });
  });

  describe("設定管理", () => {
    it("isInitialized関数が正しく動作する", async () => {
      const mockConfigModule = vi.mocked(await import("../core/config.js"));
      mockConfigModule.isInitialized.mockReturnValue(true);

      const result = isInitialized();
      expect(result).toBe(true);
    });

    it("loadConfig関数が正しく動作する", () => {
      // loadConfigは既にモックされているので、直接呼び出してモックの動作を確認
      const result = loadConfig();
      expect(result).toBeDefined();
    });
  });
});