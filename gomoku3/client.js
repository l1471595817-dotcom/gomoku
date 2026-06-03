const MQTT_BROKER="wss://broker-cn.emqx.io:8084/mqtt";
const BS=15,MT=0,BK=1,WH=2;
const THEMES=[
  {n:"竹林雅韵",bg:["#0a1a0a","#1a2a1a"],bd:"#c8e0a0",gl:"#4a6a3a",bkS:"#2a4a2a",whS:"#f0f8e0",sg:["#4a8a3a","#3a7a2a"]},
  {n:"水墨丹青",bg:["#1a1a1a","#2a2a2a"],bd:"#d0d0c0",gl:"#606050",bkS:"#1a1a1a",whS:"#f8f8f0",sg:["#404040","#303030"]},
  {n:"樱花烂漫",bg:["#2a0a1a","#3a1a2a"],bd:"#f0d0d8",gl:"#b08088",bkS:"#4a2a3a",whS:"#fff8fa",sg:["#c08090","#b07080"]},
  {n:"星河璀璨",bg:["#0a0a2a","#1a1a3a"],bd:"#3a3a6a",gl:"#6060a0",bkS:"#0a0a1a",whS:"#c0c0f0",sg:["#4040a0","#303090"]}
];

const $=id=>document.getElementById(id);
const el={};
["lobby","game","ls","rd","rct","sa","btnGo","ja","gt","cb","toast","gi",
 "btnC","btnSJ","btnJ","ri","gc","wo","we","wt","wok","godPanel",
 "btnUndo","btnRestart","btnLeave","ghostStone","turnInfo",
 "bkBlack","bkWhite","btnEgg","btnFlower",
 "gAI","gTime","gRat","p1a","p2a","p1n","p2n",
 "deceptionOverlay","decText","ratOverlay","ratAnim",
 "boardWrapper"].forEach(id=>{el[id]=$(id);});

const cv=el.gc,ctx=cv.getContext("2d");
let CS=36,P=28,CSz=520,dpr=1;

let mc=null,rc="",isH=false,myId=0,selT=0;
let gS=false,gO=false,gA=false;
let tC=0,tT=null;
let board=[],cp=BK,wn=null,wc=[],lm=null,hs=[];
let aiEnabled=false;

// Theme
let selTheme=0;
document.querySelectorAll(".card").forEach(c=>{
  c.addEventListener("click",function(){
    const p=this.parentElement;
    p.querySelectorAll(".card").forEach(x=>x.classList.remove("sel"));
    this.classList.add("sel");
    if(this.dataset.t!==undefined)selTheme=parseInt(this.dataset.t);
  });
});

function toast(m,t){el.toast.textContent=m;el.toast.className="show"+(t?" "+t:"");clearTimeout(el.toast._t);el.toast._t=setTimeout(()=>el.toast.classList.remove("show"),3000);}
function ss(m,c){el.ls.textContent=m;el.ls.className="st"+(c?" "+c:"");}

// ===== MQTT =====
function myT(){return"g3/"+rc+"/"+(isH?"h":"j");}
function opT(){return"g3/"+rc+"/"+(isH?"j":"h");}
function coM(){
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  mc=mqtt.connect(MQTT_BROKER,{clientId:"g3_"+Math.random().toString(36).substring(2,10),clean:true});
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
      cp=cp===BK?WH:BK;db();uP();chkWin(d.r,d.c,d.p||(cp===BK?WH:BK));
    }
  }
  if(d.t==="undo"){
    if(hs.length>0){const m=hs.pop();board[m.r][m.c]=MT;lm=hs.length>0?{r:hs[hs.length-1].r,c:hs[hs.length-1].c}:null;cp=m.p;gO=false;wn=null;wc=[];db();uP();}
  }
  if(d.t==="rat"&&d.id!==myId){showWindDec();doUndo();toast("🌬️ 风太大，您的棋子不幸滚落出局了！","");}
  if(d.t==="egg"&&d.id!==myId){el.p1a.classList.remove("shake");void el.p1a.offsetWidth;el.p1a.classList.add("shake");toast("🥚 对方扔了个鸡蛋！","");}
  if(d.t==="flower"&&d.id!==myId){el.p1a.classList.remove("shake");void el.p1a.offsetWidth;el.p1a.classList.add("shake");toast("🌸 对方送了你一朵花~","");}
  if(d.t==="restart"){ib();toast("对方要求重开","");}
  if(d.t==="leave"){toast("对方离开了 😢","err");gO=true;gS=false;}
}
function rL(){el.btnC.disabled=false;el.btnJ.disabled=false;el.btnC.style.display="";el.btnSJ.style.display="";el.ja.style.display="none";el.rd.style.display="none";el.sa.style.display="none";ss("创建或加入房间 🎯","");}

