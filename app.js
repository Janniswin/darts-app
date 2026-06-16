/* =========================================================
   FAMILY DARTS CHAMPIONSHIP
   Client-side app, data stored in localStorage
   ========================================================= */

const STORAGE_KEY = "fdc_players_v1";
const HISTORY_KEY = "fdc_matchhistory_v1";

let players = [];        // [{id, name, stats:{...}}]
let matchHistory = [];   // finished matches

let match = null;        // current match state

// ---------- Persistence ----------
function loadData() {
  players = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  matchHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
}
function savePlayers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}
function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(matchHistory));
}

function emptyStats() {
  return {
    legsPlayed: 0,
    legsWon: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    dartsThrown: 0,
    totalScored: 0,     // sum of all turn scores (for average)
    count140plus: 0,
    count100plus: 0,
    highestTurn: 0,
    checkoutsHit: 0,
    bestCheckout: 0,
    tripleCount: 0,      // triples from T10 upwards (T10..T20)
  };
}

function getPlayer(id) { return players.find(p => p.id === id); }

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Voice ----------
// Pure recorded-clip announcer - no synthetic/browser TTS voice anywhere.
// If a clip is missing for a given moment, the app simply stays silent
// rather than falling back to a robotic voice.
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Short click tone played on every number button press.
const _clickCtx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
function playClickTone() {
  if (!_clickCtx) return;
  const osc = _clickCtx.createOscillator();
  const gain = _clickCtx.createGain();
  osc.connect(gain);
  gain.connect(_clickCtx.destination);
  osc.frequency.value = 1000;
  gain.gain.setValueAtTime(0.18, _clickCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, _clickCtx.currentTime + 0.06);
  osc.start(_clickCtx.currentTime);
  osc.stop(_clickCtx.currentTime + 0.06);
}

function playClip(name) {
  const voiceOn = document.getElementById("voiceToggle").value === "on";
  if (!voiceOn) return false;
  try {
    const audio = new Audio(`voice/${name}`);
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

function announceScore(score) {
  playClip(`score_${score}.m4a`);
}

// Dedicated "overthrown" (bust) sound effect, separate from a plain 0 score.
function announceBust() {
  playClip("bust.m4a");
}

function announceCheckout(playerName) {
  playClip("win.m4a");
}

function announceMatchWin(playerName) {
  playClip("win.m4a");
}

// ---------- Navigation ----------
function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  // Hide the big top bar during a match so the board uses the whole screen.
  document.body.classList.toggle("in-game", view === "game");
  if (view === "stats") renderStats();
  if (view === "players") renderPlayerList();
  if (view === "setup") renderPlayerSelect();
}

document.getElementById("exitMatchBtn").addEventListener("click", () => switchView("setup"));

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ============================================================
// PLAYER MANAGEMENT
// ============================================================
function renderPlayerList() {
  const container = document.getElementById("playerList");
  container.innerHTML = "";
  if (players.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim)">No players added yet.</p>`;
    return;
  }
  players.forEach(p => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <span class="pname">${escapeHtml(p.name)}</span>
      <button class="premove" data-id="${p.id}">Remove</button>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll(".premove").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const p = getPlayer(id);
      if (confirm(`Really remove "${p.name}"? Stats stay in the match history.`)) {
        players = players.filter(pl => pl.id !== id);
        selectedPlayerIds.delete(id);
        savePlayers();
        renderPlayerList();
        renderPlayerSelect();
      }
    });
  });
}

