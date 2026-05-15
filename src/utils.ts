import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * Get the absolute path of the project root (where .pwm/ lives).
 * Walks up from cwd until a .git directory is found.
 */
export function getProjectRoot(): string | null {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/** Require being inside a git repo, exit with error if not. */
export function requireGitRepo(): string {
  const root = getProjectRoot();
  if (!root) {
    console.error("Error: not inside a git repository.");
    process.exit(1);
  }
  return root;
}

/** Check if tmux is available on the system. */
export function isTmuxInstalled(): boolean {
  try {
    execSync("which tmux", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Generate a short hash from the project root path for tmux session naming. */
export function sessionHash(projectRoot: string): string {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 8);
}

/** Build the tmux session name for this project. */
export function getSessionName(projectRoot: string): string {
  return `pwm-${sessionHash(projectRoot)}`;
}
