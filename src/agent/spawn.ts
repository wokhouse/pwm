import path from "node:path";
import { readConfig } from "../config.js";
import { readState, updateWorktree, type AgentInfo } from "../state.js";
import * as tmux from "../tmux/index.js";
import { getSessionName } from "../utils.js";

interface SpawnOptions {
  projectRoot: string;
  name: string;
  prompt?: string;
}

export function spawnAgent({ projectRoot, name, prompt }: SpawnOptions): void {
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

  // Build the command
  let command: string;
  const jsonlPath = path.join(worktreeAbsPath, ".claude-output.jsonl");

  if (mode === "print") {
    // Non-interactive: use -p flag with prompt, tee to jsonl
    const escapedPrompt = prompt!.replace(/"/g, '\\"').replace(/\$/g, "\\$");
    command = `${config.agentCommand} "${escapedPrompt}" 2>&1 | tee "${jsonlPath}"`;
  } else {
    // Interactive: just launch claude with stream-json output
    command = `claude --output-format stream-json 2>&1 | tee "${jsonlPath}"`;
  }

  // Send command to the tmux window
  const target = `${sessionName}:${name}`;
  tmux.sendKeys(target, command);

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
}
