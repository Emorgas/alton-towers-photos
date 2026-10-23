// Alton Towers ride photos — static site logic.
// Data: data/photos.json (id, file, year, label, ride, drive)
// Shared tags: data/tags.json ({ people: [...], tags: { photoId: [names] }, rideFixes: { photoId: ride } })
// Local edits (this browser only) live in localStorage and override the shared file.
// Export downloads a merged tags.json — send it to Stephen to bake into the site for everyone.

const LS_KEY = "at-photos-local-v1";
let PHOTOS = [];
let shared = { people: [], tags: {}, rideFixes: {} };
let local = loadLocal();
const state = { view: "all", years: new Set(), rides: new Set(), people: new Set(), tagMode: false, compareRide: null, lbIndex: -1, visible: [] };

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(local)); }

function people() {
  const all = new Set([...(shared.people || []), ...(local.people || [])]);
  Object.values(mergedTags()).forEach(names => names.forEach(n => all.add(n)));
  return [...all].sort((a, b) => a.localeCompare(b));
}
function mergedTags() {
  const out = {};
  for (const [k, v] of Object.entries(shared.tags || {})) out[k] = [...v];
  for (const [k, v] of Object.entries(local.tags || {})) out[k] = [...v];
  return out;
}
function rideOf(p) { return (local.rideFixes && local.rideFixes[p.id]) || (shared.rideFixes && shared.rideFixes[p.id]) || p.ride; }
function tagsOf(p) { return mergedTags()[p.id] || []; }

const $ = s => document.querySelector(s);
const main = $("#main");

async function boot() {
  PHOTOS = await (await fetch("data/photos.json")).json();
  try { shared = await (await fetch("data/tags.json")).json(); } catch { /* first run */ }
  buildStats(); buildFilters(); render();
}
function buildStats() {
  const years = [...new Set(PHOTOS.map(p => p.year))].sort();
  const rides = new Set(PHOTOS.map(p => rideOf(p)));
  $("#stats").innerHTML = [
    `<span class="stat"><b>${PHOTOS.length}</b> photos</span>`,
    `<span class="stat"><b>${years.length}</b> trips — ${years.join(" · ")}</span>`,
    `<span class="stat"><b>${rides.size}</b> rides &amp; attractions</span>`,
    `<span class="stat"><b>${Object.keys(mergedTags()).length}</b> photos tagged</span>`
  ].join("");
}
function chip(label, pressed, cls = "", count) {
  const b = document.createElement("button");
  b.className = "chip " + cls; b.setAttribute("aria-pressed", pressed);
  b.innerHTML = count != null ? `${label} <span class="n">${count}</span>` : label;
  return b;
}
function buildFilters() {
  const yr = $("#yearRow"); yr.querySelectorAll(".chip").forEach(c => c.remove());
  [...new Set(PHOTOS.map(p => p.year))].sort().forEach(y => {
    const c = chip(String(y), state.years.has(y), "", PHOTOS.filter(p => p.year === y).length);
    c.onclick = () => { toggle(state.years, y); buildFilters(); render(); };
    yr.appendChild(c);
  });
  const rr = $("#rideRow"); rr.querySelectorAll(".chip").forEach(c => c.remove());
  [...new Set(PHOTOS.map(p => rideOf(p)))].sort().forEach(r => {
    const c = chip(r, state.rides.has(r), "", PHOTOS.filter(p => rideOf(p) === r).length);
    c.onclick = () => { toggle(state.rides, r); buildFilters(); render(); };
    rr.appendChild(c);
  });
  const pr = $("#peopleRow"); pr.querySelectorAll(".chip").forEach(c => c.remove());
  const folks = people();
  $("#peopleHint").hidden = folks.length > 0;
  const counts = {}; Object.values(mergedTags()).flat().forEach(n => counts[n] = (counts[n] || 0) + 1);
  folks.forEach(name => {
    const c = chip(name, state.people.has(name), "person", counts[name] || 0);
    c.onclick = () => { toggle(state.people, name); buildFilters(); render(); };
    pr.appendChild(c);
  });
  const sel = $("#compareSelect");
  sel.innerHTML = "";
  [...new Set(PHOTOS.map(p => rideOf(p)))].sort().forEach(r => {
    const o = document.createElement("option"); o.value = r; o.textContent = r; sel.appendChild(o);
  });
  if (!state.compareRide || !sel.querySelector(`option[value="${CSS.escape(state.compareRide)}"]`)) state.compareRide = sel.value;
  sel.value = state.compareRide;
}
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