document.getElementById("addPlayerForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("newPlayerName");
  const name = input.value.trim();
  if (!name) return;
  const newPlayer = { id: crypto.randomUUID(), name, stats: emptyStats() };
  players.push(newPlayer);
  selectedPlayerIds.add(newPlayer.id); // auto-select for the next match
  savePlayers();
  input.value = "";
  renderPlayerList();
  renderPlayerSelect();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// SETUP / PLAYER SELECTION
// ============================================================
let selectedPlayerIds = new Set();

function renderPlayerSelect() {
  const container = document.getElementById("playerSelectList");
  container.innerHTML = "";
  if (players.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim)">Please add players under "Players" first.</p>`;
    return;
  }
  players.forEach(p => {
    const chip = document.createElement("div");
    chip.className = "player-chip" + (selectedPlayerIds.has(p.id) ? " selected" : "");
    chip.textContent = p.name;
    chip.addEventListener("click", () => {
      if (selectedPlayerIds.has(p.id)) selectedPlayerIds.delete(p.id);
      else selectedPlayerIds.add(p.id);
      renderPlayerSelect();
    });
    container.appendChild(chip);
  });
}

document.getElementById("startMatchBtn").addEventListener("click", () => {
  if (selectedPlayerIds.size < 2) {
    showToast("Please select at least 2 players.");
    return;
  }
  const mode = parseInt(document.getElementById("modeSelect").value, 10);
  const finish = document.getElementById("finishSelect").value;
  const legsBestOf = parseInt(document.getElementById("legsSelect").value, 10);
  const ids = Array.from(selectedPlayerIds);

  startMatch(ids, mode, finish, legsBestOf);
  switchView("game");
});

// ============================================================
// DART INPUT PAD
// ============================================================
let currentModifier = "single"; // single | double | triple

function buildNumberGrid() {
  const grid = document.getElementById("numberGrid");
  grid.innerHTML = "";
  for (let n = 1; n <= 20; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "num-btn";
    btn.textContent = n;
    btn.addEventListener("click", () => { playClickTone(); handleNumberClick(n); });
    grid.appendChild(btn);
  }
  const bull = document.createElement("button");
  bull.type = "button";
  bull.className = "num-btn bull";
  bull.textContent = "25";
  bull.addEventListener("click", () => { playClickTone(); handleNumberClick(25); });
  grid.appendChild(bull);

  // Fuck (miss) and Undo sit right next to the 25 in the grid.
  const miss = document.createElement("button");
  miss.type = "button";
  miss.className = "num-btn miss-cell";
  miss.textContent = "FUCK";
  miss.addEventListener("click", () => { playClickTone(); onMiss(); });
  grid.appendChild(miss);

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "num-btn undo-cell";
  undo.textContent = "Undo";
  undo.addEventListener("click", onUndo);
  grid.appendChild(undo);
}

document.querySelectorAll(".mod-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    playClickTone();
    currentModifier = btn.dataset.mod;
    document.querySelectorAll(".mod-btn").forEach(b => b.classList.toggle("active", b === btn));
  });
});

function resetModifier() {
  currentModifier = "single";
  document.querySelectorAll(".mod-btn").forEach(b => b.classList.toggle("active", b.dataset.mod === "single"));
}

function handleNumberClick(number) {
  let mult = currentModifier === "double" ? 2 : currentModifier === "triple" ? 3 : 1;
  // Bullseye has no triple - cap at double (50)
  if (number === 25 && mult === 3) mult = 2;
  const value = number * mult;
  const isTriple = mult === 3;
  const isDouble = mult === 2;
  let label;
  if (number === 25) label = isDouble ? "BULL" : "25";
  else label = (isTriple ? "T" : isDouble ? "D" : "S") + number;

  submitDart({ value, label, isDouble, isTriple, number });
  resetModifier();
}

function onMiss() {
  submitDart({ value: 0, label: "MISS", isDouble: false, isTriple: false, number: 0 });
  resetModifier();
}

function onUndo() {
  if (!match || match.finished) return;
  if (match.undoStack.length === 0) {
    showToast("Nothing to undo in this leg.");
    return;
  }
  restoreLegState(match.undoStack.pop());
  resetModifier();
  document.getElementById("currentPlayerName").textContent = currentMatchPlayer().name;
  renderScoreboard();
  renderThrows();
  renderLegLog();
}

