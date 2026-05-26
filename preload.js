// Preload script — runs in a privileged context inside the renderer process
// BEFORE any page JS. It's the ONLY place we're allowed to expose Node-side
// capabilities to the (sandboxed) renderer.
//
// Whatever we attach to window via contextBridge becomes the entire surface
// the React code (or here, plain JS) can call. Think of it as the typed API
// definition between renderer and main.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  greet: (name) => ipcRenderer.invoke("greet", name),
  status: () => ipcRenderer.invoke("status"),
});
