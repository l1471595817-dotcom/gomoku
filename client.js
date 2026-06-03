// ===== 配置 =====
const SERVER_URL = "ws://localhost:8080";

// ===== 常量 =====
const BS = 15, MT = 0, BK = 1, WH = 2;
const CHARS = [
  { emoji: "😺", name: "元气猫猫", color: "#ffb7c5" },
  { emoji: "🐶", name: "发呆汪汪", color: "#b5d8f7" },
  { emoji: "🐰", name: "傲娇兔兔", color: "#d4b8f0" }
];

// ===== DOM =====
const el = {};
["lobby","game","lobbyStatus","roomDisplay","roomCodeText","startArea","btnStart","joinArea",
 "gameTitle","connBadge","turnText","boardWrap","board","winOverlay","winEmoji","winText","winOk",
 "toast","godPanel","godIndicator","godDouble","godAi","player1Card","player2Card",
 "p1Avatar","p2Avatar","p1Name","p2Name","p1Dot","p2Dot","p1Active","p2Active",
 "eggBtn","eggContainer","tauntInput","tauntSend","tauntContainer","restartBtn","leaveBtn"].forEach(id=>{
  el[id]=document.getElementById(id);
});

// ===== State =====
let ws = null;
let myId = 0, myColor = BK, myChar = 0, oppChar = 1;
let roomCode = "", isHost = false, gameStarted = false, gameOver = false;
let board = Array.from({length:BS},()=>Array(BS).fill(MT));
let cp = BK, winner = null, winningCells = [], lastMove = null, history = [];
let P = 0, CS = 0, CSz = 0, dpr = 1;
let godActive = false, doubleMove = false, dmPending = false;
let titleClicks = 0, titleTimer = null;

const canvas = el.board;
const ctx = canvas.getContext("2d");

// ===== Character Select =====
let selectedChar = 0;
document.querySelectorAll(".char-card").forEach(card=>{
  card.addEventListener("click",function(){
    document.querySelectorAll(".char-card").forEach(c=>c.classList.remove("selected"));
    this.classList.add("selected");
    selectedChar = parseInt(this.dataset.idx);
  });
});

// ===== Toast =====
function toast(msg, t) {
  el.toast.textContent = msg;
  el.toast.className = "show" + (t ? " " + t : "");
  clearTimeout(el.toast._t);
  el.toast._t = setTimeout(()=>el.toast.classList.remove("show"), 2500);
}

// ===== Lobby =====
document.getElementById("btnCreate").addEventListener("click", createRoom);
document.getElementById("btnShowJoin").addEventListener("click", ()=>{
  el.joinArea.style.display = "block";
  document.getElementById("btnShowJoin").style.display = "none";
});
document.getElementById("btnJoin").addEventListener("click", joinRoom);
document.getElementById("roomInput").addEventListener("keydown", e=>{if(e.key==="Enter")document.getElementById("btnJoin").click()});

function setStatus(msg, cls) {
  el.lobbyStatus.textContent = msg;
  el.lobbyStatus.className = "status-line" + (cls ? " " + cls : "");
}

function createRoom() {
  setStatus("正在创建房间...","waiting");
  document.getElementById("btnCreate").disabled = true;
  connectWS();
  sendMsg({ type: "create_room", character: selectedChar });
}

function joinRoom() {
  const code = document.getElementById("roomInput").value.trim();
  if (!code || code.length !== 4 || isNaN(code)) { toast("输入4位房间号"); return; }
  setStatus("正在连接...","waiting");
  roomCode = code;
  document.getElementById("btnJoin").disabled = true;
  connectWS();
  sendMsg({ type: "join_room", roomCode: code, character: selectedChar });
}

function connectWS() {
  if (ws) try { ws.close(); } catch(e) {}
  ws = new WebSocket(SERVER_URL);
  ws.onopen = () => console.log("WS connected");
  ws.onmessage = e => { try { handleMsg(JSON.parse(e.data)); } catch(ex) {} };
  ws.onclose = () => {
    if (gameStarted) toast("连接断开","error");
    else setStatus("连接失败，请重试","error");
  };
}

