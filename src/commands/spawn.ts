import fs from "node:fs";
import { Command } from "commander";
import { requireGitRepo, isTmuxInstalled } from "../utils.js";
import { pwmDir } from "../state.js";
import { spawnAgent } from "../agent/spawn.js";

export function registerSpawnCommand(program: Command): void {
  program
    .command("spawn <name> [prompt]")
    .description("Launch claude agent in a tmux pane for the given worktree")
    .action((name: string, prompt?: string) => {
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

      spawnAgent({ projectRoot, name, prompt });
    });
}
