/**
 * extract コマンドの単体テスト
 * 
 * git diff パース、ユーザー選択、ファイル操作のテストを実行
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { 
  parseDiffOutput, 
  getStagedChanges, 
  getPresetChoices, 
  appendToPreset, 
  removeFromClaudeMd,
  getClaudeMdContent,
  type DiffChange,
  type ExtractSelection,
  type ClaudeMdLine
} from "./extract.js";
import * as fs from "../core/fs.js";

// モックの設定
vi.mock("node:child_process", () => ({
  exec: vi.fn()
}));

vi.mock("../core/fs.js", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  fileExists: vi.fn()
}));

describe("extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseDiffOutput", () => {
    test("git diff の出力を正しくパースする", () => {
      const diffOutput = `diff --git a/CLAUDE.md b/CLAUDE.md
index abc123..def456 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,2 +1,4 @@
 # Existing content
 
+- Use TypeScript strict mode
+- Add ESLint configuration`;

      const result = parseDiffOutput(diffOutput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toEqual({
          lineNumber: 3,
          content: "- Use TypeScript strict mode",
          filePath: "CLAUDE.md"
        });
        expect(result.data[1]).toEqual({
          lineNumber: 4,
          content: "- Add ESLint configuration",
          filePath: "CLAUDE.md"
        });
      }
    });

    test("CLAUDE.md 以外のファイルは無視する", () => {
      const diffOutput = `diff --git a/package.json b/package.json
index abc123..def456 100644
--- a/package.json
+++ b/package.json
@@ -1,2 +1,3 @@
 {
   "name": "test"
+  "version": "1.0.0"
 }
diff --git a/CLAUDE.md b/CLAUDE.md
index abc123..def456 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,1 +1,2 @@
 # Title
+- New rule`;

      const result = parseDiffOutput(diffOutput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.filePath).toBe("CLAUDE.md");
        expect(result.data[0]!.content).toBe("- New rule");
      }
    });

    test("追加行がない場合は空配列を返す", () => {
      const diffOutput = `diff --git a/CLAUDE.md b/CLAUDE.md
index abc123..def456 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,2 +1,2 @@
 # Title
-Old content
+New content`;

      const result = parseDiffOutput(diffOutput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.content).toBe("New content");
      }
    });

    test("不正な diff 出力でもエラーを返さない", () => {
      const diffOutput = "invalid diff output";
      
      const result = parseDiffOutput(diffOutput);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe("getPresetChoices", () => {
    test("プリセット選択肢を正しく返す", async () => {
      const result = await getPresetChoices();
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              file: "react.md",
              owner: "myorg",
              repo: "CLAUDE-md"
            }),
            expect.objectContaining({
              file: "typescript.md",
              owner: "myorg", 
              repo: "CLAUDE-md"
            }),
            expect.objectContaining({
              file: "custom",
              owner: "custom",
              repo: "custom"
            })
          ])
        );
      }
    });
  });

  describe("appendToPreset", () => {
    test("新規ファイルにコンテンツを追記する", async () => {
      const selection: ExtractSelection = {
        selectedLines: ["- Use strict mode", "- Add linting"],
        preset: {
          name: "react.md",
          file: "react.md",
          owner: "myorg",
          repo: "CLAUDE-md"
        }
      };

      // ファイルが存在しない場合をモック
      vi.mocked(fs.fileExists).mockResolvedValue(false);
      vi.mocked(fs.writeFile).mockResolvedValue({ success: true, data: undefined });

      const result = await appendToPreset(selection);

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("react.md"),
        "- Use strict mode\n- Add linting"
      );
    });

    test("既存ファイルにコンテンツを追記する", async () => {
      const selection: ExtractSelection = {
        selectedLines: ["- New rule"],
        preset: {
          name: "react.md",
          file: "react.md", 
          owner: "myorg",
          repo: "CLAUDE-md"
        }
      };

      // 既存ファイルの内容をモック
      vi.mocked(fs.fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue({ 
        success: true, 
        data: "- Existing rule" 
      });
      vi.mocked(fs.writeFile).mockResolvedValue({ success: true, data: undefined });

      const result = await appendToPreset(selection);

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("react.md"),
        "- Existing rule\n\n- New rule"
      );
    });

    test("ファイル書き込みエラーを処理する", async () => {
      const selection: ExtractSelection = {
        selectedLines: ["- Test rule"],
        preset: {
          name: "react.md",
          file: "react.md",
          owner: "myorg", 
          repo: "CLAUDE-md"
        }
      };

      vi.mocked(fs.fileExists).mockResolvedValue(false);
      vi.mocked(fs.writeFile).mockResolvedValue({ 
        success: false, 
        error: new Error("Write failed") 
      });

      const result = await appendToPreset(selection);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Write failed");
      }
    });
  });

  describe("removeFromClaudeMd", () => {
    test("CLAUDE.md から指定された行を削除する", async () => {
      const selectedLines = ["- Remove this line", "- And this one"];
      const claudeMdPath = "/path/to/CLAUDE.md";
      
      const claudeContent = `# Project Rules

- Keep this line
- Remove this line
- And this one
- Keep this too

@~/.ccmm/projects/test/merged-preset-HEAD.md`;

      vi.mocked(fs.readFile).mockResolvedValue({
        success: true,
        data: claudeContent
      });
      vi.mocked(fs.writeFile).mockResolvedValue({ success: true, data: undefined });

      const result = await removeFromClaudeMd(selectedLines, claudeMdPath);

      expect(result.success).toBe(true);
      
      const expectedContent = `# Project Rules

- Keep this line
- Keep this too

@~/.ccmm/projects/test/merged-preset-HEAD.md`;

      expect(fs.writeFile).toHaveBeenCalledWith(claudeMdPath, expectedContent);
    });

    test("import行がない場合も正しく処理する", async () => {
      const selectedLines = ["- Remove this"];
      const claudeMdPath = "/path/to/CLAUDE.md";
      
      const claudeContent = `# Project Rules

- Keep this line
- Remove this`;

      vi.mocked(fs.readFile).mockResolvedValue({
        success: true,
        data: claudeContent
      });
      vi.mocked(fs.writeFile).mockResolvedValue({ success: true, data: undefined });

      const result = await removeFromClaudeMd(selectedLines, claudeMdPath);

      expect(result.success).toBe(true);
      
      const expectedContent = `# Project Rules

- Keep this line`;

      expect(fs.writeFile).toHaveBeenCalledWith(claudeMdPath, expectedContent);
    });

    test("ファイル読み取りエラーを処理する", async () => {
      const selectedLines = ["- Test"];
      const claudeMdPath = "/path/to/CLAUDE.md";
      
      vi.mocked(fs.readFile).mockResolvedValue({
        success: false,
        error: new Error("Read failed")
      });

      const result = await removeFromClaudeMd(selectedLines, claudeMdPath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("CLAUDE.md の読み取りに失敗しました");
      }
    });
  });

  describe("getClaudeMdContent", () => {
    test("CLAUDE.md の内容から抽出可能な行を取得する", async () => {
      const claudeMdPath = "/path/to/CLAUDE.md";
      const claudeContent = `# Project Rules

- Use TypeScript
- Enable strict mode

@~/.ccmm/projects/test/merged-preset-HEAD.md`;

      vi.mocked(fs.readFile).mockResolvedValue({
        success: true,
        data: claudeContent
      });

      const result = await getClaudeMdContent(claudeMdPath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]).toEqual({
          lineNumber: 1,
          content: "# Project Rules",
          source: "file"
        });
        expect(result.data[1]).toEqual({
          lineNumber: 3,
          content: "- Use TypeScript",
          source: "file"
        });
        expect(result.data[2]).toEqual({
          lineNumber: 4,
          content: "- Enable strict mode",
          source: "file"
        });
      }
    });

    test("空行をスキップする", async () => {
      const claudeMdPath = "/path/to/CLAUDE.md";
      const claudeContent = `# Title


- Rule 1

- Rule 2`;

      vi.mocked(fs.readFile).mockResolvedValue({
        success: true,
        data: claudeContent
      });

      const result = await getClaudeMdContent(claudeMdPath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]!.content).toBe("# Title");
        expect(result.data[1]!.content).toBe("- Rule 1");
        expect(result.data[2]!.content).toBe("- Rule 2");
      }
    });

    test("import行を除外する", async () => {
      const claudeMdPath = "/path/to/CLAUDE.md";
      const claudeContent = `# Rules
- Rule 1

@~/.ccmm/projects/test/merged-preset-HEAD.md`;

      vi.mocked(fs.readFile).mockResolvedValue({
        success: true,
        data: claudeContent
      });

      const result = await getClaudeMdContent(claudeMdPath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]!.content).toBe("# Rules");
        expect(result.data[1]!.content).toBe("- Rule 1");
        // import行は含まれない
        expect(result.data.some(line => line.content.startsWith("@"))).toBe(false);
      }
    });

    test("ファイル読み取りエラーを処理する", async () => {
      const claudeMdPath = "/path/to/CLAUDE.md";
      
      vi.mocked(fs.readFile).mockResolvedValue({
        success: false,
        error: new Error("Read failed")
      });

      const result = await getClaudeMdContent(claudeMdPath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("CLAUDE.md の読み取りに失敗しました");
      }
    });
  });
});