function sendMsg(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function handleMsg(d) {
  switch(d.type) {
    case "room_created":
      roomCode = d.roomCode; myId = d.playerId; isHost = true;
      el.roomCodeText.textContent = roomCode;
      el.roomDisplay.style.display = "block";
      document.getElementById("btnCreate").style.display = "none";
      document.getElementById("btnShowJoin").style.display = "none";
      setStatus("等待对方加入...","waiting");
      break;

    case "game_start":
      myId = d.playerId;
      myColor = d.color === "black" ? BK : WH;
      const me = d.players.find(p => p.id === myId);
      const opp = d.players.find(p => p.id !== myId);
      if (me) myChar = me.character;
      if (opp) oppChar = opp.character;
      initGame();
      break;

    case "error":
      toast(d.message, "error");
      resetLobby();
      break;

    case "move":
      const pid = d.playerId;
      if (pid !== myId) {
        const oppColor = pid === 1 ? BK : WH;
        if (board[d.row][d.col] === MT) {
          board[d.row][d.col] = oppColor;
          history.push({ p: oppColor, r: d.row, c: d.col });
          lastMove = { r: d.row, c: d.col };
          cp = cp === BK ? WH : BK;
          db();
          u();
          checkWinLocal(d.row, d.col, oppColor);
        }
      }
      break;

    case "egg":
      showEggAnimation(d.fromId);
      break;

    case "taunt":
      showTaunt(d.fromId, d.message);
      break;

    case "player_disconnected":
      if (gameStarted) toast("对方离开了游戏 😢","error");
      break;

    case "restart":
      if (d.fromId !== myId) {
        resetBoard();
        toast("对方请求重新开始","info");
      }
      break;
  }
}

function resetLobby() {
  document.getElementById("btnCreate").disabled = false;
  document.getElementById("btnJoin").disabled = false;
  document.getElementById("btnCreate").style.display = "";
  document.getElementById("btnShowJoin").style.display = "";
  el.joinArea.style.display = "none";
  el.roomDisplay.style.display = "none";
  el.startArea.style.display = "none";
  setStatus("创建或加入一个房间开始游戏");
}

// ===== Game Init =====
function initGame() {
  gameStarted = true;
  el.lobby.style.display = "none";
  el.game.style.display = "block";
  el.connBadge.textContent = "🟢 已连接";

  // Setup player display
  const p1 = myId === 1 ? { id: 1, char: myChar, color: BK, name: "我" }
                        : { id: 1, char: oppChar, color: BK, name: "对手" };
  const p2 = myId === 2 ? { id: 2, char: myChar, color: WH, name: "我" }
                        : { id: 2, char: oppChar, color: WH, name: "对手" };

  el.p1Avatar.textContent = CHARS[p1.char].emoji;
  el.p1Name.textContent = CHARS[p1.char].name + " (" + p1.name + ")";
  el.p1Dot.className = "pdot black";
  el.p2Avatar.textContent = CHARS[p2.char].emoji;
  el.p2Name.textContent = CHARS[p2.char].name + " (" + p2.name + ")";
  el.p2Dot.className = "pdot white";

  resetBoard();
  setTimeout(resizeCanvas, 50);
}

function resetBoard() {
  board = Array.from({length:BS},()=>Array(BS).fill(MT));
  cp = BK; gameOver = false; winner = null; winningCells = [];
  lastMove = null; history = []; dmPending = false;
  if (gameStarted) u();
  db();
}

// ===== Canvas =====
function resizeCanvas() {
  const rect = el.boardWrap.getBoundingClientRect();
  let size = Math.floor(rect.width);
  if (size < 10) size = 300;
  dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  CSz = size;
  P = size * 0.05;
  CS = (CSz - 2 * P) / (BS - 1);
  ctx.scale(dpr, dpr);
  db();
}

function db() {
  let s = CSz;
  if (!s || s < 10) { setTimeout(resizeCanvas, 100); return; }
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "#deb55c";
  ctx.fillRect(0, 0, s, s);
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * s, 0);
    ctx.lineTo(Math.random() * s, s);
    ctx.strokeStyle = "#6b4226";
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "#6b4226";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < BS; i++) {
    const p = P + i * CS;
    ctx.beginPath(); ctx.moveTo(P, p); ctx.lineTo(P + (BS-1) * CS, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, P); ctx.lineTo(p, P + (BS-1) * CS); ctx.stroke();
  }

  const stars = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
  for (const [r,c] of stars) {
    ctx.beginPath();
    ctx.arc(P + c * CS, P + r * CS, CS * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#6b4226";
    ctx.fill();
  }

  if (winningCells.length > 0) {
    ctx.save();
    for (const [r,c] of winningCells) {
      ctx.beginPath();
      ctx.arc(P + c * CS, P + r * CS, CS * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,215,0,0.18)";
      ctx.fill();
    }
    ctx.restore();
  }

  for (let r = 0; r < BS; r++)
    for (let c = 0; c < BS; c++)
      if (board[r][c] !== MT) ds(r, c, board[r][c]);

  if (lastMove) {
    ctx.beginPath();
    ctx.arc(P + lastMove.c * CS, P + lastMove.r * CS, CS * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4444";
    ctx.fill();
  }

  ctx.strokeStyle = "#3a2210";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, s, s);
}

