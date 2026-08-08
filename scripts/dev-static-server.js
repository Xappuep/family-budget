const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json"
};

const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname.endsWith("/")) {
        pathname += "index.html";
    }

    const relative = pathname.replace(/^\/+/, "");
    const file = path.resolve(root, relative);

    if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("404 " + pathname);
            return;
        }

        res.writeHead(200, {
            "Content-Type": types[path.extname(file)] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        res.end(data);
    });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`READY http://127.0.0.1:${port}/`);
});
