// ===== 配置 =====
const MQTT_BROKER = "wss://broker-cn.emqx.io:8084/mqtt";
const COLS = 13, ROWS = 11, CS = 40;
const CW = COLS * CS, CH = ROWS * CS;
const MAX_HP = 3, BOMB_TIME = 100, EXPLODE_TIME = 15;
const WALL = 1, SOFT = 2, EMPTY = 0;

const SCENES = [
  {name:"糖果森林",bg:"#d0e8ff",soft:"#ffb7c5",wall:"#8a7a5a",ground:"#c8e0a0",slide:false,lava:false},
  {name:"溜冰城堡",bg:"#d8f0ff",soft:"#b5d8f7",wall:"#a0b0c0",ground:"#e0f0ff",slide:true,lava:false},
  {name:"熔岩火山",bg:"#3a1a0a",soft:"#f0a060",wall:"#4a2a1a",ground:"#2a0a00",slide:false,lava:true}
];
const CHARS = [
  {emoji:"🟡",body:"#fff0c0",hair:"#f0c040",name:"黄黄鸭"},
  {emoji:"🩷",body:"#ffe0e8",hair:"#f080a0",name:"粉粉鸭"}
];

const $=id=>document.getElementById(id);
const el={};
["lobby","game","ls","rd","rct","sa","btnGo","ja",
 "gt","cb","toast","gp","gi","gNoclip","gNuke",
 "p1a","p2a","p1n","p2n","hp1","hp2","items1","items2",
 "wo","we","wt","wok",
 "btnC","btnSJ","btnJ","ri","gc","ga",
 "jb","jh","btnBomb","btnBanana","btnChili","tc","statext","chiliOverlay"].forEach(id=>{el[id]=$(id);});

const canvas=el.gc,ctx=canvas.getContext("2d");
canvas.width=CW;canvas.height=CH;

// ===== 状态 =====
let mc=null,rc="",isH=false,myId=0;
let sChar=0,oChar=1,sScene=0;
let gS=false,gO=false;
let gA=false,noclip=false,nuke=false;
let tC=0,tT=null;

let hp=[0,MAX_HP,MAX_HP];
let p1={x:1,y:1,dir:0,gx:1,gy:1,slide:0,items:{banana:0,chili:0}},p2={x:11,y:9,dir:0,gx:11,gy:9,slide:0,items:{banana:0,chili:0}};
let grid=[],bombs=[],explosions=[];
let lavaTimer=0,lavaCells=[];

// Input bridge
let input={up:false,down:false,left:false,right:false};
let moveTimer=0,moveDelay=6;
let jTouchId=null;

// Touch detection
function isTD(){return "ontouchstart"in window||navigator.maxTouchPoints>0;}
if(isTD()){setTimeout(()=>{el.tc.style.display="block";},300);}

function toast(m,t){el.toast.textContent=m;el.toast.className="show"+(t?" "+t:"");clearTimeout(el.toast._t);el.toast._t=setTimeout(()=>el.toast.classList.remove("show"),2500);}
function ss(m,c){el.ls.textContent=m;el.ls.className="st"+(c?" "+c:"");}

// ===== 角色/地图选择 =====
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

// ===== MQTT =====
function myT(){return"bd/"+rc+"/"+(isH?"h":"j");}
function opT(){return"bd/"+rc+"/"+(isH?"j":"h");}
function connectMQTT(){
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  const cid="bd_"+Math.random().toString(36).substring(2,10);
  mc=mqtt.connect(MQTT_BROKER,{clientId:cid,clean:true});
  mc.on("connect",()=>{
    mc.subscribe(opT());
    if(isH){el.rct.textContent=rc;el.rd.style.display="block";ss("等待对方加入...","");el.btnC.style.display="none";el.btnSJ.style.display="none";}
    else ss("已连接！","succ");
    mc.publish(myT(),JSON.stringify({t:"hello",char:selChar}));
  });
  mc.on("message",(t,m)=>{try{handleMsg(JSON.parse(m.toString()));}catch(e){}});
  mc.on("error",()=>{
    if(isH){ss("创建失败","err");toast("连接失败","err");el.btnC.disabled=false;}
    else{ss("连接失败","err");toast("连接失败","err");el.btnJ.disabled=false;}
  });
  mc.on("offline",()=>{if(gS)toast("连接断开","err");else{ss("断开","err");rL();}});
}
function send(d){if(mc&&mc.connected)mc.publish(myT(),JSON.stringify(d));}

