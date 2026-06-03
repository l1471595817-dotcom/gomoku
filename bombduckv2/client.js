const MQTT_BROKER="wss://broker-cn.emqx.io:8084/mqtt";
const COLS=13,ROWS=11,CS=40,CW=COLS*CS,CH=ROWS*CS,MAX_HP=3,BOMB_T=100;
const W=1,S=2,E=0;
const SCENES=[
  {n:"草莓森林",bg:"#1a2a1a",sd:"#c8e0a0",wl:"#6b5a4a",sf:"#ffb7c5",sl:false,la:false},
  {n:"镜面滑冰",bg:"#0a1a2a",sd:"#e0f0ff",wl:"#8090a0",sf:"#b5d8f7",sl:true,la:false},
  {n:"熔岩炼狱",bg:"#1a0a00",sd:"#2a0a00",wl:"#4a2a1a",sf:"#f0a060",sl:false,la:true}
];
const CHARS=[
  {e:"🟡",b:"#fff0c0",h:"#f0c040"},
  {e:"🩷",b:"#ffe0e8",h:"#f080a0"}
];

const $=id=>document.getElementById(id);
const el={};
["lobby","game","ls","rd","rct","sa","btnGo","ja","gt","cb","toast",
 "gp","gi","gNoc","gNuke","p1a","p2a","p1n","p2n","hp1","hp2","it1","it2",
 "wo","we","wt","wok","btnC","btnSJ","btnJ","ri","gc","statext",
 "chiliOverlay","joyStick","joyBase","joyDot","btnBomb","btnBanana","btnChili","leftZone"].forEach(id=>{el[id]=$(id);});

const cv=el.gc,ctx=cv.getContext("2d");
cv.width=CW;cv.height=CH;

let mc=null,rc="",isH=false,myId=0,sChar=0,oChar=1,sScene=0;
let gS=false,gO=false,gA=false,noclip=false,nuke=false,tC=0,tT=null;
let hp=[0,MAX_HP,MAX_HP];
let grid=[],bombs=[],parts=[],explodes=[];
let lavaTimer=0,lavaCells=[];
let input={x:0,y:0,fire:false},moveAccum=0;
let shakeAmount=0;
let jTouchId=null,jEl=null;

function isTD(){return"ontouchstart"in window||navigator.maxTouchPoints>0;}
if(isTD())el.leftZone.style.display="block";

function toast(m,t){el.toast.textContent=m;el.toast.className="show"+(t?" "+t:"");clearTimeout(el.toast._t);el.toast._t=setTimeout(()=>el.toast.classList.remove("show"),2500);}
function ss(m,c){el.ls.textContent=m;el.ls.className="st"+(c?" "+c:"");}

// Character/scene selection
let selChar=0,selScene=0;
document.querySelectorAll(".card").forEach(c=>{
  c.addEventListener("click",function(){
    const p=this.parentElement;
    p.querySelectorAll(".card").forEach(x=>x.classList.remove("sel"));
    this.classList.add("sel");
    if(this.dataset.idx!==undefined)selChar=parseInt(this.dataset.idx);
    if(this.dataset.sidx!==undefined)selScene=parseInt(this.dataset.sidx);
  });
});

// MQTT
function myT(){return"bd2/"+rc+"/"+(isH?"h":"j");}
function opT(){return"bd2/"+rc+"/"+(isH?"j":"h");}
function coM(){
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  mc=mqtt.connect(MQTT_BROKER,{clientId:"bd2_"+Math.random().toString(36).substring(2,10),clean:true});
  mc.on("connect",()=>{
    mc.subscribe(opT());
    if(isH){el.rct.textContent=rc;el.rd.style.display="block";ss("等待加入...","");el.btnC.style.display="none";el.btnSJ.style.display="none";}
    else ss("已连接！","succ");
    mc.publish(myT(),JSON.stringify({t:"hello",char:selChar}));
  });
  mc.on("message",(t,m)=>{try{handleMsg(JSON.parse(m.toString()));}catch(e){}});
  mc.on("error",()=>{if(isH){ss("创建失败","err");toast("连接失败","err");el.btnC.disabled=false;}else{ss("连接失败","err");toast("连接失败","err");el.btnJ.disabled=false;}});
  mc.on("offline",()=>{if(gS)toast("断开","err");else{ss("断开","err");rL();}});
}
function send(d){if(mc&&mc.connected)mc.publish(myT(),JSON.stringify(d));}

