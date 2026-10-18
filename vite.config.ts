import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import { execSync } from "node:child_process";

const host = process.env.TAURI_DEV_HOST;

const awsCredentialsPlugin = (): Plugin => ({
  name: "aws-credentials-dev-endpoint",
  configureServer(server) {
    server.middlewares.use("/api/aws-credentials", (_req, res) => {
      try {
        const out = execSync("aws configure export-credentials", { encoding: "utf-8" });
        const parsed = JSON.parse(out);
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            accessKeyId: parsed.AccessKeyId,
            secretAccessKey: parsed.SecretAccessKey,
            sessionToken: parsed.SessionToken,
            region: "ap-southeast-2",
          })
        );
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: err?.message || "Failed to export AWS credentials" }));
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), awsCredentialsPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
