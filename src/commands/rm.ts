import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { Command } from "commander";
import { requireGitRepo, getSessionName } from "../utils.js";
import { readState, writeState, pwmDir } from "../state.js";
import { removeWorktree } from "../worktree/index.js";
import { hasSession, hasWindow, killWindow } from "../tmux/index.js";

export function registerRmCommand(program: Command): void {
  program
    .command("rm <name>")
    .description("Remove a git worktree and its associated tmux window")
    .action((name: string) => {
      const projectRoot = requireGitRepo();

      // Validate .pwm/ exists
      if (!fs.existsSync(pwmDir(projectRoot))) {
        console.error("Error: .pwm/ directory not found. Run 'pwm init' first.");
        process.exit(1);
      }

      const state = readState(projectRoot);
      const entry = state.worktrees[name];
      if (!entry) {
        console.error(`Error: worktree "${name}" not found in pwm state.`);
        process.exit(1);
      }

      const worktreePath = path.resolve(projectRoot, entry.path);

      // Kill tmux window if session and window exist
      const sessionName = getSessionName(projectRoot);
      if (hasSession(sessionName) && hasWindow(sessionName, name)) {
        killWindow(`${sessionName}:${name}`);
      }

      // Remove git worktree
      if (fs.existsSync(worktreePath)) {
        try {
          removeWorktree(worktreePath);
        } catch (err) {
          console.error(`Error removing worktree: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }
      }

      // Delete branch
      try {
        execSync(`git branch -D "${name}"`, { stdio: "inherit" });
      } catch {
        // Branch may already be gone — non-fatal
      }

      // Remove from state
      delete state.worktrees[name];
      writeState(projectRoot, state);

      console.log(`Removed worktree "${name}"`);
    });
}
