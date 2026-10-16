import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/{src,test}/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