// ---------- Undo snapshots (within the current leg) ----------
// A snapshot captures every mutable bit of leg state so undo can step back
// through whole turns - even after the next player has started throwing.
function snapshotLegState() {
  return {
    players: match.players.map(p => ({
      remaining: p.remaining,
      currentLegTurns: p.currentLegTurns.slice(),
      tripleCount: p.tripleCount,
      out: p.out,
    })),
    currentPlayerIdx: match.currentPlayerIdx,
    currentThrows: match.currentThrows.slice(),
    legLog: match.legLog.slice(),
    legFinishOrder: match.legFinishOrder.slice(),
  };
}

function restoreLegState(s) {
  s.players.forEach((sp, i) => {
    match.players[i].remaining = sp.remaining;
    match.players[i].currentLegTurns = sp.currentLegTurns.slice();
    match.players[i].tripleCount = sp.tripleCount;
    match.players[i].out = sp.out;
  });
  match.currentPlayerIdx = s.currentPlayerIdx;
  match.currentThrows = s.currentThrows.slice();
  match.legLog = s.legLog.slice();
  match.legFinishOrder = s.legFinishOrder.slice();
}

function pushUndo() {
  match.undoStack.push(snapshotLegState());
  if (match.undoStack.length > 80) match.undoStack.shift();
}

// ============================================================
// GAME ENGINE (X01)
// ============================================================
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startMatch(playerIds, startScore, finishMode, legsBestOf) {
  const shuffledIds = shuffle(playerIds.slice());
  match = {
    startScore,
    finishMode,
    legsBestOf,
    legsToWin: Math.ceil(legsBestOf / 2),
    players: shuffledIds.map(id => ({
      id,
      name: getPlayer(id).name,
      remaining: startScore,
      legsWon: 0,
      turnHistory: [],     // per leg: array of turn totals
      currentLegTurns: [],
      tripleCount: 0,      // live triple counter (T10+) for this match
      out: false,          // already finished (checked out) this leg
    })),
    currentPlayerIdx: 0,
    legNumber: 1,
    currentThrows: [],     // up to 3 dart objects of the current turn
    legLog: [],
    legFinishOrder: [],    // player ids in the order they checked out this leg
    undoStack: [],         // per-dart snapshots for undo within a leg
    finished: false,
  };
  buildNumberGrid();
  resetModifier();
  renderScoreboard();
  renderThrows();
  document.getElementById("legHistory").innerHTML = "";
  updateLegLabel();
  document.getElementById("currentPlayerName").textContent = currentMatchPlayer().name;
}

function currentMatchPlayer() {
  return match.players[match.currentPlayerIdx];
}

function updateLegLabel() {
  document.getElementById("legCounter").textContent = match.legNumber;
  document.getElementById("legsLabel").textContent = `Best of ${match.legsBestOf} (to win: ${match.legsToWin})`;
}

function renderScoreboard() {
  const container = document.getElementById("scoreboard");
  container.innerHTML = "";
  // Always keep every player's score on a single row across the top.
  container.style.gridTemplateColumns = `repeat(${match.players.length}, 1fr)`;
  match.players.forEach((p, idx) => {
    const card = document.createElement("div");
    const finishedPlace = match.legFinishOrder.indexOf(p.id); // -1 if still in
    const isOut = p.out && finishedPlace >= 0;
    card.className = "player-card"
      + (idx === match.currentPlayerIdx && !isOut ? " active" : "")
      + (isOut ? " out" : "");
    const avg = computeLiveAverage(p);
    let pips = "";
    for (let i = 0; i < match.legsToWin; i++) {
      pips += `<span class="leg-pip ${i < p.legsWon ? "won" : ""}"></span>`;
    }
    // Players who already checked out this leg show their finishing place.
    const remainingDisplay = isOut
      ? `<div class="remaining done">${ordinal(finishedPlace + 1)}</div>`
      : `<div class="remaining">${p.remaining}</div>`;
    card.innerHTML = `
      <div class="name">${escapeHtml(p.name)}</div>
      ${remainingDisplay}
      <div class="meta">
        <div><strong>${avg}</strong>Avg</div>
        <div><strong>${p.tripleCount}</strong>Triples</div>
      </div>
      <div class="legs-won">${pips}</div>
    `;
    container.appendChild(card);
  });
}