function handleMsg(d){
  if(d.t==="hello"){oChar=d.char;if(isH){ss("✅ 对手已连接！","succ");el.sa.style.display="block";}}
  if(d.t==="start"){oChar=d.char||oChar;if(!isH)sScene=d.sc||sScene;initG();}
  if(d.t==="pos"&&d.id!==myId){}
  if(d.t==="bomb"&&d.id!==myId){bombs.push({gx:d.gx,gy:d.gy,t:BOMB_T,rg:d.rg||2,id:d.id});}
  if(d.t==="exp"){expCell(d.gx,d.gy,d.rg||2,false);shakeAmount=8;}
  if(d.t==="hit"&&d.tgt===myId){hp[myId]--;updHP();if(hp[myId]<=0){gO=true;el.we.textContent="💀";el.wt.textContent="你被炸飞了...";el.wo.classList.add("show");}}
  if(d.t==="destroy"){if(d.gx>=0&&d.gx<COLS&&d.gy>=0&&d.gy<ROWS&&grid[d.gy][d.gx]===S){grid[d.gy][d.gx]=E;}}
  if(d.t==="banana"&&d.id!==myId){
    const me=myId===1?{gx:1,gy:1}:{gx:11,gy:9}; // simplified for demo
    toast("🍌 踩到香蕉皮！","");send({t:"pos",x:1,y:1,dir:0});
  }
  if(d.t==="chili"&&d.id!==myId){el.chiliOverlay.classList.add("show");setTimeout(()=>el.chiliOverlay.classList.remove("show"),4000);}
  if(d.t==="item"){if(d.id===myId&&d.type==="banana")toast("获得 🍌","");if(d.id===myId&&d.type==="chili")toast("获得 🌶️","");}
  if(d.t==="leave"){toast("对方被吓跑了 😢","err");gO=true;gS=false;}
}
function rL(){el.btnC.disabled=false;el.btnJ.disabled=false;el.btnC.style.display="";el.btnSJ.style.display="";el.ja.style.display="none";el.rd.style.display="none";el.sa.style.display="none";ss("创建或加入房间 💥","");}
el.btnC.addEventListener("click",()=>{ss("生成中...","");el.btnC.disabled=true;rc=Math.floor(1000+Math.random()*9000).toString();isH=true;myId=1;sScene=selScene;coM();});
el.btnSJ.addEventListener("click",()=>{el.ja.style.display="block";el.btnSJ.style.display="none";});
el.btnJ.addEventListener("click",()=>{const c=el.ri.value.trim();if(!c||c.length!==4||isNaN(c)){toast("输入4位房间号");return;}ss("连...","");rc=c;isH=false;myId=2;el.btnJ.disabled=true;coM();});
el.btnGo.addEventListener("click",()=>{if(!mc||!mc.connected){toast("断开","err");return;}send({t:"start",char:selChar,sc:sScene});if(isH)initG();});

function initG(){
  gS=true;gO=false;el.lobby.style.display="none";el.game.style.display="flex";el.cb.textContent="🟢 已连接";
  hp=[0,MAX_HP,MAX_HP];bombs=[];parts=[];explodes=[];lavaCells=[];lavaTimer=0;
  el.p1a.textContent=CHARS[isH?selChar:oChar].e;el.p1n.textContent=isH?"我":"对手";
  el.p2a.textContent=CHARS[isH?oChar:selChar].e;el.p2n.textContent=isH?"对手":"我";
  buildG();updHP();el.statext.textContent="🎯 "+SCENES[sScene].n;
  requestAnimationFrame(gameLoop);
}

function buildG(){
  grid=Array.from({length:ROWS},()=>Array(COLS).fill(E));
  for(let x=0;x<COLS;x++){grid[0][x]=W;grid[ROWS-1][x]=W;}
  for(let y=0;y<ROWS;y++){grid[y][0]=W;grid[y][COLS-1]=W;}
  for(let y=2;y<ROWS-1;y+=2)for(let x=2;x<COLS-1;x+=2)grid[y][x]=W;
  for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++)
    if(grid[y][x]===E&&!(x===1&&y===1)&&!(x===11&&y===9))
      if(Math.random()<0.55)grid[y][x]=S;
}

function updHP(){el.hp1.style.width=(hp[1]/MAX_HP*100)+"%";el.hp2.style.width=(hp[2]/MAX_HP*100)+"%";}

// ===== Dynamic Joystick =====
el.leftZone.addEventListener("touchstart",e=>{
  e.preventDefault();const t=e.changedTouches[0];
  jTouchId=t.identifier;
  el.joyStick.style.display="block";
  const z=el.leftZone.getBoundingClientRect();
  el.joyStick.style.left=(t.clientX-z.left)+"px";el.joyStick.style.top=(t.clientY-z.top)+"px";
  el.joyDot.style.transform="translate(0,0)";input.x=0;input.y=0;
},{passive:false});

