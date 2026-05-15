import path from "node:path";
import { execSync } from "node:child_process";
import { readConfig } from "../config.js";
import { readState, updateWorktree, type AgentInfo } from "../state.js";
import * as tmux from "../tmux/index.js";
import { getSessionName } from "../utils.js";

interface SpawnOptions {
  projectRoot: string;
  name: string;
  prompt?: string;
  attach?: boolean;
}

export function spawnAgent({ projectRoot, name, prompt, attach }: SpawnOptions): void {
  const config = readConfig(projectRoot);
  const sessionName = getSessionName(projectRoot);

  // Ensure tmux session exists
  if (!tmux.hasSession(sessionName)) {
    tmux.createSession(sessionName, projectRoot);
  }

  // Check if window already exists for this worktree
  if (tmux.hasWindow(sessionName, name)) {
    console.error(`Error: tmux window "${name}" already exists in session "${sessionName}".`);
    process.exit(1);
  }

  // Get absolute path to worktree
  const state = readState(projectRoot);
  const worktreeEntry = state.worktrees[name];
  if (!worktreeEntry) {
    console.error(`Error: worktree "${name}" not found in state.`);
    process.exit(1);
  }
  const worktreeAbsPath = path.resolve(projectRoot, worktreeEntry.path);

  // Determine mode
  const mode: "print" | "interactive" = prompt ? "print" : "interactive";

  // Create tmux window for this worktree
  tmux.newWindow(sessionName, name, worktreeAbsPath);

  const target = `${sessionName}:${name}`;

  // Launch claude interactively (full TUI experience)
  // Pass the prompt as a positional argument so Claude submits it automatically,
  // rather than trying to type it via tmux send-keys (which has timing/encoding issues).
  const claudeCmd = prompt
    ? `claude "${prompt.replace(/"/g, '\\"')}"`
    : "claude";
  tmux.sendKeys(target, claudeCmd);

  // Update state with agent info
  const agentInfo: AgentInfo = {
    pid: null,
    claudeSessionId: null,
    mode,
    spawnedAt: new Date().toISOString(),
    status: "running",
  };

  updateWorktree(projectRoot, name, (entry) => ({
    ...entry,
    agent: agentInfo,
  }));

  console.log(`Agent spawned in tmux window "${name}".`);
  console.log(`  Session: ${sessionName}`);
  console.log(`  Window:  ${name}`);
  console.log(`  Mode:    ${mode}`);
  console.log(`  Attach:  tmux attach -t ${target}`);

  // Optionally attach to the spawned window
  if (attach) {
    if (process.env.TMUX) {
      execSync(`tmux switch-client -t "${target}"`, { stdio: "inherit" });
    } else {
      execSync(`tmux attach-session -t "${target}"`, { stdio: "inherit" });
    }
  }
}
