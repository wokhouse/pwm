import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerCreateCommand } from "./commands/create.js";
import { registerSpawnCommand } from "./commands/spawn.js";
import { registerLsCommand } from "./commands/ls.js";
import { registerAttachCommand } from "./commands/attach.js";
import { registerRmCommand } from "./commands/rm.js";

const program = new Command();

program
  .name("pwm")
  .description("Petite Worktree Manager — manage git worktrees and run parallel Claude Code agents")
  .version("0.1.0");

registerInitCommand(program);
registerCreateCommand(program);
registerSpawnCommand(program);
registerLsCommand(program);
registerAttachCommand(program);
registerRmCommand(program);

program.parse();
