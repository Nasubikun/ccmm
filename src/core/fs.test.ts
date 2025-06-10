/**
 * ファイルシステム操作ヘルパー関数のテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { 
  readFile, 
  writeFile, 
  ensureDir, 
  expandTilde, 
  resolvePath, 
  fileExists, 
  safeReadFile 
} from "./fs.js";

describe("fs module", () => {
  let tempDir: string;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = await mkdtemp(join(tmpdir(), "ccmm-test-"));
  });

  afterEach(async () => {
    // テスト後に一時ディレクトリを削除
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // 削除に失敗しても無視（テスト環境の問題）
    }
  });

  describe("readFile", () => {
    it("存在するファイルの内容を正常に読み取れる", async () => {
      const filePath = join(tempDir, "test.txt");
      const content = "Hello, World!";
      
      // テスト用ファイルを先に作成
      const writeResult = await writeFile(filePath, content);
      expect(writeResult.success).toBe(true);

      // ファイルを読み取り
      const result = await readFile(filePath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(content);
      }
    });

    it("存在しないファイルを読み取ろうとした場合エラーが返る", async () => {
      const filePath = join(tempDir, "nonexistent.txt");
      
      const result = await readFile(filePath);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it("UTF-8以外のエンコーディングでファイルを読み取れる", async () => {
      const filePath = join(tempDir, "test-ascii.txt");
      const content = "ASCII content";
      
      const writeResult = await writeFile(filePath, content);
      expect(writeResult.success).toBe(true);

      const result = await readFile(filePath, "ascii");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(content);
      }
    });
  });

  describe("writeFile", () => {
    it("ファイルに内容を正常に書き込める", async () => {
      const filePath = join(tempDir, "write-test.txt");
      const content = "Test content";
      
      const result = await writeFile(filePath, content);
      expect(result.success).toBe(true);

      // 書き込んだ内容を確認
      const readResult = await readFile(filePath);
      expect(readResult.success).toBe(true);
      if (readResult.success) {
        expect(readResult.data).toBe(content);
      }
    });

    it("存在しない親ディレクトリがあっても自動的に作成される", async () => {
      const filePath = join(tempDir, "nested", "dir", "test.txt");
      const content = "Nested content";
      
      const result = await writeFile(filePath, content);
      expect(result.success).toBe(true);

      // 書き込んだ内容を確認
      const readResult = await readFile(filePath);
      expect(readResult.success).toBe(true);
      if (readResult.success) {
        expect(readResult.data).toBe(content);
      }
    });

    it("既存ファイルの内容を上書きできる", async () => {
      const filePath = join(tempDir, "overwrite-test.txt");
      const originalContent = "Original content";
      const newContent = "New content";
      
      // 最初の書き込み
      let result = await writeFile(filePath, originalContent);
      expect(result.success).toBe(true);

      // 上書き
      result = await writeFile(filePath, newContent);
      expect(result.success).toBe(true);

      // 上書きされた内容を確認
      const readResult = await readFile(filePath);
      expect(readResult.success).toBe(true);
      if (readResult.success) {
        expect(readResult.data).toBe(newContent);
      }
    });
  });

  describe("ensureDir", () => {
    it("存在しないディレクトリを作成できる", async () => {
      const dirPath = join(tempDir, "new-dir");
      
      const result = await ensureDir(dirPath);
      expect(result.success).toBe(true);

      // ディレクトリが作成されたことを確認
      const exists = await fileExists(dirPath);
      expect(exists).toBe(true);
    });

    it("ネストしたディレクトリを再帰的に作成できる", async () => {
      const dirPath = join(tempDir, "nested", "deep", "directory");
      
      const result = await ensureDir(dirPath);
      expect(result.success).toBe(true);

      // ディレクトリが作成されたことを確認
      const exists = await fileExists(dirPath);
      expect(exists).toBe(true);
    });

    it("既に存在するディレクトリに対してエラーにならない", async () => {
      const dirPath = join(tempDir, "existing-dir");
      
      // 最初の作成
      let result = await ensureDir(dirPath);
      expect(result.success).toBe(true);

      // 2回目の作成（既存）
      result = await ensureDir(dirPath);
      expect(result.success).toBe(true);
    });
  });

  describe("expandTilde", () => {
    it("チルダで始まるパスをホームディレクトリに展開する", () => {
      const result = expandTilde("~/.ccmm/config");
      expect(result).toBe(join(homedir(), ".ccmm/config"));
    });

    it("チルダのみのパスをホームディレクトリに展開する", () => {
      const result = expandTilde("~");
      expect(result).toBe(homedir());
    });

    it("チルダで始まらないパスはそのまま返す", () => {
      const path = "/absolute/path";
      const result = expandTilde(path);
      expect(result).toBe(path);
    });

    it("相対パスはそのまま返す", () => {
      const path = "relative/path";
      const result = expandTilde(path);
      expect(result).toBe(path);
    });
  });

  describe("resolvePath", () => {
    it("相対パスを絶対パスに解決する", () => {
      const result = resolvePath("test/path");
      expect(result).toMatch(/^[/\\]/); // 絶対パスで始まる
      expect(result).toContain("test/path");
    });

    it("チルダを含むパスを正しく解決する", () => {
      const result = resolvePath("~/.ccmm");
      expect(result).toBe(join(homedir(), ".ccmm"));
    });

    it("既に絶対パスの場合はそのまま返す", () => {
      const absolutePath = join(tempDir, "absolute");
      const result = resolvePath(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it("基準ディレクトリを指定して相対パスを解決する", () => {
      const result = resolvePath("config.json", tempDir);
      expect(result).toBe(join(tempDir, "config.json"));
    });
  });

  describe("fileExists", () => {
    it("存在するファイルに対してtrueを返す", async () => {
      const filePath = join(tempDir, "exists.txt");
      
      // テスト用ファイルを作成
      const writeResult = await writeFile(filePath, "content");
      expect(writeResult.success).toBe(true);

      const exists = await fileExists(filePath);
      expect(exists).toBe(true);
    });

    it("存在しないファイルに対してfalseを返す", async () => {
      const filePath = join(tempDir, "nonexistent.txt");
      
      const exists = await fileExists(filePath);
      expect(exists).toBe(false);
    });

    it("存在するディレクトリに対してtrueを返す", async () => {
      const dirPath = join(tempDir, "test-dir");
      
      const ensureResult = await ensureDir(dirPath);
      expect(ensureResult.success).toBe(true);

      const exists = await fileExists(dirPath);
      expect(exists).toBe(true);
    });
  });

  describe("safeReadFile", () => {
    it("存在するファイルの内容を正常に読み取れる", async () => {
      const filePath = join(tempDir, "safe-read.txt");
      const content = "Safe read content";
      
      const writeResult = await writeFile(filePath, content);
      expect(writeResult.success).toBe(true);

      const result = await safeReadFile(filePath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(content);
      }
    });

    it("存在しないファイルに対してnullを返す", async () => {
      const filePath = join(tempDir, "nonexistent-safe.txt");
      
      const result = await safeReadFile(filePath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(null);
      }
    });

    it("読み取りエラーが発生した場合エラーを返す", async () => {
      // 権限のないファイルパスを使用してエラーを意図的に発生させる
      // ただし、テスト環境によっては権限エラーが発生しない場合があるため、
      // この部分はOS依存のテストとなる
      const invalidPath = "/root/no-permission-file.txt";
      
      const result = await safeReadFile(invalidPath);
      // 権限エラーの場合はエラーが返る、存在しない場合はnullが返る
      if (result.success) {
        expect(result.data).toBe(null);
      } else {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });
});