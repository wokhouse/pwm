import fs from "node:fs";
import { Command } from "commander";
import { requireGitRepo, getSessionName } from "../utils.js";
import { readState, pwmDir } from "../state.js";
import { computeStatus, printStatusTable } from "../agent/status.js";

export function registerLsCommand(program: Command): void {
  program
    .command("ls")
    .description("Show a table of worktrees with branch, agent status, and cost")
    .action(() => {
      const projectRoot = requireGitRepo();

      // Validate .pwm/ exists
      if (!fs.existsSync(pwmDir(projectRoot))) {
        console.error("Error: .pwm/ directory not found. Run 'pwm init' first.");
        process.exit(1);
      }

      const state = readState(projectRoot);
      const sessionName = getSessionName(projectRoot);

      const statuses = Object.entries(state.worktrees).map(([name, worktree]) =>
        computeStatus(projectRoot, name, worktree, sessionName),
      );

      printStatusTable(statuses);
    });
}
