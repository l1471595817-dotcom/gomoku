// ===== 配置 =====
const MQTT_BROKER = "wss://broker-cn.emqx.io:8084/mqtt";
const GRAVITY = 0.45, JUMP = -9, SPEED = 3.5, BS = 6, MAX_HP = 100;
const CW = 800, CH = 450;

const CHARS = [
  { emoji: "🍓", name: "草莓兔兔", color: "#ffb7c5", body: "#fff0f0", hair: "#ffb7c5" },
  { emoji: "🌿", name: "薄荷熊熊", color: "#b8f0d0", body: "#f0fff5", hair: "#b8f0d0" },
  { emoji: "🍊", name: "橙子猫猫", color: "#fce6a2", body: "#fff8f0", hair: "#fce6a2" }
];

const PLATFORMS = [
  { x: 40, y: 340, w: 180, h: 18, c: "#ffb7c5" },
  { x: 290, y: 270, w: 200, h: 18, c: "#b5d8f7" },
  { x: 560, y: 340, w: 180, h: 18, c: "#d4b8f0" },
  { x: 200, y: 180, w: 160, h: 18, c: "#fce6a2" },
  { x: 480, y: 200, w: 140, h: 18, c: "#b8f0d0" }
];

const GROUND = { x: 0, y: 430, w: CW, h: 20, c: "#c0d8a0" };

// ===== DOM =====
const $ = id => document.getElementById(id);
const el = {};
["lobby","game","lobbyStatus","roomDisplay","roomCodeText","startArea","btnStart","joinArea",
 "gameTitle","connBadge","toast","godPanel","godIndicator","godFly","godAim","godGun",
 "p1a","p2a","p1n","p2n","hp1","hp2","p1c","p2c",
 "bananaBtn","cakeBtn","cakeOverlay","winOverlay","winEmoji","winText","winOk",
 "btnCreate","btnShowJoin","btnJoin","roomInput","gameCanvas"].forEach(id=>{ el[id]=$(id); });

const canvas = el.gameCanvas;
const ctx = canvas.getContext("2d");
canvas.width = CW; canvas.height = CH;

// ===== State =====
let mc = null, roomCode = "", isHost = false, myId = 0;
let selChar = 0, oppChar = 1;
let gameStarted = false, gameOver = false;
let godActive = false, flyMode = false, aimMode = false, gunMode = false;
let titleClicks = 0, titleTimer = null;
let hp1 = MAX_HP, hp2 = MAX_HP;
let myDir = 1;
let p1 = { x: 100, y: 300, vx: 0, vy: 0, w: 22, h: 32, dir: 1, onGround: false, sliding: 0 };
let p2 = { x: 650, y: 300, vx: 0, vy: 0, w: 22, h: 32, dir: -1, onGround: false, sliding: 0 };
let bullets = [], items = [], particles = [];
let keys = {}, lastPosSend = 0, shootCooldown = 0;
let oppX = p2.x, oppY = p2.y, oppTargetX = p2.x, oppTargetY = p2.y;

// ===== Character Select =====
document.querySelectorAll(".char-card").forEach(card=>{
  card.addEventListener("click",function(){
    document.querySelectorAll(".char-card").forEach(c=>c.classList.remove("selected"));
    this.classList.add("selected"); selChar = parseInt(this.dataset.idx);
  });
});

function toast(m,t){ el.toast.textContent=m; el.toast.className="show"+(t?" "+t:""); clearTimeout(el.toast._t); el.toast._t=setTimeout(()=>el.toast.classList.remove("show"),2500); }

// ===== MQTT =====
function myT(){ return "sh/"+roomCode+"/"+(isHost?"h":"j"); }
function opT(){ return "sh/"+roomCode+"/"+(isHost?"j":"h"); }

