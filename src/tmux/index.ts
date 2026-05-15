import { execSync } from "node:child_process";

function tmux(args: string): string {
  return execSync(`tmux ${args}`, { encoding: "utf-8" });
}

/** Check if a tmux session with the given name exists. */
export function hasSession(name: string): boolean {
  try {
    execSync(`tmux has-session -t "${name}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Create a new detached tmux session. */
export function createSession(name: string, cwd: string): void {
  tmux(`new-session -d -s "${name}" -c "${cwd}"`);
}

/** Create a new window in an existing session. */
export function newWindow(session: string, name: string, cwd: string): void {
  tmux(`new-window -t "${session}" -n "${name}" -c "${cwd}"`);
}

/** Send keystrokes to a tmux target (window/pane). */
export function sendKeys(target: string, command: string): void {
  // Use double quotes around command and escape internal double quotes
  const escaped = command.replace(/"/g, '\\"');
  tmux(`send-keys -t "${target}" "${escaped}" Enter`);
}

/** List window names in a session. */
export function listWindows(session: string): string[] {
  try {
    const output = tmux(`list-windows -t "${session}" -F "#{window_name}"`);
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Kill a specific window in a session. */
export function killWindow(target: string): void {
  tmux(`kill-window -t "${target}"`);
}

/** Check if a specific window exists in a session. */
export function hasWindow(session: string, windowName: string): boolean {
  return listWindows(session).includes(windowName);
}
