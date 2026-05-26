// Plain renderer JS. No React, no bundler. This is what runs inside the
// Chromium window. It can ONLY call functions exposed by preload.js
// (window.api.*) — it has no Node, no fs, no fetch-to-Go directly.

const $name = document.getElementById("name");
const $btn = document.getElementById("go");
const $out = document.getElementById("out");
const $status = document.getElementById("status");

$btn.addEventListener("click", async () => {
  $out.textContent = "loading…";
  try {
    const result = await window.api.greet($name.value || "World");
    $out.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    $out.textContent = `Error: ${err.message}`;
  }
});

(async () => {
  try {
    const s = await window.api.status();
    $status.textContent = `Backend: ${s.endpoint || "not connected"} · alive: ${s.alive}`;
  } catch (err) {
    $status.textContent = `Status error: ${err.message}`;
  }
})();
