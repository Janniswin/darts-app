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

// ---------- Voice (English) ----------
let englishVoice = null;
let speechUnlocked = false;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  englishVoice = voices.find(v => v.lang && v.lang.startsWith("en")) || voices[0] || null;
}
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = pickVoice;
  pickVoice();
}

// Mobile browsers (iOS Safari, Chrome on Android) only allow the speech
// engine to start "warmed up" the first time speak() is called directly
// inside a real user gesture (tap/click) - any setTimeout/delay in between
// kills it. So we unlock once on the very first tap anywhere on the page.
function unlockSpeech() {
  if (speechUnlocked || !("speechSynthesis" in window)) return;
  speechUnlocked = true;
  pickVoice();
  const warmup = new SpeechSynthesisUtterance(" ");
  warmup.volume = 0; // silent, just opens the audio channel
  speechSynthesis.speak(warmup);
}
document.addEventListener("click", unlockSpeech, { once: true, capture: true });
document.addEventListener("touchend", unlockSpeech, { once: true, capture: true });

function speak(text) {
  const voiceOn = document.getElementById("voiceToggle").value === "on";
  if (!voiceOn) return;
  if (!("speechSynthesis" in window)) return;
  if (!englishVoice) pickVoice(); // voices may have loaded by now

  // Must run synchronously (no setTimeout) so mobile browsers still treat
  // this as part of the user gesture that triggered it.
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  if (englishVoice) utter.voice = englishVoice;
  utter.rate = 0.95;
  utter.pitch = 0.95;
  speechSynthesis.speak(utter);
}

function announceScore(score) {
  speak(score === 0 ? "No score." : `${score}`);
}

function announceCheckout(playerName) {
  speak(`${playerName} checks out! Leg won!`);
}

function announceMatchWin(playerName) {
  speak(`${playerName} wins the match! Congratulations!`);
}

// ---------- Navigation ----------
function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "stats") renderStats();
  if (view === "players") renderPlayerList();
  if (view === "setup") renderPlayerSelect();
}

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
    btn.addEventListener("click", () => handleNumberClick(n));
    grid.appendChild(btn);
  }
  const bull = document.createElement("button");
  bull.type = "button";
  bull.className = "num-btn bull";
  bull.textContent = "25";
  bull.addEventListener("click", () => handleNumberClick(25));
  grid.appendChild(bull);
}

document.querySelectorAll(".mod-btn").forEach(btn => {
  btn.addEventListener("click", () => {
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

document.getElementById("missBtn").addEventListener("click", () => {
  submitDart({ value: 0, label: "MISS", isDouble: false, isTriple: false, number: 0 });
  resetModifier();
});

document.getElementById("undoBtn").addEventListener("click", () => {
  if (match && match.currentThrows.length > 0) {
    match.currentThrows.pop();
    renderThrows();
  }
});

// ============================================================
// GAME ENGINE (X01)
// ============================================================
function startMatch(playerIds, startScore, finishMode, legsBestOf) {
  match = {
    startScore,
    finishMode,
    legsBestOf,
    legsToWin: Math.ceil(legsBestOf / 2),
    players: playerIds.map(id => ({
      id,
      name: getPlayer(id).name,
      remaining: startScore,
      legsWon: 0,
      turnHistory: [],     // per leg: array of turn totals
      currentLegTurns: [],
      tripleCount: 0,      // live triple counter (T10+) for this match
    })),
    currentPlayerIdx: 0,
    legNumber: 1,
    currentThrows: [],     // up to 3 dart objects of the current turn
    legLog: [],
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
  match.players.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "player-card" + (idx === match.currentPlayerIdx ? " active" : "");
    const avg = computeLiveAverage(p);
    let pips = "";
    for (let i = 0; i < match.legsToWin; i++) {
      pips += `<span class="leg-pip ${i < p.legsWon ? "won" : ""}"></span>`;
    }
    card.innerHTML = `
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="remaining">${p.remaining}</div>
      <div class="meta">
        <div><strong>${avg}</strong>3-Dart Avg</div>
        <div><strong>${p.legsWon}</strong>Legs</div>
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
}

function submitDart(dart) {
  if (!match || match.finished) return;
  if (match.currentThrows.length >= 3) return;

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
    announceScore(0);
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
  match.currentPlayerIdx = (match.currentPlayerIdx + 1) % match.players.length;
  document.getElementById("currentPlayerName").textContent = currentMatchPlayer().name;
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
  announceScore(turnScoreSoFar);
  setTimeout(() => announceCheckout(mp.name), 1200);
  onLegWon(mp, turnScoreSoFar);
}

function onLegWon(mp, checkoutScore) {
  mp.legsWon += 1;
  match.legLog.push(`🎯 ${mp.name} wins leg ${match.legNumber}!`);

  // Freeze turn history for averages
  match.players.forEach(p => {
    p.turnHistory.push(p.currentLegTurns);
  });

  // Update persistent player stats for this leg
  match.players.forEach(p => {
    const realPlayer = getPlayer(p.id);
    if (!realPlayer) return;
    const s = realPlayer.stats;
    s.legsPlayed += 1;
    if (p.id === mp.id) s.legsWon += 1;
    s.tripleCount += p.tripleCount;
    p.currentLegTurns.forEach(turnVal => {
      s.dartsThrown += 3;
      s.totalScored += turnVal;
      if (turnVal >= 140) s.count140plus += 1;
      else if (turnVal >= 100) s.count100plus += 1;
      if (turnVal > s.highestTurn) s.highestTurn = turnVal;
    });
  });
  const winnerStats = getPlayer(mp.id)?.stats;
  if (winnerStats) {
    winnerStats.checkoutsHit += 1;
    if (checkoutScore > winnerStats.bestCheckout) winnerStats.bestCheckout = checkoutScore;
  }
  savePlayers();

  // Check match win
  if (mp.legsWon >= match.legsToWin) {
    finishMatch(mp);
    return;
  }

  // Prepare next leg
  match.legNumber += 1;
  match.players.forEach(p => {
    p.remaining = match.startScore;
    p.currentLegTurns = [];
    p.tripleCount = 0;
  });
  match.currentThrows = [];
  match.currentPlayerIdx = (match.players.findIndex(p => p.id === mp.id) + 1) % match.players.length;
  document.getElementById("currentPlayerName").textContent = currentMatchPlayer().name;

  updateLegLabel();
  renderScoreboard();
  renderThrows();
  renderLegLog();
  showToast(`${mp.name} wins leg ${match.legNumber - 1}!`);
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

  matchHistory.unshift({
    date: new Date().toISOString(),
    mode: match.startScore,
    legsBestOf: match.legsBestOf,
    winner: winnerMatchPlayer.name,
    players: match.players.map(p => ({ name: p.name, legsWon: p.legsWon, average: computeLiveAverage(p) })),
  });
  saveHistory();

  setTimeout(() => announceMatchWin(winnerMatchPlayer.name), 1500);

  document.getElementById("winnerTitle").textContent = "🏆 " + winnerMatchPlayer.name.toUpperCase() + " 🏆";
  document.getElementById("winnerText").textContent =
    `wins the match ${winnerMatchPlayer.legsWon} - ` +
    match.players.filter(p => p.id !== winnerMatchPlayer.id).map(p => p.legsWon).join(", ") +
    ` legs (${match.startScore}, Best of ${match.legsBestOf}).`;
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

// ============================================================
// INIT
// ============================================================
loadData();
selectedPlayerIds = new Set(players.map(p => p.id)); // all players selected by default
renderPlayerList();
renderPlayerSelect();