function ds(r, c, player) {
  const x = P + c * CS, y = P + r * CS, rr = CS * 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + 1.5, y + 2, rr, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fill();
  if (player === BK) {
    const g = ctx.createRadialGradient(x - rr*0.3, y - rr*0.3, rr*0.1, x, y, rr);
    g.addColorStop(0, "#666"); g.addColorStop(0.6, "#2a2a2a"); g.addColorStop(1, "#111");
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
  } else {
    const g = ctx.createRadialGradient(x - rr*0.3, y - rr*0.3, rr*0.1, x, y, rr);
    g.addColorStop(0, "#fff"); g.addColorStop(0.7, "#f0f0f0"); g.addColorStop(1, "#d0d0d0");
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}

// ===== Click Handler =====
canvas.addEventListener("click", function(e) {
  if (!gameStarted || gameOver) return;
  if (!doubleMove && cp !== myColor) { toast("轮到对手下棋"); return; }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (CSz / rect.width);
  const y = (e.clientY - rect.top) * (CSz / rect.height);
  const col = Math.round((x - P) / CS);
  const row = Math.round((y - P) / CS);
  if (row < 0 || row >= BS || col < 0 || col >= BS) return;
  if (board[row][col] !== MT) return;
  placeMove(row, col);
});

canvas.addEventListener("touchstart", function(e) {
  e.preventDefault();
  if (!gameStarted || gameOver) return;
  if (!doubleMove && cp !== myColor) { toast("轮到对手下棋"); return; }
  const t = e.touches[0]; if (!t) return;
  const rect = canvas.getBoundingClientRect();
  const x = (t.clientX - rect.left) * (CSz / rect.width);
  const y = (t.clientY - rect.top) * (CSz / rect.height);
  const col = Math.round((x - P) / CS);
  const row = Math.round((y - P) / CS);
  if (row < 0 || row >= BS || col < 0 || col >= BS) return;
  if (board[row][col] !== MT) return;
  placeMove(row, col);
}, { passive: false });

function placeMove(r, c) {
  board[r][c] = cp;
  history.push({ p: cp, r, c });
  lastMove = { r, c };
  db();
  sendMsg({ type: "move", row: r, col: c });

  if (checkWinLocal(r, c, cp)) return;
  if (history.length === BS * BS) { toast("平局！"); gameOver = true; u(); return; }

  if (doubleMove && cp === myColor && !dmPending) {
    dmPending = true; u(); return;
  }
  dmPending = false;
  cp = cp === BK ? WH : BK;
  u();
}

function checkWinLocal(r, c, player) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    const cells = [[r, c]];
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < BS && cc >= 0 && cc < BS && board[rr][cc] === player) {
      cells.push([rr, cc]); rr += dr; cc += dc;
    }
    rr = r - dr; cc = c - dc;
    while (rr >= 0 && rr < BS && cc >= 0 && cc < BS && board[rr][cc] === player) {
      cells.push([rr, cc]); rr -= dr; cc -= dc;
    }
    if (cells.length >= 5) {
      winningCells = cells;
      gameOver = true; winner = player;
      u(); db();
      const won = winner === myColor;
      el.winEmoji.textContent = won ? "🎉" : "😅";
      el.winText.textContent = won ? "你赢了！" : "对方赢了";
      el.winOverlay.classList.add("show");
      return true;
    }
  }
  return false;
}

