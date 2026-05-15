import { execSync } from "node:child_process";
import fs from "node:fs";
import { Command } from "commander";
import { requireGitRepo, isTmuxInstalled, getSessionName } from "../utils.js";
import { pwmDir, readState } from "../state.js";
import { hasSession, hasWindow } from "../tmux/index.js";

export function registerAttachCommand(program: Command): void {
  program
    .command("attach [name]")
    .description("Attach to a worktree's tmux window")
    .action((name?: string) => {
      const projectRoot = requireGitRepo();

      // Validate .pwm/ exists
      if (!fs.existsSync(pwmDir(projectRoot))) {
        console.error("Error: .pwm/ directory not found. Run 'pwm init' first.");
        process.exit(1);
      }

      // Check tmux is installed
      if (!isTmuxInstalled()) {
        console.error("Error: tmux is not installed. Install it first: brew install tmux");
        process.exit(1);
      }

      // Resolve target name
      let target = name;
      if (!target) {
        try {
          target = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
        } catch {
          console.error("Error: could not determine current branch.");
          process.exit(1);
        }
      }

      // Look up worktree in state
      const state = readState(projectRoot);
      let entry = state.worktrees[target];

      // If no direct match, try searching by branch field
      if (!entry) {
        for (const [key, val] of Object.entries(state.worktrees)) {
          if (val.branch === target) {
            entry = val;
            target = key;
            break;
          }
        }
      }

      if (!entry) {
        const names = Object.keys(state.worktrees);
        if (names.length > 0) {
          console.error(`Error: worktree "${target}" not found.`);
          console.error(`Available worktrees: ${names.join(", ")}`);
        } else {
          console.error(`Error: no worktrees found. Run 'pwm create <name>' first.`);
        }
        process.exit(1);
      }

      // Verify tmux session and window exist
      const session = getSessionName(projectRoot);
      if (!hasSession(session)) {
        console.error(`Error: tmux session "${session}" not found. Run 'pwm spawn ${target}' first.`);
        process.exit(1);
      }

      if (!hasWindow(session, target)) {
        console.error(`Error: tmux window "${target}" not found. Run 'pwm spawn ${target}' first.`);
        process.exit(1);
      }

      // Attach
      const windowTarget = `${session}:${target}`;
      if (process.env.TMUX) {
        execSync(`tmux switch-client -t "${windowTarget}"`, { stdio: "inherit" });
      } else {
        execSync(`tmux attach-session -t "${windowTarget}"`, { stdio: "inherit" });
      }
    });
}
