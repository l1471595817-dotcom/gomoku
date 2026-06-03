const WebSocket = require("ws");
const http = require("http");
const server = http.createServer();
const wss = new WebSocket.Server({ server });
const rooms = new Map();

function genCode() {
  let c; do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

function bc(room, msg, exclude) {
  if (!rooms.has(room)) return;
  const d = JSON.stringify(msg);
  rooms.get(room).forEach(cl => {
    if (cl !== exclude && cl.ws.readyState === WebSocket.OPEN) cl.ws.send(d);
  });
}

function snd(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", ws => {
  let pd = null;
  ws.on("message", raw => {
    let d; try { d = JSON.parse(raw); } catch(e) { return; }
    switch (d.type) {
      case "create": {
        const code = genCode();
        rooms.set(code, [{ ws, id: 1 }]);
        pd = { room: code, id: 1 };
        snd(ws, { type: "created", roomCode: code, playerId: 1 });
        break;
      }
      case "join": {
        if (!rooms.has(d.roomCode)) { snd(ws, { type: "error", msg: "房间不存在" }); return; }
        const r = rooms.get(d.roomCode);
        if (r.length >= 2) { snd(ws, { type: "error", msg: "房间已满" }); return; }
        r.push({ ws, id: 2 });
        pd = { room: d.roomCode, id: 2 };
        snd(ws, { type: "start", playerId: 2 });
        bc(d.roomCode, { type: "start", playerId: 1 }, ws);
        break;
      }
      case "pos": { if (pd) bc(pd.room, { type: "pos", id: pd.id, x: d.x, y: d.y, dir: d.dir, hp: d.hp }, ws); break; }
      case "shoot": { if (pd) bc(pd.room, { type: "shoot", id: pd.id, x: d.x, y: d.y, vx: d.vx, vy: d.vy, homing: d.homing }, ws); break; }
      case "hit": { if (pd) bc(pd.room, { type: "hit", target: d.target, dmg: d.dmg }, ws); break; }
      case "banana": { if (pd) bc(pd.room, { type: "banana", id: pd.id }, ws); break; }
      case "cake": { if (pd) bc(pd.room, { type: "cake", id: pd.id }, ws); break; }
      case "respawn": { if (pd) bc(pd.room, { type: "respawn", id: pd.id, x: d.x, y: d.y }, ws); break; }
    }
  });
  ws.on("close", () => {
    if (!pd) return;
    bc(pd.room, { type: "leave", id: pd.id });
    rooms.delete(pd.room);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => console.log("Shooter WS on", PORT));