el.btnC.addEventListener("click",()=>{ss("生成中...","");el.btnC.disabled=true;rc=Math.floor(1000+Math.random()*9000).toString();isH=true;myId=1;coM();});
el.btnSJ.addEventListener("click",()=>{el.ja.style.display="block";el.btnSJ.style.display="none";});
el.btnJ.addEventListener("click",()=>{const c=el.ri.value.trim();if(!c||c.length!==4||isNaN(c)){toast("输入4位房间号");return;}ss("连接...","");rc=c;isH=false;myId=2;el.btnJ.disabled=true;coM();});
el.btnGo.addEventListener("click",()=>{if(!mc||!mc.connected){toast("断开","err");return;}send({t:"start"});if(isH)initG();});

// ===== 游戏初始化 =====
function initG(){
  gS=true;gO=false;
  el.lobby.style.display="none";el.game.style.display="flex";el.game.classList.add("show");
  el.cb.textContent="🟢 已连接";
  board=Array.from({length:BS},()=>Array(BS).fill(MT));
  cp=BK;wn=null;wc=[];lm=null;hs=[];
  el.turnInfo.textContent="你的回合 · 拖拽棋子到棋盘";
  // 关键：确保布局稳定后再量尺寸
  requestAnimationFrame(()=>{resizeC();uP();db();updateBaskets();});
}

// ===== Canvas 尺寸修复（黄金比例保命版）=====
function resizeC(){
  const wrapper=el.boardWrapper;
  if(!wrapper){cv.width=0;cv.height=0;CSz=0;return;}
  const rect=wrapper.getBoundingClientRect();
  if(rect.width<10||rect.height<10){CSz=0;return;}
  const s=Math.floor(Math.min(rect.width,rect.height,600));
  dpr=window.devicePixelRatio||1;
  cv.width=s*dpr;
  cv.height=s*dpr;
  cv.style.width=s+"px";
  cv.style.height=s+"px";
  CSz=s;
  P=s*0.05;
  CS=(CSz-2*P)/(BS-1);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  db();
}

function ib(){board=Array.from({length:BS},()=>Array(BS).fill(MT));cp=BK;gO=false;wn=null;wc=[];lm=null;hs=[];if(gS){uP();db();updateBaskets();}}

function doUndo(){
  if(hs.length===0)return;
  const m=hs.pop();board[m.r][m.c]=MT;
  lm=hs.length>0?{r:hs[hs.length-1].r,c:hs[hs.length-1].c}:null;
  cp=m.p;gO=false;wn=null;wc=[];db();uP();updateBaskets();
}

function uP(){el.btnUndo.disabled=hs.length===0;}
function updateBaskets(){
  el.bkBlack.style.display="flex";
  el.bkWhite.style.display="flex";
  el.colBlack=document.getElementById("colBlack");
  el.colWhite=document.getElementById("colWhite");
  const myTurn=cp===myColor();
  if(el.colBlack)el.colBlack.style.opacity=(isH&&myTurn)?"1":"0.25";
  if(el.colWhite)el.colWhite.style.opacity=(!isH&&myTurn)?"1":"0.25";
  el.turnInfo.textContent=gO?(wn===myColor()?"🎉 你赢了！":"😅 对方赢了"):(myTurn?"你的回合 · 拖拽棋子到棋盘":"等待对方下棋...");
}
function myColor(){return isH?BK:WH;}

// ===== 拖拽系统 =====
let dragActive=false,dragColor=BK,dragR=-1,dragC=-1,dragValid=false,touchId=null;

