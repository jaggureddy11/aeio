import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const host = process.env.TAURI_DEV_HOST;

const awsCredentialsPlugin = (): Plugin => ({
  name: "aws-credentials-dev-endpoint",
  configureServer(server) {
    server.middlewares.use("/api/aws-credentials", (_req, res) => {
      try {
        let accessKeyId = "";
        let secretAccessKey = "";
        let sessionToken: string | undefined = undefined;
        let expiration: string | undefined = undefined;
        const region = process.env.AWS_REGION || process.env.BEDROCK_REGION || "ap-southeast-2";

        try {
          const out = execSync("aws configure export-credentials", { encoding: "utf-8" });
          const parsed = JSON.parse(out);
          accessKeyId = parsed.AccessKeyId;
          secretAccessKey = parsed.SecretAccessKey;
          sessionToken = parsed.SessionToken;
          expiration = parsed.Expiration;
        } catch {
          if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            accessKeyId = process.env.AWS_ACCESS_KEY_ID;
            secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
            sessionToken = process.env.AWS_SESSION_TOKEN;
          }
        }

        if (!accessKeyId || !secretAccessKey) {
          throw new Error("No AWS credentials found in SSO session or .env file.");
        }

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            accessKeyId,
            secretAccessKey,
            sessionToken,
            expiration,
            region,
          })
        );
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: err?.message || "Failed to export AWS credentials" }));
      }
    });

    server.middlewares.use("/api/bedrock-proxy", (req, res) => {
      let bodyData = "";
      req.on("data", (chunk) => {
        bodyData += chunk;
      });
      req.on("end", async () => {
        try {
          const targetUrl = req.headers["x-bedrock-target-url"] as string;
          if (!targetUrl) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing x-bedrock-target-url header" }));
            return;
          }

          const forwardHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (
              typeof v === "string" &&
              !["host", "connection", "origin", "referer", "content-length", "x-bedrock-target-url"].includes(k.toLowerCase())
            ) {
              forwardHeaders[k] = v;
            }
          }

          const fetchResp = await fetch(targetUrl, {
            method: req.method || "POST",
            headers: forwardHeaders,
            body: bodyData || undefined,
          });

          res.statusCode = fetchResp.status;
          fetchResp.headers.forEach((val, key) => {
            if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
              res.setHeader(key, val);
            }
          });

          if (fetchResp.body) {
            const arrayBuf = await fetchResp.arrayBuffer();
            res.end(Buffer.from(arrayBuf));
          } else {
            res.end();
          }
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err?.message || "Bedrock proxy error" }));
        }
      });
    });

    server.middlewares.use("/api/system-action", (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      let bodyData = "";
      req.on("data", (chunk) => {
        bodyData += chunk;
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(bodyData || "{}");
          const cmd = body.cmd || body.command || body.action;
          const args = body.args || body.parameters || body;
          let result: any = { success: true };

          switch (cmd) {
            case "open_app": {
              const rawName = String(args.name || args.app || args.appName || args.target || "").trim();
              if (rawName.startsWith("http://") || rawName.startsWith("https://")) {
                spawnSync("open", [rawName]);
                result = { success: true, message: `Opened URL: ${rawName}`, action_type: "open_app", payload: rawName };
              } else if (rawName.toLowerCase() === "youtube" || rawName.toLowerCase() === "youtube.com") {
                spawnSync("open", ["https://www.youtube.com"]);
                result = { success: true, message: "Opened YouTube", action_type: "open_app", payload: "https://www.youtube.com" };
              } else if (rawName.toLowerCase().startsWith("youtube ")) {
                const query = rawName.slice(8).trim();
                const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                spawnSync("open", [url]);
                result = { success: true, message: `Searching YouTube for '${query}'`, action_type: "search_web", payload: url };
              } else {
                const appProc = spawnSync("open", ["-a", rawName]);
                if (appProc.status !== 0) {
                  spawnSync("open", [rawName]);
                }
                result = { success: true, message: `Opened ${rawName}`, action_type: "open_app", payload: rawName };
              }
              break;
            }

            case "open_target": {
              const target = String(args.target || args.url || "").trim();
              if (target) {
                spawnSync("open", [target]);
              }
              result = { success: true, message: `Opened ${target}` };
              break;
            }

            case "search_web_platform": {
              const query = String(args.query || "").trim();
              const platform = String(args.platform || "google").toLowerCase();
              const app = args.app ? String(args.app).trim() : "";
              let url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
              if (query.startsWith("http://") || query.startsWith("https://")) {
                url = query;
              } else if (platform === "youtube" || platform === "video") {
                url = query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : "https://www.youtube.com";
              } else if (platform === "github" || platform === "code") {
                url = query ? `https://github.com/search?q=${encodeURIComponent(query)}` : "https://github.com";
              } else if (platform === "duckduckgo" || platform === "ddg") {
                url = query ? `https://duckduckgo.com/?q=${encodeURIComponent(query)}` : "https://duckduckgo.com";
              } else if (platform === "spotify") {
                url = query ? `https://open.spotify.com/search/${encodeURIComponent(query)}` : "https://open.spotify.com";
              } else if (platform === "netflix") {
                url = "https://www.netflix.com";
              } else if (platform === "chatgpt") {
                url = "https://chatgpt.com";
              } else if (platform === "twitter" || platform === "x") {
                url = "https://x.com";
              } else if (platform === "reddit") {
                url = "https://www.reddit.com";
              }

              if (app) {
                spawnSync("open", ["-a", app, url]);
              } else {
                spawnSync("open", [url]);
              }
              result = { success: true, message: `Searching ${platform} for '${query}'`, action_type: "search_web", payload: url };
              break;
            }

            case "inject_text_to_active_app": {
              const text = String(args.text || "");
              spawnSync("pbcopy", { input: text });
              spawnSync("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
              result = { success: true, message: "Text pasted into active application", action_type: "inject_text", payload: text };
              break;
            }

            case "simulate_key_press": {
              const key = String(args.key || "enter").toLowerCase().trim();
              const keyCodeMap: Record<string, number> = {
                enter: 36,
                return: 36,
                escape: 53,
                esc: 53,
                tab: 48,
                space: 49,
                up: 126,
                down: 125,
                left: 123,
                right: 124,
                backspace: 51,
                delete: 51,
              };
              if (keyCodeMap[key]) {
                spawnSync("osascript", ["-e", `tell application "System Events" to key code ${keyCodeMap[key]}`]);
              } else {
                spawnSync("osascript", ["-e", `tell application "System Events" to keystroke "${key}"`]);
              }
              result = { success: true, message: `Key pressed: ${key}`, action_type: "key_press", payload: key };
              break;
            }

            case "simulate_scroll": {
              const dir = String(args.direction || "down").toLowerCase();
              const amount = typeof args.amount === "number" ? args.amount : 6;
              const keyCode = dir === "up" ? 126 : 125;
              const script = `tell application "System Events" to repeat ${amount} times\n key code ${keyCode}\n delay 0.05\n end repeat`;
              spawnSync("osascript", ["-e", script]);
              result = { success: true, message: `Scrolled ${dir} by ${amount}`, action_type: "scroll" };
              break;
            }

            case "set_system_volume": {
              const level = Math.min(100, Math.max(0, Number(args.level ?? 50)));
              spawnSync("osascript", ["-e", `set volume output volume ${level}`]);
              result = { success: true, message: `System volume set to ${level}%`, action_type: "set_volume", payload: String(level) };
              break;
            }

            case "get_system_volume": {
              const out = spawnSync("osascript", ["-e", "output volume of (get volume settings)"], { encoding: "utf-8" });
              const vol = parseInt(out.stdout?.trim() || "50", 10);
              result = { volume: isNaN(vol) ? 50 : vol, is_muted: false };
              break;
            }

            case "set_system_mute": {
              const mute = Boolean(args.mute);
              spawnSync("osascript", ["-e", `set volume output muted ${mute ? "true" : "false"}`]);
              result = { success: true, message: mute ? "System muted" : "System unmuted", action_type: "set_mute", payload: String(mute) };
              break;
            }

            case "play_spotify": {
              const query = String(args.query || "").trim();
              const encoded = encodeURIComponent(query);
              const script = `tell application "Spotify" to activate\nopen location "spotify:search:${encoded}"`;
              const spRes = spawnSync("osascript", ["-e", script]);
              if (spRes.status !== 0) {
                spawnSync("open", [`https://open.spotify.com/search/${encoded}`]);
              }
              result = { success: true, message: `Playing '${query}' on Spotify`, action_type: "play_spotify", payload: query };
              break;
            }

            case "media_control": {
              const act = String(args.action || "playpause").toLowerCase();
              const spCmd =
                act === "play"
                  ? "play"
                  : act === "pause"
                  ? "pause"
                  : act === "next"
                  ? "next track"
                  : act === "prev" || act === "previous"
                  ? "previous track"
                  : "playpause";
              spawnSync("osascript", ["-e", `tell application "Spotify" to ${spCmd}`]);
              result = { success: true, message: `Media control: ${act}`, action_type: "media_control", payload: act };
              break;
            }

            case "lock_screen": {
              spawnSync("pmset", ["displaysleepnow"]);
              result = { success: true, message: "Screen locked", action_type: "lock_screen" };
              break;
            }

            case "send_system_notification": {
              const title = String(args.title || "Aeio Notification").replace(/"/g, '\\"');
              const msg = String(args.message || "").replace(/"/g, '\\"');
              spawnSync("osascript", ["-e", `display notification "${msg}" with title "${title}"`]);
              result = { success: true, message: "Notification sent", action_type: "notification" };
              break;
            }

            case "focus_app": {
              const name = String(args.name || "");
              if (name) {
                spawnSync("open", ["-a", name]);
              }
              result = { success: true, message: `Focused ${name}`, action_type: "focus_app" };
              break;
            }

            case "list_running_apps": {
              const out = spawnSync("osascript", ["-e", 'tell application "System Events" to get name of (processes whose background only is false)'], { encoding: "utf-8" });
              const raw = out.stdout?.trim() || "";
              const apps = raw ? raw.split(", ").map((s: string) => s.trim()) : [];
              result = apps;
              break;
            }

            case "execute_computer_action":
            case "computer_action": {
              const request = args.request || args;
              const action = request.action || args.action || args;
              const actionType = action.actionType || action.type;
              const cursorBin = path.resolve(process.cwd(), "scripts/cursor_ctrl");
              if (!fs.existsSync(cursorBin)) {
                const swiftSrc = path.resolve(process.cwd(), "scripts/cursor_ctrl.swift");
                if (fs.existsSync(swiftSrc)) {
                  spawnSync("swiftc", ["-O", swiftSrc, "-o", cursorBin]);
                }
              }

              if (actionType === "click") {
                const x = Number(action.x ?? 0);
                const y = Number(action.y ?? 0);
                const btn = action.button || "left";
                const dbl = action.double ? "double" : "single";
                spawnSync(cursorBin, ["click", String(x), String(y), btn, dbl]);
              } else if (actionType === "move") {
                const x = Number(action.x ?? 0);
                const y = Number(action.y ?? 0);
                spawnSync(cursorBin, ["move", String(x), String(y)]);
              } else if (actionType === "drag") {
                const sx = Number(action.startX ?? action.start_x ?? 0);
                const sy = Number(action.startY ?? action.start_y ?? 0);
                const ex = Number(action.endX ?? action.end_x ?? 0);
                const ey = Number(action.endY ?? action.end_y ?? 0);
                spawnSync(cursorBin, ["drag", String(sx), String(sy), String(ex), String(ey)]);
              } else if (actionType === "scroll") {
                const dx = Number(action.dx ?? 0);
                const dy = Number(action.dy ?? (action.direction === "up" ? 6 : -6));
                spawnSync(cursorBin, ["scroll", String(dx), String(dy)]);
              } else if (actionType === "type") {
                const text = String(action.text ?? "");
                spawnSync("pbcopy", { input: text });
                spawnSync("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
              } else if (actionType === "keyCombo") {
                const keys = Array.isArray(action.keys) ? action.keys : [action.key || "enter"];
                for (const k of keys) {
                  const lk = String(k).toLowerCase();
                  const keyCodeMap: Record<string, number> = {
                    enter: 36,
                    return: 36,
                    escape: 53,
                    esc: 53,
                    tab: 48,
                    space: 49,
                    up: 126,
                    down: 125,
                    left: 123,
                    right: 124,
                    backspace: 51,
                    delete: 51,
                  };
                  if (keyCodeMap[lk]) {
                    spawnSync("osascript", ["-e", `tell application "System Events" to key code ${keyCodeMap[lk]}`]);
                  } else {
                    spawnSync("osascript", ["-e", `tell application "System Events" to keystroke "${lk}"`]);
                  }
                }
              }

              result = {
                status: "SUCCESS",
                message: "Action executed successfully",
                targetAppBundleId: request?.intent?.targetAppBundleId || "macos",
                completedStep: request?.stepNumber || 1,
              };
              break;
            }

            case "gui_click": {
              const cursorBin = path.resolve(process.cwd(), "scripts/cursor_ctrl");
              const x = Number(args.x ?? 0);
              const y = Number(args.y ?? 0);
              const btn = args.button || "left";
              const dbl = args.double ? "double" : "single";
              spawnSync(cursorBin, ["click", String(x), String(y), btn, dbl]);
              result = { success: true, message: `Clicked at (${x}, ${y})`, coordinate: { x, y } };
              break;
            }

            case "gui_move":
            case "mouse_move": {
              const cursorBin = path.resolve(process.cwd(), "scripts/cursor_ctrl");
              const x = Number(args.x ?? 0);
              const y = Number(args.y ?? 0);
              spawnSync(cursorBin, ["move", String(x), String(y)]);
              result = { success: true, message: `Moved cursor to (${x}, ${y})`, coordinate: { x, y } };
              break;
            }

            case "gui_drag": {
              const cursorBin = path.resolve(process.cwd(), "scripts/cursor_ctrl");
              const sx = Number(args.startX ?? args.start_x ?? 0);
              const sy = Number(args.startY ?? args.start_y ?? 0);
              const ex = Number(args.endX ?? args.end_x ?? 0);
              const ey = Number(args.endY ?? args.end_y ?? 0);
              spawnSync(cursorBin, ["drag", String(sx), String(sy), String(ex), String(ey)]);
              result = { success: true, message: `Dragged from (${sx}, ${sy}) to (${ex}, ${ey})` };
              break;
            }

            case "capture_screen": {
              const outputPath = String(args.outputPath || "/tmp/aeio_screenshot.png");
              spawnSync("screencapture", ["-x", outputPath]);
              result = { filePath: outputPath };
              break;
            }

            case "capture_screen_data": {
              const tmpPath = "/tmp/aeio_screen_capture.png";
              spawnSync("screencapture", ["-x", tmpPath]);
              let width = 1920;
              let height = 1080;
              try {
                const sipsOut = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", tmpPath], { encoding: "utf-8" });
                const wMatch = sipsOut.stdout.match(/pixelWidth:\s*(\d+)/);
                const hMatch = sipsOut.stdout.match(/pixelHeight:\s*(\d+)/);
                if (wMatch && wMatch[1]) width = parseInt(wMatch[1], 10);
                if (hMatch && hMatch[1]) height = parseInt(hMatch[1], 10);
              } catch {}
              let base64 = "";
              try {
                const buf = fs.readFileSync(tmpPath);
                base64 = buf.toString("base64");
              } catch {}
              result = {
                filePath: tmpPath,
                base64,
                width,
                height,
              };
              break;
            }

            default:
              result = { success: true, message: `Command ${cmd} handled by fallback` };
          }

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err?.message || "Failed to execute system action" }));
        }
      });
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