function connectMQTT(){
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  const cid="sh_"+Math.random().toString(36).substring(2,10);
  mc=mqtt.connect(MQTT_BROKER,{clientId:cid,clean:true});
  mc.on("connect",()=>{
    mc.subscribe(opT());
    if(isHost){
      el.roomCodeText.textContent=roomCode; el.roomDisplay.style.display="block";
      setStatus("等待对方加入...","waiting");
      el.btnCreate.style.display="none"; el.btnShowJoin.style.display="none";
    } else setStatus("已连接！等待房主开始","success");
    mc.publish(myT(),JSON.stringify({t:"hello",char:selChar,id:myId}));
  });
  mc.on("message",(t,m)=>{ try{handleMsg(JSON.parse(m.toString()));}catch(e){} });
  mc.on("error",()=>{
    if(isHost){setStatus("创建失败","error");toast("连接失败","error");el.btnCreate.disabled=false;}
    else{setStatus("连接失败","error");toast("连接失败","error");el.btnJoin.disabled=false;}
  });
  mc.on("offline",()=>{if(gameStarted)toast("连接断开","error");else{setStatus("连接断开","error");resetLobby();}});
}

function sendMsg(d){if(mc&&mc.connected)mc.publish(myT(),JSON.stringify(d));}
function setStatus(m,c){el.lobbyStatus.textContent=m;el.lobbyStatus.className="status-line"+(c?" "+c:"");}

function handleMsg(d){
  if(d.t==="hello"){oppChar=d.char;if(isHost){setStatus("✅ 对手已连接！","success");el.startArea.style.display="block";}}
  if(d.t==="start"){oppChar=d.char||oppChar;initGame();}
  if(d.t==="pos"){oppTargetX=d.x;oppTargetY=d.y;p2.dir=d.dir||p2.dir;if(d.hp!==undefined)hp2=d.hp;}
  if(d.t==="shoot"){
    const isMine=d.id===myId;
    if(!isMine){bullets.push({x:d.x,y:d.y,vx:d.vx,vy:d.vy,owner:d.id,life:90,r:4,homing:d.homing,dx:d.x,dy:d.y});}
  }
  if(d.t==="hit"&&d.target===myId){hp1-=d.dmg||10;if(hp1<0)hp1=0;updateHP();}
  if(d.t==="banana"&&d.id!==myId){p1.sliding=90;toast("🍌 踩到香蕉皮！","info");}
  if(d.t==="cake"&&d.id!==myId){showCakeSplat();}
  if(d.t==="respawn"&&d.id===myId){p1.x=d.x;p1.y=d.y;p1.vy=0;p1.vx=0;hp1=MAX_HP;updateHP();}
  if(d.t==="leave"){toast("对方已逃跑 😢","error");gameOver=true;}
}

// ===== Lobby =====
el.btnCreate.addEventListener("click",()=>{
  setStatus("正在生成房间...","waiting");el.btnCreate.disabled=true;
  roomCode=Math.floor(1000+Math.random()*9000).toString();isHost=true;myId=1;connectMQTT();
});
el.btnShowJoin.addEventListener("click",()=>{el.joinArea.style.display="block";el.btnShowJoin.style.display="none";});
el.btnJoin.addEventListener("click",()=>{
  const c=el.roomInput.value.trim();
  if(!c||c.length!==4||isNaN(c)){toast("输入4位房间号");return;}
  setStatus("正在连接...","waiting");roomCode=c;isHost=false;myId=2;el.btnJoin.disabled=true;connectMQTT();
});
el.roomInput.addEventListener("keydown",e=>{if(e.key==="Enter")el.btnJoin.click()});
el.btnStart.addEventListener("click",()=>{
  if(!mc||!mc.connected){toast("连接已断开","error");return;}
  sendMsg({t:"start",oppChar:selChar});initGame();
});

function resetLobby(){
  el.btnCreate.disabled=false;el.btnJoin.disabled=false;
  el.btnCreate.style.display="";el.btnShowJoin.style.display="";
  el.joinArea.style.display="none";el.roomDisplay.style.display="none";el.startArea.style.display="none";
  setStatus("创建或加入一个房间开始对战 🎯");
}