function startDrag(color,e){
  dragActive=true;dragColor=color;
  el.ghostStone.style.display="block";
  el.ghostStone.style.background=color===BK?"#2a4a2a":"#f0f8f0";
  el.ghostStone.style.boxShadow="0 0 20px rgba(200,200,200,0.3)";
  updateDrag(e);
}

function updateDrag(e){
  if(!dragActive)return;
  const rect=cv.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(CSz/rect.width),y=(e.clientY-rect.top)*(CSz/rect.height);
  const c=Math.round((x-P)/CS),rw=Math.round((y-P)/CS);
  el.ghostStone.style.left=(e.clientX)+"px";
  el.ghostStone.style.top=(e.clientY)+"px";
  el.ghostStone.style.width=(CS*0.85)+"px";el.ghostStone.style.height=(CS*0.85)+"px";
  if(rw>=0&&rw<BS&&c>=0&&c<BS&&board[rw][c]===MT){
    dragR=rw;dragC=c;dragValid=true;el.ghostStone.style.opacity="0.6";
  } else {
    dragValid=false;el.ghostStone.style.opacity="0.3";
  }
  // 实时重绘预览
  db();
}

function endDrag(e){
  if(!dragActive)return;
  dragActive=false;touchId=null;
  el.ghostStone.style.display="none";
  if(dragValid&&!gO&&cp===myColor()){placeMove(dragR,dragC);}
  dragValid=false;dragR=-1;dragC=-1;
  db();
}

// 鼠标事件
document.querySelectorAll(".bs").forEach(bs=>{
  bs.addEventListener("mousedown",e=>{
    const col=bs.closest(".basket")?.id==="bkBlack"?BK:WH;
    if(gO||cp!==myColor())return;
    if(isH&&col===WH)return;
    if(!isH&&col===BK)return;
    startDrag(col,e);
  });
});
document.addEventListener("mousemove",e=>{if(dragActive)updateDrag(e);});
document.addEventListener("mouseup",e=>{if(dragActive)endDrag(e);});

// 触摸事件
document.querySelectorAll(".bs").forEach(bs=>{
  bs.addEventListener("touchstart",e=>{
    const col=bs.closest(".basket")?.id==="bkBlack"?BK:WH;
    if(gO||cp!==myColor())return;
    if(isH&&col===WH)return;
    if(!isH&&col===BK)return;
    const t=e.changedTouches[0];touchId=t.identifier;
    startDrag(col,{clientX:t.clientX,clientY:t.clientY});
  },{passive:false});
});
document.addEventListener("touchmove",e=>{
  if(!dragActive||touchId===null)return;
  for(let i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier===touchId){
      updateDrag({clientX:e.changedTouches[i].clientX,clientY:e.changedTouches[i].clientY});
    }
  }
},{passive:false});
document.addEventListener("touchend",e=>{
  if(!dragActive)return;
  endDrag({});
},{passive:false});

// ===== 落子 =====
function placeMove(r,c){
  if(gO||board[r][c]!==MT||cp!==myColor())return;
  board[r][c]=cp;hs.push({p:cp,r,c});lm={r,c};
  send({t:"move",r,c,p:cp});
  particles(r,c,cp===BK?"#555":"#fff",6);
  db();
  if(chkWin(r,c,cp))return;
  if(hs.length===BS*BS){gO=true;uP();toast("平局！","");el.turnInfo.textContent="平局！";return;}
  cp=cp===BK?WH:BK;uP();updateBaskets();
}

function chkWin(r,c,p){
  const ds=[[1,0],[0,1],[1,1],[1,-1]];
  for(const[dr,dc]of ds){
    const cells=[[r,c]];let rr=r+dr,cc=c+dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cells.push([rr,cc]);rr+=dr;cc+=dc;}
    rr=r-dr;cc=c-dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===p){cells.push([rr,cc]);rr-=dr;cc-=dc;}
    if(cells.length>=5){wc=cells;gO=true;wn=p;db();uP();
      el.we.textContent=wn===myColor()?"🎉":"😅";el.wt.textContent=wn===myColor()?"你赢了！":"对方赢了";
      el.wo.classList.add("show");return true;}
  }
  return false;
}