function handleMsg(d){
  if(d.t==="hello"){oChar=d.char;if(isH){ss("✅ 对手已连接！","succ");el.sa.style.display="block";}}
  if(d.t==="start"){oChar=d.char||oChar;if(!isH)sScene=d.sc||sScene;initGame();}
  if(d.t==="pos"&&d.id!==myId){p2.gx=d.x;p2.gy=d.y;p2.dir=d.dir||0;}
  if(d.t==="bomb"&&d.id!==myId){bombs.push({gx:d.gx,gy:d.gy,timer:BOMB_TIME,range:d.range||2,id:d.id});}
  if(d.t==="exp"){
    expCell(d.gx,d.gy,d.range||2);
    el.ga.classList.remove("shake");void el.ga.offsetWidth;el.ga.classList.add("shake");
  }
  if(d.t==="hit"&&d.target===myId){hp[myId]--;updateHP();if(hp[myId]<=0){gO=true;el.we.textContent="💀";el.wt.textContent="你被炸飞了...";el.wo.classList.add("show");}}
  if(d.t==="destroy"){if(d.gx>=0&&d.gx<COLS&&d.gy>=0&&d.gy<ROWS&&grid[d.gy][d.gx]===SOFT){grid[d.gy][d.gx]=EMPTY;maybeDrop(d.gx,d.gy);}}
  if(d.t==="banana"&&d.id!==myId){
    const slideDir=p1.dir;
    if(d.gx===p1.gx&&d.gy===p1.gy){
      p1.slide=20;toast("🍌 踩到香蕉皮！","");
      const dx=[0,0,1,-1][slideDir]||0,dy=[-1,1,0,0][slideDir]||0;
      p1.gx=Math.max(1,Math.min(COLS-2,p1.gx+dx*2));
      p1.gy=Math.max(1,Math.min(ROWS-2,p1.gy+dy*2));
    }
  }
  if(d.t==="chili"&&d.id!==myId){showChili();}
  if(d.t==="item"){if(d.id===myId){const pl=myId===1?p1:p2;if(d.type==="banana")pl.items.banana=(pl.items.banana||0)+1;if(d.type==="chili")pl.items.chili=(pl.items.chili||0)+1;}updateItems();}
  if(d.t==="leave"){toast("对方被吓跑了 😢","err");gO=true;gS=false;}
}
function rL(){el.btnC.disabled=false;el.btnJ.disabled=false;
  el.btnC.style.display="";el.btnSJ.style.display="";
  el.ja.style.display="none";el.rd.style.display="none";el.sa.style.display="none";
  ss("创建或加入一个房间开始对战 💥","");}

el.btnC.addEventListener("click",()=>{ss("生成房间...","");el.btnC.disabled=true;rc=Math.floor(1000+Math.random()*9000).toString();isH=true;myId=1;sScene=selScene;connectMQTT();});
el.btnSJ.addEventListener("click",()=>{el.ja.style.display="block";el.btnSJ.style.display="none";});
el.btnJ.addEventListener("click",()=>{const c=el.ri.value.trim();if(!c||c.length!==4||isNaN(c)){toast("输入4位房间号");return;}ss("连接...","");rc=c;isH=false;myId=2;el.btnJ.disabled=true;connectMQTT();});
el.ri.addEventListener("keydown",e=>{if(e.key==="Enter")el.btnJ.click()});
el.btnGo.addEventListener("click",()=>{if(!mc||!mc.connected){toast("断开","err");return;}send({t:"start",char:selChar,sc:sScene});initGame();});

// ===== 游戏初始化 =====
function initGame(){
  gS=true;gO=false;el.lobby.style.display="none";el.game.style.display="block";el.cb.textContent="🟢 已连接";
  if(isTD())el.tc.style.display="block";
  hp=[0,MAX_HP,MAX_HP];bombs=[];explosions=[];lavaCells=[];lavaTimer=0;
  p1={x:CS*1.5,y:CS*1.5,dir:0,gx:1,gy:1,slide:0,items:{banana:0,chili:0}};
  p2={x:CS*11.5,y:CS*9.5,dir:0,gx:11,gy:9,slide:0,items:{banana:0,chili:0}};
  el.p1a.textContent=CHARS[isH?selChar:oChar].emoji;el.p1n.textContent=isH?"我":"对手";
  el.p2a.textContent=CHARS[isH?oChar:selChar].emoji;el.p2n.textContent=isH?"对手":"我";
  buildGrid();updateHP();updateItems();
  el.statext.textContent="地图: "+SCENES[sScene].name;
  gameLoop();
}

