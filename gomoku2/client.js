const MQTT_BROKER="wss://broker-cn.emqx.io:8084/mqtt";
const BS=15,MT=0,BK=1,WH=2;
const THEMES=[
  {n:"竹林雅韵",bg:["#0a1a0a","#1a2a1a"],bd:"#c8e0a0",gl:"#4a6a3a",bkg:"#e8f0d0",bkS:"#2a4a2a",whS:"#f0f8e0",ac:"#6a9a5a",sg:["#4a8a3a","#3a7a2a"]},
  {n:"水墨丹青",bg:["#1a1a1a","#2a2a2a"],bd:"#d0d0c0",gl:"#606050",bkg:"#e8e8d8",bkS:"#1a1a1a",whS:"#f8f8f0",ac:"#808070",sg:["#404040","#303030"]},
  {n:"樱花烂漫",bg:["#2a0a1a","#3a1a2a"],bd:"#f0d0d8",gl:"#b08088",bkg:"#fff0f2",bkS:"#4a2a3a",whS:"#fff8fa",ac:"#d090a0",sg:["#c08090","#b07080"]},
  {n:"星河璀璨",bg:["#0a0a2a","#1a1a3a"],bd:"#3a3a6a",gl:"#6060a0",bkg:"#2a2a5a",bkS:"#0a0a1a",whS:"#c0c0f0",ac:"#8080d0",sg:["#4040a0","#303090"]}
];

const $=id=>document.getElementById(id);
const el={};
["lobby","game","ls","rd","rct","sa","btnGo","ja","gt","cb","toast",
 "gi","gAI","gDb","gSk","gUndo","hp1","hp2","p1n","p2n","btnC","btnSJ","btnJ",
 "ri","gc","wo","we","wt","wok","godPanel","btnUndo","btnRestart","btnLeave",
 "ghostStone","btnSkill","btnShield","shieldCnt","parContainer"].forEach(id=>{el[id]=$(id);});

const cv=el.gc,ctx=cv.getContext("2d");
let CS=36,P=28,CSz=560,dpr=1;

let mc=null,rc="",isH=false,myId=0,selT=0;
let gS=false,gO=false,gA=false,dM=false,sUndo=false;
let godAI=false,godDM=false,godSk=false,godUndo=false;
let tC=0,tT=null;
let board=[],cp=BK,wn=null,wc=[],lm=null,hs=[];
let shieldCnt=0,skillUsed=false;
// Drag state
let dragMode=false,dragR=-1,dragC=-1,isTouch=false;

// Theme select
let selTheme=0;
document.querySelectorAll(".card").forEach(c=>{
  c.addEventListener("click",function(){
    const p=this.parentElement;
    p.querySelectorAll(".card").forEach(x=>x.classList.remove("sel"));
    this.classList.add("sel");
    if(this.dataset.t!==undefined)selTheme=parseInt(this.dataset.t);
  });
});

function toast(m,t){el.toast.textContent=m;el.toast.className="show"+(t?" "+t:"");clearTimeout(el.toast._t);el.toast._t=setTimeout(()=>el.toast.classList.remove("show"),2500);}
function ss(m,c){el.ls.textContent=m;el.ls.className="st"+(c?" "+c:"");}

// ===== MQTT =====
function myT(){return"gm2/"+rc+"/"+(isH?"h":"j");}
function opT(){return"gm2/"+rc+"/"+(isH?"j":"h");}
function coM(){
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  mc=mqtt.connect(MQTT_BROKER,{clientId:"gm2_"+Math.random().toString(36).substring(2,10),clean:true});
  mc.on("connect",()=>{
    mc.subscribe(opT());
    if(isH){el.rct.textContent=rc;el.rd.style.display="block";ss("等待对方...","");el.btnC.style.display="none";el.btnSJ.style.display="none";}
    else ss("已连接！","succ");
    mc.publish(myT(),JSON.stringify({t:"hello"}));
  });
  mc.on("message",(t,m)=>{try{handleMsg(JSON.parse(m.toString()));}catch(e){}});
  mc.on("error",()=>{if(isH){ss("创建失败","err");toast("连接失败","err");el.btnC.disabled=false;}else{ss("连接失败","err");toast("连接失败","err");el.btnJ.disabled=false;}});
  mc.on("offline",()=>{if(gS)toast("断开","err");else{ss("断开","err");rL();}});
}
function send(d){if(mc&&mc.connected)mc.publish(myT(),JSON.stringify(d));}

