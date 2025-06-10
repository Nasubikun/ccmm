/**
 * slug.ts の動作確認用テスト
 */
import { describe, it, expect } from "vitest";
import { makeSlug } from "./slug.js";

describe("makeSlug", () => {
  describe("URL形式のパース", () => {
    it("HTTPS URL (.git付き)", () => {
      const url = "https://github.com/myorg/myrepo.git";
      const slug = makeSlug(url);
      expect(slug).toBeDefined();
      expect(typeof slug).toBe("string");
      expect(slug.length).toBe(16);
    });

    it("HTTPS URL (.git無し)", () => {
      const url = "https://github.com/myorg/myrepo";
      const slug = makeSlug(url);
      expect(slug).toBeDefined();
      expect(typeof slug).toBe("string");
      expect(slug.length).toBe(16);
    });

    it("SSH URL", () => {
      const url = "git@github.com:myorg/myrepo.git";
      const slug = makeSlug(url);
      expect(slug).toBeDefined();
      expect(typeof slug).toBe("string");
      expect(slug.length).toBe(16);
    });

    it("SSH URL形式", () => {
      const url = "ssh://git@github.com/myorg/myrepo.git";
      const slug = makeSlug(url);
      expect(slug).toBeDefined();
      expect(typeof slug).toBe("string");
      expect(slug.length).toBe(16);
    });

    it("GitLab URL", () => {
      const url = "https://gitlab.com/company/project.git";
      const slug = makeSlug(url);
      expect(slug).toBeDefined();
      expect(typeof slug).toBe("string");
      expect(slug.length).toBe(16);
    });
  });

  describe("エラーハンドリング", () => {
    it("不正なURL形式でエラーを投げる", () => {
      expect(() => makeSlug("invalid-url")).toThrow("Unsupported Git URL format");
      expect(() => makeSlug("")).toThrow("Unsupported Git URL format");
      expect(() => makeSlug("not-a-git-url")).toThrow("Unsupported Git URL format");
    });
  });

  describe("冪等性と一意性", () => {
    it("同じURLから同じスラッグが生成される", () => {
      const url = "https://github.com/myorg/myrepo.git";
      const slug1 = makeSlug(url);
      const slug2 = makeSlug(url);
      expect(slug1).toBe(slug2);
    });

    it("異なるURLから異なるスラッグが生成される", () => {
      const url1 = "https://github.com/myorg/repo1.git";
      const url2 = "https://github.com/myorg/repo2.git";
      const slug1 = makeSlug(url1);
      const slug2 = makeSlug(url2);
      expect(slug1).not.toBe(slug2);
    });

    it("同じrepoでもオーナーが違えば異なるスラッグ", () => {
      const url1 = "https://github.com/owner1/repo.git";
      const url2 = "https://github.com/owner2/repo.git";
      const slug1 = makeSlug(url1);
      const slug2 = makeSlug(url2);
      expect(slug1).not.toBe(slug2);
    });

    it("同じrepoでもホストが違えば異なるスラッグ", () => {
      const url1 = "https://github.com/owner/repo.git";
      const url2 = "https://gitlab.com/owner/repo.git";
      const slug1 = makeSlug(url1);
      const slug2 = makeSlug(url2);
      expect(slug1).not.toBe(slug2);
    });
  });

  describe("URL正規化の確認", () => {
    it(".git有無で同じスラッグが生成される", () => {
      const url1 = "https://github.com/myorg/myrepo.git";
      const url2 = "https://github.com/myorg/myrepo";
      const slug1 = makeSlug(url1);
      const slug2 = makeSlug(url2);
      expect(slug1).toBe(slug2);
    });

    it("前後の空白は無視される", () => {
      const url1 = "https://github.com/myorg/myrepo.git";
      const url2 = "  https://github.com/myorg/myrepo.git  ";
      const slug1 = makeSlug(url1);
      const slug2 = makeSlug(url2);
      expect(slug1).toBe(slug2);
    });
  });
});