function computeLiveAverage(matchPlayer) {
  const allTurns = matchPlayer.turnHistory.concat([matchPlayer.currentLegTurns]).flat();
  if (allTurns.length === 0) return "0.0";
  const sum = allTurns.reduce((a, b) => a + b, 0);
  return (sum / allTurns.length).toFixed(1);
}

function renderThrows() {
  const t = match.currentThrows;
  [1, 2, 3].forEach(n => {
    const box = document.getElementById("throw" + n);
    box.querySelector("strong").textContent = t[n - 1] ? t[n - 1].label : "-";
  });
  const total = t.reduce((a, b) => a + b.value, 0);
  document.getElementById("turnTotal").textContent = total;
  updateCheckoutHint();
}

// ---------- Checkout routes ----------
// Build every single-dart outcome once, grouped so we can search for a
// sensible finishing route (pro-style preference order).
const TRIPLES = [], SINGLES = [], DOUBLES = [];
for (let n = 20; n >= 1; n--) TRIPLES.push({ v: 3 * n, l: "T" + n });
for (let n = 20; n >= 1; n--) SINGLES.push({ v: n, l: "S" + n });
const BULL25 = { v: 25, l: "25" }, BULL50 = { v: 50, l: "Bull" };
[20, 16, 18, 12, 10, 14, 8, 4, 2, 6, 11, 19, 17, 15, 13, 9, 7, 5, 3, 1]
  .forEach(n => DOUBLES.push({ v: 2 * n, l: "D" + n }));
DOUBLES.push(BULL50);
// Setup darts (non-finishing): triples first, then bull/25, then singles.
const SETUPS = [...TRIPLES, BULL50, BULL25, ...SINGLES];
// For straight-out any dart can finish; prefer an exact single, then bull,
// then double, then triple.
const STRAIGHT_FIN = [...SINGLES, BULL25, BULL50, ...DOUBLES, ...TRIPLES];

function findRoute(rem, mode) {
  if (rem <= 1 && mode === "double") return null;
  if (rem <= 0 || rem > 170) return null;
  const finishers = mode === "double" ? DOUBLES : STRAIGHT_FIN;

  for (const f of finishers) if (f.v === rem) return [f];
  for (const s of SETUPS) {
    const r = rem - s.v;
    if (r <= 0) continue;
    for (const f of finishers) if (f.v === r) return [s, f];
  }
  for (const s1 of SETUPS) {
    if (rem - s1.v <= 0) continue;
    for (const s2 of SETUPS) {
      const r = rem - s1.v - s2.v;
      if (r <= 0) continue;
      for (const f of finishers) if (f.v === r) return [s1, s2, f];
    }
  }
  return null;
}

function updateCheckoutHint() {
  const el = document.getElementById("checkoutHint");
  if (!el || !match) return;
  const mp = currentMatchPlayer();
  const thrown = match.currentThrows.reduce((a, b) => a + b.value, 0);
  const rem = mp.remaining - thrown;
  const dartsLeft = 3 - match.currentThrows.length;

  const route = findRoute(rem, match.finishMode);
  if (route && route.length <= dartsLeft) {
    el.innerHTML = `<span class="co-label">Finish</span> ${route.map(d => `<b>${d.l}</b>`).join(" ")}`;
    el.classList.add("show");
  } else {
    el.textContent = "";
    el.classList.remove("show");
  }
}