function handleMsg(d){
  if(d.t==="hello"){if(isH){ss("✅ 对手已连接！","succ");el.sa.style.display="block";}}
  if(d.t==="start"){initG();}
  if(d.t==="move"&&d.id!==myId){
    if(board[d.r][d.c]===MT){
      board[d.r][d.c]=d.p||cp;hs.push({p:d.p||cp,r:d.r,c:d.c});lm={r:d.r,c:d.c};
      cp=cp===BK?WH:BK;db();uP();
      if(cw(d.r,d.c,d.p||(cp===BK?WH:BK))){gO=true;wn=d.p||(cp===BK?WH:BK);uP();db();sw();}
    }
  }
  if(d.t==="undo"&&d.id!==myId){undo(false);}
  if(d.t==="restart"){ib();toast("对方要求重开","");}
  if(d.t==="skill"){
    if(d.sk==="rat"&&d.id!==myId&&hs.length>0){
      const last=hs[hs.length-1];board[last.r][last.c]=MT;hs.pop();
      lm=hs.length>0?{r:hs[hs.length-1].r,c:hs[hs.length-1].c}:null;
      cp=cp===BK?WH:BK;db();uP();showParticles(last.r,last.c,"#ffd700");toast("🐭 你的棋子被侠盗偷走了！","");
    }
    if(d.sk==="shield"&&d.id===myId){shieldCnt=Math.max(0,shieldCnt-1);el.shieldCnt.textContent=shieldCnt;toast("🛡️ 护盾已激活！","");}
  }
  if(d.t==="leave"){toast("对方离开了 😢","err");gO=true;gS=false;}
}
function rL(){el.btnC.disabled=false;el.btnJ.disabled=false;el.btnC.style.display="";el.btnSJ.style.display="";el.ja.style.display="none";el.rd.style.display="none";el.sa.style.display="none";ss("创建或加入房间 🎯","");}
el.btnC.addEventListener("click",()=>{ss("生成中...","");el.btnC.disabled=true;rc=Math.floor(1000+Math.random()*9000).toString();isH=true;myId=1;coM();});
el.btnSJ.addEventListener("click",()=>{el.ja.style.display="block";el.btnSJ.style.display="none";});
el.btnJ.addEventListener("click",()=>{const c=el.ri.value.trim();if(!c||c.length!==4||isNaN(c)){toast("输入4位房间号");return;}ss("连接...","");rc=c;isH=false;myId=2;el.btnJ.disabled=true;coM();});
el.btnGo.addEventListener("click",()=>{if(!mc||!mc.connected){toast("断开","err");return;}send({t:"start"});if(isH)initG();});

function initG(){
  gS=true;gO=false;el.lobby.style.display="none";el.game.style.display="flex";el.cb.textContent="🟢 已连接";
  board=Array.from({length:BS},()=>Array(BS).fill(MT));
  cp=BK;wn=null;wc=[];lm=null;hs=[];shieldCnt=0;skillUsed=false;dM=false;
  el.shieldCnt.textContent="0";el.btnShield.disabled=true;el.btnSkill.disabled=false;
  resizeC();uP();db();
  requestAnimationFrame(gameLoop);
}

function resizeC(){
  const r=el.boardArea.getBoundingClientRect(),s=Math.min(Math.floor(r.width),560);
  dpr=window.devicePixelRatio||1;
  cv.width=s*dpr;cv.height=s*dpr;cv.style.width=s+"px";cv.style.height=s+"px";
  CSz=s;P=s*0.05;CS=(CSz-2*P)/(BS-1);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  db();
}

function ib(){
  board=Array.from({length:BS},()=>Array(BS).fill(MT));
  cp=BK;gO=false;wn=null;wc=[];lm=null;hs=[];dM=false;
  if(gS){uP();db();}
}

