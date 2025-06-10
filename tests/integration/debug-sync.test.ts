/**
 * sync機能のデバッグテスト
 * merged-preset-HEAD.mdの内容を詳細に確認
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import {
  createTestContext,
  initGitRepo,
  execCLI,
  fileExists,
  readFile,
  setGitRemote,
  calculateProjectSlug,
  type TestContext,
} from "./helpers.js";

describe("Sync機能デバッグ", () => {
  let ctx: TestContext;
  const remoteUrl = "git@github.com:test/my-project.git";

  beforeEach(async () => {
    ctx = await createTestContext();
    
    // プロジェクトリポジトリを初期化
    await initGitRepo(ctx.projectDir);
    
    // プリセットリポジトリを初期化  
    await initGitRepo(ctx.presetDir, true);
    
    // プロジェクトにリモートURLを設定
    setGitRemote(ctx.projectDir, remoteUrl);
    
    // 基本セットアップ
    execCLI("init --yes", ctx.projectDir, { HOME: ctx.homeDir });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("syncで作成されるmerged-preset-HEAD.mdの内容を詳細確認", async () => {
    // 設定ファイルを作成
    const configPath = path.join(ctx.homeDir, ".ccmm", "config.json");
    const config = {
      defaultPresetRepo: `file://${ctx.presetDir}`,
      defaultPresets: ["react.md", "typescript.md"]
    };
    await require("node:fs/promises").writeFile(configPath, JSON.stringify(config, null, 2));

    console.log("🔍 Config設定:");
    console.log("- defaultPresetRepo:", config.defaultPresetRepo);
    console.log("- defaultPresets:", config.defaultPresets);

    // syncを実行
    const syncResult = execCLI("sync --yes", ctx.projectDir, { HOME: ctx.homeDir });
    console.log("🔍 Sync結果:", syncResult.exitCode);
    
    if (syncResult.exitCode !== 0) {
      console.log("Sync stderr:", syncResult.stderr);
      return;
    }

    // 作成されたファイルの確認
    const projectSlug = calculateProjectSlug(remoteUrl);
    const mergedPresetPath = path.join(
      ctx.homeDir, 
      ".ccmm", 
      "projects", 
      projectSlug, 
      "merged-preset-HEAD.md"
    );

    console.log("🔍 merged-preset-HEAD.mdパス:", mergedPresetPath);
    console.log("🔍 ファイル存在:", await fileExists(mergedPresetPath));

    if (await fileExists(mergedPresetPath)) {
      const content = await readFile(mergedPresetPath);
      console.log("🔍 merged-preset-HEAD.mdの内容:");
      console.log("'" + content + "'");
      console.log("🔍 内容の長さ:", content.length);
      console.log("🔍 行数:", content.split('\n').length);
      
      if (content.trim() === "") {
        console.log("❌ merged-preset-HEAD.mdが空です！これがlockが失敗する原因です");
      } else {
        console.log("✅ merged-preset-HEAD.mdに内容があります");
        
        // @import行を確認
        const importLines = content.split('\n').filter(line => line.startsWith('@'));
        console.log("🔍 @import行の数:", importLines.length);
        importLines.forEach((line, i) => {
          console.log(`🔍 import[${i}]:`, line);
        });
      }
    }

    // プリセットファイルがコピーされているか確認
    const presetDir = path.join(ctx.homeDir, ".ccmm", "presets");
    console.log("🔍 プリセットディレクトリ:", presetDir);
    
    try {
      const fs = require("node:fs/promises");
      const presetsExists = await fileExists(presetDir);
      console.log("🔍 プリセットディレクトリ存在:", presetsExists);
      
      if (presetsExists) {
        const presetContents = await fs.readdir(presetDir, { recursive: true });
        console.log("🔍 プリセットディレクトリ内容:", presetContents);
      }
    } catch (error) {
      console.log("🔍 プリセットディレクトリ読み取りエラー:", error);
    }

    // CLAUDE.mdの内容も確認
    const claudeMdContent = await readFile(path.join(ctx.projectDir, "CLAUDE.md"));
    console.log("🔍 CLAUDE.md内容:");
    console.log("'" + claudeMdContent + "'");
  });
});