function submitDart(dart) {
  if (!match || match.finished) return;
  if (match.currentThrows.length >= 3) return;

  // Snapshot BEFORE any mutation so undo can revert this exact dart -
  // including across the turn/player boundary it may trigger.
  pushUndo();

  const mp = currentMatchPlayer();

  // Triple counter (T10 and above)
  if (dart.isTriple && dart.number >= 10) {
    mp.tripleCount += 1;
  }

  match.currentThrows.push(dart);
  renderThrows();

  const turnScoreSoFar = match.currentThrows.reduce((a, b) => a + b.value, 0);
  const running = mp.remaining - turnScoreSoFar;
  const lastDart = dart;

  if (running < 0) {
    // BUST - turn ends immediately, score reverts
    endTurn(mp, true, turnScoreSoFar);
    return;
  }

  if (running === 0) {
    const validCheckout = match.finishMode === "straight" || lastDart.isDouble;
    if (validCheckout) {
      handleCheckout(mp, turnScoreSoFar);
      return;
    } else {
      // Reached zero without a double - bust
      endTurn(mp, true, turnScoreSoFar);
      return;
    }
  }

  if (running === 1 && match.finishMode === "double") {
    // Can never finish from 1 with double out - bust
    endTurn(mp, true, turnScoreSoFar);
    return;
  }

  if (match.currentThrows.length === 3) {
    // Turn complete, no bust
    mp.remaining = running;
    mp.currentLegTurns.push(turnScoreSoFar);
    announceScore(turnScoreSoFar);
    endTurnCleanup();
  }
  // else: wait for next dart
}

function endTurn(mp, isBust, turnScoreSoFar) {
  if (isBust) {
    mp.currentLegTurns.push(0);
    match.legLog.push(`${mp.name}: turn voided (bust) - stays on ${mp.remaining}`);
    announceBust();
  }
  endTurnCleanup();
}

function endTurnCleanup() {
  match.currentThrows = [];
  nextPlayer();
  renderScoreboard();
  renderThrows();
  renderLegLog();
}

function nextPlayer() {
  // Advance to the next player who has NOT already finished this leg.
  const n = match.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (match.currentPlayerIdx + i) % n;
    if (!match.players[idx].out) { match.currentPlayerIdx = idx; break; }
  }
  document.getElementById("currentPlayerName").textContent = currentMatchPlayer().name;
}

function ordinal(n) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function renderLegLog() {
  const container = document.getElementById("legHistory");
  container.innerHTML = "";
  match.legLog.slice(-6).reverse().forEach(line => {
    const div = document.createElement("div");
    div.className = "leg-history-item";
    div.innerHTML = `<span>${escapeHtml(line)}</span>`;
    container.appendChild(div);
  });
}

function handleCheckout(mp, turnScoreSoFar) {
  mp.currentLegTurns.push(turnScoreSoFar);
  mp.remaining = 0;
  mp.out = true;
  match.legFinishOrder.push(mp.id);
  const isLegWinner = match.legFinishOrder.length === 1;
  if (isLegWinner) {
    mp.legsWon += 1; // live (scoreboard) leg count
    const ws = getPlayer(mp.id)?.stats;
    if (ws) {
      ws.checkoutsHit += 1;
      if (turnScoreSoFar > ws.bestCheckout) ws.bestCheckout = turnScoreSoFar;
    }
    savePlayers();
    match.legLog.push(`🎯 ${mp.name} wins leg ${match.legNumber}!`);
    setTimeout(() => announceCheckout(mp.name), 1200);
  } else {
    const place = match.legFinishOrder.length; // 2nd, 3rd, ...
    match.legLog.push(`${mp.name} finishes ${ordinal(place)}.`);
    setTimeout(() => announcePlacement(mp.name, place), 1000);
  }

  // Anyone still playing? If 0 or 1 left, the leg is fully decided.
  const active = match.players.filter(p => !p.out);
  if (active.length <= 1) {
    if (active.length === 1) match.legFinishOrder.push(active[0].id); // last place
    finalizeLeg();
    return;
  }

  // Others keep playing for the next placement.
  match.currentThrows = [];
  nextPlayer();
  renderScoreboard();
  renderThrows();
  renderLegLog();
}

