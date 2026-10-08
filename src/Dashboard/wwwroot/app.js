// Single-page dashboard. Loads the latest snapshot and the change log once,
// then renders each screen from the URL hash (#/servers/MGMT-01, #/camera/<id>, ...).

const state = { inventory: null, changes: [] };
const $view = document.getElementById("view");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const when = d => new Date(d).toLocaleString();
const dot = online => `<span class="dot ${online ? "" : "off"}"></span>`;

const TYPE = { Added: "added", Removed: "removed", WentOffline: "went offline", BackOnline: "back online", PossibleReplacement: "possibly replaced (guess)" };
const KIND = { Camera: "Camera", RecordingServer: "Recording server" };

const byId = (list, id) => list.find(x => x.id === id);
const camsOn = recId => state.inventory.cameras.filter(c => c.recordingServerId === recId);
const recsOn = mgmtId => state.inventory.recordingServers.filter(r => r.managementServerId === mgmtId);

function bar(on, total) {
  const off = total - on, pct = total ? (on / total) * 100 : 0;
  return `<div class="bar"><i class="on" style="width:${pct}%"></i><i class="off" style="width:${100 - pct}%"></i></div>
    <div class="legend"><b class="g">Online ${on}</b> · <b class="r">Offline ${off}</b> · ${total} total</div>`;
}

const recName = id => byId(state.inventory.recordingServers, id)?.name ?? id;
const replacedName = id => state.changes.find(x => x.id === id && x.type === "Removed")?.name ?? id;

function changeLink(e) {
  return e.kind === "Camera" ? `#/camera/${enc(e.id)}` : `#/recording/${enc(e.id)}`;
}

function changeList(events, limit) {
  if (!events.length) return `<p class="empty">No changes.</p>`;
  const shown = limit ? events.slice(0, limit) : events;
  return `<ul class="log">${shown.map(e => `
    <li class="${e.type}"><a href="${changeLink(e)}">
      <div><strong>${KIND[e.kind]} ${TYPE[e.type]}</strong>: ${esc(e.name)}
        ${e.replacedId ? `<div class="note">Possibly replaces ${esc(replacedName(e.replacedId))}</div>` : ""}</div>
      <div class="note">${when(e.detectedAt)} · ${esc(e.managementServerId)}${e.recordingServerId ? " · " + esc(recName(e.recordingServerId)) : ""}</div>
    </a></li>`).join("")}</ul>`;
}

function cameraTable(cams, limit = 200) {
  if (!cams.length) return `<p class="empty">No cameras match.</p>`;
  const rows = cams.slice(0, limit).map(c => {
    const rec = byId(state.inventory.recordingServers, c.recordingServerId);
    return `<tr class="link" onclick="location.hash='#/camera/${enc(c.id)}'">
      <td>${dot(c.online)}${esc(c.name)}</td><td>${esc(c.model)}</td><td>${esc(c.ipAddress)}</td>
      <td>${esc(rec?.name ?? c.recordingServerId)}</td><td>${esc(c.managementServerId)}</td></tr>`;
  }).join("");
  const more = cams.length > limit ? `<div class="more">Showing ${limit} of ${cams.length}. Narrow the search to see more.</div>` : "";
  return `<table><thead><tr><th>Camera</th><th>Model</th><th>IP</th><th>Recording server</th><th>Mgmt</th></tr></thead><tbody>${rows}</tbody></table>${more}`;
}

// ---- Screens ----

function overview() {
  const { managementServers: ms, recordingServers: rs, cameras: cs } = state.inventory;
  const recOn = rs.filter(r => r.online).length, camOn = cs.filter(c => c.online).length;
  const offlineRecs = rs.filter(r => !r.online);
  return `
    <h1>Environment overview</h1>
    <p class="sub">Status across all management servers</p>
    <div class="tiles">
      <a class="card" href="#/servers"><div class="label">Management servers</div><div class="big">${ms.length}</div><div class="note">${[...new Set(ms.map(m => m.version).filter(Boolean))].join(", ")}</div></a>
      <a class="card" href="#/servers"><div class="label">Recording servers</div><div class="big">${rs.length}</div><div class="note">${recOn} online</div></a>
      <a class="card" href="#/cameras"><div class="label">Cameras</div><div class="big">${cs.length}</div><div class="note">${camOn} online</div></a>
      <a class="card" href="#/cameras?status=offline"><div class="label">Cameras offline</div><div class="big ${cs.length - camOn ? "bad" : ""}">${cs.length - camOn}</div><div class="note">Click to see which</div></a>
    </div>
    <div class="grid2">
      <div class="card"><h2>Recording servers</h2>${bar(recOn, rs.length)}
        ${offlineRecs.length ? `<div class="note" style="margin-top:10px">Offline: ${offlineRecs.map(r => `<a style="color:var(--bad)" href="#/recording/${enc(r.id)}">${esc(r.name)}</a>`).join(", ")}</div>` : ""}</div>
      <div class="card"><h2>Cameras</h2>${bar(camOn, cs.length)}</div>
    </div>
    <h2>Latest changes</h2>
    ${changeList(state.changes, 8)}
    ${state.changes.length > 8 ? `<a class="btn" href="#/changes">See all ${state.changes.length} changes</a>` : ""}`;
}

