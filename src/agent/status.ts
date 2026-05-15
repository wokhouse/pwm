import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseJsonl, type ParsedSummary } from "./parser.js";
import type { WorktreeEntry, AgentInfo } from "../state.js";

export interface WorktreeStatus {
  name: string;
  branch: string;
  agentStatus: AgentInfo["status"] | "none";
  lastAction: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

/**
 * Estimate cost based on token usage.
 * Rough Claude pricing: $3/M input, $15/M output (Sonnet rates).
 */
function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  return Math.round((inputCost + outputCost) * 100) / 100;
}

/** Format token count for display (e.g., 45000 -> "45k"). */
function formatTokens(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Get the parsed summary from a worktree's jsonl output file. */
export function getWorktreeSummary(
  projectRoot: string,
  worktree: WorktreeEntry,
): ParsedSummary | null {
  const jsonlPath = path.join(projectRoot, worktree.path, ".claude-output.jsonl");
  if (!fs.existsSync(jsonlPath)) return null;

  try {
    // Read last 100KB to avoid loading huge files
    const stat = fs.statSync(jsonlPath);
    const readSize = Math.min(stat.size, 100_000);
    const fd = fs.openSync(jsonlPath, "r");
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);

    const content = buf.toString("utf-8");
    return parseJsonl(content);
  } catch {
    return null;
  }
}

/** Check if a tmux window still has a running process. */
export function isTmuxWindowAlive(sessionName: string, windowName: string): boolean {
  try {
    // Check if the window exists and has an active process
    const result = execSync(
      `tmux list-panes -t "${sessionName}:${windowName}" -F "#{pane_dead}" 2>/dev/null`,
      { encoding: "utf-8" },
    );
    // If pane_dead is 0, the pane is alive (process running)
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
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };

  if (!worktree.agent) return status;

  const summary = getWorktreeSummary(projectRoot, worktree);

  if (summary) {
    status.lastAction = summary.lastAction;
    status.inputTokens = summary.totalUsage.inputTokens;
    status.outputTokens = summary.totalUsage.outputTokens;
    status.estimatedCost = estimateCost(
      summary.totalUsage.inputTokens,
      summary.totalUsage.outputTokens,
    );
  }

  // Determine status
  if (summary?.finished) {
    status.agentStatus = summary.lastAction === "failed" ? "failed" : "done";
  } else if (worktree.agent.status === "running") {
    // Check if the tmux window is still alive
    const alive = isTmuxWindowAlive(sessionName, name);
    if (alive) {
      status.agentStatus = "running";
    } else if (summary && summary.eventCount > 0) {
      // Window gone but we have events — likely finished
      status.agentStatus = "done";
    } else {
      status.agentStatus = "idle";
    }
  } else {
    status.agentStatus = worktree.agent.status;
  }

  return status;
}

/** Format a status table row for display. */
export function formatStatusRow(s: WorktreeStatus): string {
  const tokens = s.inputTokens + s.outputTokens;
  const tokenStr = tokens > 0 ? formatTokens(tokens) : "0";
  const costStr = s.estimatedCost > 0 ? `$${s.estimatedCost.toFixed(2)}` : "$0.00";

  const name = s.name.padEnd(16);
  const branch = s.branch.padEnd(16);
  const status = s.agentStatus.padEnd(14);
  const action = s.lastAction.padEnd(20);
  const tok = tokenStr.padEnd(10);
  const cost = costStr.padEnd(8);

  return `${name}${branch}${status}${action}${tok}${cost}`;
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
    "LAST ACTION".padEnd(20) +
    "TOKENS".padEnd(10) +
    "COST".padEnd(8);

  console.log(header);
  console.log("─".repeat(header.length));
  for (const s of statuses) {
    console.log(formatStatusRow(s));
  }
}