function finalizeLeg() {
  // Freeze turn history for averages
  match.players.forEach(p => p.turnHistory.push(p.currentLegTurns));

  // Credit persistent per-leg stats for every player
  match.players.forEach(p => {
    const realPlayer = getPlayer(p.id);
    if (!realPlayer) return;
    const s = realPlayer.stats;
    s.legsPlayed += 1;
    s.tripleCount += p.tripleCount;
    p.currentLegTurns.forEach(turnVal => {
      s.dartsThrown += 3;
      s.totalScored += turnVal;
      if (turnVal >= 140) s.count140plus += 1;
      else if (turnVal >= 100) s.count100plus += 1;
      if (turnVal > s.highestTurn) s.highestTurn = turnVal;
    });
  });
  const legWinnerId = match.legFinishOrder[0];
  const lwStats = getPlayer(legWinnerId)?.stats;
  if (lwStats) lwStats.legsWon += 1;
  savePlayers();

  // Finishing order of this leg drives the placement / standings.
  match.lastFinishOrder = match.legFinishOrder.slice();

  // Match decided?
  const matchWinner = match.players.find(p => p.legsWon >= match.legsToWin);
  if (matchWinner) { finishMatch(matchWinner); return; }

  // Prepare next leg
  match.legNumber += 1;
  match.players.forEach(p => {
    p.remaining = match.startScore;
    p.currentLegTurns = [];
    p.tripleCount = 0;
    p.out = false;
  });
  match.currentThrows = [];
  match.legFinishOrder = [];
  match.undoStack = []; // undo does not cross into a finished leg
  match.currentPlayerIdx = (match.players.findIndex(p => p.id === legWinnerId) + 1) % match.players.length;
  document.getElementById("currentPlayerName").textContent = currentMatchPlayer().name;

  updateLegLabel();
  renderScoreboard();
  renderThrows();
  renderLegLog();
  showToast(`${getPlayer(legWinnerId)?.name || ""} wins leg ${match.legNumber - 1}!`);
}

function announcePlacement(name, place) {
  if (place === 2) {
    playClip("2. Sieger.m4a");
  } else {
    playClip(`place_${place}.m4a`);
  }
}

function computeStandings() {
  const order = match.lastFinishOrder || [];
  const rankOf = id => {
    const i = order.indexOf(id);
    return i === -1 ? 999 : i;
  };
  return [...match.players].sort(
    (a, b) => b.legsWon - a.legsWon || rankOf(a.id) - rankOf(b.id)
  );
}

function finishMatch(winnerMatchPlayer) {
  match.finished = true;
  match.players.forEach(p => {
    const realPlayer = getPlayer(p.id);
    if (!realPlayer) return;
    realPlayer.stats.matchesPlayed += 1;
    if (p.id === winnerMatchPlayer.id) realPlayer.stats.matchesWon += 1;
  });
  savePlayers();

  const standings = computeStandings();

  matchHistory.unshift({
    date: new Date().toISOString(),
    mode: match.startScore,
    legsBestOf: match.legsBestOf,
    winner: winnerMatchPlayer.name,
    standings: standings.map(p => p.name),
    players: standings.map(p => ({ name: p.name, legsWon: p.legsWon, average: computeLiveAverage(p) })),
  });
  saveHistory();


  document.getElementById("winnerTitle").textContent = "🏆 " + winnerMatchPlayer.name.toUpperCase() + " 🏆";
  // Full final standings (1st, 2nd, 3rd …) so the placement play-off shows.
  const medals = ["🥇", "🥈", "🥉"];
  document.getElementById("winnerText").innerHTML = standings
    .map((p, i) => {
      const badge = medals[i] || `${i + 1}.`;
      return `<div class="standing-row"><span>${badge} ${ordinal(i + 1)}</span>` +
             `<strong>${escapeHtml(p.name)}</strong>` +
             `<span class="standing-avg">avg ${computeLiveAverage(p)}</span></div>`;
    })
    .join("");
  document.getElementById("winnerModal").classList.remove("hidden");

  renderScoreboard();
}

