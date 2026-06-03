const WebSocket = require("ws");
const http = require("http");
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

function generateRoomCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (rooms.has(code));
  return code;
}

function broadcast(room, message, exclude = null) {
  if (!rooms.has(room)) return;
  const data = JSON.stringify(message);
  rooms.get(room).forEach(client => {
    if (client !== exclude && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on("connection", function(ws) {
  let playerData = null;

  ws.on("message", function(raw) {
    let data;
    try { data = JSON.parse(raw); } catch(e) { return; }

    switch (data.type) {
      case "create_room": {
        const code = generateRoomCode();
        const player = { ws, id: 1, character: data.character || 0, color: "black" };
        rooms.set(code, [player]);
        playerData = { room: code, id: 1 };
        sendTo(ws, { type: "room_created", roomCode: code, playerId: 1 });
        break;
      }
      case "join_room": {
        const code = data.roomCode;
        if (!rooms.has(code)) {
          sendTo(ws, { type: "error", message: "房间不存在" });
          return;
        }
        const room = rooms.get(code);
        if (room.length >= 2) {
          sendTo(ws, { type: "error", message: "房间已满" });
          return;
        }
        const player = { ws, id: 2, character: data.character || 1, color: "white" };
        room.push(player);
        playerData = { room: code, id: 2 };
        // Notify both players
        const players = room.map(p => ({ id: p.id, character: p.character, color: p.color }));
        sendTo(ws, { type: "game_start", playerId: 2, color: "white", players });
        broadcast(code, { type: "game_start", playerId: 1, color: "black", players }, ws);
        break;
      }
      case "move": {
        if (!playerData) return;
        broadcast(playerData.room, { type: "move", playerId: playerData.id, row: data.row, col: data.col }, ws);
        break;
      }
      case "egg": {
        if (!playerData) return;
        broadcast(playerData.room, { type: "egg", fromId: playerData.id });
        break;
      }
      case "taunt": {
        if (!playerData) return;
        broadcast(playerData.room, { type: "taunt", fromId: playerData.id, message: data.message });
        break;
      }
      case "restart": {
        if (!playerData) return;
        broadcast(playerData.room, { type: "restart", fromId: playerData.id }, ws);
        break;
      }
    }
  });

  ws.on("close", function() {
    if (!playerData) return;
    const { room, id } = playerData;
    if (rooms.has(room)) {
      broadcast(room, { type: "player_disconnected", playerId: id });
      rooms.delete(room);
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log("Gomoku WS server running on port", PORT);
});