function servers() {
  const cards = state.inventory.managementServers.map(m => {
    const recs = recsOn(m.id), cams = state.inventory.cameras.filter(c => c.managementServerId === m.id);
    const on = cams.filter(c => c.online).length;
    return `<a class="card" href="#/servers/${enc(m.id)}">
      <div class="label">Management server</div><h2 style="margin:4px 0">${esc(m.name)}</h2>
      <div class="note">${esc(m.version ?? "")} · ${recs.length} recording servers (${recs.filter(r => r.online).length} online)</div>
      ${bar(on, cams.length)}</a>`;
  }).join("");
  return `<h1>Servers</h1><p class="sub">Click a management server to see its recording servers</p><div class="cards">${cards}</div>`;
}

function managementServer(id, params) {
  const m = byId(state.inventory.managementServers, id);
  if (!m) return notFound("Management server", id);
  const filter = params.get("status") ?? "all", q = (params.get("q") ?? "").toLowerCase();
  const recs = recsOn(id)
    .filter(r => filter === "all" || (filter === "online") === r.online)
    .filter(r => !q || r.name.toLowerCase().includes(q) || (r.hostName ?? "").toLowerCase().includes(q));
  const cards = recs.map(r => {
    const cams = camsOn(r.id), on = cams.filter(c => c.online).length;
    return `<a class="card" href="#/recording/${enc(r.id)}">
      <div>${dot(r.online)}<strong>${esc(r.name)}</strong><span class="note" style="float:right">${cams.length} cams</span></div>
      <div class="note">${esc(r.hostName ?? "")}</div>${bar(on, cams.length)}</a>`;
  }).join("");
  return `
    <div class="crumbs"><a href="#/servers">Servers</a> / ${esc(m.name)}</div>
    <h1>${esc(m.name)}</h1><p class="sub">Recording servers on this management server</p>
    <div class="toolbar">
      ${segment(["all", "online", "offline"], filter, "status")}
      <input placeholder="Search recording servers…" value="${esc(params.get("q") ?? "")}" oninput="setParam('q', this.value)">
    </div>
    ${cards ? `<div class="cards">${cards}</div>` : `<p class="empty">No recording servers match.</p>`}`;
}

function recordingServer(id) {
  const r = byId(state.inventory.recordingServers, id);
  const history = state.changes.filter(e => e.id === id);
  if (!r) return notFound("Recording server", id) + `<h2>History</h2>${changeList(history)}`;
  const m = byId(state.inventory.managementServers, r.managementServerId);
  const cams = camsOn(id);
  return `
    <div class="crumbs"><a href="#/servers">Servers</a> / <a href="#/servers/${enc(r.managementServerId)}">${esc(m?.name ?? r.managementServerId)}</a> / ${esc(r.name)}</div>
    <h1>${dot(r.online)}${esc(r.name)}</h1><p class="sub">${esc(r.hostName ?? "")} · ${r.online ? "Online" : "Offline"}</p>
    <div class="card" style="margin-bottom:20px"><h2>Cameras</h2>${bar(cams.filter(c => c.online).length, cams.length)}</div>
    ${cameraTable(cams)}
    <h2 style="margin-top:20px">Changes on this recording server</h2>
    ${changeList(state.changes.filter(e => e.id === id || e.recordingServerId === id))}`;
}

