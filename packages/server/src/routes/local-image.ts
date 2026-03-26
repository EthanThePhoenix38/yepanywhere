import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { Hono } from "hono";
import { stream } from "hono/streaming";

interface LocalImageDeps {
  allowedPaths: string[];
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
};

/**
 * Create routes for serving local images from allowed paths.
 *
 * Security: Only serves files that:
 * 1. Resolve (after symlink resolution) to a path under an allowed prefix
 * 2. Have a recognized image extension
 * 3. Are regular files (not directories, devices, etc.)
 */
export function createLocalImageRoutes(deps: LocalImageDeps) {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const filePath = c.req.query("path");
    if (!filePath) {
      return c.json({ error: "Missing path parameter" }, 400);
    }

    // Must be an absolute path
    if (!filePath.startsWith("/")) {
      return c.json({ error: "Path must be absolute" }, 400);
    }

    // Check image extension
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const contentType = IMAGE_EXTENSIONS[ext];
    if (!contentType) {
      return c.json({ error: "Not a recognized image type" }, 400);
    }

    // Resolve symlinks to get the real path
    let resolvedPath: string;
    try {
      resolvedPath = await realpath(filePath);
    } catch {
      return c.json({ error: "File not found" }, 404);
    }

    // Check both the requested path and resolved path against allowed prefixes
    const isAllowed = deps.allowedPaths.some(
      (prefix) =>
        filePath.startsWith(`${prefix}/`) &&
        resolvedPath.startsWith(`${prefix}/`),
    );
    if (!isAllowed) {
      return c.json({ error: "Path not in allowed directories" }, 403);
    }

    try {
      const stats = await stat(resolvedPath);
      if (!stats.isFile()) {
        return c.json({ error: "Not a file" }, 404);
      }

      c.header("Content-Type", contentType);
      c.header("Content-Length", stats.size.toString());
      c.header("Cache-Control", "private, max-age=3600");

      return stream(c, async (s) => {
        const readable = createReadStream(resolvedPath);
        for await (const chunk of readable) {
          await s.write(chunk);
        }
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "File not found" }, 404);
      }
      console.error("[LocalImage] Error serving file:", err);
      return c.json({ error: "Internal error" }, 500);
    }
  });

  return routes;
}
