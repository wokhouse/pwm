import { readState } from "../state.js";
import { computeStatus, type WorktreeStatus } from "./status.js";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function statusColor(status: string): string {
  switch (status) {
    case "running":
      return GREEN;
    case "waiting":
      return CYAN;
    case "done":
      return YELLOW;
    case "failed":
      return RED;
    default:
      return DIM;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function padEnd(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const padding = Math.max(0, len - visible.length);
  return str + " ".repeat(padding);
}

export function renderDashboard(projectRoot: string, sessionName: string): string {
  const state = readState(projectRoot);
  const names = Object.keys(state.worktrees);
  const now = new Date().toLocaleTimeString("en-US", { hour12: false });

  const lines: string[] = [];

  // Header
  const header = " pwm dashboard";
  const timeStr = `${now}`;
  const headerPadding = Math.max(0, 80 - header.length - timeStr.length - 1);
  lines.push(`\x1b[1m${header}${" ".repeat(headerPadding)}${timeStr}\x1b[0m`);
  lines.push(" " + "─".repeat(79));

  // Rows
  const statuses: WorktreeStatus[] = [];
  for (const name of names) {
    statuses.push(computeStatus(projectRoot, name, state.worktrees[name], sessionName));
  }

  if (statuses.length === 0) {
    lines.push(" No worktrees. Use 'pwm create <name>' to create one.");
  } else {
    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      const num = `${BOLD}${String(i + 1).padStart(2)}${RESET}  `;
      const nameCol = truncate(s.name, 16).padEnd(16);
      const statusText = s.agentStatus;
      const statusCol = `${statusColor(statusText)}${statusText.padEnd(10)}${RESET}  `;
      const actionCol = truncate(s.lastAction, 30);
      lines.push(` ${num}${nameCol}  ${statusCol}${actionCol}`);
    }
  }

  lines.push(" " + "─".repeat(79));
  lines.push(" Type number to attach, q to quit, r to refresh");
  lines.push("> ");

  return lines.join("\n");
}
