import fs from "fs";
import path from "path";

const CLAUDE_MD = `# Killswitch Workspace

## Constraints (enforced by the platform — do not modify)

- Frontend dev server: **:3000** (\`npm run dev\` or \`vite\`)
- Backend server: **:3001**
- No other ports may be bound or tunneled to viewers
- Tool execution is sandboxed to this workspace directory
- Do not read or write files outside this directory

## Getting started

Run \`npm run dev\` to start the frontend. Run \`npm run dev:backend\` for the backend.
`;

const PACKAGE_JSON = JSON.stringify(
  {
    name: "killswitch-workspace",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "vite",
      "dev:backend": "node server.js",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {},
    devDependencies: {
      vite: "^5.0.0",
    },
  },
  null,
  2
);

const VITE_CONFIG = `import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
    host: true,
  },
});
`;

const SERVER_JS = `// Backend server — runs on port 3001
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

server.listen(3001, () => {
  process.stderr.write("Backend server running on port 3001\\n");
});
`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Killswitch Workspace</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`;

const MAIN_JS = `// Entry point
document.getElementById("app").innerHTML = "<h1>Killswitch Workspace</h1><p>Ready.</p>";
`;

export function scaffoldWorkspace(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  fs.writeFileSync(path.join(dir, "CLAUDE.md"), CLAUDE_MD, "utf8");
  fs.writeFileSync(path.join(dir, "package.json"), PACKAGE_JSON, "utf8");
  fs.writeFileSync(path.join(dir, "vite.config.ts"), VITE_CONFIG, "utf8");
  fs.writeFileSync(path.join(dir, "server.js"), SERVER_JS, "utf8");
  fs.writeFileSync(path.join(dir, "index.html"), INDEX_HTML, "utf8");
  fs.writeFileSync(path.join(dir, "src", "main.js"), MAIN_JS, "utf8");
}
