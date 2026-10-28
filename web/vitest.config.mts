import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["src/lib/**/*.ts"], exclude: ["src/lib/supabase/**", "src/lib/auth.ts", "src/lib/herbs.ts"] },
  },
});