// ===== Minimax AI with Alpha-Beta (Depth 3) =====
function grandmasterAI(){
  if(gO)return null;
  let candidates=[];
  for(let r=0;r<BS;r++)for(let c=0;c<BS;c++){
    if(board[r][c]!==MT||!isNear(r,c,2))continue;
    const sc=evalCell(r,c,cp)*1.0+evalCell(r,c,cp===BK?WH:BK)*1.15;
    candidates.push({r,c,sc});
  }
  if(candidates.length===0){
    for(let r=0;r<BS;r++)for(let c=0;c<BS;c++)if(board[r][c]===MT)candidates.push({r,c,sc:0});
  }
  candidates.sort((a,b)=>b.sc-a.sc);
  const top=candidates.slice(0,10);
  if(top.length===0)return null;
  let best={r:top[0].r,c:top[0].c,val:-1e9};
  for(const{ r:ir,c:ic }of top){
    board[ir][ic]=cp;
    const val=minimax(3,-1e9,1e9,false,cp===BK?WH:BK,ir,ic);
    board[ir][ic]=MT;
    if(val>best.val){best={r:ir,c:ic,val};}
  }
  return best;
}

function minimax(depth,alpha,beta,isMax,player,lastR,lastC){
  if(depth===0)return evaluate(player,lastR,lastC);
  if(cwCheck(player,lastR,lastC))return isMax?100000-depth:-100000+depth;
  const opp=player===BK?WH:BK;
  if(cwCheck(opp,lastR,lastC))return isMax?-100000+depth:100000-depth;
  let cands=[];
  for(let r=0;r<BS;r++)for(let c=0;c<BS;c++){
    if(board[r][c]!==MT||!isNear(r,c,1))continue;
    cands.push({r,c,sc:evalCell(r,c,player)*1.1+evalCell(r,c,opp)});
  }
  if(cands.length===0)return evaluate(player,lastR,lastC);
  cands.sort((a,b)=>b.sc-a.sc);
  cands=cands.slice(0,7);
  if(isMax){
    let maxV=-1e9;
    for(const{ r,c }of cands){
      board[r][c]=player;
      const v=minimax(depth-1,alpha,beta,false,opp,r,c);
      board[r][c]=MT;
      maxV=Math.max(maxV,v);
      alpha=Math.max(alpha,v);
      if(beta<=alpha)break;
    }
    return maxV;
  } else {
    let minV=1e9;
    for(const{ r,c }of cands){
      board[r][c]=player;
      const v=minimax(depth-1,alpha,beta,true,opp,r,c);
      board[r][c]=MT;
      minV=Math.min(minV,v);
      beta=Math.min(beta,v);
      if(beta<=alpha)break;
    }
    return minV;
  }
}

function cwCheck(player,r,c){
  const ds=[[1,0],[0,1],[1,1],[1,-1]];
  for(const[dr,dc]of ds){
    let cnt=1;let rr=r+dr,cc=c+dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===player){cnt++;rr+=dr;cc+=dc;}
    rr=r-dr;cc=c-dc;
    while(rr>=0&&rr<BS&&cc>=0&&cc<BS&&board[rr][cc]===player){cnt++;rr-=dr;cc-=dc;}
    if(cnt>=5)return true;
  }
  return false;
}

function evaluate(player,r,c){
  return evalCell(r,c,player)-evalCell(r,c,player===BK?WH:BK)*1.1;
}

function evalCell(r,c,p){
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
  const sc={"4,2":50000,"4,1":5000,"3,2":3000,"3,1":300,"2,2":200,"2,1":20,"1,2":10,"1,1":1};
  return sc[cnt+","+op]||0;
}

function isNear(r,c,d){
  for(let dr=-d;dr<=d;dr++)for(let dc=-d;dc<=d;dc++)
    if(r+dr>=0&&r+dr<BS&&c+dc>=0&&c+dc<BS&&board[r+dr][c+dc]!==MT)return true;
  return false;
}

// ===== God Mode 2.0 =====
el.gt.addEventListener("click",function(){
  if(gA)return;tC++;clearTimeout(tT);
  if(tC>=5){
    gA=true;el.godPanel.classList.add("show");el.gi.style.display="inline";
    toast("✨ 上帝操控台已解锁","");el.gt.style.color="#ffd700";
    setTimeout(()=>el.gt.style.color="",1000);return;
  }
  tT=setTimeout(()=>{tC=0;},1200);if(tC===4)toast("还差一次 ✨","");
});
document.addEventListener("keydown",e=>{if(e.ctrlKey&&e.key==="g"){e.preventDefault();if(gA){el.godPanel.classList.toggle("show");toast(el.godPanel.classList.contains("show")?"👑 已开":"关闭","");}}});

