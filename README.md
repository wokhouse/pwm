# pwm

**petite worktree manager** — manage git worktrees and run parallel Claude Code agents in tmux.

## Requirements

- Node.js >= 18
- [tmux](https://github.com/tmux/tmux)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`)

## Install

```bash
git clone https://github.com/wokhouse/pwm.git
cd pwm
npm install
npm link
```

## How it works

pwm manages git worktrees inside a `.pwm/` directory in your repo. Each worktree gets its own branch and an isolated working directory. When you spawn a Claude Code agent, pwm opens a tmux window for that worktree so you can run multiple agents in parallel.

Status detection works by reading Claude Code's session JSONL files (`~/.claude/projects/<encoded-path>/*.jsonl`), so pwm can tell whether an agent is actively working, waiting for input, done, or failed — without needing to instrument the agent process itself.

## Commands

### `pwm init`

Initialize pwm in the current git repo. Creates `.pwm/config.json` and `.pwm/state.json`, and adds `.pwm/` to `.gitignore`.

```bash
pwm init
```

### `pwm create <name>`

Create a new git worktree at `.pwm/<name>/` on a new branch called `<name>`.

```bash
pwm create feature-auth
pwm create bugfix-123
```

### `pwm spawn <name> [prompt]`

Launch a Claude Code agent in a new tmux window for the given worktree. If a prompt is provided, it's typed into the Claude session after startup. Without a prompt, Claude starts in interactive mode.

```bash
pwm spawn feature-auth "implement login page"
pwm spawn feature-auth
```

This creates a tmux session for the project (if one doesn't exist) and opens a window named after the worktree. You're switched to that window automatically.

### `pwm ls`

Print a table of all worktrees with their branch, agent status, and last action.

```bash
pwm ls
```

```
NAME             BRANCH          STATUS        LAST ACTION
────────────────────────────────────────────────────────
feature-auth     feature-auth    running       editing: login.ts
bugfix-123       bugfix-123      done          running: npm test
```

Agent statuses:

| Status | Meaning |
|---|---|
| `running` | Agent is actively working (executing tool calls) |
| `waiting` | Agent finished its turn, waiting for input |
| `done` | Agent process exited |
| `failed` | Agent exited with an error |
| `idle` | No agent spawned for this worktree |
| `none` | (Same as idle) |

### `pwm dashboard`

Open an interactive, auto-refreshing dashboard inside the project's tmux session. Shows a numbered list of worktrees with live status updates.

```bash
pwm dashboard
```

```
 pwm dashboard                                   12:34:05
 ───────────────────────────────────────────────────────
  1  feature-auth   running     editing: login.ts
  2  feature-api    waiting     running: npm test
  3  bugfix-123     done        tool: Bash
  4  experiment     idle        —
 ───────────────────────────────────────────────────────
 Type number to attach, q to quit, r to refresh
> _
```

Controls:

- **Number** (1-9) — switch to that worktree's tmux window. Navigate back with standard tmux keys (e.g. `Ctrl+B l` or `Ctrl+B n`). The dashboard keeps running.
- **r** — force a refresh
- **q** — quit the dashboard

Running `pwm dashboard` again while it's already open just switches to the existing dashboard window.

### `pwm attach [name]`

Attach to a worktree's tmux window. If no name is given, uses the current git branch name.

```bash
pwm attach feature-auth
pwm attach              # uses current branch
```

### `pwm rm <name>`

Remove a worktree: kills its tmux window, removes the git worktree, deletes the branch, and cleans up state.

```bash
pwm rm feature-auth
```

## Configuration

Config lives in `.pwm/config.json`:

```json
{
  "project": "myproject",
  "defaultAgent": "claude",
  "agentCommand": "claude -p",
  "dashboardRefreshInterval": 5000
}
```

| Field | Default | Description |
|---|---|---|
| `project` | — | Project name (set by `pwm init`) |
| `defaultAgent` | `claude` | Agent binary to use |
| `agentCommand` | `claude -p` | Command used for print-mode agents |
| `dashboardRefreshInterval` | `5000` | Dashboard auto-refresh interval in ms |

## Typical workflow

```bash
pwm init
pwm create feature-auth
pwm create feature-api
pwm create bugfix-123

pwm spawn feature-auth "implement login and signup"
pwm spawn feature-api "build REST API endpoints"
pwm spawn bugfix-123 "fix the off-by-one in calculateTotal"

pwm dashboard           # watch all agents from one screen
# press 1 → jump to feature-auth's window
# Ctrl+B l → back to dashboard

pwm rm bugfix-123       # clean up when done
```

## License

MIT