function buildGrid(){
  grid=Array.from({length:ROWS},()=>Array(COLS).fill(EMPTY));
  // Border walls
  for(let x=0;x<COLS;x++){grid[0][x]=WALL;grid[ROWS-1][x]=WALL;}
  for(let y=0;y<ROWS;y++){grid[y][0]=WALL;grid[y][COLS-1]=WALL;}
  // Hard walls at even-even positions
  for(let y=2;y<ROWS-1;y+=2)for(let x=2;x<COLS-1;x+=2)grid[y][x]=WALL;
  // Soft blocks in remaining
  for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++)
    if(grid[y][x]===EMPTY&&!(x===1&&y===1)&&!(x===11&&y===9))
      if(Math.random()<0.55)grid[y][x]=SOFT;
}

function updateHP(){
  el.hp1.style.width=(hp[1]/MAX_HP*100)+"%";
  el.hp2.style.width=(hp[2]/MAX_HP*100)+"%";
}

function updateItems(){
  el.items1.textContent="🍌"+(p1.items.banana||0)+" 🌶️"+(p1.items.chili||0);
  el.items2.textContent="🍌"+(p2.items.banana||0)+" 🌶️"+(p2.items.chili||0);
}

function maybeDrop(gx,gy){
  const r=Math.random();
  if(r<0.1){}else if(r<0.25){p1.items.banana=(p1.items.banana||0)+1;updateItems();toast("获得 🍌 香蕉皮！","");send({t:"item",id:myId,type:"banana"});}
  else if(r<0.4){p1.items.chili=(p1.items.chili||0)+1;updateItems();toast("获得 🌶️ 辣椒粉！","");send({t:"item",id:myId,type:"chili"});}
}

// ===== 游戏循环 =====
function gameLoop(){
  if(!gS){requestAnimationFrame(gameLoop);return;}
  
  // Update player movement
  moveTimer--;
  if(moveTimer<=0){
    moveTimer=moveDelay;
    const me=isH?p1:p2;
    // Ice slide
    if(SCENES[sScene].slide&&me.slide<=0){
      if(!input.up&&!input.down&&!input.left&&!input.right&&me.slide>-5){
        me.slide=-5;moveTimer=moveDelay+2;
      }
    }
    if(me.slide>0){me.slide--;}
    else{
      let dx=0,dy=0;
      if(input.up)dy=-1;else if(input.down)dy=1;
      if(input.left)dx=-1;else if(input.right)dx=1;
      if(dx!==0||dy!==0){
        const nx=me.gx+dx,ny=me.gy+dy;
        if(nx>=1&&nx<COLS-1&&ny>=1&&ny<ROWS-1){
          if(noclip||(grid[ny][nx]===EMPTY&&!bombAt(nx,ny))){
            me.gx=nx;me.gy=ny;me.dir=dx!==0?dx:me.dir;
          }
        }
      }
    }
    me.x=me.gx*CS+CS*0.5;me.y=me.gy*CS+CS*0.5;
    // Send position
    send({t:"pos",x:me.gx,y:me.gy,dir:me.dir});
  }
  
  // Lava
  if(SCENES[sScene].lava){
    lavaTimer++;
    if(lavaTimer%300===0&&lavaTimer>0){ // every 15s at 60fps ~900 frames... actually 300 = 5s
      lavaCells=[];
      for(let i=0;i<3;i++){
        let lx=1+Math.floor(Math.random()*(COLS-2));
        let ly=1+Math.floor(Math.random()*(ROWS-2));
        lavaCells.push({gx:lx,gy:ly,flash:30});
      }
    }
    // Check lava damage
    for(const lc of lavaCells){
      if(lc.flash>0)lc.flash--;
      else{
        if((isH?p1.gx:p1.gx)===lc.gx&&(isH?p1.gy:p1.gy)===lc.gy){hp[1]=Math.max(0,hp[1]-1);updateHP();}
        if((isH?p2.gx:p2.gx)===lc.gx&&(isH?p2.gy:p2.gy)===lc.gy){hp[2]=Math.max(0,hp[2]-1);updateHP();}
      }
    }
  }
  
  // Update bombs
  let bi=0;
  while(bi<bombs.length){
    const b=bombs[bi];
    b.timer--;
    if(b.timer<=0){
      // Explode
      if(nuke){
        for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++)expCell(x,y,0);
        const t=isH?p2:p1;
        hp[t===p2?2:1]--;updateHP();
        if(hp[t===p2?2:1]<=0){gO=true;el.we.textContent="💀";el.wt.textContent="你被核弹炸飞了...";el.wo.classList.add("show");}
      } else {
        expCell(b.gx,b.gy,b.range||2,b.id===myId);
        // Check hit on players
        const me=isH?p1:p2,op=isH?p2:p1;
        if(Math.abs(op.gx-b.gx)+Math.abs(op.gy-b.gy)<=b.range&&hitCheck(op,b.gx,b.gy,b.range)){
          hp[2]--;
          if(hp[2]<=0){gO=true;el.we.textContent="🎉";el.wt.textContent="你赢了！";el.wo.classList.add("show");}
          updateHP();send({t:"hit",target:2});if(hp[2]<=0){gO=true;el.we.textContent="🎉";el.wt.textContent="你赢了！";el.wo.classList.add("show");}
        }
        if(!noclip&&Math.abs(me.gx-b.gx)+Math.abs(me.gy-b.gy)<=b.range&&hitCheck(me,b.gx,b.gy,b.range)){
          hp[1]--;
          if(hp[1]<=0&&!noclip){gO=true;el.we.textContent="💀";el.wt.textContent="你被炸飞了...";el.wo.classList.add("show");}
          updateHP();
        }
      }
      send({t:"exp",gx:b.gx,gy:b.gy,range:b.range||2});
      bombs.splice(bi,1);continue;
    }
    bi++;
  }
  
  // Update explosions
  let ei=0;
  while(ei<explosions.length){
    explosions[ei].life--;
    if(explosions[ei].life<=0){explosions.splice(ei,1);continue;}
    ei++;
  }
  
  draw();
  requestAnimationFrame(gameLoop);
}