document.getElementById("closeWinnerModal").addEventListener("click", () => {
  document.getElementById("winnerModal").classList.add("hidden");
  switchView("setup");
});

// ============================================================
// STATISTICS
// ============================================================
function renderStats() {
  const select = document.getElementById("statsPlayerSelect");
  const prevVal = select.value;
  select.innerHTML = "";
  players.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  if (prevVal && players.some(p => p.id === prevVal)) select.value = prevVal;

  renderStatCards();
  renderMatchHistory();
}

document.getElementById("statsPlayerSelect").addEventListener("change", renderStatCards);

document.getElementById("resetStatsBtn").addEventListener("click", () => {
  if (!confirm("Reset ALL statistics and match history for every player? This cannot be undone.")) return;
  players.forEach(p => { p.stats = emptyStats(); });
  matchHistory = [];
  savePlayers();
  saveHistory();
  renderStats();
  showToast("All statistics have been reset.");
});

function renderStatCards() {
  const container = document.getElementById("statsCards");
  container.innerHTML = "";
  const id = document.getElementById("statsPlayerSelect").value;
  const p = getPlayer(id);
  if (!p) {
    container.innerHTML = `<p style="color:var(--text-dim)">No data available.</p>`;
    return;
  }
  const s = p.stats;
  const average3 = s.dartsThrown > 0 ? ((s.totalScored / s.dartsThrown) * 3).toFixed(1) : "0.0";

  const cards = [
    ["Match Average", average3],
    ["Matches Played", s.matchesPlayed],
    ["Matches Won", s.matchesWon],
    ["Legs Won", s.legsWon],
    ["Legs Played", s.legsPlayed],
    ["Triples (T10+)", s.tripleCount],
    ["140+ Turns", s.count140plus],
    ["100+ Turns", s.count100plus],
    ["Highest Turn", s.highestTurn],
    ["Best Checkout", s.bestCheckout],
    ["Checkouts Hit", s.checkoutsHit],
  ];
  cards.forEach(([label, val]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="val">${val}</div><div class="lbl">${label}</div>`;
    container.appendChild(card);
  });
}

function renderMatchHistory() {
  const container = document.getElementById("matchHistoryList");
  container.innerHTML = "";
  if (matchHistory.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim)">No matches played yet.</p>`;
    return;
  }
  matchHistory.slice(0, 30).forEach(m => {
    const div = document.createElement("div");
    div.className = "match-history-item";
    const date = new Date(m.date).toLocaleString("en-US");
    const playersStr = m.players.map(pl => `${pl.name} (${pl.legsWon} legs, avg ${pl.average})`).join(" vs. ");
    div.innerHTML = `
      <div><span class="winner">${escapeHtml(m.winner)}</span> wins — ${escapeHtml(playersStr)}</div>
      <div class="date">${m.mode} · Best of ${m.legsBestOf} · ${date}</div>
    `;
    container.appendChild(div);
  });
}

// ---------- PWA: register service worker for installability + offline ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(reg => {
      // Check for a newer service worker every time the app opens.
      reg.update();
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // A new version has installed and there was already a controller
          // (i.e. this is an update, not a first install) -> reload once so
          // the user immediately sees the new version instead of stale files.
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    }).catch(() => {});
  });
}

// ============================================================
// INIT
// ============================================================
loadData();
selectedPlayerIds = new Set(players.map(p => p.id)); // all players selected by default
renderPlayerList();
renderPlayerSelect();
