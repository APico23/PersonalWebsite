import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const include = [
  "index.html",
  "analytics.html",
  "managers.html",
  "players.html",
  "trade-block.html",
  "privacy.html",
  "README.md",
  "assets",
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const item of include) {
  const src = path.join(root, item);
  const dest = path.join(dist, item);
  await cp(src, dest, { recursive: true });
}

await writeFile(path.join(dist, ".nojekyll"), "");
console.log("Built static site to ffleague/dist");