function uP(){
  el.btnUndo.disabled=hs.length===0;
}

// ===== Drag-to-Place =====
function getGrid(e){
  const r=cv.getBoundingClientRect();
  const x=(e.clientX-r.left)*(CSz/r.width),y=(e.clientY-r.top)*(CSz/r.height);
  const c=Math.round((x-P)/CS),rw=Math.round((y-P)/CS);
  if(rw<0||rw>=BS||c<0||c>=BS)return null;
  return {r:rw,c};
}

function showGhost(r,c){
  const th=THEMES[selTheme];
  const x=P+c*CS,y=P+r*CS;
  const rect=cv.getBoundingClientRect();
  el.ghostStone.style.left=(rect.left+x)+"px";
  el.ghostStone.style.top=(rect.top+y)+"px";
  el.ghostStone.style.width=(CS*0.85)+"px";
  el.ghostStone.style.height=(CS*0.85)+"px";
  el.ghostStone.style.background=cp===BK?th.bkS:th.whS;
  el.ghostStone.style.boxShadow="0 0 20px "+th.ac;
  el.ghostStone.style.display="block";
}

// Mouse drag
cv.addEventListener("mousedown",e=>{
  if(!gS||gO)return;
  const g=getGrid(e);if(!g||board[g.r][g.c]!==MT)return;
  dragMode=true;dragR=g.r;dragC=g.c;isTouch=false;
  showGhost(g.r,g.c);
});
document.addEventListener("mousemove",e=>{
  if(!dragMode)return;
  const g=getGrid(e);if(!g)return;
  if(g.r!==dragR||g.c!==dragC){
    if(board[g.r][g.c]===MT){dragR=g.r;dragC=g.c;showGhost(g.r,g.c);}
    else el.ghostStone.style.display="none";
  }
});
document.addEventListener("mouseup",e=>{
  if(!dragMode)return;
  dragMode=false;el.ghostStone.style.display="none";
  if(dragR>=0&&board[dragR][dragC]===MT&&!gO){placeMove(dragR,dragC);}
});

// Touch drag
cv.addEventListener("touchstart",e=>{
  if(!gS||gO)return;
  isTouch=true;const t=e.changedTouches[0];
  const g=getGrid({clientX:t.clientX,clientY:t.clientY});if(!g||board[g.r][g.c]!==MT)return;
  dragMode=true;dragR=g.r;dragC=g.c;showGhost(g.r,g.c);
},{passive:false});
document.addEventListener("touchmove",e=>{
  if(!dragMode||!isTouch)return;
  const t=e.changedTouches[0];
  const g=getGrid({clientX:t.clientX,clientY:t.clientY});if(!g)return;
  if(g.r!==dragR||g.c!==dragC){
    if(board[g.r][g.c]===MT){dragR=g.r;dragC=g.c;showGhost(g.r,g.c);}
    else el.ghostStone.style.display="none";
  }
},{passive:false});
document.addEventListener("touchend",e=>{
  if(!dragMode||!isTouch)return;
  dragMode=false;isTouch=false;el.ghostStone.style.display="none";
  if(dragR>=0&&board[dragR][dragC]===MT&&!gO){placeMove(dragR,dragC);}
},{passive:false});

// ===== Place Move =====
function placeMove(r,c){
  if(gO||board[r][c]!==MT)return;
  board[r][c]=cp;hs.push({p:cp,r,c});lm={r,c};
  send({t:"move",r,c,p:cp});
  showParticles(r,c,cp===BK?"#555":"#fff");
  db();
  if(cw(r,c,cp)){gO=true;wn=cp;uP();db();sw();return;}
  if(hs.length===BS*BS){gO=true;uP();toast("平局！","");return;}
  if(dM&&cp===myColor&&!skillUsed){skillUsed=true;uP();return;}
  skillUsed=false;cp=cp===BK?WH:BK;uP();
  // Give shield after opponent's 2nd move
  if(hs.length===4)shieldCnt++;el.shieldCnt.textContent=shieldCnt;el.btnShield.disabled=shieldCnt<=0;
  // Grant skill periodically
  if(hs.length%8===0&&shieldCnt<3){shieldCnt++;el.shieldCnt.textContent=shieldCnt;el.btnShield.disabled=false;toast("🛡️ 获得护盾！","");}
}