el.gAI.addEventListener("click",function(){
  const m=grandmasterAI();if(!m){toast("无可下位置","");return;}
  placeMove(m.r,m.c);toast("🧠 大师AI已落子 (α-β 深度3)","");
});

el.gTime.addEventListener("click",function(){
  if(hs.length<2){toast("没有足够的棋子回退","");return;}
  doUndo();if(hs.length>0)doUndo();
  send({t:"undo"});send({t:"undo"});
  toast("⏳ 时空倒流成功，棋子已撤回","");
  showDecText("网络波动，正在重连及同步棋局...");
  setTimeout(()=>el.deceptionOverlay.classList.remove("show"),2500);
});

el.gRat.addEventListener("click",function(){
  if(hs.length<1){toast("没有棋子可偷","");return;}
  const opp=cp===BK?WH:BK;let idx=hs.length-1;
  while(idx>=0&&hs[idx].p!==opp)idx--;
  if(idx<0){toast("没有对手的棋子","");return;}
  const tgt=hs[idx];
  showRatAnim();
  board[tgt.r][tgt.c]=MT;hs.splice(idx,1);
  lm=hs.length>0?{r:hs[hs.length-1].r,c:hs[hs.length-1].c}:null;
  gO=false;wn=null;wc=[];cp=cp===BK?WH:BK;
  db();uP();updateBaskets();
  send({t:"rat"});
  particles(tgt.r,tgt.c,"#ffd700",8);
  toast("🐭 侠盗老鼠已得手！","");
});

function showWindDec(){
  const w=document.createElement("div");w.className="windEffect";
  document.body.appendChild(w);
  showDecText("🌬️ 风太大了！您的棋子被吹跑了...");
  setTimeout(()=>{w.remove();el.deceptionOverlay.classList.remove("show");},2500);
}
function showDecText(t){
  el.decText.textContent=t;
  el.deceptionOverlay.classList.add("show");
}
function showRatAnim(){
  el.ratOverlay.classList.add("show");
  setTimeout(()=>el.ratOverlay.classList.remove("show"),1300);
}

// ===== Egg & Flower =====
el.btnEgg.addEventListener("click",()=>{if(!gS)return;send({t:"egg"});el.p2a.classList.remove("shake");void el.p2a.offsetWidth;el.p2a.classList.add("shake");toast("🥚 扔了鸡蛋！","");});
el.btnFlower.addEventListener("click",()=>{if(!gS)return;send({t:"flower"});el.p2a.classList.remove("shake");void el.p2a.offsetWidth;el.p2a.classList.add("shake");toast("🌸 送了朵花~","");});

// ===== Actions =====
el.btnUndo.addEventListener("click",()=>{doUndo();send({t:"undo"});updateBaskets();});
el.btnRestart.addEventListener("click",()=>{ib();send({t:"restart"});updateBaskets();});
el.btnLeave.addEventListener("click",()=>{
  if(mc){try{mc.end(true)}catch(e){}mc=null}
  gS=false;
  el.game.style.display="none";el.game.classList.remove("show");
  el.lobby.style.display="flex";rL();
});
el.wok.addEventListener("click",()=>el.wo.classList.remove("show"));
el.wo.addEventListener("click",e=>{if(e.target===el.wo)el.wo.classList.remove("show");});

// ===== Particles =====
function particles(r,c,color,n){
  const rect=cv.getBoundingClientRect();
  const x=P+c*CS+rect.left,y=P+r*CS+rect.top;
  for(let i=0;i<n;i++){
    const d=document.createElement("div");d.className="pr";
    d.style.left=(x+(Math.random()-0.5)*40)+"px";d.style.top=(y+(Math.random()-0.5)*40)+"px";
    d.style.width=(3+Math.random()*5)+"px";d.style.height=d.style.width;
    d.style.background=color;d.style.boxShadow="0 0 8px "+color;
    document.body.appendChild(d);setTimeout(()=>d.remove(),500);
  }
}