function bombAt(gx,gy){return bombs.some(b=>b.gx===gx&&b.gy===gy);}

function hitCheck(pl,bx,by,range){
  return Math.abs(pl.gx-bx)+Math.abs(pl.gy-by)<=range;
}

function expCell(gx,gy,range,dropItems){
  explosions.push({gx,gy,life:EXPLODE_TIME,range});
  const dirs=[[0,0],[0,-1],[0,1],[-1,0],[1,0]];
  for(const [dx,dy] of dirs){
    for(let i=0;i<Math.max(1,range);i++){
      const nx=gx+dx*i,ny=gy+dy*i;
      if(nx<0||nx>=COLS||ny<0||ny>=ROWS)break;
      if(grid[ny][nx]===WALL)break;
      if(grid[ny][nx]===SOFT){
        grid[ny][nx]=EMPTY;
        explosions.push({gx:nx,gy:ny,life:EXPLODE_TIME,range:0});
        send({t:"destroy",gx:nx,gy:ny});
        if(dropItems!==false)maybeDrop(nx,ny);
        break;
      }
    }
  }
}

// ===== 炸弹与道具 =====
el.btnBomb.addEventListener("click",()=>{
  if(!gS||gO)return;
  const me=isH?p1:p2;
  if(bombAt(me.gx,me.gy)){toast("这里已经有炸弹了");return;}
  if(bombs.filter(b=>b.id===myId).length>=3){toast("炸弹已达上限");return;}
  bombs.push({gx:me.gx,gy:me.gy,timer:BOMB_TIME,range:nuke?99:2,id:myId});
  send({t:"bomb",gx:me.gx,gy:me.gy,range:nuke?99:2});
});

el.btnBanana.addEventListener("click",()=>{
  if(!gS||gO)return;
  const me=isH?p1:p2;
  if((me.items.banana||0)<=0){toast("没有香蕉皮了");return;}
  me.items.banana--;updateItems();
  const op=isH?p2:p1;
  send({t:"banana",id:myId,gx:op.gx,gy:op.gy});
  toast("🍌 扔出香蕉皮！");
});

el.btnChili.addEventListener("click",()=>{
  if(!gS||gO)return;
  const me=isH?p1:p2;
  if((me.items.chili||0)<=0){toast("没有辣椒粉了");return;}
  me.items.chili--;updateItems();
  send({t:"chili",id:myId});
  toast("🌶️ 撒出辣椒粉！");
});

