import { defineConfig } from "vitest/config";

// base "./" makes every built URL relative, so dist/ works from GitHub Pages,
// `npm run preview`, or any local static server (no fixed path needed).
export default defineConfig({
  base: "./",
  // React's automatic JSX runtime (no `import React` needed in each file).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
