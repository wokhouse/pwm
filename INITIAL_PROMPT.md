# Petite Worktree Manager (PWM)

A TypeScript CLI tool for managing git worktrees and running multiple Claude Code agents in parallel. Designed for remote server use — SSH in, spawn agents across worktrees, detach, reattach later.

## Core Concept

Run `pwm` in a repo directory to create and manage isolated git worktrees inside a project-local `.pwm/` directory, each with its own Claude Code agent running in a tmux pane. A sidebar shows real-time status of all agents.

## MVP Scope

### Assumptions

- **Claude Code only** as the agent (no generic agent abstraction)
- **tmux** as the terminal multiplexer (required, not optional)
- **Remote server first** — persistence and detach/reattach are core, not nice-to-have
- **Node.js runtime** for widest compatibility

### Commands

| Command | Description |
|---|---|
| `pwm init` | Create `.pwm/` directory, write config |
| `pwm create <name>` | Create git worktree at `.pwm/<name>/` + new branch |
| `pwm spawn <name> [prompt]` | Launch `claude -p` in worktree's tmux window |
| `pwm spawn <name> -i` | Launch interactive `claude` session in worktree's tmux window |
| `pwm resume <name>` | Reconnect to Claude Code session with `--continue` |
| `pwm ls` | Print status table (no tmux needed, works over bare SSH) |
| `pwm attach <name>` | Jump to that worktree's tmux window |
| `pwm kill <name>` | Kill the claude process |
| `pwm rm <name>` | Kill agent + remove worktree + delete branch |
| `pwm up` | Open the tmux session with sidebar |
| `pwm down` | Close tmux session (agents keep running in background) |

### Architecture

#### Directory Structure

```
.pwm/
  config.json              # project settings (default agent command, etc.)
  state.json               # worktree metadata, session IDs, PIDs, status
  <worktree-name>/         # git worktree checkout
    .claude-output.jsonl   # tee'd stream-json output from claude
```

#### tmux Session Layout

```
┌──────────────────────────────────────────────────────────┐
│  pwm: my-project                              $4.12 total│
│──────────────────────┬───────────────────────────────────│
│                      │                                   │
│  SIDEBAR PANE        │   ACTIVE WORKTREE PANE            │
│  (auto-refreshed)    │   (agent terminal or interactive  │
│                      │    claude session lives here)     │
│  Shows per worktree: │                                   │
│  - status indicator  │                                   │
│  - current file/edit │                                   │
│  - token usage       │                                   │
│  - cost              │                                   │
│                      │                                   │
│──────────────────────┴───────────────────────────────────│
│  ↑↓:navigate enter:attach s:spawn d:delete r:resume q:detach│
└──────────────────────────────────────────────────────────┘
```

#### Claude Code Integration

- Use `claude -p --output-format stream-json` for non-interactive agents
- Parse stream-json events for real-time status: tool calls (Edit, Bash, Read), token counts, completion/error
- Tee output to `.pwm/<name>/.claude-output.jsonl` for sidebar to tail
- Store Claude Code session IDs in `state.json` for `--continue` / `pwm resume`
- Use `-p` (print mode) for non-interactive, raw `claude` for interactive (`-i` flag)

#### Status Detection (from stream-json)

| Event | Sidebar Display |
|---|---|
| `tool_call` with tool `Bash` | `running: <command>` |
| `tool_call` with tool `Edit` | `editing: <filepath>` |
| `tool_call` with tool `Read` | `reading: <filepath>` |
| `content_delta` | `thinking...` |
| Permission prompt / waiting | `⚠ needs approval` |
| Exit code 0 | `✓ done` |
| Exit code 1 | `✗ failed` |
| PID alive, no recent events | `idle` |

#### State Management

`state.json` is the source of truth:

```json
{
  "project": "my-project",
  "sessionCreatedAt": "2026-05-15T10:00:00Z",
  "worktrees": {
    "feature-auth": {
      "branch": "feature-auth",
      "path": ".pwm/feature-auth",
      "agent": {
        "pid": 12345,
        "claudeSessionId": "abc-123",
        "mode": "print",
        "spawnedAt": "2026-05-15T10:05:00Z",
        "status": "running"
      }
    }
  }
}
```

#### Sidebar Refresh

A background process in the sidebar tmux pane that:
1. Reads `state.json` for worktree list
2. Tails each `.claude-output.jsonl` for latest events
3. Checks PID liveness
4. Parses latest tool call, token count, etc.
5. Re-renders every 2 seconds

### Project Source Structure

```
src/
  commands/           # CLI command handlers
    init.ts
    create.ts
    up.ts
    spawn.ts
    ls.ts
    resume.ts
    attach.ts
    kill.ts
    rm.ts
    down.ts
  tmux/               # tmux interaction layer
    session.ts        # create/attach/kill tmux sessions
    layout.ts         # set up sidebar + pane layout
    sidebar.ts        # render status sidebar, background refresh
  worktree/           # git worktree operations
    create.ts
    remove.ts
    list.ts
  agent/              # Claude Code process management
    spawn.ts          # launch claude in tmux pane
    status.ts         # parse stream-json, check PID, detect states
    kill.ts
    parser.ts         # parse claude stream-json events (isolated for easy updates)
  state.ts            # read/write .pwm/state.json
  config.ts           # .pwm/config.json defaults
  cli.ts              # commander/yargs entry point
```

### Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **CLI framework**: `commander`
- **TUI (sidebar)**: `ink` (React for terminal) or raw tmux + shell rendering
- **Git operations**: shell out to `git` CLI directly
- **Process management**: tmux sessions + `child_process`
- **State**: JSON files in `.pwm/`

### Explicitly NOT in MVP

- Support for agents other than Claude Code
- Custom agent integrations or templates
- Log streaming / output search
- PR/merge workflow
- Resource monitoring (CPU/memory)
- Multi-user support
- Web UI
- Homebrew distribution (npm only for MVP)

### Key Risks

- **Stream-json format stability**: Claude Code's output format may change. Mitigation: isolate parser in one file.
- **tmux dependency**: Users must have tmux installed. Mitigation: detect and error clearly.
- **Session file discovery**: Finding the right Claude Code session to resume requires mapping worktree paths to `~/.claude/projects/` entries.