function showChili(){
  el.chiliOverlay.classList.add("show");
  setTimeout(()=>el.chiliOverlay.classList.remove("show"),4000);
}

// ===== 键盘 =====
document.addEventListener("keydown",e=>{
  if(e.key==="ArrowUp"||e.key==="w"||e.key==="W"){input.up=true;e.preventDefault();}
  if(e.key==="ArrowDown"||e.key==="s"||e.key==="S"){input.down=true;e.preventDefault();}
  if(e.key==="ArrowLeft"||e.key==="a"||e.key==="A"){input.left=true;e.preventDefault();}
  if(e.key==="ArrowRight"||e.key==="d"||e.key==="D"){input.right=true;e.preventDefault();}
  if(e.key===" "||e.key==="Space"){el.btnBomb.click();e.preventDefault();}
});
document.addEventListener("keyup",e=>{
  if(e.key==="ArrowUp"||e.key==="w"||e.key==="W"){input.up=false;e.preventDefault();}
  if(e.key==="ArrowDown"||e.key==="s"||e.key==="S"){input.down=false;e.preventDefault();}
  if(e.key==="ArrowLeft"||e.key==="a"||e.key==="A"){input.left=false;e.preventDefault();}
  if(e.key==="ArrowRight"||e.key==="d"||e.key==="D"){input.right=false;e.preventDefault();}
});

// ===== 触屏 =====
el.jb.addEventListener("touchstart",e=>{
  e.preventDefault();jTouchId=e.changedTouches[0].identifier;
  updateJoystick(e.changedTouches[0]);
},{passive:false});
document.addEventListener("touchmove",e=>{
  if(jTouchId===null)return;
  for(let i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier!==jTouchId)continue;
    e.preventDefault();updateJoystick(e.changedTouches[i]);
  }
},{passive:false});
document.addEventListener("touchend",e=>{
  if(jTouchId===null)return;
  for(let i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier!==jTouchId)continue;
    jTouchId=null;el.jh.style.transform="translate(0,0)";
    input.up=false;input.down=false;input.left=false;input.right=false;
  }
},{passive:false});

function updateJoystick(t){
  const r=el.jb.getBoundingClientRect();
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  const dx=t.clientX-cx,dy=t.clientY-cy;
  const dist=Math.sqrt(dx*dx+dy*dy),maxR=35;
  const clamp=Math.min(dist,maxR);
  const angle=Math.atan2(dy,dx);
  const tx=Math.cos(angle)*clamp,ty=Math.sin(angle)*clamp;
  el.jh.style.transform=`translate(${tx}px,${ty}px)`;
  input.up=dy<-10;input.down=dy>10;
  input.left=dx<-10;input.right=dx>10;
}

function bindTB(elem,fn){
  elem.addEventListener("touchstart",e=>{e.preventDefault();fn();},{passive:false});
}
bindTB(el.btnBomb,()=>el.btnBomb.click());
bindTB(el.btnBanana,()=>el.btnBanana.click());
bindTB(el.btnChili,()=>el.btnChili.click());

// ===== Win =====
el.wok.addEventListener("click",()=>el.wo.classList.remove("show"));
el.wo.addEventListener("click",e=>{if(e.target===el.wo)el.wo.classList.remove("show");});

// ===== 上帝模式 =====
el.gt.addEventListener("click",function(){
  if(gA)return;tC++;clearTimeout(tT);
  if(tC>=5){
    gA=true;el.gp.classList.add("show");el.gi.style.display="inline";
    toast("✨ 上帝模式已激活","");el.gt.style.transition="color 0.3s";el.gt.style.color="#ffd700";
    setTimeout(()=>el.gt.style.color="",800);return;
  }
  tT=setTimeout(()=>{tC=0;},1200);
  if(tC===4)toast("还差一次 ✨","");
});
document.addEventListener("keydown",function(e){
  if(e.ctrlKey&&e.key==="g"){e.preventDefault();
    if(gA){el.gp.classList.toggle("show");toast(el.gp.classList.contains("show")?"👑 工具箱已打开":"工具箱已关闭","");}
  }
});
el.gNoclip.addEventListener("click",function(){
  noclip=!noclip;this.classList.toggle("on",noclip);
  toast(noclip?"👻 幽灵穿墙已开启":"穿墙已关闭","");
});
el.gNuke.addEventListener("click",function(){
  nuke=!nuke;this.classList.toggle("on",nuke);
  toast(nuke?"☢️ 核弹引爆已开启":"核弹已关闭","");
});