// ===== Game Loop =====
function gameLoop(){if(gS)db();requestAnimationFrame(gameLoop);}

// ===== Drawing =====
function db(){
  const s=CSz;if(!s||s<10)return;
  const th=THEMES[selTheme];
  const grad=ctx.createLinearGradient(0,0,0,s);
  grad.addColorStop(0,th.bg[0]);grad.addColorStop(1,th.bg[1]);
  ctx.fillStyle=grad;ctx.fillRect(0,0,s,s);
  if(selTheme===3)for(let i=0;i<40;i++){ctx.fillStyle="rgba(255,255,255,0.2)";ctx.beginPath();ctx.arc(Math.random()*s,Math.random()*s,Math.random()*1.2,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle=th.bd;ctx.fillRect(P-6,P-6,CSz-2*P+12,CSz-2*P+12);
  ctx.strokeStyle=th.gl;ctx.lineWidth=0.7;
  for(let i=0;i<BS;i++){const p=P+i*CS;ctx.beginPath();ctx.moveTo(P,p);ctx.lineTo(P+(BS-1)*CS,p);ctx.stroke();ctx.beginPath();ctx.moveTo(p,P);ctx.lineTo(p,P+(BS-1)*CS);ctx.stroke();}
  const stars=[[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
  for(const[r,c]of stars){ctx.beginPath();ctx.arc(P+c*CS,P+r*CS,CS*0.1,0,Math.PI*2);ctx.fillStyle=th.gl;ctx.fill();}
  if(wc.length>0){ctx.save();for(const[r,c]of wc){ctx.beginPath();ctx.arc(P+c*CS,P+r*CS,CS*0.46,0,Math.PI*2);ctx.fillStyle="rgba(255,215,0,0.12)";ctx.fill();}ctx.restore();}
  for(let r=0;r<BS;r++)for(let c=0;c<BS;c++)if(board[r][c]!==MT)ds(r,c,board[r][c],th);
  if(lm){ctx.beginPath();ctx.arc(P+lm.c*CS,P+lm.r*CS,CS*0.07,0,Math.PI*2);ctx.fillStyle="#ff4444";ctx.fill();}
  // 拖拽落子预览
  if(dragActive&&dragValid&&dragR>=0&&dragC>=0){
    ctx.save();
    ctx.beginPath();ctx.arc(P+dragC*CS,P+dragR*CS,CS*0.4,0,Math.PI*2);
    ctx.fillStyle="rgba(255,255,255,0.18)";ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.4)";ctx.lineWidth=1.5;
    ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.strokeStyle=th.gl;ctx.lineWidth=1.2;ctx.strokeRect(P-6,P-6,CSz-2*P+12,CSz-2*P+12);
}

function ds(r,c,p,th){
  const x=P+c*CS,y=P+r*CS,rr=CS*0.4;
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,0.25)";ctx.shadowBlur=3;ctx.shadowOffsetY=1.5;
  ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);
  if(p===BK){const g=ctx.createRadialGradient(x-rr*0.3,y-rr*0.3,rr*0.1,x,y,rr);g.addColorStop(0,th.sg[0]);g.addColorStop(0.6,th.sg[1]);g.addColorStop(1,"#111");ctx.fillStyle=g;}
  else{const g=ctx.createRadialGradient(x-rr*0.3,y-rr*0.3,rr*0.1,x,y,rr);g.addColorStop(0,"#fff");g.addColorStop(0.7,th.whS);g.addColorStop(1,"#d0d0d0");ctx.fillStyle=g;}
  ctx.fill();ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(x-rr*0.25,y-rr*0.25,rr*0.22,0,Math.PI*2);
  ctx.fillStyle="rgba(255,255,255,0.12)";ctx.fill();
  ctx.restore();
}

// ===== Init =====
function init(){
  board=Array.from({length:BS},()=>Array(BS).fill(MT));
  requestAnimationFrame(gameLoop);
}
init();
window.addEventListener("resize",()=>{if(gS)resizeC();});
// 也监听 orientation change
window.addEventListener("orientationchange",()=>{setTimeout(()=>{if(gS)resizeC();},300);});