function u() {
  const isMe = cp === myColor;
  const isOpp = !isMe && !gameOver;
  el.p1Active.classList.toggle("active", (myId === 1 && isMe) || (myId === 2 && isOpp));
  el.p2Active.classList.toggle("active", (myId === 2 && isMe) || (myId === 1 && isOpp));
  if (gameOver) {
    el.turnText.textContent = winner === myColor ? "🎉 你赢了！" : "😅 对方赢了";
  } else {
    el.turnText.textContent = isMe ? "你的回合 ✨" : "等待对方下棋...";
  }
}

// ===== Win & Events =====
el.winOk.addEventListener("click", ()=>el.winOverlay.classList.remove("show"));
el.winOverlay.addEventListener("click", e=>{ if(e.target===el.winOverlay) el.winOverlay.classList.remove("show"); });
el.restartBtn.addEventListener("click", function() {
  resetBoard(); sendMsg({ type: "restart" });
});
el.leaveBtn.addEventListener("click", function() {
  if (ws) ws.close();
  gameStarted = false;
  el.game.style.display = "none";
  el.lobby.style.display = "block";
  resetLobby();
});

// Resize handler
let rt;
window.addEventListener("resize", ()=>{
  clearTimeout(rt);
  rt = setTimeout(()=>{ if (gameStarted) resizeCanvas(); }, 150);
});

// ===== Egg & Taunt =====
el.eggBtn.addEventListener("click", function() {
  if (!gameStarted) return;
  sendMsg({ type: "egg" });
  showEggAnimation(myId);
});

el.tauntSend.addEventListener("click", function() {
  const msg = el.tauntInput.value.trim();
  if (!msg) return;
  sendMsg({ type: "taunt", message: msg });
  showTaunt(myId, msg);
  el.tauntInput.value = "";
});

function showEggAnimation(fromId) {
  const fromEl = fromId === myId ? el.p1Active : el.p2Active;
  const toEl = fromId === myId ? el.p2Active : el.p1Active;
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const egg = document.createElement("div");
  egg.className = "egg-fly";
  egg.style.left = fromRect.left + fromRect.width / 2 - 11 + "px";
  egg.style.top = fromRect.top + "px";
  egg.style.transition = "all 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)";
  document.body.appendChild(egg);

  requestAnimationFrame(() => {
    const midX = (fromRect.left + toRect.left) / 2 + (fromRect.width - toRect.width) / 2;
    const midY = Math.min(fromRect.top, toRect.top) - 60;
    egg.style.left = midX + "px";
    egg.style.top = midY + "px";
    egg.style.transform = "rotate(180deg)";
  });

  setTimeout(() => {
    egg.style.left = toRect.left + toRect.width / 2 - 11 + "px";
    egg.style.top = toRect.top + "px";
    egg.style.transform = "rotate(360deg)";
  }, 300);

  setTimeout(() => {
    egg.remove();
    const splat = document.createElement("div");
    splat.className = "egg-splat";
    splat.style.left = toRect.left + toRect.width / 2 - 20 + "px";
    splat.style.top = toRect.top + 10 + "px";
    document.body.appendChild(splat);
    setTimeout(() => splat.remove(), 900);
    // Shake the target
    toEl.classList.remove("shake");
    void toEl.offsetWidth;
    toEl.classList.add("shake");
  }, 620);
}

