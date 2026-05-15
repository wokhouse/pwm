import { execSync } from "node:child_process";

export async function isGitRepo(): Promise<boolean> {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Create a git worktree at the given path on a new branch. */
export function createWorktree(worktreePath: string, branch: string): void {
  execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
    stdio: "inherit",
  });
}

/** Remove a git worktree at the given path. */
export function removeWorktree(worktreePath: string): void {
  execSync(`git worktree remove "${worktreePath}"`, { stdio: "inherit" });
}

/** List all worktrees as parsed porcelain entries. */
export function listWorktrees(): string[] {
  const output = execSync("git worktree list --porcelain", {
    encoding: "utf-8",
  });
  return output
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const line = block.split("\n").find((l) => l.startsWith("worktree "));
      return line ? line.replace("worktree ", "") : "";
    })
    .filter(Boolean);
}

/** Basic validation for a git branch name. */
export function isValidBranchName(name: string): boolean {
  // Reject empty, dots, path traversal, and git-reserved names
  if (!name || name === "." || name === "..") return false;
  if (name.includes("..") || name.includes("//")) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  if (name.endsWith(".lock") || name.endsWith(".")) return false;
  if (/[ ~^:?*\[\\]/.test(name)) return false;
  if (name.includes("@{")) return false;
  // Must not be a git ref
  if (/^(heads|tags|remotes)\//.test(name)) return false;
  return true;
}

/** Check if a branch already exists. */
export function branchExists(branch: string): boolean {
  try {
    execSync(`git rev-parse --verify "${branch}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