function undo(sendMsg=true){
  if(hs.length===0)return;
  const m=hs.pop();board[m.r][m.c]=MT;
  lm=hs.length>0?{r:hs[hs.length-1].r,c:hs[hs.length-1].c}:null;
  cp=m.p;if(gO&&wn){gO=false;wn=null;wc=[];}
  skillUsed=false;uP();db();
  if(sendMsg)send({t:"undo"});
}

function cw(r,c,p){
  const ds=[[1,0],[0,1],[1,1],[1,-1]];
  for(const[dr,dc]of ds){
    const cells=[[r,c]];let rr=r+dr,cc=c+dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cells.push([rr,cc]);rr+=dr;cc+=dc;}
    rr=r-dr;cc=c-dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cells.push([rr,cc]);rr-=dr;cc-=dc;}
    if(cells.length>=5){wc=cells;return true;}
  }
  return false;
}

// ===== Smart AI (pattern-based, Go master level) =====
function smartAI(){
  if(gO)return null;
  let best=-1e9,bestM=null;
  for(let r=0;r<BS;r++)for(let c=0;c<BS;c++){
    if(board[r][c]!==MT)continue;
    let sc=0;const near=isNear(r,c,2);if(!near)continue;
    const off=evalPos(r,c,cp);const def=evalPos(r,c,cp===BK?WH:BK);
    sc=off*1.1+def*1.2; // Defense weighted slightly higher
    // Center preference
    const cx=(BS-1)/2;sc-=(Math.abs(r-cx)+Math.abs(c-cx))*2;
    // Double-threat detection bonus
    if(countThreats(r,c,cp)>=2)sc+=5000;
    if(countThreats(r,c,cp===BK?WH:BK)>=2)sc+=8000; // Block double threats
    if(sc>best){best=sc;bestM={r,c};}
  }
  // Fallback to center
  if(!bestM){
    for(let r=0;r<BS;r++)for(let c=0;c<BS;c++)if(board[r][c]===MT){
      if(!bestM||Math.abs(r-7)+Math.abs(c-7)<Math.abs(bestM.r-7)+Math.abs(bestM.c-7))bestM={r,c};
    }
  }
  return bestM;
}

function isNear(r,c,d){
  for(let dr=-d;dr<=d;dr++)for(let dc=-d;dc<=d;dc++)
    if(r+dr>=0&&r+dr<BS&&c+dc>=0&&c+dc<BS&&board[r+dr][c+dc]!==MT)return true;
  return false;
}

function evalPos(r,c,p){
  const ds=[[1,0],[0,1],[1,1],[1,-1]];let t=0;
  for(const[dr,dc]of ds){
    let cnt=1,op=0;let rr=r+dr,cc=c+dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cnt++;rr+=dr;cc+=dc;}
    if(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===MT)op++;
    rr=r-dr;cc=c-dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cnt++;rr-=dr;cc-=dc;}
    if(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===MT)op++;
    t+=ps(cnt,op);
  }
  return t;
}

function ps(cnt,op){
  if(cnt>=5)return 100000;
  if(op===0)return 0;
  const scores={
    "4,2":50000,"4,1":5000,
    "3,2":3000,"3,1":300,
    "2,2":200,"2,1":20,
    "1,2":10,"1,1":1
  };
  return scores[cnt+","+op]||0;
}

function countThreats(r,c,p){
  const ds=[[1,0],[0,1],[1,1],[1,-1]];let n=0;
  for(const[dr,dc]of ds){
    let cnt=1;let rr=r+dr,cc=c+dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cnt++;rr+=dr;cc+=dc;}
    rr=r-dr;cc=c-dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cnt++;rr-=dr;cc-=dc;}
    if(cnt>=3)n++;
  }
  return n;
}

