const WebSocket=require("ws"),http=require("http");
const server=http.createServer(),wss=new WebSocket.Server({server});
const rooms=new Map();
function gc(){let c;do{c=String(Math.floor(1000+Math.random()*9000));}while(rooms.has(c));return c;}
function bc(r,m,x){if(!rooms.has(r))return;const d=JSON.stringify(m);rooms.get(r).forEach(c=>{if(c!==x&&c.ws.readyState===WebSocket.OPEN)c.ws.send(d);});}
function sw(ws,m){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
wss.on("connection",ws=>{let pd=null;
  ws.on("message",raw=>{let d;try{d=JSON.parse(raw);}catch(e){return;}
    switch(d.t){
      case"create":{const c=gc();rooms.set(c,[{ws,id:1,char:d.char||0}]);pd={room:c,id:1};sw(ws,{t:"created",code:c,id:1});break;}
      case"join":{if(!rooms.has(d.code)){sw(ws,{t:"err",m:"房间不存在"});return;}const r=rooms.get(d.code);if(r.length>=2){sw(ws,{t:"err",m:"房间已满"});return;}r.push({ws,id:2,char:d.char||0});pd={room:d.code,id:2};sw(ws,{t:"start",id:2});bc(d.code,{t:"start",id:1},ws);break;}
      case"pos":case"move":case"skill":case"undo":case"restart":case"hit":{if(pd)bc(pd.room,{t:d.t,id:pd.id,...d},ws);break;}
    }
  });
  ws.on("close",()=>{if(!pd)return;bc(pd.room,{t:"leave",id:pd.id});rooms.delete(pd.room);});
});
const PORT=process.env.PORT||8080;
server.listen(PORT,"0.0.0.0",()=>console.log("Gomoku2 WS on",PORT));