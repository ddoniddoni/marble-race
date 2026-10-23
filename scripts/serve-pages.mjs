// Local verification server only. No SPA fallback: unknown URLs must return 404.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("out");
const mount = new URL(process.env.SITE_URL || "https://ddoniddoni.github.io/marble-race/")
  .pathname.replace(/\/$/, "");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png",
  ".wasm": "application/wasm", ".woff2": "font/woff2", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (mount && pathname === mount) {
      res.writeHead(308, { Location: `${mount}/` }).end();
      return;
    }
    if (!pathname.startsWith(`${mount}/`)) throw new Error("Outside mount");
    let file = resolve(root, `.${pathname.slice(mount.length)}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error("Outside export");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    await stat(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    createReadStream(resolve(root, "404.html")).on("error", () => res.end("Not found")).pipe(res);
  }
}).listen(3101, "127.0.0.1", () => console.log(`Pages preview: http://127.0.0.1:3101${mount}/`));
