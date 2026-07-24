import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Resolve a workspace package to an absolute filesystem path.
 *
 * Note `fileURLToPath` rather than `new URL(...).pathname`. They look
 * interchangeable and are not: on Windows, `.pathname` returns
 * "/C:/Users/..." — a POSIX-style leading slash in front of the drive
 * letter — which is not a path Windows can open. Vitest then fails to
 * resolve every "@agentdesk/*" import and no test in the suite runs.
 *
 * `fileURLToPath` is the documented way to turn a file:// URL into a real
 * path, and it produces "C:\Users\..." on Windows and "/Users/..." on
 * POSIX. The bug is invisible on Linux and macOS, which is exactly why it
 * survived: CI would have been green while local runs were broken.
 */
const pkg = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@agentdesk/shared": pkg("./packages/shared/src/index.ts"),
      "@agentdesk/domain": pkg("./packages/domain/src/index.ts"),
      "@agentdesk/agents": pkg("./packages/agents/src/index.ts"),
      "@agentdesk/observability": pkg("./packages/observability/src/index.ts")
    }
  }
});