document.addEventListener("touchmove",e=>{
  if(jTouchId===null)return;
  for(let i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier!==jTouchId)continue;
    e.preventDefault();
    const t=e.changedTouches[i];
    const z=el.leftZone.getBoundingClientRect();
    const jx=parseFloat(el.joyStick.style.left),jy=parseFloat(el.joyStick.style.top);
    const dx=t.clientX-z.left-jx,dy=t.clientY-z.top-jy;
    const dist=Math.sqrt(dx*dx+dy*dy),maxR=30;
    const clamp=Math.min(dist,maxR);const ang=Math.atan2(dy,dx);
    el.joyDot.style.transform=`translate(${Math.cos(ang)*clamp}px,${Math.sin(ang)*clamp}px)`;
    input.x=dx/maxR;input.y=dy/maxR;
    if(Math.abs(dx)<5&&Math.abs(dy)<5){input.x=0;input.y=0;}
  }
},{passive:false});

document.addEventListener("touchend",e=>{
  if(jTouchId===null)return;
  for(let i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier!==jTouchId)continue;
    jTouchId=null;el.joyStick.style.display="none";
    input.x=0;input.y=0;
  }
},{passive:false});

// Buttons
function bindT(el2,fn){el2.addEventListener("touchstart",e=>{e.stopPropagation();fn();},{passive:false});}
bindT(el.btnBomb,()=>{if(!gS||gO)return;send({t:"bomb",gx:Math.floor(1+input.x),gy:Math.floor(1+input.y),rg:2});});
bindT(el.btnBanana,()=>{if(!gS||gO)return;send({t:"banana",id:myId});toast("🍌 扔出香蕉皮！");});
bindT(el.btnChili,()=>{if(!gS||gO)return;send({t:"chili",id:myId});toast("🌶️ 撒出辣椒粉！");});

// Keyboard (PC fallback)
document.addEventListener("keydown",e=>{
  if(e.key==="ArrowUp"||e.key==="w"){input.y=-1;e.preventDefault();}
  if(e.key==="ArrowDown"||e.key==="s"){input.y=1;e.preventDefault();}
  if(e.key==="ArrowLeft"||e.key==="a"){input.x=-1;e.preventDefault();}
  if(e.key==="ArrowRight"||e.key==="d"){input.x=1;e.preventDefault();}
  if(e.key===" "){e.preventDefault();send({t:"bomb",gx:1,gy:1,rg:2});}
});
document.addEventListener("keyup",e=>{
  if(e.key==="ArrowUp"||e.key==="w"||e.key==="ArrowDown"||e.key==="s")input.y=0;
  if(e.key==="ArrowLeft"||e.key==="a"||e.key==="ArrowRight"||e.key==="d")input.x=0;
});

// ===== Game Loop (Delta-Time) =====
let lastTime=0,me={gx:1,gy:1,dir:0},op={gx:11,gy:9,dir:0};

