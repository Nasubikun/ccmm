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
      defaultPresetRepositories: [`file://${ctx.presetDir}`],
      defaultPresets: ["react.md", "typescript.md"]
    };
    await require("node:fs/promises").writeFile(configPath, JSON.stringify(config, null, 2));

    console.log("🔍 Config設定:");
    console.log("- defaultPresetRepo:", config.defaultPresetRepositories);
    console.log("- defaultPresets:", config.defaultPresets);

    // プリセットディレクトリの内容を事前に確認
    try {
      const presetFiles = await require("node:fs/promises").readdir(ctx.presetDir);
      console.log("🔍 プリセットディレクトリのファイル:", presetFiles);
    } catch (error) {
      console.log("🔍 プリセットディレクトリ読み取りエラー:", error);
    }

    // scanPresetFilesの動作をテスト
    const { scanPresetFiles } = await import("../../src/git/repo-scan.js");
    const scanResult = await scanPresetFiles(`file://${ctx.presetDir}`);
    console.log("🔍 scanPresetFiles結果:", scanResult);

    // fetchPresetsの動作をテスト
    const { fetchPresets } = await import("../../src/cli/sync.js");
    const testPointers = [
      {
        host: 'localhost',
        owner: `file://${ctx.presetDir}`,
        repo: 'local',
        file: 'react.md',
        commit: 'HEAD'
      }
    ];
    console.log("🔍 テスト用プリセットポインタ:", testPointers);
    
    const testPresetDir = path.join(ctx.homeDir, ".ccmm", "presets");
    const fetchResult = await fetchPresets(testPointers, testPresetDir);
    console.log("🔍 fetchPresets結果:", fetchResult);

    // contractTildeの動作をテスト
    if (fetchResult.success && fetchResult.data.length > 0) {
      const { contractTilde } = await import("../../src/core/fs.js");
      const { homedir } = require("node:os");
      const { resolve } = require("node:path");
      
      const localPath = fetchResult.data[0].localPath;
      const contractedPath = contractTilde(localPath);
      
      console.log("🔍 contractTilde変換:");
      console.log("  入力:", localPath);
      console.log("  出力:", contractedPath);
      console.log("  ctx.homeDir:", ctx.homeDir);
      console.log("  process.env.HOME:", process.env.HOME);
      console.log("  os.homedir():", homedir());
      console.log("  resolve(ctx.homeDir):", resolve(ctx.homeDir));
      console.log("  resolve(localPath):", resolve(localPath));
      console.log("  localPathがhomeDirで始まる?:", localPath.startsWith(ctx.homeDir));
      console.log("  localPathがresolved homeDirで始まる?:", resolve(localPath).startsWith(resolve(ctx.homeDir)));
      
      // 手動でcontractTildeの処理をテスト
      const normalizedPath = resolve(localPath);
      const normalizedHome = resolve(ctx.homeDir);
      console.log("  normalizedPath:", normalizedPath);
      console.log("  normalizedHome:", normalizedHome);
      console.log("  normalizedPathがnormalizedHomeで始まる?:", normalizedPath.startsWith(normalizedHome));
      
      if (normalizedPath.startsWith(normalizedHome)) {
        const relativePath = normalizedPath.slice(normalizedHome.length);
        console.log("  relativePath:", relativePath);
        const expectedContracted = '~' + relativePath;
        console.log("  期待されるcontracted:", expectedContracted);
      }
    }

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
        
        // syncコマンドの実行でprocess.env.HOMEが正しく設定されているかを確認
        console.log("🔍 syncコマンド実行時の環境変数:");
        console.log("  syncコマンドに渡されたHOME:", ctx.homeDir);
        
        // generateMergedを手動で呼び出して、正しい環境変数で動作するかテスト
        const testPresets = fetchResult.success ? fetchResult.data : [];
        if (testPresets.length > 0) {
          // HOMEを一時的に変更
          const originalHome = process.env.HOME;
          process.env.HOME = ctx.homeDir;
          
          const { generateMerged } = await import("../../src/cli/sync.js");
          const testMergedPath = path.join(ctx.homeDir, "test-merged.md");
          const generateResult = await generateMerged(testPresets, testMergedPath, "HEAD");
          
          console.log("🔍 手動generateMerged結果:", generateResult);
          if (generateResult.success && await fileExists(testMergedPath)) {
            const testContent = await readFile(testMergedPath);
            console.log("🔍 手動生成されたmerged内容:", testContent);
          }
          
          // HOMEを元に戻す
          process.env.HOME = originalHome;
        }
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