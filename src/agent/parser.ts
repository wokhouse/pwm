/**
 * Parser for Claude Code's stream-json (NDJSON) output.
 *
 * Each line is a JSON object with a `type` field. Key events:
 * - type "assistant": content blocks with tool_use, text, etc. May include usage.
 * - type "user": user messages
 * - type "system": system messages
 *
 * We extract: latest tool call, token usage, and completion status.
 */

export interface ParsedEvent {
  type: string;
  /** Current tool being called, if any */
  tool?: string;
  /** Summary of what the tool is doing */
  action?: string;
  /** Input details for the tool call */
  toolInput?: Record<string, unknown>;
  /** Token usage from the event */
  usage?: TokenUsage;
  /** Raw event for debugging */
  raw: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface ParsedSummary {
  /** Latest meaningful event */
  latestEvent: ParsedEvent | null;
  /** Cumulative token usage */
  totalUsage: TokenUsage;
  /** Number of events parsed */
  eventCount: number;
  /** Last tool call description for display */
  lastAction: string;
  /** Whether the agent appears to have finished */
  finished: boolean;
}

/** Parse a single NDJSON line into a ParsedEvent. */
export function parseLine(line: string): ParsedEvent | null {
  if (!line.trim()) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }

  if (!obj.type || typeof obj.type !== "string") {
    return { type: "unknown", raw: obj };
  }

  const event: ParsedEvent = { type: obj.type, raw: obj };

  // Extract tool use from assistant messages
  if (obj.type === "assistant" && Array.isArray(obj.content)) {
    for (const block of obj.content as Record<string, unknown>[]) {
      if (block.type === "tool_use" && typeof block.name === "string") {
        event.tool = block.name;
        event.toolInput = block.input as Record<string, unknown>;
        event.action = describeToolCall(block.name, block.input as Record<string, unknown>);
      }
    }

    // Extract usage
    if (obj.usage && typeof obj.usage === "object") {
      const u = obj.usage as Record<string, unknown>;
      event.usage = {
        inputTokens: Number(u.input_tokens ?? u.inputTokens ?? 0),
        outputTokens: Number(u.output_tokens ?? u.outputTokens ?? 0),
        cacheReadTokens: u.cache_read_input_tokens != null
          ? Number(u.cache_read_input_tokens)
          : undefined,
        cacheCreationTokens: u.cache_creation_input_tokens != null
          ? Number(u.cache_creation_input_tokens)
          : undefined,
      };
    }
  }

  // type "result" indicates the agent finished
  if (obj.type === "result") {
    event.action = obj.subtype === "error" ? "error" : "done";
    if (obj.usage && typeof obj.usage === "object") {
      const u = obj.usage as Record<string, unknown>;
      event.usage = {
        inputTokens: Number(u.input_tokens ?? u.inputTokens ?? 0),
        outputTokens: Number(u.output_tokens ?? u.outputTokens ?? 0),
      };
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
export function parseJsonl(content: string): ParsedSummary {
  const lines = content.split("\n").filter((l) => l.trim());
  const result: ParsedSummary = {
    latestEvent: null,
    totalUsage: { inputTokens: 0, outputTokens: 0 },
    eventCount: 0,
    lastAction: "—",
    finished: false,
  };

  for (const line of lines) {
    const event = parseLine(line);
    if (!event) continue;

    result.eventCount++;

    // Accumulate usage (take the largest values seen)
    if (event.usage) {
      result.totalUsage.inputTokens = Math.max(
        result.totalUsage.inputTokens,
        event.usage.inputTokens,
      );
      result.totalUsage.outputTokens = Math.max(
        result.totalUsage.outputTokens,
        event.usage.outputTokens,
      );
    }

    // Track latest meaningful event
    if (event.tool || event.type === "result") {
      result.latestEvent = event;
    }
  }

  // Derive last action and finished status
  if (result.latestEvent) {
    if (result.latestEvent.type === "result") {
      result.finished = true;
      result.lastAction = result.latestEvent.action === "error" ? "failed" : "completed";
    } else if (result.latestEvent.action) {
      result.lastAction = result.latestEvent.action;
    }
  }

  return result;
}
