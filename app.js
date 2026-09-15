const DB_NAME="card-vault",DB_VERSION=2,CARD_STORE="cards",FOLDER_STORE="folders";
let db,cards=[],folders=[],current=0,currentFolder=null,editingId=null;
let pressTimer=null,draggedId=null,dragging=false,moved=false,startX=0,startY=0,lastPinch=0,zoom=1;

const $=id=>document.getElementById(id);
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(CARD_STORE)){const s=d.createObjectStore(CARD_STORE,{keyPath:"id",autoIncrement:true});s.createIndex("order","order")}if(!d.objectStoreNames.contains(FOLDER_STORE))d.createObjectStore(FOLDER_STORE,{keyPath:"id",autoIncrement:true})};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function request(req){return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
const allCards=()=>request(store(CARD_STORE).getAll());
const allFolders=()=>request(store(FOLDER_STORE).getAll());
const putCard=c=>request(store(CARD_STORE,"readwrite").put(c));
const deleteCard=id=>request(store(CARD_STORE,"readwrite").delete(id));
const addFolder=f=>request(store(FOLDER_STORE,"readwrite").add(f));
const deleteFolder=id=>request(store(FOLDER_STORE,"readwrite").delete(id));

async function refresh(){
 cards=(await allCards()).sort((a,b)=>(a.order??a.id)-(b.order??b.id));
 folders=await allFolders();
 renderFolderFilter();renderGrid();
}
function visibleCards(){return currentFolder===null?cards:cards.filter(c=>c.folderId===currentFolder)}
function renderGrid(){
 const list=visibleCards();$("empty").classList.toggle("hidden",list.length>0);
 $("grid").innerHTML="";
 list.forEach((c,i)=>{
  const b=document.createElement("div");b.className="thumb";b.setAttribute("role","button");b.setAttribute("tabindex","0");b.dataset.id=c.id;
  b.innerHTML=`<img src="${c.front}" alt="Card ${i+1}" draggable="false">${c.back?'<span class="badge">2-sided</span>':''}<button class="more-btn" type="button" aria-label="Card options">⋯</button><span class="drag-hint">Hold & drag</span>`;
  b.addEventListener("click",e=>{if(e.target.closest(".more-btn"))return;if(!dragging&&!moved)openViewer(cards.indexOf(c))});
  b.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest(".more-btn")){e.preventDefault();openViewer(cards.indexOf(c));}});
  b.querySelector(".more-btn").addEventListener("pointerdown",e=>{e.stopPropagation();clearTimeout(pressTimer)});
  b.querySelector(".more-btn").addEventListener("click",e=>{e.stopPropagation();showActions(c.id)});
  b.addEventListener("contextmenu",e=>{e.preventDefault();showActions(c.id)});
  b.addEventListener("pointerdown",e=>startPress(e,b,c.id));
  b.addEventListener("pointermove",e=>movePress(e,b,c.id));
  b.addEventListener("pointerup",e=>endPress(e,b,c.id));
  b.addEventListener("pointercancel",e=>endPress(e,b,c.id));
  $("grid").appendChild(b);
 });
}
function startPress(e,el,id){
 if(e.pointerType==="mouse"&&e.button!==0)return;
 moved=false;dragging=false;
 const x=e.clientX,y=e.clientY;
 clearTimeout(pressTimer);
 pressTimer=setTimeout(()=>beginDrag(el,id),420);
 el.setPointerCapture?.(e.pointerId);
 el.dataset.sx=x;el.dataset.sy=y;
}
function movePress(e,el,id){
 const dx=e.clientX-(+el.dataset.sx||e.clientX),dy=e.clientY-(+el.dataset.sy||e.clientY);
 if(Math.hypot(dx,dy)>9){moved=true;if(!dragging)clearTimeout(pressTimer)}
 if(dragging){
  e.preventDefault();
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".thumb");
  document.querySelectorAll(".drag-over").forEach(x=>x.classList.remove("drag-over"));
  if(target&&target!==el)target.classList.add("drag-over");
 }
}
function endPress(e,el,id){
 clearTimeout(pressTimer);
 if(dragging){finishDrag(el,id,e);return}
 setTimeout(()=>moved=false,0);
}
function beginDrag(el,id){
 dragging=true;draggedId=id;$("grid").classList.add("reordering");el.classList.add("dragging");
 if(navigator.vibrate)navigator.vibrate(20);
}
async function finishDrag(el,id,e){
 const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".thumb");
 const targetId=target?.dataset.id;
 el.classList.remove("dragging");$("grid").classList.remove("reordering");
 document.querySelectorAll(".drag-over").forEach(x=>x.classList.remove("drag-over"));
 dragging=false;
 if(targetId&&targetId!==String(id)){
  const from=cards.findIndex(c=>c.id===id),to=cards.findIndex(c=>c.id===Number(targetId));
  const movedCard=cards.splice(from,1)[0];cards.splice(to,0,movedCard);
  for(let i=0;i<cards.length;i++){cards[i].order=i;await putCard(cards[i])}
  renderGrid();
 }
}
function showEditor(id=null){
 editingId=id;
 const c=id?cards.find(x=>x.id===id):null;
 $("editorTitle").textContent=c?"Edit Card":"Add Card";
 $("frontInput").value="";$("backInput").value="";
 $("frontPreview").src=c?.front||"";$("backPreview").src=c?.back||"";
 $("frontPreview").parentElement.classList.toggle("has-image",!!c?.front);
 $("backPreview").parentElement.classList.toggle("has-image",!!c?.back);
 renderFolderSelect(c?.folderId??currentFolder);
 $("editor").classList.remove("hidden");
 $("editor").setAttribute("aria-hidden","false");
}
function renderFolderSelect(selected=null){
 $("folderSelect").innerHTML='<option value="">No Folder</option>'+folders.map(f=>`<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
 $("folderSelect").value=selected??"";
}
function bindPreview(input,img){input.onchange=async()=>{if(input.files[0]){img.src=await fileData(input.files[0]);img.parentElement.classList.add("has-image")}}}
const fileData=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)});
bindPreview($("frontInput"),$("frontPreview"));bindPreview($("backInput"),$("backPreview"));
$("addBtn").onclick=()=>showEditor();$("emptyAdd").onclick=()=>showEditor();
$("cancelBtn").onclick=closeEditor;
function closeEditor(){$("editor").classList.add("hidden");$("editor").setAttribute("aria-hidden","true");editingId=null}
$("doneBtn").onclick=async()=>{
 const existing=editingId?cards.find(c=>c.id===editingId):null;
 if(!existing&&!$("frontInput").files[0]){alert("Please choose a front photo.");return}
 const front=$("frontInput").files[0]?await fileData($("frontInput").files[0]):existing.front;
 const back=$("backInput").files[0]?await fileData($("backInput").files[0]):(existing?.back||null);
 const folderId=$("folderSelect").value?Number($("folderSelect").value):null;
 const c={...(existing||{}),front,back,folderId,order:existing?.order??cards.length,created:existing?.created??Date.now()};
 await putCard(c);closeEditor();await refresh();
};
function renderFolderFilter(){
 const name=currentFolder===null?"All Cards":(folders.find(f=>f.id===currentFolder)?.name||"All Cards");
 $("folderFilterBtn").textContent=name+" ▾";
}
$("folderFilterBtn").onclick=showFolderMenu;$("closeFolderMenu").onclick=closeFolderMenu;
function showFolderMenu(){renderFolderList();$("folderMenu").classList.remove("hidden")}
function closeFolderMenu(){$("folderMenu").classList.add("hidden")}
function renderFolderList(){
 const all=`<button class="folder-row ${currentFolder===null?"selected":""}" data-folder="">All Cards <span class="count">${cards.length}</span></button>`;
 const rows=folders.map(f=>{const count=cards.filter(c=>c.folderId===f.id).length;return `<div class="folder-row ${currentFolder===f.id?"selected":""}" data-folder="${f.id}">📁 ${escapeHtml(f.name)} <span class="count">${count}</span><button class="folder-delete" data-delete="${f.id}" aria-label="Delete folder">×</button></div>`}).join("");
 $("folderList").innerHTML=all+rows;
 $("folderList").querySelectorAll("[data-folder]").forEach(el=>el.onclick=async e=>{if(e.target.dataset.delete)return;currentFolder=el.dataset.folder===""?null:Number(el.dataset.folder);closeFolderMenu();renderFolderFilter();renderGrid()});
 $("folderList").querySelectorAll("[data-delete]").forEach(btn=>btn.onclick=async e=>{e.stopPropagation();const id=Number(btn.dataset.delete);if(!confirm("Delete this folder? Cards will be kept."))return;await deleteFolder(id);for(const c of cards.filter(c=>c.folderId===id)){c.folderId=null;await putCard(c)}if(currentFolder===id)currentFolder=null;await refresh();renderFolderList()});
}
$("newFolderBtn").onclick=async()=>{const name=prompt("Folder name");if(name?.trim()){await addFolder({name:name.trim(),created:Date.now()});await refresh();renderFolderList()}};

function showActions(id){
 const c=cards.find(x=>x.id===id);if(!c)return;
 $("actionPreview").src=c.front;$("actions").dataset.id=id;$("actions").classList.remove("hidden");
}
$("cancelActions").onclick=()=>$("actions").classList.add("hidden");
$("editBtn").onclick=()=>{const id=Number($("actions").dataset.id);$("actions").classList.add("hidden");showEditor(id)};
$("deleteBtn").onclick=async()=>{const id=Number($("actions").dataset.id);if(confirm("Delete this card? This cannot be undone.")){await deleteCard(id);$("actions").classList.add("hidden");await refresh()}};

function openViewer(i){
 if(!cards[i])return;
 current=i;zoom=1;
 $("viewer").classList.remove("hidden");
 renderViewer();
 updateOrientationLock();
 requestAnimationFrame(()=>scrollToCard(current,false));
}
function buildViewerTrack(){
 const track=$("cardTrack");
 track.innerHTML="";
 const list=visibleCards();
 // Viewer navigation is based on the actual card array, not the thumbnail grid.
 // Each slide occupies one full viewport, so native scroll-snap can do the hard work.
 list.forEach((c,i)=>{
   const slide=document.createElement("div");
   slide.className="cardSlide";
   slide.dataset.index=String(cards.indexOf(c));
   const card=document.createElement("div");
   card.className="card3d";
   card.id=i===current?"card":"";
   card.dataset.index=String(cards.indexOf(c));
   card.innerHTML=`<div class="face frontFace"><img alt="Card ${cards.indexOf(c)+1}" draggable="false"></div><div class="face backFace"><img alt="Card ${cards.indexOf(c)+1} back" draggable="false"></div>`;
   card.querySelector(".frontFace img").src=c.front;
   card.querySelector(".backFace img").src=c.back||c.front;
   card.classList.toggle("no-back",!c.back);
   slide.appendChild(card);
   track.appendChild(slide);
 });
}
function renderViewer(){
 buildViewerTrack();
 applyZoom();
}
function scrollToCard(index,smooth=true){
 const stage=$("cardStage"), list=visibleCards();
 const local=list.findIndex(c=>cards.indexOf(c)===index);
 if(local<0)return;
 stage.scrollTo({left:local*stage.clientWidth,behavior:smooth?"smooth":"auto"});
}
function getCenteredIndex(){
 const stage=$("cardStage"),list=visibleCards();
 if(!list.length)return -1;
 const local=Math.round(stage.scrollLeft/Math.max(1,stage.clientWidth));
 return cards.indexOf(list[Math.max(0,Math.min(list.length-1,local))]);
}
function flip(){
 const c=cards[current];
 if(!c?.back)return;
 const card=$("card");
 if(!card)return;
 card.classList.toggle("flipped");
 applyZoom();
}
function next(dir){
 const n=current+dir;
 if(n<0||n>=cards.length)return;
 current=n;
 scrollToCard(current,true);
}

// The viewer is a real horizontal scroll surface. Touch/trackpad drags are native
// scrolling; CSS scroll-snap settles the nearest card into the exact center.
const stage=$("cardStage");
let scrollSnapTimer=0;
let lastCentered=current;
stage.addEventListener("scroll",()=>{
 const idx=getCenteredIndex();
 if(idx<0)return;
 if(idx!==lastCentered){
   lastCentered=idx;
   current=idx;
   zoom=1;
   updateViewerCardState();
 }
 clearTimeout(scrollSnapTimer);
 scrollSnapTimer=setTimeout(()=>{
   const target=getCenteredIndex();
   if(target>=0)scrollToCard(target,true);
 },90);
},{passive:true});

// Mouse wheel becomes horizontal card scrolling. Trackpads can still use their
// native horizontal deltas, while a vertical wheel is translated into the same axis.
stage.addEventListener("wheel",e=>{
 if($("viewer").classList.contains("hidden"))return;
 if(Math.abs(e.deltaX)<Math.abs(e.deltaY))e.preventDefault();
 const delta=Math.abs(e.deltaX)>=Math.abs(e.deltaY)?e.deltaX:e.deltaY;
 if(Math.abs(delta)<0.5)return;
 stage.scrollBy({left:delta,behavior:"auto"});
},{passive:false});

function updateViewerCardState(){
 const track=$("cardTrack");
 track.querySelectorAll(".card3d").forEach(el=>{
   const idx=Number(el.dataset.index);
   if(idx!==current)el.classList.remove("flipped");
   el.id=idx===current?"card":"";
 });
 const card=$("card");
 if(card){
   const c=cards[current];
   card.classList.toggle("no-back",!c?.back);
   applyZoom();
 }
}
function pointerDistance(){
 const a=[...pointers.values()];
 return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
}
function applyZoom(){
 const card=$("card");
 if(!card)return;
 const rotation=card.classList.contains("flipped")?" rotateY(180deg)":"";
 card.style.transform=`scale(${zoom})${rotation}`;
 $("viewer").classList.toggle("zooming",zoom>1);
}

// Pinch zoom is kept, but one-finger movement is deliberately left to the native
// scroll surface above instead of being interpreted as a swipe command.
const pointers=new Map();
let gestureStartX=0,gestureStartY=0,gestureMoved=false,pinchStart=0,zoomStart=1;
stage.addEventListener("pointerdown",e=>{
 if(e.pointerType==="mouse"&&e.button!==0)return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){gestureStartX=e.clientX;gestureStartY=e.clientY;gestureMoved=false;}
 if(pointers.size===2){pinchStart=pointerDistance();zoomStart=zoom;$("viewer").classList.add("zooming");}
});
stage.addEventListener("pointermove",e=>{
 if(!pointers.has(e.pointerId))return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2){
   if(pinchStart){zoom=Math.min(4,Math.max(1,zoomStart*(pointerDistance()/pinchStart)));applyZoom();}
   gestureMoved=true;e.preventDefault();return;
 }
 if(pointers.size===1&&Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>10)gestureMoved=true;
},{passive:false});
stage.addEventListener("pointerup",finishPointer);
stage.addEventListener("pointercancel",finishPointer);
function finishPointer(e){
 if(!pointers.has(e.pointerId))return;
 pointers.delete(e.pointerId);
 if(pointers.size===0){
   $("viewer").classList.remove("zooming");
   pinchStart=0;
   if(!gestureMoved&&Math.abs(e.clientX-gestureStartX)<15&&Math.abs(e.clientY-gestureStartY)<15&&zoom===1)flip();
 }
}
$("closeViewer").onclick=()=>$("viewer").classList.add("hidden");
document.addEventListener("keydown",e=>{
 if($("viewer").classList.contains("hidden"))return;
 if(e.key==="ArrowRight")next(1);
 if(e.key==="ArrowLeft")next(-1);
 if(e.key==="Escape")$("viewer").classList.add("hidden");
 if(e.key===" "){e.preventDefault();flip();}
});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

// Keep the viewer itself unchanged when the device rotates. The browser simply
// gives it the new viewport dimensions; the cards and their scroll direction stay the same.
function updateOrientationLock(){
  const stage=$("cardStage");
  if(!stage || $("viewer").classList.contains("hidden"))return;
  requestAnimationFrame(()=>{
    const list=visibleCards();
    const local=list.findIndex(c=>cards.indexOf(c)===current);
    if(local>=0)stage.scrollTo({left:local*stage.clientWidth,behavior:"auto"});
  });
}
window.addEventListener("resize",updateOrientationLock);
window.addEventListener("orientationchange",()=>setTimeout(updateOrientationLock,120));

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

// Persistent appearance + theme preferences.
const savedAppearance=localStorage.getItem("card-vault-theme")||"dark";
const savedVisualTheme=localStorage.getItem("card-vault-visual-theme")||"glass";
if(savedAppearance==="light")document.body.classList.add("light");
if(savedVisualTheme==="glass")document.body.classList.add("liquid-glass");

function applyAppearance(mode){
  document.body.classList.toggle("light",mode==="light");
  localStorage.setItem("card-vault-theme",mode);
  syncSettingsUI();
}
function applyVisualTheme(theme){
  document.body.classList.toggle("liquid-glass",theme==="glass");
  localStorage.setItem("card-vault-visual-theme",theme);
  syncSettingsUI();
}

// Persistent music preference. Playback is tied to app visibility; it pauses when
// the PWA/browser is hidden and resumes immediately when it becomes visible again.
const themeMusic=$("themeMusic");
let musicOn=localStorage.getItem("card-vault-music")==="on";
let musicNeedsGesture=false;
themeMusic.volume=.42;
function updateMusicPlayback(){
  if(musicOn && document.visibilityState==="visible"){
    const p=themeMusic.play();
    if(p&&typeof p.catch==="function")p.catch(()=>{musicNeedsGesture=true});
  }else{
    themeMusic.pause();
    musicNeedsGesture=false;
  }
}
function unlockMusic(){
  if(!musicOn || document.visibilityState!=="visible")return;
  const p=themeMusic.play();
  if(p&&typeof p.then==="function")p.then(()=>{musicNeedsGesture=false}).catch(()=>{});
}
function setMusic(on){
  musicOn=!!on;
  localStorage.setItem("card-vault-music",musicOn?"on":"off");
  if(musicOn){
    musicNeedsGesture=false;
    updateMusicPlayback();
  }else{
    themeMusic.pause();
  }
  syncSettingsUI();
}

document.addEventListener("visibilitychange",updateMusicPlayback);
window.addEventListener("pagehide",()=>themeMusic.pause());
window.addEventListener("pageshow",()=>{if(musicOn)updateMusicPlayback()});
window.addEventListener("focus",()=>{if(musicOn)updateMusicPlayback()});
themeMusic.addEventListener("ended",()=>{if(musicOn&&document.visibilityState==="visible")updateMusicPlayback()});
// Some browsers block audio autoplay after a complete app/browser restart.
// Use the first real interaction as an autoplay-unlock fallback.
["pointerdown","touchstart","keydown"].forEach(type=>document.addEventListener(type,unlockMusic,{passive:true}));
updateMusicPlayback();

// Settings menu consolidates appearance, music, and visual theme controls.
function syncSettingsUI(){
  const mode=document.body.classList.contains("light")?"light":"dark";
  const visual=document.body.classList.contains("liquid-glass")?"glass":"flat";
  document.querySelectorAll("#appearanceOptions button").forEach(b=>b.classList.toggle("selected",b.dataset.appearance===mode));
  document.querySelectorAll("#themeOptions button").forEach(b=>b.classList.toggle("selected",b.dataset.theme===visual));
  const toggle=$("musicToggle");
  toggle.textContent=musicOn?"On":"Off";
  toggle.setAttribute("aria-pressed",String(musicOn));
  toggle.classList.toggle("selected",musicOn);
}
function showSettings(){
  syncSettingsUI();
  $("settingsMenu").classList.remove("hidden");
  $("settingsMenu").setAttribute("aria-hidden","false");
  $("settingsBtn").setAttribute("aria-expanded","true");
}
function closeSettings(){
  $("settingsMenu").classList.add("hidden");
  $("settingsMenu").setAttribute("aria-hidden","true");
  $("settingsBtn").setAttribute("aria-expanded","false");
}
$("settingsBtn").onclick=()=>$("settingsMenu").classList.contains("hidden")?showSettings():closeSettings();
$("closeSettings").onclick=closeSettings;
$("appearanceOptions").querySelectorAll("button").forEach(b=>b.onclick=()=>applyAppearance(b.dataset.appearance));
$("themeOptions").querySelectorAll("button").forEach(b=>b.onclick=()=>applyVisualTheme(b.dataset.theme));
$("musicToggle").onclick=()=>setMusic(!musicOn);
$("settingsMenu").addEventListener("click",e=>{if(e.target===$("settingsMenu"))closeSettings()});
syncSettingsUI();

openDB().then(refresh).catch(err=>alert("Could not open local storage: "+err));
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});

// Modal quality-of-life: tapping the dimmed area closes menus, while the
// existing Cancel/Done buttons remain available. Taps inside a sheet stay open.
const modalClosers={
  folderMenu:closeFolderMenu,
  editor:closeEditor,
  actions:()=>$("actions").classList.add("hidden"),
  changeFolderMenu:()=>closeChangeFolderMenu()
};
Object.entries(modalClosers).forEach(([id,close])=>{
  const modal=$(id);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
});

function showChangeFolderMenu(cardId){
  const c=cards.find(x=>x.id===cardId); if(!c)return;
  $("changeFolderMenu").dataset.id=String(cardId);
  renderChangeFolderList(c.folderId??null);
  $("actions").classList.add("hidden");
  $("changeFolderMenu").classList.remove("hidden");
  $("changeFolderMenu").setAttribute("aria-hidden","false");
}
function closeChangeFolderMenu(){
  $("changeFolderMenu").classList.add("hidden");
  $("changeFolderMenu").setAttribute("aria-hidden","true");
}
function renderChangeFolderList(selected){
  const rows=folders.map(f=>`<button class="folder-row ${selected===f.id?"selected":""}" data-folder-id="${f.id}">📁 ${escapeHtml(f.name)}<span class="count">${cards.filter(c=>c.folderId===f.id).length}</span></button>`).join("");
  $("changeFolderList").innerHTML=rows||'<div class="folder-empty">No folders yet. Create one from Folders.</div>';
  $("changeFolderList").querySelectorAll("[data-folder-id]").forEach(btn=>btn.onclick=async()=>{
    const id=Number($("changeFolderMenu").dataset.id); const c=cards.find(x=>x.id===id); if(!c)return;
    c.folderId=Number(btn.dataset.folderId); await putCard(c); closeChangeFolderMenu(); await refresh();
  });
}
$("changeFolderBtn").onclick=()=>showChangeFolderMenu(Number($("actions").dataset.id));
$("cancelChangeFolder").onclick=closeChangeFolderMenu;
$("clearCardFolder").onclick=async()=>{
  const id=Number($("changeFolderMenu").dataset.id); const c=cards.find(x=>x.id===id); if(!c)return;
  c.folderId=null; await putCard(c); closeChangeFolderMenu(); await refresh();
};