// ===== Game Init =====
function initGame(){
  gameStarted=true;gameOver=false;
  el.lobby.style.display="none";el.game.style.display="block";el.connBadge.textContent="🟢 已连接";
  p1.x=isHost?100:650;p1.y=300;p1.vy=0;p1.sliding=0;
  p2.x=isHost?650:100;p2.y=300;p2.vy=0;p2.sliding=0;
  oppTargetX=p2.x;oppTargetY=p2.y;oppX=p2.x;oppY=p2.y;
  hp1=MAX_HP;hp2=MAX_HP;bullets=[];items=[];particles=[];
  el.p1a.textContent=CHARS[isHost?selChar:oppChar].emoji;el.p1n.textContent=isHost?"我":"对手";
  el.p2a.textContent=CHARS[isHost?oppChar:selChar].emoji;el.p2n.textContent=isHost?"对手":"我";
  updateHP();gameLoop();
}

function updateHP(){
  el.hp1.style.width=Math.max(0,hp1)+"%";
  el.hp2.style.width=Math.max(0,hp2)+"%";
  if(hp1<=0){toast("💀 你被击败了！","error");sendMsg({t:"respawn",x:isHost?100:650,y:300});setTimeout(()=>{hp1=MAX_HP;updateHP();},2000);}
  if(hp2<=0){toast("🎉 击败了对手！");}
}

// ===== Physics =====
function updatePlayer(player, dt){
  if(player.sliding>0){
    player.sliding--;
    player.vx+=player.dir*0.3;
  } else {
    if(keys["ArrowLeft"]){player.vx=-SPEED;player.dir=-1;}
    else if(keys["ArrowRight"]){player.vx=SPEED;player.dir=1;}
    else player.vx*=0.7;
  }
  if(!flyMode||player!==p1){
    player.vy+=GRAVITY;
    if(keys["ArrowUp"]&&player.onGround){player.vy=JUMP;player.onGround=false;}
  } else {
    if(keys["ArrowUp"]){player.vy=-SPEED*0.8;}
    else if(keys["ArrowDown"]){player.vy=SPEED*0.8;}
    else player.vy*=0.8;
  }
  if(player!==p1&&flyMode){} // no effect
}

function moveAndCollide(player){
  player.x+=player.vx;
  if(player.x<0){player.x=0;player.vx=0;}
  if(player.x+player.w>CW){player.x=CW-player.w;player.vx=0;}
  player.onGround=false;
  // Ground
  if(player.y+player.h>=GROUND.y&&player.x+player.w>GROUND.x&&player.x<GROUND.x+GROUND.w){
    player.y=GROUND.y-player.h;player.vy=0;player.onGround=true;
  }
  player.y+=player.vy;
  if(player.y+player.h>CH){player.y=CH-player.h;player.vy=0;player.onGround=true;}
  if(player.y<0){player.y=0;player.vy=0;}
  // Platforms
  for(const pl of PLATFORMS){
    if(player.vy>=0&&player.y+player.h>pl.y&&player.y+player.h<pl.y+pl.h+10&&
       player.x+player.w>pl.x+5&&player.x<pl.x+pl.w-5){
      // Check if player was above last frame
      const prevBottom=(player.y-player.vy)+player.h;
      if(prevBottom<=pl.y+5){
        player.y=pl.y-player.h;player.vy=0;player.onGround=true;
      }
    }
  }
}

function collides(a,b){
  return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}

