import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import { requireGitRepo } from "../utils.js";
import { readState, writeState, pwmDir } from "../state.js";
import { createWorktree, isValidBranchName, branchExists } from "../worktree/index.js";

export function registerCreateCommand(program: Command): void {
  program
    .command("create <name>")
    .description("Create a git worktree at .pwm/<name>/ on a new branch")
    .action((name: string) => {
      const projectRoot = requireGitRepo();

      // Validate .pwm/ exists
      if (!fs.existsSync(pwmDir(projectRoot))) {
        console.error("Error: .pwm/ directory not found. Run 'pwm init' first.");
        process.exit(1);
      }

      // Validate name
      if (!isValidBranchName(name)) {
        console.error(`Error: "${name}" is not a valid git branch name.`);
        process.exit(1);
      }

      // Check name doesn't already exist
      if (branchExists(name)) {
        console.error(`Error: branch "${name}" already exists.`);
        process.exit(1);
      }

      const state = readState(projectRoot);
      if (state.worktrees[name]) {
        console.error(`Error: worktree "${name}" already exists in pwm state.`);
        process.exit(1);
      }

      // Create worktree
      const worktreePath = path.join(pwmDir(projectRoot), name);
      try {
        createWorktree(worktreePath, name);
      } catch (err) {
        console.error(`Error creating worktree: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }

      // Update state
      state.worktrees[name] = {
        branch: name,
        path: `.pwm/${name}`,
        agent: null,
      };
      writeState(projectRoot, state);

      console.log(`Created worktree "${name}" at ${worktreePath}`);
    });
}
