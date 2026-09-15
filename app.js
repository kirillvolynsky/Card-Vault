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
}
function renderViewer(){
 const c=cards[current];
 $("viewFront").src=c.front;
 $("viewBack").src=c.back||c.front;
 $("card").classList.remove("flipped");
 $("card").classList.toggle("no-back",!c.back);
 applyZoom();
}
function flip(){
 if(cards[current]?.back&&zoom===1) $("card").classList.toggle("flipped");
}
function next(dir){
 const n=current+dir;
 if(n<0||n>=cards.length)return;
 const stage=$("cardStage");
 stage.classList.remove("slide-left","slide-right","enter-left","enter-right");
 stage.classList.add(dir>0?"slide-left":"slide-right");
 setTimeout(()=>{
   current=n;zoom=1;renderViewer();
   stage.classList.remove("slide-left","slide-right");
   stage.classList.add(dir>0?"enter-right":"enter-left");
   requestAnimationFrame(()=>requestAnimationFrame(()=>stage.classList.remove("enter-right","enter-left")));
 },170);
}

// Viewer gestures: one-finger swipe/tap + two-finger pinch, using Pointer Events
const pointers=new Map();
let gestureStartX=0,gestureStartY=0,gestureMoved=false,pinchStart=0,zoomStart=1;
const stage=$("cardStage");
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
 if(pointers.size===1&&Math.hypot(e.clientX-gestureStartX,e.clientY-gestureStartY)>10){gestureMoved=true;e.preventDefault();}
},{passive:false});
stage.addEventListener("pointerup",finishPointer);
stage.addEventListener("pointercancel",finishPointer);
function finishPointer(e){
 if(!pointers.has(e.pointerId))return;
 pointers.delete(e.pointerId);
 if(pointers.size===0){
   $("viewer").classList.remove("zooming");
   const dx=e.clientX-gestureStartX,dy=e.clientY-gestureStartY;
   if(zoom===1&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)) next(dx<0?1:-1);
   else if(zoom===1&&!gestureMoved&&Math.abs(dx)<15&&Math.abs(dy)<15) flip();
 }
}
function pointerDistance(){
 const a=[...pointers.values()];
 return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
}
function applyZoom(){
 const card=$("card");
 const rotation=card.classList.contains("flipped")?" rotateY(180deg)":"";
 card.style.transform=`scale(${zoom})${rotation}`;
 $("viewer").classList.toggle("zooming",zoom>1);
}
$("closeViewer").onclick=()=>$("viewer").classList.add("hidden");
document.addEventListener("keydown",e=>{
 if($("viewer").classList.contains("hidden"))return;
 if(e.key==="ArrowRight")next(1);
 if(e.key==="ArrowLeft")next(-1);
 if(e.key==="Escape")$("viewer").classList.add("hidden");
 if(e.key===" "){e.preventDefault();flip();}
});
function updateOrientationLock(){
 const landscape=window.matchMedia("(orientation: landscape)").matches;
 $("viewer").classList.toggle("landscape-lock",landscape);
}
window.addEventListener("resize",()=>{if(!$("viewer").classList.contains("hidden"))updateOrientationLock();});
window.addEventListener("orientationchange",()=>setTimeout(updateOrientationLock,50));

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

const savedTheme=localStorage.getItem("card-vault-theme");if(savedTheme==="light")document.body.classList.add("light");$("themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("card-vault-theme",document.body.classList.contains("light")?"light":"dark")};
openDB().then(refresh).catch(err=>alert("Could not open local storage: "+err));
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
