/**
 * Git origin URLからプロジェクト識別用のスラッグを生成する
 */
import { createHash } from "node:crypto";

/**
 * Git URLから host, owner, repo を抽出する
 */
function parseGitUrl(originUrl: string): { host: string; owner: string; repo: string } {
  // URLを正規化（末尾の.gitを除去、スペースをトリム）
  const normalizedUrl = originUrl.trim().replace(/\.git$/, "");
  
  // file://形式: file:///path/to/repo
  if (normalizedUrl.startsWith("file://")) {
    // file://形式の場合はローカルファイルシステムなので、特別な処理
    const path = normalizedUrl.replace("file://", "");
    const pathParts = path.split("/").filter(p => p);
    const repoName = pathParts[pathParts.length - 1] || "local-repo";
    
    return {
      host: "localhost",
      owner: "local",
      repo: repoName,
    };
  }
  
  // HTTPS形式: https://github.com/owner/repo
  const httpsMatch = normalizedUrl.match(/^https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)$/);
  if (httpsMatch) {
    return {
      host: httpsMatch[1]!,
      owner: httpsMatch[2]!,
      repo: httpsMatch[3]!,
    };
  }
  
  // SSH形式: git@github.com:owner/repo
  const sshMatch = normalizedUrl.match(/^git@([^:]+):([^\/]+)\/([^\/]+)$/);
  if (sshMatch) {
    return {
      host: sshMatch[1]!,
      owner: sshMatch[2]!,
      repo: sshMatch[3]!,
    };
  }
  
  // SSH URL形式: ssh://git@github.com/owner/repo
  const sshUrlMatch = normalizedUrl.match(/^ssh:\/\/git@([^\/]+)\/([^\/]+)\/([^\/]+)$/);
  if (sshUrlMatch) {
    return {
      host: sshUrlMatch[1]!,
      owner: sshUrlMatch[2]!,
      repo: sshUrlMatch[3]!,
    };
  }
  
  throw new Error(`Unsupported Git URL format: ${originUrl}`);
}

/**
 * 文字列のSHA-256ハッシュを計算する（最初の16文字を返す）
 */
function sha256Short(input: string): string {
  return createHash("sha256").update(input).digest("hex").substring(0, 16);
}

/**
 * Git origin URLからプロジェクト用のスラッグを生成する
 * 
 * @param originUrl - Git origin URL (例: https://github.com/myorg/myrepo.git)
 * @returns プロジェクト識別用のスラッグ
 * 
 * @example
 * makeSlug("https://github.com/myorg/myrepo.git")
 * // => "a1b2c3d4e5f6g7h8" (実際のハッシュ値)
 */
export function makeSlug(originUrl: string): string {
  // URLをパースして構成要素を取得
  const { host, owner, repo } = parseGitUrl(originUrl);
  
  // 正規化されたURLを再構築してハッシュ化（originSHA）
  const normalizedUrl = `https://${host}/${owner}/${repo}`;
  const originSha = sha256Short(normalizedUrl);
  
  // requirements.mdの仕様: host__owner__repo-git-<originSHA>
  const slugSource = `${host}__${owner}__${repo}-git-${originSha}`;
  
  // 最終的なスラッグとして、この文字列をさらにハッシュ化
  // （ディレクトリ名として使いやすい長さにするため）
  return sha256Short(slugSource);
}

/**
 * ファイルパスからプロジェクト用のスラッグを生成する
 * Gitリポジトリでないプロジェクトで使用
 * 
 * @param projectPath - プロジェクトのパス
 * @returns プロジェクト識別用のスラッグ
 * 
 * @example
 * makeSlugFromPath("/home/user/my-project")
 * // => "a1b2c3d4e5f6g7h8" (実際のハッシュ値)
 */
export function makeSlugFromPath(projectPath: string): string {
  // パスを正規化（末尾のスラッシュを除去）
  const normalizedPath = projectPath.replace(/\/$/, "");
  
  // パスベースのスラッグソースを生成
  const slugSource = `local__${normalizedPath}`;
  
  // ハッシュ化して返す
  return sha256Short(slugSource);
}