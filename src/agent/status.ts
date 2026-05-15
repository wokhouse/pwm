import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseSessionJsonl, type ParsedSummary } from "./parser.js";
import type { WorktreeEntry, AgentInfo } from "../state.js";

export interface WorktreeStatus {
  name: string;
  branch: string;
  agentStatus: AgentInfo["status"] | "none" | "waiting";
  lastAction: string;
}

/**
 * Encode an absolute path the way Claude Code does for its project directories.
 * Both / and . are replaced with -.
 */
function encodeProjectPath(absPath: string): string {
  return absPath.replace(/[/\\.]/g, "-");
}

/**
 * Find the latest session JSONL file for a worktree path.
 * Claude Code stores sessions at ~/.claude/projects/<encoded-path>/*.jsonl
 */
function findLatestSession(worktreeAbsPath: string): string | null {
  const encoded = encodeProjectPath(worktreeAbsPath);
  const projectDir = path.join(os.homedir(), ".claude", "projects", encoded);

  if (!fs.existsSync(projectDir)) return null;

  try {
    const files = fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({
        name: f,
        path: path.join(projectDir, f),
        mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

/** Read the tail of a session JSONL file and parse it. */
function getSessionSummary(worktreeAbsPath: string): ParsedSummary | null {
  const sessionFile = findLatestSession(worktreeAbsPath);
  if (!sessionFile) return null;

  try {
    const stat = fs.statSync(sessionFile);
    if (stat.size === 0) return null;

    // Read last 200KB to get recent events
    const readSize = Math.min(stat.size, 200_000);
    const fd = fs.openSync(sessionFile, "r");
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);

    const content = buf.toString("utf-8");
    return parseSessionJsonl(content);
  } catch {
    return null;
  }
}

/** Check if a tmux window still has a running process. */
function isTmuxWindowAlive(sessionName: string, windowName: string): boolean {
  try {
    const result = execSync(
      `tmux list-panes -t "${sessionName}:${windowName}" -F "#{pane_dead}" 2>/dev/null`,
      { encoding: "utf-8" },
    );
    return result.trim().split("\n").every((line) => line.trim() === "0");
  } catch {
    return false;
  }
}

/** Compute the full status for a worktree. */
export function computeStatus(
  projectRoot: string,
  name: string,
  worktree: WorktreeEntry,
  sessionName: string,
): WorktreeStatus {
  const status: WorktreeStatus = {
    name,
    branch: worktree.branch,
    agentStatus: "none",
    lastAction: "—",
  };

  if (!worktree.agent) return status;

  const worktreeAbsPath = path.resolve(projectRoot, worktree.path);
  const summary = getSessionSummary(worktreeAbsPath);

  if (summary?.latestEvent?.action) {
    status.lastAction = summary.lastAction;
  }

  // Determine agent status
  if (worktree.agent.status === "running") {
    const alive = isTmuxWindowAlive(sessionName, name);
    if (alive) {
      if (summary?.finished) {
        status.agentStatus = "waiting";
      } else {
        status.agentStatus = "running";
      }
    } else if (summary && summary.eventCount > 0) {
      status.agentStatus = "done";
    } else {
      status.agentStatus = "idle";
    }
  } else {
    status.agentStatus = worktree.agent.status;
  }

  return status;
}

/** Print the full status table. */
export function printStatusTable(statuses: WorktreeStatus[]): void {
  if (statuses.length === 0) {
    console.log("No worktrees. Use 'pwm create <name>' to create one.");
    return;
  }

  const header =
    "NAME".padEnd(16) +
    "BRANCH".padEnd(16) +
    "STATUS".padEnd(14) +
    "LAST ACTION".padEnd(20);

  console.log(header);
  console.log("─".repeat(header.length));
  for (const s of statuses) {
    const name = s.name.padEnd(16);
    const branch = s.branch.padEnd(16);
    const st = s.agentStatus.padEnd(14);
    const action = s.lastAction.padEnd(20);
    console.log(`${name}${branch}${st}${action}`);
  }
}