// ===== 渲染 =====
function draw(){
  const sc=SCENES[sScene];
  ctx.fillStyle=sc.bg;ctx.fillRect(0,0,CW,CH);
  // Grid
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const px=x*CS,py=y*CS;
    if(grid[y][x]===EMPTY){ctx.fillStyle=sc.ground;ctx.fillRect(px,py,CS,CS);ctx.strokeStyle="rgba(0,0,0,0.03)";ctx.strokeRect(px,py,CS,CS);}
    else if(grid[y][x]===WALL){ctx.fillStyle=sc.wall;ctx.fillRect(px,py,CS,CS);ctx.fillStyle="rgba(255,255,255,0.15)";ctx.fillRect(px+2,py+2,CS-4,4);}
    else if(grid[y][x]===SOFT){
      ctx.fillStyle=sc.soft;ctx.beginPath();roundRect(ctx,px+2,py+2,CS-4,CS-4,4);ctx.fill();
      ctx.fillStyle="rgba(255,255,255,0.25)";ctx.fillRect(px+5,py+4,CS-10,3);
    }
  }
  // Lava warning
  for(const lc of lavaCells){
    if(lc.flash>10){ctx.fillStyle=`rgba(255,${60+Math.random()*50},0,0.5)`;ctx.fillRect(lc.gx*CS,lc.gy*CS,CS,CS);}
    else if(lc.flash>0){ctx.fillStyle="rgba(255,60,0,0.3)";ctx.fillRect(lc.gx*CS,lc.gy*CS,CS,CS);}
  }
  // Bombs
  for(const b of bombs){
    ctx.beginPath();ctx.arc(b.gx*CS+CS/2,b.gy*CS+CS/2,CS*0.3,0,Math.PI*2);
    ctx.fillStyle="#333";ctx.fill();
    ctx.fillStyle="#666";ctx.beginPath();ctx.arc(b.gx*CS+CS/2-3,b.gy*CS+CS/2-3,CS*0.12,0,Math.PI*2);ctx.fill();
    // fuse
    ctx.fillStyle="#ff4444";ctx.beginPath();ctx.arc(b.gx*CS+CS/2+5,b.gy*CS+CS/2-8,3+b.timer%5,0,Math.PI*2);ctx.fill();
  }
  // Explosions
  for(const ex of explosions){
    const a=ex.life/EXPLODE_TIME;
    ctx.globalAlpha=a;
    ctx.fillStyle="#ff8800";ctx.fillRect(ex.gx*CS,ex.gy*CS,CS,CS);
    ctx.fillStyle="#ffcc00";ctx.fillRect(ex.gx*CS+5,ex.gy*CS+5,CS-10,CS-10);
    ctx.globalAlpha=1;
  }
  // Players
  drawDuck(isH?p1:p2,CHARS[isH?selChar:oChar],noclip);
  drawDuck(isH?p2:p1,CHARS[isH?oChar:selChar],false);
}

function drawDuck(p,ch,nc){
  const sx=p.slide>0?(Math.random()-0.5)*3:0;
  const gx=p.gx*CS+CS/2,gy=p.gy*CS+CS/2;
  ctx.save();ctx.translate(gx+sx,gy);
  // Body
  ctx.fillStyle=ch.body;ctx.beginPath();ctx.ellipse(0,2,14,12,0,0,Math.PI*2);ctx.fill();
  // Head
  ctx.beginPath();ctx.arc(0,-8,9,0,Math.PI*2);ctx.fill();
  // Hair tuft
  ctx.fillStyle=ch.hair;ctx.beginPath();ctx.ellipse(0,-16,6,4,0,0,Math.PI*2);ctx.fill();
  // Eyes
  ctx.fillStyle="#333";ctx.beginPath();ctx.arc(-4,-10,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(4,-10,2.5,0,Math.PI*2);ctx.fill();
  // Beak
  ctx.fillStyle="#f0a030";ctx.beginPath();ctx.ellipse(0,-7,5,2.5,0,0,Math.PI*2);ctx.fill();
  // Feet
  ctx.fillStyle="#f0a030";ctx.fillRect(-8,12,6,4);ctx.fillRect(2,12,6,4);
  // Noclip shimmer
  if(nc){ctx.strokeStyle="rgba(255,215,0,0.4)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
}

// ===== Init =====
buildGrid();draw();
