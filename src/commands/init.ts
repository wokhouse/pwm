import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { defaultConfig, writeConfig } from "../config.js";
import { emptyState, writeState, pwmDir } from "../state.js";
import { requireGitRepo } from "../utils.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize .pwm/ directory with config and state files")
    .action(() => {
      const projectRoot = requireGitRepo();
      const pwmPath = pwmDir(projectRoot);

      // Check if already initialized
      if (fs.existsSync(pwmPath)) {
        console.error("Error: .pwm/ directory already exists. Remove it first to re-initialize.");
        process.exit(1);
      }

      // Create .pwm/ directory
      fs.mkdirSync(pwmPath, { recursive: true });

      // Write config
      const projectName = path.basename(projectRoot);
      writeConfig(projectRoot, defaultConfig(projectName));

      // Write state
      writeState(projectRoot, emptyState());

      // Add .pwm/ to .gitignore if not already present
      const gitignorePath = path.join(projectRoot, ".gitignore");
      let gitignoreContent = "";
      if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      }
      if (!gitignoreContent.includes(".pwm")) {
        const addition = (gitignoreContent.length > 0 ? "\n" : "") + ".pwm/\n";
        fs.appendFileSync(gitignorePath, addition);
      }

      console.log(`Initialized pwm in ${projectRoot}`);
      console.log(`  Created: ${pwmPath}/config.json`);
      console.log(`  Created: ${pwmPath}/state.json`);
    });
}