// ===== Bullets =====
function updateBullets(){
  let i=0;
  while(i<bullets.length){
    const b=bullets[i];
    // Homing
    if(b.homing&&b.owner!==myId){
      const target=b.owner===1?p1:p2;
      const dx=target.x+target.w/2-b.x;
      const dy=target.y+target.h/2-b.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist>0){b.vx+=dx/dist*0.15;b.vy+=dy/dist*0.15;}
      const sp=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
      if(sp>0){b.vx=b.vx/sp*BS*1.2;b.vy=b.vy/sp*BS*1.2;}
    }
    b.x+=b.vx;b.y+=b.vy;
    b.life--;
    // Hit own player
    const self=b.owner===myId?p1:p2;
    if(collides({x:b.x-4,y:b.y-4,w:8,h:8},{x:self.x,y:self.y,w:self.w,h:self.h})){
      bullets.splice(i,1);continue;
    }
    // Hit opponent
    const target=b.owner===myId?p2:p1;
    if(b.owner===myId&&collides({x:b.x-4,y:b.y-4,w:8,h:8},{x:target.x,y:target.y,w:target.w,h:target.h})){
      const dmg=gunMode?5:12;
      if(b.owner===myId){sendMsg({t:"hit",target:b.owner===1?2:1,dmg:dmg});}
      if(b.owner!==myId){hp1-=dmg;if(hp1<0)hp1=0;updateHP();}
      for(let p=0;p<6;p++)particles.push({x:b.x,y:b.y,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3-2,life:20,color:["#ffb7c5","#b5d8f7","#fce6a2","#d4b8f0"][Math.floor(Math.random()*4)]});
      bullets.splice(i,1);continue;
    }
    // Out of bounds or expired
    if(b.x<-20||b.x>CW+20||b.y<-20||b.y>CH+20||b.life<=0){bullets.splice(i,1);continue;}
    i++;
  }
}

function shoot(){
  if(shootCooldown>0&&!gunMode)return;
  if(gunMode)shootCooldown=2;else shootCooldown=12;
  const player=isHost?p1:p1;
  const bx=player.x+(player.dir>0?player.w:0);
  const by=player.y+player.h/2;
  const bvx=player.dir*BS+(Math.random()-0.5)*0.5;
  const bvy=(Math.random()-0.5)*0.5;
  const target=isHost?p2:p1;
  const aimDx=target.x+target.w/2-bx;
  const aimDy=target.y+target.h/2-by;
  const aimDist=Math.sqrt(aimDx*aimDx+aimDy*aimDy);
  let homing=0;
  if(aimMode&&aimDist>0){homing=1;}
  bullets.push({x:bx,y:by,vx:bvx+(aimMode?aimDx/aimDist*2:0),vy:bvy+(aimMode?aimDy/aimDist*2:0),owner:myId,life:90,r:4,homing:homing});
  sendMsg({t:"shoot",x:bx,y:by,vx:bvx+(aimMode?aimDx/aimDist*2:0),vy:bvy+(aimMode?aimDy/aimDist*2:0),homing:homing});
}

// ===== Items =====
el.bananaBtn.addEventListener("click",()=>{if(!gameStarted)return;sendMsg({t:"banana",id:myId});toast("🍌 扔出香蕉皮！");});
el.cakeBtn.addEventListener("click",()=>{if(!gameStarted)return;sendMsg({t:"cake",id:myId});showCakeSplat();toast("🎂 奶油蛋糕攻击！");});

function showCakeSplat(){
  el.cakeOverlay.classList.add("show");
  setTimeout(()=>el.cakeOverlay.classList.remove("show"),2600);
}

// ===== Particles =====
function updateParticles(){
  let i=0;
  while(i<particles.length){
    particles[i].x+=particles[i].vx;
    particles[i].y+=particles[i].vy;
    particles[i].vy+=0.1;
    particles[i].life--;
    if(particles[i].life<=0){particles.splice(i,1);continue;}
    i++;
  }
}