// ===== Skills =====
el.btnSkill.addEventListener("click",()=>{
  if(!gS||gO||hs.length===0){toast("没有棋子可偷","");return;}
  const opp=cp===BK?WH:BK;let idx=hs.length-1;
  while(idx>=0&&hs[idx].p!==opp)idx--;
  if(idx<0){toast("没有对手的棋子","");return;}
  const tgt=hs[idx];board[tgt.r][tgt.c]=MT;hs.splice(idx,1);
  lm=hs.length>0?{r:hs[hs.length-1].r,c:hs[hs.length-1].c}:null;
  gO=false;wn=null;wc=[];skillUsed=false;cp=cp===BK?WH:BK;
  send({t:"skill",sk:"rat"});
  showParticles(tgt.r,tgt.c,"#ffd700");
  toast("🐭 侠盗老鼠偷走了对手的棋子！","");
  db();uP();
});

el.btnShield.addEventListener("click",()=>{
  if(shieldCnt<=0){toast("没有护盾了","");return;}
  shieldCnt--;el.shieldCnt.textContent=shieldCnt;
  if(shieldCnt<=0)el.btnShield.disabled=true;
  toast("🛡️ 护盾已展开！","");
  send({t:"skill",sk:"shield"});
});

// Kill one-click undo with god mode
el.btnUndo.addEventListener("click",()=>undo(true));
el.btnRestart.addEventListener("click",()=>{ib();send({t:"restart"});});
el.btnLeave.addEventListener("click",()=>{
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  gS=false;el.game.style.display="none";el.lobby.style.display="flex";rL();
});
el.wok.addEventListener("click",()=>el.wo.classList.remove("show"));
el.wo.addEventListener("click",e=>{if(e.target===el.wo)el.wo.classList.remove("show");});

// ===== God Mode =====
el.gt.addEventListener("click",function(){
  if(gA)return;tC++;clearTimeout(tT);
  if(tC>=5){
    gA=true;el.godPanel.classList.add("show");el.gi.style.display="inline";
    toast("✨ 上帝模式已激活","");el.gt.style.color="#ffd700";
    el.gt.style.textShadow="0 0 20px rgba(255,215,0,0.5)";
    setTimeout(()=>{el.gt.style.color="";el.gt.style.textShadow="";},1000);
    return;
  }
  tT=setTimeout(()=>{tC=0;},1200);if(tC===4)toast("还差一次 ✨","");
});
document.addEventListener("keydown",e=>{if(e.ctrlKey&&e.key==="g"){e.preventDefault();if(gA){el.godPanel.classList.toggle("show");toast(el.godPanel.classList.contains("show")?"👑 工具箱已开":"关闭","");}}});
el.gAI.addEventListener("click",function(){
  const m=smartAI();if(!m){toast("没有可下的位置","");return;}
  placeMove(m.r,m.c);toast("🤖 大师AI已落子","");
});
el.gDb.addEventListener("click",function(){dM=!dM;this.classList.toggle("on",dM);toast(dM?"🔁 双倍下子已开启":"已关闭","");});
el.gSk.addEventListener("click",()=>el.btnSkill.click());
el.gUndo.addEventListener("click",()=>{undo(true);toast("↩️ 一键悔棋","");});

// ===== Particles =====
function showParticles(r,c,color){
  const rect=cv.getBoundingClientRect();
  const x=P+c*CS,y=P+r*CS;
  const px=rect.left+x,py=rect.top+y;
  for(let i=0;i<8;i++){
    const d=document.createElement("div");
    d.className="pr";
    d.style.left=(px+(Math.random()-0.5)*30)+"px";
    d.style.top=(py+(Math.random()-0.5)*30)+"px";
    d.style.width=(4+Math.random()*6)+"px";
    d.style.height=d.style.width;
    d.style.borderRadius="50%";
    d.style.background=color;
    d.style.boxShadow="0 0 10px "+color;
    el.parContainer.appendChild(d);
    setTimeout(()=>d.remove(),600);
  }
}

// ===== Game Loop =====
function gameLoop(){
  db();requestAnimationFrame(gameLoop);
}

