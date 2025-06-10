/**
 * Git操作ラッパー関数のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
  getHeadSha,
  shallowFetch,
  batchFetch,
  openPr,
  isGitRepository,
  getOriginUrl,
  getBranches,
  createAndCheckoutBranch,
  type PullRequestInfo,
} from "./index.js";
import type { PresetPointer } from "../core/types/index.js";

// Mockの設定
vi.mock("simple-git");
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

const mockExec = vi.fn();

describe("git module", () => {
  let tempDir: string;
  let mockGit: any;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = await mkdtemp(join(tmpdir(), "ccmm-git-test-"));
    
    // simple-gitのモックを設定
    mockGit = {
      revparse: vi.fn(),
      status: vi.fn(),
      getRemotes: vi.fn(),
      branchLocal: vi.fn(),
      checkoutLocalBranch: vi.fn(),
    };
    
    vi.mocked(simpleGit).mockReturnValue(mockGit);
    
    // child_process.execのモックを設定
    const { exec } = await import("node:child_process");
    vi.mocked(exec).mockImplementation(mockExec);
  });

  afterEach(async () => {
    // テスト後に一時ディレクトリを削除
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除に失敗しても無視
    }
    
    // モックをリセット
    vi.resetAllMocks();
  });

  describe("getHeadSha", () => {
    it("HEADコミットハッシュを正常に取得できる", async () => {
      const expectedSha = "abc123def456";
      mockGit.revparse.mockResolvedValue(`${expectedSha}\n`);

      const result = await getHeadSha();
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedSha);
      }
      expect(mockGit.revparse).toHaveBeenCalledWith(["HEAD"]);
    });

    it("指定されたパスのリポジトリからSHAを取得できる", async () => {
      const expectedSha = "def456abc123";
      const repoPath = "/path/to/repo";
      mockGit.revparse.mockResolvedValue(`  ${expectedSha}  \n`);

      const result = await getHeadSha(repoPath);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedSha);
      }
      expect(simpleGit).toHaveBeenCalledWith(repoPath);
    });

    it("Git操作でエラーが発生した場合エラーを返す", async () => {
      const errorMessage = "Not a git repository";
      mockGit.revparse.mockRejectedValue(new Error(errorMessage));

      const result = await getHeadSha();
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe(errorMessage);
      }
    });
  });

  describe("shallowFetch", () => {
    const mockPointer: PresetPointer = {
      host: "github.com",
      owner: "testorg",
      repo: "testRepo",
      file: "preset.md",
      commit: "abc123",
    };

    // mockExecはbeforeEachで設定済み

    it("ghコマンドでファイルを正常にフェッチできる", async () => {
      const localPath = join(tempDir, "fetched.md");
      
      // execのモックを設定（gh成功時）
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (typeof callback === "function") {
          if (callCount === 1) {
            // gh --version の応答
            callback(null, { stdout: "gh version 2.0.0", stderr: "" } as any);
          } else {
            // gh api の応答
            callback(null, { stdout: "File content", stderr: "" } as any);
          }
        }
        return {} as any;
      });

      const result = await shallowFetch(mockPointer, localPath);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.data?.localPath).toBe(localPath);
        expect(result.data.data?.commit).toBe("abc123");
        expect(result.data.data?.method).toBe("gh");
      }
    });

    it("ghが失敗した場合curlにフォールバックする", async () => {
      const localPath = join(tempDir, "fallback.md");
      
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (typeof callback === "function") {
          if (callCount === 1) {
            // gh --version の応答
            callback(null, { stdout: "gh version 2.0.0", stderr: "" } as any);
          } else if (callCount === 2) {
            // gh api の失敗
            callback(null, { stdout: "", stderr: "HTTP 404: Not Found" } as any);
          } else {
            // curl の成功
            callback(null, { stdout: "Success with curl", stderr: "" } as any);
          }
        }
        return {} as any;
      });

      const result = await shallowFetch(mockPointer, localPath);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data?.method).toBe("curl");
      }
    });

    it("GITHUB_TOKENが設定されている場合認証ヘッダーを含む", async () => {
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "test-token";
      
      const localPath = join(tempDir, "fetched-auth.md");
      
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (typeof callback === "function") {
          if (callCount === 1) {
            // gh --version失敗
            callback(new Error("gh not found"), { stdout: "", stderr: "" } as any);
          } else {
            // curlで認証ヘッダー確認
            expect(command).toContain('Authorization: Bearer test-token');
            callback(null, { stdout: "Success", stderr: "" } as any);
          }
        }
        return {} as any;
      });

      const result = await shallowFetch(mockPointer, localPath);
      
      expect(result.success).toBe(true);
      
      // 環境変数を元に戻す
      if (originalToken !== undefined) {
        process.env.GITHUB_TOKEN = originalToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    });

    it("フェッチでエラーが発生した場合エラーを返す", async () => {
      const localPath = join(tempDir, "error.md");
      
      mockExec.mockImplementation((command, callback) => {
        if (typeof callback === "function") {
          callback(null, { stdout: "", stderr: "404 Not Found" } as any);
        }
        return {} as any;
      });

      const result = await shallowFetch(mockPointer, localPath);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Failed to fetch file");
      }
    });
  });

  describe("batchFetch", () => {
    const mockPointers: PresetPointer[] = [
      {
        host: "github.com",
        owner: "org",
        repo: "repo1",
        file: "file1.md",
        commit: "sha1",
      },
      {
        host: "github.com", 
        owner: "org",
        repo: "repo2",
        file: "file2.md",
        commit: "sha2",
      },
    ];

    // mockExecはbeforeEachで設定済み

    it("複数ファイルを一括で正常にフェッチできる", async () => {
      const localPaths = [
        join(tempDir, "batch1.md"),
        join(tempDir, "batch2.md"),
      ];

      mockExec.mockImplementation((command, callback) => {
        if (typeof callback === "function") {
          callback(null, { stdout: "Success", stderr: "" } as any);
        }
        return {} as any;
      });

      const result = await batchFetch(mockPointers, localPaths);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].success).toBe(true);
        expect(result.data[1].success).toBe(true);
      }
    });

    it("ポインタとパスの配列の長さが異なる場合エラーを返す", async () => {
      const localPaths = [join(tempDir, "single.md")];

      const result = await batchFetch(mockPointers, localPaths);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("same length");
      }
    });

    it("一部のフェッチが失敗した場合エラーを返す", async () => {
      const localPaths = [
        join(tempDir, "success.md"),
        join(tempDir, "fail.md"),
      ];

      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (typeof callback === "function") {
          if (callCount === 1) {
            // 最初の呼び出しは成功
            callback(null, { stdout: "Success", stderr: "" } as any);
          } else {
            // 2回目の呼び出しは失敗
            callback(null, { stdout: "", stderr: "Error" } as any);
          }
        }
        return {} as any;
      });

      const result = await batchFetch(mockPointers, localPaths);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Batch fetch failed");
      }
    });
  });

  describe("openPr", () => {
    const mockPrInfo: PullRequestInfo = {
      title: "Test PR",
      body: "Test PR body",
      branch: "feature-branch",
      owner: "testowner",
      repo: "testrepo",
    };

    // mockExecはbeforeEachで設定済み

    it("プルリクエストを正常に作成できる", async () => {
      // gh --version の呼び出し（CLI利用可能チェック）
      // gh pr create の呼び出し
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (typeof callback === "function") {
          if (callCount === 1) {
            // gh --version の応答
            callback(null, { stdout: "gh version 2.0.0", stderr: "" } as any);
          } else {
            // PR作成の応答
            const prUrl = "https://github.com/testowner/testrepo/pull/123";
            callback(null, { stdout: prUrl, stderr: "Opening in browser..." } as any);
          }
        }
        return {} as any;
      });

      const result = await openPr(mockPrInfo);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain("github.com");
        expect(result.data).toContain("pull");
      }
    });

    it("GitHub CLIが利用できない場合エラーを返す", async () => {
      mockExec.mockImplementation((command, callback) => {
        if (typeof callback === "function") {
          callback(new Error("gh: command not found"), { stdout: "", stderr: "" } as any);
        }
        return {} as any;
      });

      const result = await openPr(mockPrInfo);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("command not found");
      }
    });

    it("権限がない場合フォークを試行する", async () => {
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (typeof callback === "function") {
          if (callCount === 1) {
            // gh --version
            callback(null, { stdout: "gh version 2.0.0", stderr: "" } as any);
          } else if (callCount === 2) {
            // PR作成の失敗（権限なし）
            callback(null, { stdout: "", stderr: "permission denied" } as any);
          } else if (callCount === 3) {
            // フォーク作成
            callback(null, { stdout: "Forked", stderr: "" } as any);
          } else if (callCount === 4) {
            // ユーザー名取得
            callback(null, { stdout: "testuser", stderr: "" } as any);
          } else {
            // フォーク先からPR作成
            const prUrl = "https://github.com/testowner/testrepo/pull/124";
            callback(null, { stdout: prUrl, stderr: "Opening in browser..." } as any);
          }
        }
        return {} as any;
      });

      const result = await openPr(mockPrInfo);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain("github.com");
      }
    });
  });

  describe("isGitRepository", () => {
    it("Gitリポジトリの場合trueを返す", async () => {
      mockGit.status.mockResolvedValue({});

      const result = await isGitRepository(tempDir);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      expect(simpleGit).toHaveBeenCalledWith(tempDir);
    });

    it("Gitリポジトリでない場合falseを返す", async () => {
      mockGit.status.mockRejectedValue(new Error("Not a git repository"));

      const result = await isGitRepository(tempDir);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe("getOriginUrl", () => {
    it("origin URLを正常に取得できる", async () => {
      const expectedUrl = "https://github.com/owner/repo.git";
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: {
            fetch: expectedUrl,
            push: expectedUrl,
          },
        },
      ]);

      const result = await getOriginUrl();
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedUrl);
      }
    });

    it("originリモートが存在しない場合エラーを返す", async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "upstream",
          refs: {
            fetch: "https://github.com/upstream/repo.git",
            push: "https://github.com/upstream/repo.git",
          },
        },
      ]);

      const result = await getOriginUrl();
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("No origin remote found");
      }
    });

    it("originリモートにURLがない場合エラーを返す", async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: {},
        },
      ]);

      const result = await getOriginUrl();
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Origin remote has no URL");
      }
    });
  });

  describe("getBranches", () => {
    it("ローカルブランチの一覧を正常に取得できる", async () => {
      mockGit.branchLocal.mockResolvedValue({
        all: ["main", "feature-1", "feature-2"],
        current: "main",
        branches: {
          main: { commit: "abc123", label: "main" },
          "feature-1": { commit: "def456", label: "feature-1" },
          "feature-2": { commit: "ghi789", label: "feature-2" },
        },
      });

      const result = await getBranches();
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe("main");
        expect(result.data[0].current).toBe(true);
        expect(result.data[0].commit).toBe("abc123");
        expect(result.data[1].current).toBe(false);
      }
    });

    it("Git操作でエラーが発生した場合エラーを返す", async () => {
      mockGit.branchLocal.mockRejectedValue(new Error("Git error"));

      const result = await getBranches();
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Git error");
      }
    });
  });

  describe("createAndCheckoutBranch", () => {
    it("新しいブランチを作成してチェックアウトできる", async () => {
      const branchName = "new-feature";
      mockGit.checkoutLocalBranch.mockResolvedValue(undefined);

      const result = await createAndCheckoutBranch(branchName);
      
      expect(result.success).toBe(true);
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith(branchName);
    });

    it("指定されたパスのリポジトリでブランチを作成できる", async () => {
      const branchName = "new-feature";
      const repoPath = "/path/to/repo";
      mockGit.checkoutLocalBranch.mockResolvedValue(undefined);

      const result = await createAndCheckoutBranch(branchName, repoPath);
      
      expect(result.success).toBe(true);
      expect(simpleGit).toHaveBeenCalledWith(repoPath);
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith(branchName);
    });

    it("Git操作でエラーが発生した場合エラーを返す", async () => {
      const branchName = "invalid-branch";
      mockGit.checkoutLocalBranch.mockRejectedValue(new Error("Branch creation failed"));

      const result = await createAndCheckoutBranch(branchName);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Branch creation failed");
      }
    });
  });
});