# Electron + Go PoC

A minimal hello-world to understand how an Electron desktop app and a Go backend talk to each other using the **sidecar pattern**.

One button → one request flowing through every layer of the architecture.

## What this demonstrates

```
┌─────────────────────────────┐
│ Renderer (Chromium window)  │  renderer/index.html + renderer.js
│   window.api.greet("Aditi") │
└─────────────┬───────────────┘
              │  IPC (ipcRenderer.invoke)
┌─────────────▼───────────────┐
│ preload.js                  │  exposes window.api.* via contextBridge
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────┐
│ Main process (Node)         │  main.js
│   spawns Go on launch       │
│   forwards IPC → HTTP       │
└─────────────┬───────────────┘
              │  HTTP + Bearer token over 127.0.0.1
┌─────────────▼───────────────┐
│ Go sidecar                  │  go-backend/main.go
│   ephemeral port            │
│   announces port on stdout  │
└─────────────────────────────┘
```

The five concepts the PoC makes concrete:

1. **Spawn** — Electron's main process launches Go as a child via `child_process.spawn`.
2. **Port discovery** — Go binds to an ephemeral port and prints `{"port": N}` on stdout; Electron reads it.
3. **Bearer token** — Electron generates a per-launch secret, passes it to Go via env var, sends it on every request.
4. **IPC boundary** — `preload.js` defines the only API the renderer can call. The renderer never knows Go exists.
5. **Lifecycle** — `before-quit` kills the Go child cleanly. Crashes are surfaced via the `status` IPC call.

## Prerequisites

- **Node.js 20+** (Electron ships its own Node, but you need this for `npm install`)
- **Go 1.21+** (just `go` on your PATH; no extra modules needed — stdlib only)

Check:

```bash
node --version    # v20.x or later
go version        # go1.21 or later
```

## Run it

```bash
cd /Users/chauhan/Desktop/Open-Source/ao-learnings/electron-go-poc
npm install
npm start
```

First launch takes ~3-5 seconds because `go run` compiles before starting. Subsequent launches reuse Go's build cache and are faster.

A window opens. Type a name, click **Greet**, see Go's response.

## What to look for

Open the Electron DevTools (View → Toggle Developer Tools) and the terminal where you ran `npm start`. You'll see:

- Terminal: `[go] {"port": 54321}` — Go announcing its port
- Terminal: `[main] Go backend ready at http://127.0.0.1:54321`
- DevTools console: nothing (renderer is silent unless something fails)
- Click Greet → response shows the JSON from Go, including its PID

Now kill the Go process from another terminal (`pkill -f "go-backend"` or find the PID and `kill` it). Click Greet again — you'll see an error. Quit Electron — the kill on `before-quit` is now a no-op because Go is already gone.

## Files, in suggested reading order

| File | Read it for |
|------|-------------|
| `main.js` | The whole story in one file. Spawn, port discovery, IPC handlers, cleanup. |
| `go-backend/main.go` | How Go binds to an ephemeral port, announces it, and gates requests with a token. |
| `preload.js` | The smallest file. The renderer-facing contract. |
| `renderer/renderer.js` | What the React code (or any UI code) would look like — it just calls `window.api.*`. |
| `renderer/index.html` | Markup + minimal CSS. Nothing exotic. |

## What's intentionally NOT here

This is a 10-minute PoC, not a production app. Things you'd add next:

- **WebSocket / server push** — for streaming events (terminal data, session updates). The HTTP pattern here covers request/response only.
- **Pre-built Go binary** — we use `go run` for ease. Production ships a compiled binary via `electron-builder`'s `extraResources`.
- **Code signing & notarization** — required for macOS distribution.
- **Restart-on-crash** — if Go dies, the UI hangs on the next call. Real apps watch the child and restart with backoff.
- **PID file / orphan cleanup** — to handle Electron crashing mid-session and leaving Go behind on disk.
- **React** — the renderer is plain JS so every file fits in your head. In the real migration, this layer is the existing Next.js / React tree.
- **Typed IPC** — `window.api` is currently untyped. In TS, you'd declare an interface and share it between preload and renderer.

## See also

- `../github-gist/electron-go-onepager.html` — the architecture one-pager that motivated this PoC.
