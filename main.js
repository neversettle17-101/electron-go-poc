// Electron main process.
//
// Responsibilities:
//   1. Spawn the Go sidecar as a child process
//   2. Read the port Go chose (ephemeral, printed on stdout)
//   3. Pass a per-launch bearer token to Go via env var
//   4. Expose IPC handlers the renderer can call via window.api.*
//   5. Tear Go down cleanly when the app quits

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");

let goProcess = null;
let goEndpoint = null; // e.g. "http://127.0.0.1:54321"
let goToken = null;

// ---------- Spawn the Go sidecar ----------

function spawnGoBackend() {
  return new Promise((resolve, reject) => {
    // Per-launch secret. Even on localhost, anyone can hit the port — the
    // token gates access. Same mechanism extends to remote-Go later.
    goToken = crypto.randomBytes(16).toString("hex");

    // `go run` is fine for a PoC. In production you'd ship a pre-built binary
    // bundled into the Electron app (electron-builder's extraResources).
    const proc = spawn("go", ["run", "./go-backend"], {
      cwd: __dirname,
      env: { ...process.env, AO_TOKEN: goToken },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[go] ${text}`);

      // Go announces its port as JSON on stdout: {"port": 54321}
      const match = text.match(/\{"port":\s*(\d+)\}/);
      if (match && !goEndpoint) {
        goEndpoint = `http://127.0.0.1:${match[1]}`;
        resolve();
      }
    });

    proc.stderr.on("data", (chunk) => {
      process.stderr.write(`[go err] ${chunk}`);
    });

    proc.on("exit", (code) => {
      console.log(`[go] process exited with code ${code}`);
      goProcess = null;
      goEndpoint = null;
    });

    proc.on("error", reject);

    goProcess = proc;

    // Safety net: if Go never announces a port, give up rather than hang.
    setTimeout(() => {
      if (!goEndpoint) reject(new Error("Go backend did not announce a port within 5s"));
    }, 5000);
  });
}

// ---------- IPC handlers (the "renderer-facing contract") ----------

ipcMain.handle("greet", async (_event, name) => {
  if (!goEndpoint) throw new Error("Go backend not ready");
  const res = await fetch(`${goEndpoint}/greet?name=${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${goToken}` },
  });
  if (!res.ok) throw new Error(`Go returned ${res.status}`);
  return res.json();
});

ipcMain.handle("status", async () => ({
  endpoint: goEndpoint,
  alive: goProcess !== null,
}));

// ---------- Window + app lifecycle ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 480,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // renderer sandboxed; only window.api is exposed
      nodeIntegration: false,
    },
  });
  win.loadFile("renderer/index.html");
}

app.whenReady().then(async () => {
  try {
    await spawnGoBackend();
    console.log(`[main] Go backend ready at ${goEndpoint}`);
    createWindow();
  } catch (err) {
    console.error("[main] Failed to start Go backend:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());

// Kill the Go child before Electron exits.
app.on("before-quit", () => {
  if (goProcess) {
    console.log("[main] killing Go backend");
    goProcess.kill();
  }
});