function filtered(list) {
  return list.filter(p =>
    (state.years.size === 0 || state.years.has(p.year)) &&
    (state.rides.size === 0 || state.rides.has(rideOf(p))) &&
    (state.people.size === 0 || [...state.people].every(n => tagsOf(p).includes(n)))
  );
}
function burstMembers(p) { return p.burst ? PHOTOS.filter(x => x.burst === p.burst) : [p]; }
function card(p) {
  const f = document.createElement("figure");
  f.className = "card";
  const tags = tagsOf(p);
  const bs = burstMembers(p).length;
  const sub = [p.count ? `${p.count} rider${p.count === 1 ? "" : "s"}` : "", bs > 1 ? `burst of ${bs}` : ""].filter(Boolean).join(" · ");
  f.innerHTML = `<img loading="lazy" src="photos/${p.file}" alt="${rideOf(p)} ride photo, ${p.label}">
    <figcaption><div class="t"><span class="ride">${rideOf(p)}</span><span class="year">${p.label}</span></div>
    ${sub ? `<div class="hint">${sub}</div>` : ""}
    <div class="tags">${tags.length ? tags.map(n => `<span class="ptag">${n}</span>`).join("") : `<span class="ptag none">untagged</span>`}</div></figcaption>`;
  f.onclick = () => openLightbox(p.id);
  return f;
}
function render() {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-pressed", t.dataset.view === state.view));
  $("#compareRow").hidden = state.view !== "compare";
  main.innerHTML = "";
  let list = PHOTOS;

  if (state.view === "compare") {
    const ride = state.compareRide;
    list = PHOTOS.filter(p => rideOf(p) === ride);
    state.visible = filtered(list);
    const head = document.createElement("h2"); head.className = "viewhead";
    head.innerHTML = `${ride} <span class="sub">— the same ride on every trip we have it</span>`;
    main.appendChild(head);
    const cols = document.createElement("div"); cols.className = "years";
    [...new Set(PHOTOS.map(p => p.year))].sort().forEach(y => {
      const col = document.createElement("section"); col.className = "yearcol";
      col.innerHTML = `<h3>${y}</h3>`;
      const inYear = state.visible.filter(p => p.year === y);
      if (!inYear.length) col.insertAdjacentHTML("beforeend", `<div class="empty">No ${ride} photo this year</div>`);
      inYear.forEach(p => col.appendChild(card(p)));
      cols.appendChild(col);
    });
    main.appendChild(cols);
  } else if (state.view === "ride" || state.view === "year") {
    state.visible = filtered(list);
    const key = state.view === "ride" ? p => rideOf(p) : p => p.label;
    const groups = new Map();
    state.visible.forEach(p => { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
    const order = state.view === "ride" ? [...groups.keys()].sort() : [...groups.keys()].sort().reverse();
    order.forEach(k => {
      const g = document.createElement("section"); g.className = "ridegroup";
      const items = groups.get(k);
      if (state.view === "ride") items.sort((a, b) => a.year - b.year);
      g.innerHTML = `<h2>${k} <span class="sub">${items.length} photo${items.length === 1 ? "" : "s"}${state.view === "ride" ? " · " + [...new Set(items.map(p => p.year))].sort().join(" / ") : ""}</span></h2>`;
      const strip = document.createElement("div"); strip.className = state.view === "ride" ? "strip" : "grid";
      items.forEach(p => strip.appendChild(card(p)));
      g.appendChild(strip); main.appendChild(g);
    });
    if (!groups.size) main.innerHTML = `<p class="hint">Nothing matches those filters yet.</p>`;
  } else {
    state.visible = filtered(list);
    const grid = document.createElement("div"); grid.className = "grid";
    state.visible.forEach(p => grid.appendChild(card(p)));
    main.appendChild(grid);
    if (!state.visible.length) main.innerHTML = `<p class="hint">Nothing matches those filters yet.</p>`;
  }
  $("#count").textContent = `${state.visible.length} of ${PHOTOS.length} photos`;
}

/* lightbox + tagging */
function openLightbox(id) {
  const idx = state.visible.findIndex(p => p.id === id);
  state.lbIndex = idx >= 0 ? idx : 0;
  showLb();
  $("#lightbox").hidden = false;
}
function showLb() {
  const p = state.visible[state.lbIndex]; if (!p) return;
  $("#lbImg").src = `photos/${p.file}`;
  $("#lbImg").alt = `${rideOf(p)} ride photo, ${p.label}`;
  $("#lbTitle").textContent = rideOf(p);
  $("#lbMeta").textContent = `${p.label} · ${p.originalName}`;
  $("#lbDrive").href = p.drive || "#";
  $("#lbRideEditWrap").hidden = !state.tagMode;
  const sel = $("#lbRideEdit"); sel.innerHTML = "";
  [...new Set(PHOTOS.map(x => rideOf(x)))].sort().forEach(r => { const o = document.createElement("option"); o.value = r; o.textContent = r; sel.appendChild(o); });
  const other = document.createElement("option"); other.value = "__new"; other.textContent = "＋ Different ride…"; sel.appendChild(other);
  sel.value = rideOf(p);
  sel.onchange = () => {
    let r = sel.value;
    if (r === "__new") { r = prompt("Ride / attraction name for this photo:"); if (!r) { sel.value = rideOf(p); return; } }
    local.rideFixes = local.rideFixes || {}; local.rideFixes[p.id] = r; saveLocal();
    buildFilters(); render(); showLb();
  };
  // Seat guide + burst helper (data from the assisted tagging pass; positions/clothing only, no identities)
  const seatBox = $("#lbSeatBox");
  if (p.seats && p.seats.length) {
    seatBox.hidden = false;
    $("#lbSeats").innerHTML = p.seats.map(s => `<span class="ptag" style="background:rgba(255,158,69,.12);border-color:rgba(255,158,69,.4);color:#ffd9a8">${s.pos} — ${s.note}</span>`).join("");
    const members = burstMembers(p);
    $("#lbBurstHint").textContent = members.length > 1
      ? `Part of a burst of ${members.length} photos (same ride session${p.burstConfidence ? ", " + p.burstConfidence + " confidence" : ""}). Tag this one, then apply to the burst.`
      : "Single photo — no burst partners found.";
    $("#lbBurstRow").hidden = !(state.tagMode && members.length > 1);
    $("#lbBurstBtn").textContent = `Apply these names to the whole burst (${members.length} photos)`;
    $("#lbBurstBtn").onclick = () => {
      const names = tagsOf(p);
      if (!names.length) { alert("Tag at least one name on this photo first."); return; }
      local.tags = local.tags || {};
      members.forEach(m => { local.tags[m.id] = [...names]; });
      saveLocal(); buildStats(); buildFilters(); render(); showLb();
      alert(`Applied ${names.join(", ")} to ${members.length} photos in this burst. Check each one — you can untag anyone who is not actually in it.`);
    };
  } else { seatBox.hidden = true; }
  const who = $("#lbWho"); who.innerHTML = "";
  people().forEach(name => {
    const on = tagsOf(p).includes(name);
    const c = chip(name, on, "person");
    c.disabled = !state.tagMode;
    c.onclick = () => {
      const cur = new Set(tagsOf(p));
      cur.has(name) ? cur.delete(name) : cur.add(name);
      local.tags = local.tags || {}; local.tags[p.id] = [...cur]; saveLocal();
      buildStats(); buildFilters(); render(); showLb();
    };
    who.appendChild(c);
  });
  $("#lbTagHint").textContent = state.tagMode
    ? "Tap names to tag this photo. Saved on this device — Export tags (top of page) to share them with Stephen."
    : "Turn on Tag mode (top of the page) to edit these.";
}
function stepLb(d) { state.lbIndex = (state.lbIndex + d + state.visible.length) % state.visible.length; showLb(); }
$("#lbClose").onclick = () => { $("#lightbox").hidden = true; };
$("#lbPrev").onclick = () => stepLb(-1);
$("#lbNext").onclick = () => stepLb(1);
document.addEventListener("keydown", e => {
  if ($("#lightbox").hidden) return;
  if (e.key === "Escape") $("#lightbox").hidden = true;
  if (e.key === "ArrowLeft") stepLb(-1);
  if (e.key === "ArrowRight") stepLb(1);
});

/* controls */
document.querySelectorAll(".tab").forEach(t => t.onclick = () => { state.view = t.dataset.view; render(); });
$("#compareSelect").onchange = e => { state.compareRide = e.target.value; render(); };
$("#tagModeBtn").onclick = e => { state.tagMode = !state.tagMode; e.currentTarget.setAttribute("aria-pressed", state.tagMode); if (!$("#lightbox").hidden) showLb(); };
$("#addPersonBtn").onclick = () => {
  const name = prompt("Person's name (as it should appear on tags):");
  if (!name || !name.trim()) return;
  local.people = local.people || []; local.people.push(name.trim()); saveLocal();
  buildFilters(); if (!$("#lightbox").hidden) showLb();
};
$("#exportBtn").onclick = () => {
  const merged = { people: people(), tags: mergedTags(), rideFixes: { ...(shared.rideFixes || {}), ...(local.rideFixes || {}) } };
  const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tags.json"; a.click();
  URL.revokeObjectURL(a.href);
};
$("#importFile").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => { local = JSON.parse(t); saveLocal(); buildStats(); buildFilters(); render(); alert("Tags imported on this device."); });
};

boot();
