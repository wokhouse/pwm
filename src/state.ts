import fs from "node:fs";
import path from "node:path";

export interface AgentInfo {
  pid: number | null;
  claudeSessionId: string | null;
  mode: "print" | "interactive";
  spawnedAt: string;
  status: "running" | "done" | "failed" | "idle";
}

export interface WorktreeEntry {
  branch: string;
  path: string;
  agent: AgentInfo | null;
}

export interface State {
  worktrees: Record<string, WorktreeEntry>;
}

export function statePath(projectRoot: string): string {
  return path.join(projectRoot, ".pwm", "state.json");
}

export function pwmDir(projectRoot: string): string {
  return path.join(projectRoot, ".pwm");
}

export function readState(projectRoot: string): State {
  const raw = fs.readFileSync(statePath(projectRoot), "utf-8");
  return JSON.parse(raw);
}

export function writeState(projectRoot: string, state: State): void {
  fs.writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2) + "\n");
}

export function emptyState(): State {
  return { worktrees: {} };
}

/** Update a single worktree entry in state and write back. */
export function updateWorktree(
  projectRoot: string,
  name: string,
  updater: (entry: WorktreeEntry) => WorktreeEntry,
): void {
  const state = readState(projectRoot);
  if (!state.worktrees[name]) {
    throw new Error(`Worktree "${name}" not found in state`);
  }
  state.worktrees[name] = updater(state.worktrees[name]);
  writeState(projectRoot, state);
}