// ===== Rendering =====
function draw(){
  ctx.clearRect(0,0,CW,CH);
  // Sky
  const grad=ctx.createLinearGradient(0,0,0,CH);
  grad.addColorStop(0,"#d0e8ff");grad.addColorStop(0.5,"#e8f4ff");grad.addColorStop(1,"#fff8f0");
  ctx.fillStyle=grad;ctx.fillRect(0,0,CW,CH);
  // Clouds
  ctx.fillStyle="rgba(255,255,255,0.4)";
  for(const c of [{x:80,y:40,w:80},{x:250,y:25,w:100},{x:500,y:35,w:70},{x:650,y:20,w:90}]){
    ctx.beginPath();ctx.ellipse(c.x,c.y,c.w/2,15,0,0,Math.PI*2);ctx.fill();
  }
  // Ground
  ctx.fillStyle=GROUND.c;ctx.fillRect(GROUND.x,GROUND.y,GROUND.w,GROUND.h);
  ctx.fillStyle="#a0c070";
  for(let i=0;i<CW;i+=30){ctx.fillRect(i,GROUND.y-2,12,4);}
  // Platforms
  for(const pl of PLATFORMS){
    ctx.fillStyle=pl.c;ctx.beginPath();ctx.roundRect(pl.x,pl.y,pl.w,pl.h,8);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.3)";ctx.fillRect(pl.x+4,pl.y+2,pl.w-8,5);
  }
  // Bullets
  for(const b of bullets){
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
    ctx.fillStyle=b.homing?"#ff6b9d":"#60b0ff";
    ctx.shadowColor=b.homing?"#ff6b9d":"#60b0ff";
    ctx.shadowBlur=8;ctx.fill();ctx.shadowBlur=0;
  }
  // Particles
  for(const p of particles){
    ctx.globalAlpha=p.life/20;ctx.fillStyle=p.color;
    ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  // Players
  drawPlayer(p1,isHost?selChar:oppChar,myId===1?hp1:hp2,"p1",flyMode);
  drawPlayer(p2,isHost?oppChar:selChar,myId===2?hp1:hp2,"p2",false);
}