function gameLoop(time){
  if(!gS){requestAnimationFrame(gameLoop);return;}
  const dt=Math.min((time-lastTime)/16.67,3);lastTime=time;
  
  const m=isH?me:me;
  m.gx=isH?1:11;m.gy=isH?1:9; // simplified grid position tracking
  // Movement
  moveAccum+=dt;
  if(moveAccum>=1){
    moveAccum=0;
    let dx=0,dy=0;
    if(input.x<-0.3)dx=-1;else if(input.x>0.3)dx=1;
    if(input.y<-0.3)dy=-1;else if(input.y>0.3)dy=1;
    if(dx!==0||dy!==0){
      const nx=m.gx+dx,ny=m.gy+dy;
      if(nx>=1&&nx<COLS-1&&ny>=1&&ny<ROWS-1&&(noclip||grid[ny][nx]===E)){
        m.gx=nx;m.gy=ny;m.dir=dx!==0?dx:m.dir;
      }
    }
    send({t:"pos",x:m.gx,y:m.gy,dir:m.dir});
  }
  
  // Bombs
  let bi=0;
  while(bi<bombs.length){
    const b=bombs[bi];
    b.t-=dt;
    if(b.t<=0){
      expCell(b.gx,b.gy,b.rg||2,true);
      shakeAmount=10;
      // Check hits
      const opp=isH?op:op;
      if(Math.abs(opp.gx-b.gx)+Math.abs(opp.gy-b.gy)<=b.rg){
        hp[2]--;
        if(hp[2]<=0){gO=true;el.we.textContent="🎉";el.wt.textContent="你赢了！";el.wo.classList.add("show");}
        updHP();send({t:"hit",tgt:2});
      }
      if(!noclip&&Math.abs(1-b.gx)+Math.abs(1-b.gy)<=b.rg){
        hp[1]--;updHP();
        if(hp[1]<=0&&!noclip){gO=true;el.we.textContent="💀";el.wt.textContent="你被炸飞了...";el.wo.classList.add("show");}
      }
      send({t:"exp",gx:b.gx,gy:b.gy,rg:b.rg||2});
      bombs.splice(bi,1);continue;
    }
    bi++;
  }
  
  // Explosion visuals
  let ei=0;while(ei<explodes.length){explodes[ei].l-=dt;if(explodes[ei].l<=0){explodes.splice(ei,1);continue;}ei++;}
  
  // Lava
  if(SCENES[sScene].la){
    lavaTimer+=dt;
    if(lavaTimer>300){lavaTimer=0;lavaCells=[];
      for(let i=0;i<3;i++)lavaCells.push({gx:1+Math.floor(Math.random()*(COLS-2)),gy:1+Math.floor(Math.random()*(ROWS-2)),f:20});
    }
    for(const lc of lavaCells){lc.f-=dt;if(lc.f<=0&&lc.f>-10){hp[1]=Math.max(0,hp[1]-1);lc.f=-999;updHP();}}
  }
  
  // Particles
  let pi=0;while(pi<parts.length){parts[pi].l-=dt;parts[pi].x+=parts[pi].vx;parts[pi].y+=parts[pi].vy;parts[pi].vy+=0.1;if(parts[pi].l<=0){parts.splice(pi,1);continue;}pi++;}
  
  // Screen shake decay
  if(shakeAmount>0)shakeAmount*=0.9;if(shakeAmount<0.3)shakeAmount=0;
  
  draw();
  requestAnimationFrame(gameLoop);
}

function expCell(gx,gy,rg,drop){
  explodes.push({gx,gy,l:15,rg});
  // Particles
  for(let i=0;i<12;i++)parts.push({x:gx*CS+CS/2,y:gy*CS+CS/2,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4-2,l:20,c:["#ff8800","#ffcc00","#ff4444"][Math.floor(Math.random()*3)]});
  // Destroy soft blocks
  const dirs=[[0,0],[0,-1],[0,1],[-1,0],[1,0]];
  for(const[dx,dy]of dirs){
    for(let i=0;i<Math.max(1,rg);i++){
      const nx=gx+dx*i,ny=gy+dy*i;
      if(nx<0||nx>=COLS||ny<0||ny>=ROWS)break;
      if(grid[ny][nx]===W)break;
      if(grid[ny][nx]===S){grid[ny][nx]=E;send({t:"destroy",gx:nx,gy:ny});break;}
    }
  }
}

// ===== God Mode =====
el.gt.addEventListener("click",function(){
  if(gA)return;tC++;clearTimeout(tT);
  if(tC>=5){gA=true;el.gp.classList.add("show");el.gi.style.display="inline";toast("✨ 上帝模式已激活","");el.gt.style.color="#ffd700";setTimeout(()=>el.gt.style.color="",800);return;}
  tT=setTimeout(()=>{tC=0;},1200);if(tC===4)toast("还差一次 ✨","");
});
document.addEventListener("keydown",e=>{if(e.ctrlKey&&e.key==="g"){e.preventDefault();if(gA){el.gp.classList.toggle("show");toast(el.gp.classList.contains("show")?"👑 打开":"关闭","");}}});
el.gNoc.addEventListener("click",function(){noclip=!noclip;this.classList.toggle("on",noclip);toast(noclip?"👻 幽灵穿墙":"穿墙关闭","");});
el.gNuke.addEventListener("click",function(){nuke=!nuke;this.classList.toggle("on",nuke);toast(nuke?"☢️ 核弹":"核弹关闭","");});

// ===== Win =====
el.wok.addEventListener("click",()=>el.wo.classList.remove("show"));
el.wo.addEventListener("click",e=>{if(e.target===el.wo)el.wo.classList.remove("show");});

