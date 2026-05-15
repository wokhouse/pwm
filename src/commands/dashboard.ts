import { execSync } from "node:child_process";
import fs from "node:fs";
import { Command } from "commander";
import { requireGitRepo, isTmuxInstalled, getSessionName } from "../utils.js";
import { pwmDir, readState } from "../state.js";
import { readConfig } from "../config.js";
import {
  hasSession,
  createSession,
  newWindow,
  hasWindow,
  sendKeys,
  switchClient,
} from "../tmux/index.js";
import { renderDashboard } from "../agent/sidebar.js";

const DASHBOARD_WINDOW = "pwm-dashboard";

export function registerDashboardCommand(program: Command): void {
  // Public command: pwm dashboard
  program
    .command("dashboard")
    .description("Open an interactive dashboard for worktree navigation")
    .action(() => {
      const projectRoot = requireGitRepo();

      if (!fs.existsSync(pwmDir(projectRoot))) {
        console.error("Error: .pwm/ directory not found. Run 'pwm init' first.");
        process.exit(1);
      }

      if (!isTmuxInstalled()) {
        console.error("Error: tmux is not installed. Install it first: brew install tmux");
        process.exit(1);
      }

      const sessionName = getSessionName(projectRoot);

      // Create session if it doesn't exist
      if (!hasSession(sessionName)) {
        createSession(sessionName, projectRoot);
      }

      // If dashboard window already exists, just switch to it
      if (hasWindow(sessionName, DASHBOARD_WINDOW)) {
        if (process.env.TMUX) {
          switchClient(`${sessionName}:${DASHBOARD_WINDOW}`);
        } else {
          execSync(`tmux attach-session -t "${sessionName}:${DASHBOARD_WINDOW}"`, {
            stdio: "inherit",
          });
        }
        return;
      }

      // Create the dashboard window and launch the loop
      newWindow(sessionName, DASHBOARD_WINDOW, projectRoot);
      sendKeys(
        `${sessionName}:${DASHBOARD_WINDOW}`,
        `pwm _dashboard_loop --project "${projectRoot}"`,
      );

      // Switch to the new window
      if (process.env.TMUX) {
        switchClient(`${sessionName}:${DASHBOARD_WINDOW}`);
      } else {
        execSync(`tmux attach-session -t "${sessionName}:${DASHBOARD_WINDOW}"`, {
          stdio: "inherit",
        });
      }
    });

  // Hidden internal command: pwm _dashboard_loop
  program
    .command("_dashboard_loop", { hidden: true })
    .description("Internal: runs the dashboard interactive loop")
    .option("--project <path>", "project root path")
    .action((opts: { project?: string }) => {
      if (!opts.project) {
        console.error("Error: --project is required");
        process.exit(1);
      }

      const projectRoot = opts.project;
      const sessionName = getSessionName(projectRoot);

      let refreshInterval = 5000;
      try {
        const config = readConfig(projectRoot);
        refreshInterval = config.dashboardRefreshInterval ?? 5000;
      } catch {
        // Use default
      }

      // Render immediately
      render();

      // Auto-refresh
      const timer = setInterval(render, refreshInterval);

      // Handle single keypress input
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.setEncoding("utf-8");

      const state = readState(projectRoot);
      const names = Object.keys(state.worktrees);

      process.stdin.on("data", (key: string) => {
        // q or Ctrl-C: quit
        if (key === "q" || key === "\x03") {
          cleanup();
          return;
        }

        // r: force refresh
        if (key === "r") {
          render();
          return;
        }

        // Number input: switch to that worktree's window
        const num = parseInt(key, 10);
        if (!isNaN(num) && num >= 1 && num <= names.length) {
          const target = names[num - 1];
          try {
            switchClient(`${sessionName}:${target}`);
          } catch {
            // Window may not exist
          }
        }
      });

      function render(): void {
        try {
          const output = renderDashboard(projectRoot, sessionName);
          process.stdout.write("\x1b[2J\x1b[H" + output);
        } catch {
          // State might be temporarily unavailable
        }
      }

      function cleanup(): void {
        clearInterval(timer);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(0);
      }

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    });
}
