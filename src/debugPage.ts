// Development-only view of what the watch receives; data is rendered with textContent only.
export const DEBUG_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SideKick debug</title>
<style>
  body{font:15px -apple-system,system-ui,sans-serif;background:#000;color:#eee;margin:0;padding:16px}
  .card{max-width:340px;background:#1c1c1e;border-radius:22px;padding:16px;margin:12px 0}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#8e8e93;font-size:13px} .row{margin-top:10px}
  .owe{color:#ff9f0a} .they{color:#64d2ff} button{margin:8px 6px 0 0;padding:8px 12px;border-radius:12px;border:0}
  input{padding:6px;border-radius:8px;border:0;width:260px}
</style></head><body>
<div id="auth"><input id="token" type="password" placeholder="SIDEKICK_TOKEN"><button id="save">Connect</button></div>
<div id="status" class="muted">Disconnected</div>
<div id="card" class="card" hidden></div>
<div id="followup" class="card" hidden></div>
<script>
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("sk-token") || "";
let version = -1;
$("save").onclick = () => { token = $("token").value.trim(); sessionStorage.setItem("sk-token", token); version = -1; };
const api = (path, body) => fetch(path, { method: body ? "POST" : "GET",
  headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
function button(label, fn) { const b = el("button", label); b.onclick = fn; return b; }
function render(s) {
  const c = s.card, root = $("card");
  root.replaceChildren(); root.hidden = !c;
  if (c) {
    const name = c.person ? c.person.name : (c.inferredName || "Listening…");
    root.append(el("h1", name));
    const sub = [c.person && c.person.role, c.person && c.person.org].filter(Boolean).join(" · ");
    if (sub) root.append(el("div", sub, "muted"));
    root.append(el("div", (c.confirmed ? "Confirmed" : "Confidence " + Math.round(c.confidence * 100) + "%"), "muted"));
    if (c.howYouMet) root.append(el("div", "Met: " + c.howYouMet, "row"));
    if (c.lastSpoke) root.append(el("div", "Last: " + c.lastSpoke.when + " — " + c.lastSpoke.topic, "row"));
    for (const l of c.openLoops) root.append(el("div", (l.direction === "you_owe" ? "⚠ You owe: " : "↩ They owe: ") + l.text, "row " + (l.direction === "you_owe" ? "owe" : "they")));
    for (const d of c.dontForget) root.append(el("div", "Raise: " + d, "row"));
    for (const a of c.avoid) root.append(el("div", "Avoid: " + a, "row muted"));
    if (!c.confirmed && name !== "Listening…") {
      root.append(button("Yes, it's " + name, () => api("/api/confirm", c.person ? { conversationUuid: c.conversationUuid, personId: c.person.id } : { conversationUuid: c.conversationUuid, name }).then(render)));
      root.append(button("Not them", () => api("/api/reject", { conversationUuid: c.conversationUuid, name }).then(render)));
    }
  }
  const f = s.followUp, fu = $("followup");
  fu.replaceChildren(); fu.hidden = !f;
  if (f) {
    fu.append(el("div", "Follow-up", "muted"), el("div", f.text, "row"));
    fu.append(button("Add to Bee", () => api("/api/followups/" + f.id + "/approve", {}).then(() => (version = -1))));
    fu.append(button("Dismiss", () => api("/api/followups/" + f.id + "/dismiss", {}).then(render)));
  }
}
async function loop() {
  while (true) {
    if (!token) { await new Promise((r) => setTimeout(r, 500)); continue; }
    try {
      const s = await api("/api/state?since=" + version + "&wait=25");
      if (s.error) throw new Error(s.error);
      $("status").textContent = "Connected · v" + s.version; version = s.version; render(s);
    } catch (e) { $("status").textContent = "Error: " + e.message; await new Promise((r) => setTimeout(r, 2000)); }
  }
}
loop();
</script></body></html>`;