function drawPlayer(p,charIdx,hp,label,flying){
  const ch=CHARS[charIdx]||CHARS[0];
  // Sliding shake
  const sx=p.sliding>0?(Math.random()-0.5)*6:0;
  ctx.save();
  ctx.translate(p.x+sx,p.y);
  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.1)";ctx.beginPath();ctx.ellipse(p.w/2,p.h+2,p.w/2,4,0,0,Math.PI*2);ctx.fill();
  // Body
  ctx.fillStyle=ch.body;ctx.beginPath();ctx.roundRect(2,8,p.w-4,p.h-12,6);ctx.fill();
  // Hair/hat
  ctx.fillStyle=ch.hair;ctx.beginPath();ctx.roundRect(0,0,p.w,14,6);ctx.fill();
  // Eyes
  ctx.fillStyle="#333";const eyeX=p.dir>0?14:8;
  ctx.beginPath();ctx.arc(eyeX,16,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(eyeX+8,16,2.5,0,Math.PI*2);ctx.fill();
  // Mouth
  ctx.strokeStyle="#333";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(p.dir>0?18:14,22,3,0,Math.PI);ctx.stroke();
  // Feet
  ctx.fillStyle="#f0c0a0";ctx.fillRect(4,p.h-4,8,4);ctx.fillRect(p.w-12,p.h-4,8,4);
  // Wings for flying
  if(flying){
    ctx.fillStyle="rgba(255,255,255,0.5)";
    ctx.beginPath();ctx.ellipse(-8,-2,10,6,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(p.w+8,-2,10,6,0,0,Math.PI*2);ctx.fill();
  }
  // HP bar above
  ctx.fillStyle="#eee";ctx.fillRect(0,-10,p.w,4);
  ctx.fillStyle=hp>50?"#6bc47f":hp>25?"#f0c070":"#e87878";
  ctx.fillRect(0,-10,p.w*hp/100,4);
  ctx.restore();
}

// ===== Game Loop =====
function gameLoop(){
  if(!gameStarted||gameOver){if(!gameOver)requestAnimationFrame(gameLoop);return;}
  
  // Input → Physics
  updatePlayer(p1,1);moveAndCollide(p1);
  myDir=p1.dir;
  
  // Update opponent position (interpolation)
  oppX+=(oppTargetX-oppX)*0.2;
  oppY+=(oppTargetY-oppY)*0.2;
  p2.x=oppX;p2.y=oppY;
  
  // Update p2 physics locally for movement, but NOT position
  updatePlayer(p2,1);
  // Don't move p2 - just use interpolated position
  moveAndCollide(p2);
  
  // Bullets
  if(keys[" "]||keys["Space"]){shoot();}
  if(shootCooldown>0)shootCooldown--;
  updateBullets();
  updateParticles();
  
  // Send position (throttled 20/s)
  const now=Date.now();
  if(now-lastPosSend>50){
    sendMsg({t:"pos",x:p1.x,y:p1.y,dir:p1.dir,hp:hp1});
    lastPosSend=now;
  }
  
  // Draw
  draw();
  
  // Check defeat
  if(hp1<=0){gameOver=true;el.winEmoji.textContent="💀";el.winText.textContent="你被击败了...";el.winOverlay.classList.add("show");}
  if(hp2<=0){gameOver=true;el.winEmoji.textContent="🎉";el.winText.textContent="你赢了！";el.winOverlay.classList.add("show");}
  
  requestAnimationFrame(gameLoop);
}

// ===== Input =====
document.addEventListener("keydown",e=>{keys[e.key]=true;if(e.key===" "||e.key==="Space"||e.key==="ArrowUp")e.preventDefault();});
document.addEventListener("keyup",e=>{keys[e.key]=false;});
canvas.addEventListener("click",e=>{
  if(!gameStarted||gameOver)return;
  shoot();
});
canvas.addEventListener("touchstart",e=>{e.preventDefault();if(!gameStarted||gameOver)return;shoot();},{passive:false});

// ===== Win =====
el.winOk.addEventListener("click",()=>el.winOverlay.classList.remove("show"));
el.winOverlay.addEventListener("click",e=>{if(e.target===el.winOverlay)el.winOverlay.classList.remove("show");});

// ===== God Mode =====
el.gameTitle.addEventListener("click",function(){
  if(godActive)return;titleClicks++;clearTimeout(titleTimer);
  if(titleClicks>=5){
    godActive=true;el.godPanel.classList.add("show");el.godIndicator.style.display="inline";
    toast("✨ 上帝模式已激活","success");
    el.gameTitle.style.transition="color 0.3s";el.gameTitle.style.color="#ffd700";
    setTimeout(()=>el.gameTitle.style.color="",800);return;
  }
  titleTimer=setTimeout(()=>{titleClicks=0;},1200);
  if(titleClicks===4)toast("还差一次 ✨","info");
});

document.addEventListener("keydown",function(e){
  if(e.ctrlKey&&e.key==="g"){e.preventDefault();
    if(godActive){el.godPanel.classList.toggle("show");toast(el.godPanel.classList.contains("show")?"👑 上帝工具箱已打开":"上帝工具箱已关闭","info");}
  }
});

el.godFly.addEventListener("click",function(){
  flyMode=!flyMode;this.classList.toggle("on",flyMode);
  toast(flyMode?"🌀 无限飞行已开启":"无限飞行已关闭","info");
});
el.godAim.addEventListener("click",function(){
  aimMode=!aimMode;this.classList.toggle("on",aimMode);
  toast(aimMode?"🎯 追踪泡泡已开启":"追踪泡泡已关闭","info");
});
el.godGun.addEventListener("click",function(){
  gunMode=!gunMode;this.classList.toggle("on",gunMode);
  toast(gunMode?"💥 超级加特林已开启":"超级加特林已关闭","info");
});

// ===== Canvas roundRect polyfill =====
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    if(r>w/2)r=w/2;if(r>h/2)r=h/2;
    this.moveTo(x+r,y);this.lineTo(x+w-r,y);
    this.quadraticCurveTo(x+w,y,x+w,y+r);
    this.lineTo(x+w,y+h-r);
    this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    this.lineTo(x+r,y+h);
    this.quadraticCurveTo(x,y+h,x,y+h-r);
    this.lineTo(x,y+r);
    this.quadraticCurveTo(x,y,x+r,y);
  };
}

// ===== Init =====
function init(){
  p1={x:100,y:300,vx:0,vy:0,w:22,h:32,dir:1,onGround:false,sliding:0};
  p2={x:650,y:300,vx:0,vy:0,w:22,h:32,dir:-1,onGround:false,sliding:0};
  draw();
}
init();
