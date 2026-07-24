import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@agentdesk/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@agentdesk/domain": new URL("./packages/domain/src/index.ts", import.meta.url).pathname,
      "@agentdesk/agents": new URL("./packages/agents/src/index.ts", import.meta.url).pathname,
      "@agentdesk/observability": new URL("./packages/observability/src/index.ts", import.meta.url).pathname
    }
  }
});
