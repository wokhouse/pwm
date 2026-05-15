import fs from "node:fs";
import path from "node:path";
import type { ProjectRoot } from "./state.js";

export interface Config {
  project: string;
  defaultAgent: string;
  agentCommand: string;
}

const DEFAULT_CONFIG: Omit<Config, "project"> = {
  defaultAgent: "claude",
  agentCommand: "claude -p --output-format stream-json",
};

export function configPath(projectRoot: string): string {
  return path.join(projectRoot, ".pwm", "config.json");
}

export function readConfig(projectRoot: string): Config {
  const raw = fs.readFileSync(configPath(projectRoot), "utf-8");
  return JSON.parse(raw);
}

export function writeConfig(projectRoot: string, config: Config): void {
  fs.writeFileSync(configPath(projectRoot), JSON.stringify(config, null, 2) + "\n");
}

export function defaultConfig(projectName: string): Config {
  return { ...DEFAULT_CONFIG, project: projectName };
}