// ===== Canvas Drawing =====
function db(){
  const s=CSz;if(!s||s<10)return;
  const th=THEMES[selTheme];
  const grad=ctx.createLinearGradient(0,0,0,s);
  grad.addColorStop(0,th.bg[0]);grad.addColorStop(1,th.bg[1]);
  ctx.fillStyle=grad;ctx.fillRect(0,0,s,s);
  // Stars for starry theme
  if(selTheme===3){
    ctx.fillStyle="rgba(255,255,255,0.3)";
    for(let i=0;i<50;i++){ctx.beginPath();ctx.arc(Math.random()*s,Math.random()*s,Math.random()*1.5,0,Math.PI*2);ctx.fill();}
  }
  // Board
  ctx.fillStyle=th.bd;ctx.fillRect(P-8,P-8,CSz-2*P+16,CSz-2*P+16);
  // Grid
  ctx.strokeStyle=th.gl;ctx.lineWidth=0.8;
  for(let i=0;i<BS;i++){const p=P+i*CS;ctx.beginPath();ctx.moveTo(P,p);ctx.lineTo(P+(BS-1)*CS,p);ctx.stroke();ctx.beginPath();ctx.moveTo(p,P);ctx.lineTo(p,P+(BS-1)*CS);ctx.stroke();}
  // Star points
  const stars=[[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
  for(const[r,c]of stars){ctx.beginPath();ctx.arc(P+c*CS,P+r*CS,CS*0.12,0,Math.PI*2);ctx.fillStyle=th.gl;ctx.fill();}
  // Winning highlight
  if(wc.length>0){
    ctx.save();
    for(const[r,c]of wc){ctx.beginPath();ctx.arc(P+c*CS,P+r*CS,CS*0.48,0,Math.PI*2);ctx.fillStyle="rgba(255,215,0,0.15)";ctx.fill();}
    ctx.restore();
  }
  // Stones
  for(let r=0;r<BS;r++)for(let c=0;c<BS;c++)if(board[r][c]!==MT)ds(r,c,board[r][c],th);
  // Last move marker
  if(lm){ctx.beginPath();ctx.arc(P+lm.c*CS,P+lm.r*CS,CS*0.08,0,Math.PI*2);ctx.fillStyle="#ff4444";ctx.fill();}
  // Border
  ctx.strokeStyle=th.gl;ctx.lineWidth=1.5;ctx.strokeRect(P-8,P-8,CSz-2*P+16,CSz-2*P+16);
}

function ds(r,c,p,th){
  const x=P+c*CS,y=P+r*CS,rr=CS*0.42;
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,0.3)";ctx.shadowBlur=4;ctx.shadowOffsetY=2;
  ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);
  if(p===BK){
    const g=ctx.createRadialGradient(x-rr*0.3,y-rr*0.3,rr*0.1,x,y,rr);
    g.addColorStop(0,th.sg[0]);g.addColorStop(0.6,th.sg[1]);g.addColorStop(1,"#111");
    ctx.fillStyle=g;
  } else {
    const g=ctx.createRadialGradient(x-rr*0.3,y-rr*0.3,rr*0.1,x,y,rr);
    g.addColorStop(0,"#fff");g.addColorStop(0.7,th.whS);g.addColorStop(1,"#d0d0d0");
    ctx.fillStyle=g;
  }
  ctx.fill();
  ctx.shadowBlur=0;
  // Shine
  ctx.beginPath();ctx.arc(x-rr*0.25,y-rr*0.25,rr*0.25,0,Math.PI*2);
  ctx.fillStyle="rgba(255,255,255,0.15)";ctx.fill();
  ctx.restore();
}

// ===== Win =====
function sw(){
  el.we.textContent=wn===myColor?"🎉":"😅";
  el.wt.textContent=wn===myColor?"你赢了！":"对方赢了";
  el.wo.classList.add("show");
}

// ===== Init =====
function init(){
  board=Array.from({length:BS},()=>Array(BS).fill(MT));
  setTimeout(resizeC,100);
  db();
}
init();
window.addEventListener("resize",()=>{if(gS)resizeC();});