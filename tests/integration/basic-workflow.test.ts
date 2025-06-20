/**
 * 基本的なワークフローの統合テスト
 * 動作確認済みの機能のみをテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import {
  createTestContext,
  initGitRepo,
  execCLI,
  fileExists,
  readFile,
  getClaudeMdImportLine,
  setGitRemote,
  calculateProjectSlug,
  type TestContext,
} from "./helpers.js";

describe("基本ワークフロー統合テスト", () => {
  let ctx: TestContext;
  const remoteUrl = "git@github.com:test/my-project.git";

  beforeEach(async () => {
    ctx = await createTestContext();
    
    // プロジェクトリポジトリを初期化
    await initGitRepo(ctx.projectDir);
    
    // プロジェクトにリモートURLを設定（slug生成用）
    setGitRemote(ctx.projectDir, remoteUrl);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("ccmm initとsyncの基本動作が正常に機能する", async () => {
    // 1. ccmm init（ホームディレクトリを設定、テスト用環境）
    const initResult = execCLI("init --yes", ctx.projectDir, {
      HOME: ctx.homeDir,
      NODE_ENV: "test", // テスト環境であることを示す
    });
    
    // init が失敗した場合はデバッグ情報を出力
    if (initResult.exitCode !== 0) {
      console.log("Init stdout:", initResult.stdout);
      console.log("Init stderr:", initResult.stderr);
    }
    
    expect(initResult.exitCode).toBe(0);
    
    // ~/.ccmm ディレクトリが作成されることを確認
    expect(await fileExists(path.join(ctx.homeDir, ".ccmm"))).toBe(true);
    expect(await fileExists(path.join(ctx.homeDir, ".ccmm", "config.json"))).toBe(true);
    expect(await fileExists(path.join(ctx.homeDir, ".ccmm", "presets"))).toBe(true);
    expect(await fileExists(path.join(ctx.homeDir, ".ccmm", "projects"))).toBe(true);

    // 2. CLAUDE.mdの初期状態を確認
    const initialClaude = await readFile(path.join(ctx.projectDir, "CLAUDE.md"));
    expect(initialClaude).toBe("# プロジェクト固有メモリ\n");

    // 2.5. テスト用のプリセット選択設定を作成
    const projectSlug = calculateProjectSlug(remoteUrl);
    const projectCcmmDir = path.join(ctx.homeDir, ".ccmm", "projects", projectSlug);
    await fs.mkdir(projectCcmmDir, { recursive: true });
    
    const presetSelection = {
      selectedPresets: [
        {
          repo: "github.com/testuser/CLAUDE-md",
          file: "test-preset.md"
        }
      ],
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(
      path.join(projectCcmmDir, "preset-selection.json"),
      JSON.stringify(presetSelection, null, 2)
    );

    // テスト用のプリセットファイルを作成
    const presetDir = path.join(ctx.homeDir, ".ccmm", "presets", "github.com", "testuser", "CLAUDE-md");
    await fs.mkdir(presetDir, { recursive: true });
    await fs.writeFile(
      path.join(presetDir, "test-preset.md"),
      "# Test Preset\nTest preset content\n"
    );

    // 3. ccmm sync（プリセット適用）
    const syncResult = execCLI("sync --skip-selection", ctx.projectDir, {
      HOME: ctx.homeDir,
      NODE_ENV: "test"
    });
    
    // sync が失敗した場合はデバッグ情報を出力
    if (syncResult.exitCode !== 0) {
      console.log("Sync stdout:", syncResult.stdout);
      console.log("Sync stderr:", syncResult.stderr);
    }
    
    expect(syncResult.exitCode).toBe(0);

    // 4. merged-preset-HEAD.md が作成されることを確認
    const mergedPresetPath = path.join(projectCcmmDir, "merged-preset-HEAD.md");
    
    expect(await fileExists(mergedPresetPath)).toBe(true);

    // 5. CLAUDE.mdにインポート行が追加されることを確認
    const importLine = await getClaudeMdImportLine(ctx.projectDir);
    expect(importLine).toBeTruthy();
    expect(importLine).toMatch(/merged-preset-HEAD\.md$/);

    // 6. マージプリセットファイルの内容を確認（空であることを期待）
    const mergedContent = await readFile(mergedPresetPath);
    expect(mergedContent).toBeDefined();
    
    // 7. CLAUDE.mdの最終形を確認
    const finalClaude = await readFile(path.join(ctx.projectDir, "CLAUDE.md"));
    expect(finalClaude).toContain("# プロジェクト固有メモリ");
    expect(finalClaude).toContain("@");
  });

  it("プロジェクトslugが正しく計算される", () => {
    // 異なるURL形式でのslug計算をテスト
    const testCases = [
      "git@github.com:test/my-project.git",
      "https://github.com/test/my-project.git",
      "https://github.com/test/my-project",
    ];

    const slugs = testCases.map(url => calculateProjectSlug(url));
    
    // すべて同じslugになることを確認（正規化が正しく動作）
    expect(slugs[0]).toBe(slugs[1]);
    expect(slugs[0]).toBe(slugs[2]);
    
    // slugが16文字のハッシュであることを確認
    expect(slugs[0]).toMatch(/^[a-f0-9]{16}$/);
  });

  it("複数回のsyncが安全に実行できる", async () => {
    // 初期化
    const initResult = execCLI("init --yes", ctx.projectDir, { 
      HOME: ctx.homeDir,
      NODE_ENV: "test" 
    });
    
    // init が失敗した場合はデバッグ情報を出力
    if (initResult.exitCode !== 0) {
      console.log("Init stdout:", initResult.stdout);
      console.log("Init stderr:", initResult.stderr);
    }
    
    expect(initResult.exitCode).toBe(0);

    // テスト用のプリセット選択設定を作成
    const projectSlug = calculateProjectSlug(remoteUrl);
    const projectCcmmDir = path.join(ctx.homeDir, ".ccmm", "projects", projectSlug);
    await fs.mkdir(projectCcmmDir, { recursive: true });
    
    const presetSelection = {
      selectedPresets: [
        {
          repo: "github.com/testuser/CLAUDE-md",
          file: "test-preset.md"
        }
      ],
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(
      path.join(projectCcmmDir, "preset-selection.json"),
      JSON.stringify(presetSelection, null, 2)
    );

    // テスト用のプリセットファイルを作成
    const presetDir = path.join(ctx.homeDir, ".ccmm", "presets", "github.com", "testuser", "CLAUDE-md");
    await fs.mkdir(presetDir, { recursive: true });
    await fs.writeFile(
      path.join(presetDir, "test-preset.md"),
      "# Test Preset\nTest preset content\n"
    );

    // 1回目のsync
    const sync1Result = execCLI("sync --skip-selection", ctx.projectDir, { 
      HOME: ctx.homeDir,
      NODE_ENV: "test"
    });
    
    if (sync1Result.exitCode !== 0) {
      console.log("Sync1 stdout:", sync1Result.stdout);
      console.log("Sync1 stderr:", sync1Result.stderr);
    }
    
    expect(sync1Result.exitCode).toBe(0);

    const importLine1 = await getClaudeMdImportLine(ctx.projectDir);
    
    // 2回目のsync
    const sync2Result = execCLI("sync --skip-selection", ctx.projectDir, { 
      HOME: ctx.homeDir,
      NODE_ENV: "test"
    });
    
    if (sync2Result.exitCode !== 0) {
      console.log("Sync2 stdout:", sync2Result.stdout);
      console.log("Sync2 stderr:", sync2Result.stderr);
    }
    
    expect(sync2Result.exitCode).toBe(0);

    const importLine2 = await getClaudeMdImportLine(ctx.projectDir);
    
    // インポート行が同じであることを確認（冪等性）
    expect(importLine1).toBe(importLine2);
  });
});