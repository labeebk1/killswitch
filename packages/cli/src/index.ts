#!/usr/bin/env node
import { connectCommand } from "./commands/connect";
import { initCommand } from "./commands/init";

const [, , command, ...args] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case "connect":
      await connectCommand(args);
      break;

    case "init":
      await initCommand(args);
      break;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(
        [
          "killswitch — competitive coding platform CLI",
          "",
          "Usage:",
          "  killswitch connect <slot-key>   Connect to a match slot",
          "  killswitch init [dir]           Scaffold a new workspace",
          "  killswitch help                 Show this help",
          "",
          "Environment variables:",
          "  KILLSWITCH_SERVER_URL   Server base URL (default: https://api.killswitch.bonecho.ai)",
          "  LOCAL_PORT              Local dev server port to tunnel (default: 3000)",
          "  CLAUDE_MODEL            Claude model to use (default: claude-opus-4-5)",
          "",
        ].join("\n")
      );
      break;

    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      process.stderr.write('Run "killswitch help" for usage.\n');
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
