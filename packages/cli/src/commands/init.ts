import path from "path";
import { scaffoldWorkspace } from "../workspace/scaffold";

export async function initCommand(args: string[]): Promise<void> {
  const targetDir = args[0] ?? process.cwd();
  const absoluteDir = path.resolve(targetDir);

  process.stdout.write(`Initializing Killswitch workspace at ${absoluteDir}\n`);

  try {
    scaffoldWorkspace(absoluteDir);
    process.stdout.write("Workspace scaffold created:\n");
    process.stdout.write("  CLAUDE.md       — AI constraints and instructions\n");
    process.stdout.write("  package.json    — npm scripts (dev, dev:backend, build)\n");
    process.stdout.write("  vite.config.ts  — Vite config (port 3000)\n");
    process.stdout.write("  server.js       — Backend stub (port 3001)\n");
    process.stdout.write("  index.html      — HTML entry\n");
    process.stdout.write("  src/main.js     — JS entry\n");
    process.stdout.write("\nNext steps:\n");
    process.stdout.write(`  cd ${absoluteDir}\n`);
    process.stdout.write("  npm install\n");
    process.stdout.write("  npm run dev\n");
  } catch (err) {
    process.stderr.write(`[init] error: ${String(err)}\n`);
    process.exit(1);
  }
}