// ===== Rendering =====
function draw(){
  ctx.save();
  // Screen shake
  if(shakeAmount>0){
    const sx=(Math.random()-0.5)*shakeAmount*2;
    const sy=(Math.random()-0.5)*shakeAmount*2;
    ctx.translate(sx,sy);
  }
  
  const sc=SCENES[sScene];
  ctx.fillStyle=sc.bg;ctx.fillRect(-10,-10,CW+20,CH+20);
  
  // Grid
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const px=x*CS,py=y*CS;
    if(grid[y][x]===E){ctx.fillStyle=sc.sd;ctx.fillRect(px,py,CS,CS);}
    else if(grid[y][x]===W){ctx.fillStyle=sc.wl;ctx.fillRect(px,py,CS,CS);ctx.fillStyle="rgba(255,255,255,0.08)";ctx.fillRect(px+2,py+2,CS-4,3);}
    else if(grid[y][x]===S){
      ctx.fillStyle=sc.sf;ctx.beginPath();rrc(ctx,px+2,py+2,CS-4,CS-4,4);ctx.fill();
      ctx.fillStyle="rgba(255,255,255,0.2)";ctx.fillRect(px+4,py+3,CS-8,3);
    }
  }
  
  // Lava
  for(const lc of lavaCells){
    if(lc.f>5)ctx.fillStyle=`rgba(255,${80+Math.random()*40},0,0.4)`;
    else if(lc.f>0)ctx.fillStyle="rgba(255,50,0,0.2)";
    else continue;
    ctx.fillRect(lc.gx*CS,lc.gy*CS,CS,CS);
  }
  
  // Bombs with glow
  for(const b of bombs){
    const pulse=b.t/BOMB_T;
    ctx.shadowColor="#ff4444";ctx.shadowBlur=15+Math.sin(Date.now()/100)*5;
    ctx.beginPath();ctx.arc(b.gx*CS+CS/2,b.gy*CS+CS/2,CS*0.3,0,Math.PI*2);
    ctx.fillStyle="#222";ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle="#555";ctx.beginPath();ctx.arc(b.gx*CS+CS/2-3,b.gy*CS+CS/2-3,CS*0.1,0,Math.PI*2);ctx.fill();
    // Fuse spark
    ctx.fillStyle=Math.random()>0.5?"#ff0":"#f80";
    ctx.beginPath();ctx.arc(b.gx*CS+CS/2+6,b.gy*CS+CS/2-8,3+Math.random()*3,0,Math.PI*2);ctx.fill();
  }
  
  // Explosions
  for(const ex of explodes){
    const a=ex.l/15;
    ctx.globalAlpha=a;
    ctx.fillStyle="#ff8800";ctx.fillRect(ex.gx*CS,ex.gy*CS,CS,CS);
    ctx.fillStyle="#ffcc00";ctx.fillRect(ex.gx*CS+6,ex.gy*CS+6,CS-12,CS-12);
    ctx.globalAlpha=1;
  }
  
  // Particles
  for(const p of parts){
    ctx.globalAlpha=p.l/20;
    ctx.fillStyle=p.c||"#ff8800";
    ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  
  // Draw ducks
  drawDuck(isH?1:11,isH?1:9,0,CHARS[isH?selChar:oChar],noclip,false);
  drawDuck(isH?11:1,isH?9:1,0,CHARS[isH?oChar:selChar],false,true);
  
  ctx.restore();
}

function drawDuck(gx,gy,dir,ch,nc,isOpp){
  const x=gx*CS+CS/2,y=gy*CS+CS/2;
  const bob=Math.sin(Date.now()/200+(isOpp?0:1))*1.5;
  ctx.save();ctx.translate(x,y+bob);
  // Squash & stretch (subtle bounce)
  const sq=1+Math.sin(Date.now()/300)*0.03;
  ctx.scale(sq,1/sq);
  // Body
  ctx.fillStyle=ch.b;ctx.beginPath();ctx.ellipse(0,2,13,11,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(0,-7,8,0,Math.PI*2);ctx.fill();
  // Hair
  ctx.fillStyle=ch.h;ctx.beginPath();ctx.ellipse(0,-14,5,3,0,0,Math.PI*2);ctx.fill();
  // Eyes
  ctx.fillStyle="#333";ctx.beginPath();ctx.arc(-3,-9,2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(3,-9,2,0,Math.PI*2);ctx.fill();
  // Beak
  ctx.fillStyle="#f0a030";ctx.beginPath();ctx.ellipse(0,-6,4,2,0,0,Math.PI*2);ctx.fill();
  // Feet
  ctx.fillStyle="#f0a030";ctx.fillRect(-7,11,5,3);ctx.fillRect(2,11,5,3);
  // God glow
  if(nc){ctx.shadowColor="#ffd700";ctx.shadowBlur=20;ctx.strokeStyle="rgba(255,215,0,0.3)";ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
  ctx.restore();
}

function rrc(ctx,x,y,w,h,r){ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);}

buildG();draw();