function showTaunt(fromId, msg) {
  const fromEl = fromId === myId ? el.p1Active : el.p2Active;
  if (!fromEl) return;
  const rect = fromEl.getBoundingClientRect();
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = msg;
  bubble.style.left = rect.left + "px";
  bubble.style.top = (rect.top - 40) + "px";
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2600);
}

// ===== 🤫 GOD MODE =====
el.gameTitle.addEventListener("click", function() {
  if (godActive) return;
  titleClicks++;
  clearTimeout(titleTimer);
  if (titleClicks >= 5) {
    godActive = true;
    el.godPanel.classList.add("show");
    el.godIndicator.style.display = "inline";
    toast("✨ 上帝模式已激活","success");
    // Brief gold flash
    el.gameTitle.style.transition = "color 0.3s";
    el.gameTitle.style.color = "#ffd700";
    setTimeout(() => el.gameTitle.style.color = "", 800);
    return;
  }
  titleTimer = setTimeout(() => { titleClicks = 0; }, 1200);
  // On last click, tiny hint only on 4th click
  if (titleClicks === 4) toast("还差一次 ✨","info");
});

document.addEventListener("keydown", function(e) {
  if (e.ctrlKey && e.key === "g") {
    e.preventDefault();
    if (godActive) {
      el.godPanel.classList.toggle("show");
      toast(el.godPanel.classList.contains("show") ? "👑 上帝工具箱已打开" : "上帝工具箱已关闭","info");
    }
  }
});

el.godDouble.addEventListener("click", function() {
  doubleMove = !doubleMove;
  if (!doubleMove) dmPending = false;
  this.classList.toggle("on", doubleMove);
  toast(doubleMove ? "🔁 连下多子已开启" : "连下多子已关闭","info");
});

el.godAi.addEventListener("click", function() {
  if (gameOver || !gameStarted) { toast("游戏未开始"); return; }
  const move = calcAiMove();
  if (!move) return;
  placeMove(move.r, move.c);
});

function calcAiMove() {
  const candidates = new Map();
  for (let r = 0; r < BS; r++)
    for (let c = 0; c < BS; c++)
      if (board[r][c] !== MT)
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < BS && nc >= 0 && nc < BS && board[nr][nc] === MT) {
              const k = nr * BS + nc;
              if (!candidates.has(k)) candidates.set(k, { r: nr, c: nc });
            }
          }
  if (candidates.size === 0) return { r: Math.floor(BS/2), c: Math.floor(BS/2) };

  let best = -Infinity, bestMove = null;
  for (const { r, c } of candidates.values()) {
    const score = evalPos(r, c, cp) * 1.0 + evalPos(r, c, cp === BK ? WH : BK) * 1.1
      + (14 - (Math.abs(r - 7) + Math.abs(c - 7))) * 0.5;
    if (score > best) { best = score; bestMove = { r, c }; }
  }
  return bestMove;
}

function evalPos(r, c, player) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  let total = 0;
  for (const [dr, dc] of dirs) {
    let cnt = 1, open = 0;
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < BS && cc >= 0 && cc < BS && board[rr][cc] === player) { cnt++; rr += dr; cc += dc; }
    if (rr >= 0 && rr < BS && cc >= 0 && cc < BS && board[rr][cc] === MT) open++;
    rr = r - dr; cc = c - dc;
    while (rr >= 0 && rr < BS && cc >= 0 && cc < BS && board[rr][cc] === player) { cnt++; rr -= dr; cc -= dc; }
    if (rr >= 0 && rr < BS && cc >= 0 && cc < BS && board[rr][cc] === MT) open++;
    total += patternScore(cnt, open);
  }
  return total;
}

function patternScore(cnt, open) {
  if (cnt >= 5) return 100000;
  if (open === 0) return 0;
  switch (cnt) {
    case 4: return open === 2 ? 10000 : 1000;
    case 3: return open === 2 ? 1000 : 100;
    case 2: return open === 2 ? 100 : 10;
    case 1: return open === 2 ? 10 : 1;
    default: return 0;
  }
}

// ===== Init =====
resetBoard();
setTimeout(resizeCanvas, 200);