function cameras(params) {
  const filter = params.get("status") ?? "all", mgmt = params.get("mgmt") ?? "", q = (params.get("q") ?? "").toLowerCase();
  const cams = state.inventory.cameras
    .filter(c => filter === "all" || (filter === "online") === c.online)
    .filter(c => !mgmt || c.managementServerId === mgmt)
    .filter(c => !q || [c.name, c.ipAddress, c.macAddress, c.model].some(v => (v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => a.online - b.online || a.name.localeCompare(b.name));
  const mgmtOptions = state.inventory.managementServers.map(m => `<option value="${esc(m.id)}" ${m.id === mgmt ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  return `
    <h1>Cameras</h1><p class="sub">${cams.length} of ${state.inventory.cameras.length} cameras · offline first</p>
    <div class="toolbar">
      ${segment(["all", "online", "offline"], filter, "status")}
      <select onchange="setParam('mgmt', this.value)"><option value="">All management servers</option>${mgmtOptions}</select>
      <input placeholder="Search name, IP, MAC, model…" value="${esc(params.get("q") ?? "")}" oninput="setParam('q', this.value)">
    </div>
    ${cameraTable(cams)}`;
}

function camera(id) {
  const c = byId(state.inventory.cameras, id);
  const history = state.changes.filter(e => e.id === id || e.replacedId === id);
  if (!c) return `<div class="crumbs"><a href="#/cameras">Cameras</a> / ${esc(id)}</div>
    <h1><span class="dot gone"></span>${esc(history[0]?.name ?? id)}</h1>
    <p class="sub">Not in the latest snapshot (removed or replaced)</p><h2>Change history</h2>${changeList(history)}`;
  const r = byId(state.inventory.recordingServers, c.recordingServerId);
  return `
    <div class="crumbs"><a href="#/cameras">Cameras</a> / ${esc(c.name)}</div>
    <h1>${dot(c.online)}${esc(c.name)}</h1><p class="sub">${c.online ? "Online" : "Offline"}</p>
    <div class="card" style="margin-bottom:20px"><h2>Camera information</h2>
      <dl class="info">
        <div><dt>Model</dt><dd>${esc(c.model ?? "–")}</dd></div>
        <div><dt>IP address</dt><dd>${esc(c.ipAddress ?? "–")}</dd></div>
        <div><dt>MAC address</dt><dd>${esc(c.macAddress ?? "–")}</dd></div>
        <div><dt>Firmware</dt><dd>${esc(c.firmware ?? "–")}</dd></div>
        <div><dt>Recording server</dt><dd><a style="color:var(--ok)" href="#/recording/${enc(c.recordingServerId)}">${esc(r?.name ?? c.recordingServerId)}</a></dd></div>
        <div><dt>Management server</dt><dd><a style="color:var(--ok)" href="#/servers/${enc(c.managementServerId)}">${esc(c.managementServerId)}</a></dd></div>
      </dl></div>
    <h2>Change history</h2>${changeList(history)}`;
}

function changes(params) {
  const type = params.get("type") ?? "", mgmt = params.get("mgmt") ?? "", q = (params.get("q") ?? "").toLowerCase();
  const list = state.changes
    .filter(e => !type || e.type === type)
    .filter(e => !mgmt || e.managementServerId === mgmt)
    .filter(e => !q || e.name.toLowerCase().includes(q) || (e.recordingServerId ?? "").toLowerCase().includes(q));
  const typeOptions = Object.entries(TYPE).map(([k, v]) => `<option value="${k}" ${k === type ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("");
  const mgmtOptions = state.inventory.managementServers.map(m => `<option value="${esc(m.id)}" ${m.id === mgmt ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  return `
    <h1>Change history</h1><p class="sub">Added, removed, offline, back online and possible replacements</p>
    <div class="toolbar">
      <select onchange="setParam('type', this.value)"><option value="">All change types</option>${typeOptions}</select>
      <select onchange="setParam('mgmt', this.value)"><option value="">All management servers</option>${mgmtOptions}</select>
      <input placeholder="Search name or recording server…" value="${esc(params.get("q") ?? "")}" oninput="setParam('q', this.value)">
      <span class="spacer"></span><a class="btn" href="/api/changes.csv">Export CSV</a>
    </div>
    ${changeList(list)}`;
}

const notFound = (what, id) => `<h1>${what} not found</h1><p class="sub">${esc(id)} is not in the latest snapshot.</p>`;

function segment(values, current, param) {
  return `<span class="seg">${values.map(v =>
    `<button class="${v === current ? "on" : ""}" onclick="setParam('${param}', '${v}')">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</span>`;
}

// ---- Routing ----

function parseHash() {
  const [path, query = ""] = location.hash.slice(1).split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query) };
}

// Updates a filter in the URL without losing focus on the search box.
function setParam(key, value) {
  const { parts, params } = parseHash();
  value ? params.set(key, value) : params.delete(key);
  const focused = document.activeElement?.tagName === "INPUT";
  history.replaceState(null, "", "#/" + parts.map(enc).join("/") + (params.toString() ? "?" + params : ""));
  render();
  if (focused) { const i = $view.querySelector("input"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

function render() {
  const { parts, params } = parseHash();
  const [page, id] = parts;
  const screens = {
    undefined: () => overview(),
    servers: () => id ? managementServer(id, params) : servers(),
    recording: () => recordingServer(id),
    cameras: () => cameras(params),
    camera: () => camera(id),
    changes: () => changes(params),
  };
  $view.innerHTML = (screens[page] ?? overview)();
  const section = { recording: "servers", camera: "cameras" }[page] ?? page ?? "";
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.dataset.nav === section));
}

async function load() {
  try {
    const [inv, ch] = await Promise.all([fetch("/api/inventory"), fetch("/api/changes")]);
    if (!inv.ok) throw new Error("No snapshot data yet");
    state.inventory = await inv.json();
    state.changes = await ch.json();
    document.getElementById("snapshot-info").textContent = `Snapshot: ${when(state.inventory.takenAt)} (sample data)`;
    render();
  } catch (err) {
    $view.innerHTML = `<h1>Can't load data</h1><p class="sub">${esc(err.message)}</p>`;
  }
}

window.addEventListener("hashchange", render);
load();
