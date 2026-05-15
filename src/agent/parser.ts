/**
 * Parser for Claude Code's session JSONL files.
 *
 * Session files live at ~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
 * Each line is a JSON record with fields: type, uuid, parentUuid, timestamp,
 * sessionId, message, cwd, etc.
 *
 * Key record types:
 * - type "user": user messages (initial prompt, tool results)
 * - type "assistant": assistant messages with content blocks (text, tool_use)
 * - type "summary": compaction checkpoint
 * - type "queue-operation": internal queue events (skip)
 *
 * We extract: latest tool call, event count, and completion status.
 * Token usage is not reliably available in session files so we skip it.
 */

export interface ParsedEvent {
  type: string;
  /** Current tool being called, if any */
  tool?: string;
  /** Summary of what the tool is doing */
  action?: string;
  /** Raw event for debugging */
  raw: Record<string, unknown>;
}

export interface ParsedSummary {
  /** Latest meaningful event */
  latestEvent: ParsedEvent | null;
  /** Number of events parsed */
  eventCount: number;
  /** Last tool call description for display */
  lastAction: string;
  /** Whether the agent appears to have finished */
  finished: boolean;
}

/** Parse a single session JSONL line into a ParsedEvent. */
export function parseLine(line: string): ParsedEvent | null {
  if (!line.trim()) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }

  const type = obj.type;
  if (!type || typeof type !== "string") return null;

  // Skip internal events
  if (type === "queue-operation") return null;

  const event: ParsedEvent = { type, raw: obj };

  // Extract tool use from assistant messages
  if (type === "assistant" && obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    const content = msg.content;
    if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === "tool_use" && typeof block.name === "string") {
          event.tool = block.name;
          event.action = describeToolCall(block.name, (block.input ?? {}) as Record<string, unknown>);
        }
      }
    }
  }

  return event;
}

/** Summarize a tool call for display. */
function describeToolCall(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case "Edit":
    case "Write": {
      const fp = String(input.file_path ?? input.path ?? "");
      const short = fp.split("/").pop() ?? fp;
      return `editing: ${short}`;
    }
    case "Read": {
      const fp = String(input.file_path ?? input.path ?? "");
      const short = fp.split("/").pop() ?? fp;
      return `reading: ${short}`;
    }
    case "Bash": {
      const cmd = String(input.command ?? "");
      const short = cmd.length > 40 ? cmd.slice(0, 37) + "..." : cmd;
      return `running: ${short}`;
    }
    default:
      return `tool: ${tool}`;
  }
}

/** Parse all non-empty lines and produce a summary. */
export function parseSessionJsonl(content: string): ParsedSummary {
  const lines = content.split("\n").filter((l) => l.trim());
  const result: ParsedSummary = {
    latestEvent: null,
    eventCount: 0,
    lastAction: "—",
    finished: false,
  };

  let lastAssistantEvent: ParsedEvent | null = null;
  let hasUserAfterLastAssistant = false;

  for (const line of lines) {
    const event = parseLine(line);
    if (!event) continue;

    result.eventCount++;

    // Track latest meaningful event (tool calls, or any assistant event)
    if (event.tool) {
      result.latestEvent = event;
    } else if (event.type === "assistant" && !result.latestEvent?.tool) {
      result.latestEvent = event;
    }

    // Track last assistant event and whether user input followed it
    if (event.type === "assistant") {
      lastAssistantEvent = event;
      hasUserAfterLastAssistant = false;
    } else if (event.type === "user") {
      hasUserAfterLastAssistant = true;
    }
  }

  // Derive last action
  if (result.latestEvent?.action) {
    result.lastAction = result.latestEvent.action;
  }

  // Agent is "finished" (waiting for input) when the last assistant message
  // has no tool_use AND no user input arrived after it. This correctly
  // handles JSONL files that end with progress/system/summary events after
  // the final assistant message.
  result.finished =
    lastAssistantEvent !== null &&
    !lastAssistantEvent.tool &&
    !hasUserAfterLastAssistant;

  return result;
}
