/**
 * initコマンドのテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { init, isInitialized, loadConfig } from "./init.js";
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

describe("init", () => {
  const mockFs = fs as any;
  const mockInquirer = (inquirer as any).default;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("init関数", () => {
    it("新規初期化の場合、ディレクトリと設定ファイルを作成する", async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt
        .mockResolvedValueOnce({ useDefaultPresets: true })
        .mockResolvedValueOnce({ presetRepos: "github.com/myorg/CLAUDE-md" });

      const result = await init({ verbose: false });

      expect(result.success).toBe(true);
      expect(result.message).toBe("ccmmの初期化が完了しました");
      
      // ディレクトリ作成の確認
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        "/home/user/.ccmm",
        { recursive: true }
      );
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        "/home/user/.ccmm/presets",
        { recursive: true }
      );
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        "/home/user/.ccmm/projects",
        { recursive: true }
      );

      // 設定ファイル作成の確認
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/home/user/.ccmm/config.json",
        expect.stringContaining("github.com/myorg/CLAUDE-md"),
        "utf-8"
      );
    });

    it("既に初期化済みの場合、確認プロンプトを表示する", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockInquirer.prompt.mockResolvedValue({ confirmReinit: false });

      const result = await init({ verbose: false });

      expect(result.success).toBe(true);
      expect(result.message).toBe("初期化をキャンセルしました");
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it("--yesオプションが指定されている場合、プロンプトをスキップする", async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await init({ yes: true });

      expect(result.success).toBe(true);
      expect(mockInquirer.prompt).not.toHaveBeenCalled();
      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/home/user/.ccmm/config.json",
        "{}",
        "utf-8"
      );
    });

    it("--dry-runオプションが指定されている場合、実際の変更を行わない", async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt
        .mockResolvedValueOnce({ useDefaultPresets: false });

      const result = await init({ dryRun: true });

      expect(result.success).toBe(true);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it("複数のプリセットリポジトリを設定できる", async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt
        .mockResolvedValueOnce({ useDefaultPresets: true })
        .mockResolvedValueOnce({ 
          presetRepos: "github.com/org1/presets, github.com/org2/presets" 
        });

      const result = await init({ verbose: false });

      expect(result.success).toBe(true);
      
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const config = JSON.parse(writeCall[1]);
      
      expect(config.defaultPresetRepositories).toEqual([
        "github.com/org1/presets",
        "github.com/org2/presets"
      ]);
    });

    it("エラーが発生した場合、エラーを返す", async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = await init({ yes: true });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe("Permission denied");
    });
  });

  describe("isInitialized関数", () => {
    it("初期化済みの場合、trueを返す", () => {
      mockFs.existsSync.mockImplementation((path: string) => {
        return path.includes(".ccmm") || path.includes("config.json");
      });

      const result = isInitialized();

      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith("/home/user/.ccmm");
      expect(mockFs.existsSync).toHaveBeenCalledWith("/home/user/.ccmm/config.json");
    });

    it("未初期化の場合、falseを返す", () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = isInitialized();

      expect(result).toBe(false);
    });
  });

  describe("loadConfig関数", () => {
    it("設定ファイルが存在する場合、設定を読み込む", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        defaultPresetRepositories: ["github.com/myorg/CLAUDE-md"]
      }));

      const result = loadConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          defaultPresetRepositories: ["github.com/myorg/CLAUDE-md"]
        });
      }
    });

    it("設定ファイルが存在しない場合、空のオブジェクトを返す", () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = loadConfig();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it("JSONパースエラーの場合、エラーを返す", () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue("invalid json");

      const result = loadConfig();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });
});