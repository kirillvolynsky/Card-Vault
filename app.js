const DB_NAME="card-vault", STORE="cards";
let db, cards=[], current=0, startX=0, moved=false;

const $=id=>document.getElementById(id);
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id",autoIncrement:true});r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
function tx(mode="readonly"){return db.transaction(STORE,mode).objectStore(STORE)}
function allCards(){return new Promise((res,rej)=>{const r=tx().getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function addCard(card){return new Promise((res,rej)=>{const r=tx("readwrite").add(card);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function fileData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}

async function refresh(){
 cards=await allCards();
 $("empty").classList.toggle("hidden",cards.length>0);
 $("grid").innerHTML="";
 cards.forEach((c,i)=>{
   const b=document.createElement("button");b.className="thumb";b.dataset.i=i;
   b.innerHTML=`<img src="${c.front}" alt="Card ${i+1}">${c.back?'<span class="badge">2-sided</span>':''}`;
   b.onclick=()=>openViewer(i);$("grid").appendChild(b);
 });
}
function showEditor(){
 $("editor").classList.remove("hidden");
 $("frontInput").value="";$("backInput").value="";
 $("frontPreview").src="";$("backPreview").src="";
 $("frontPreview").parentElement.classList.remove("has-image");
 $("backPreview").parentElement.classList.remove("has-image");
}
function bindPreview(input, img){
 input.onchange=async()=>{if(input.files[0]){img.src=await fileData(input.files[0]);img.parentElement.classList.add("has-image")}};
}
bindPreview($("frontInput"),$("frontPreview"));bindPreview($("backInput"),$("backPreview"));
$("addBtn").onclick=showEditor;$("emptyAdd").onclick=showEditor;
$("cancelBtn").onclick=()=>$("editor").classList.add("hidden");
$("doneBtn").onclick=async()=>{
 if(!$("frontInput").files[0]){alert("Please upload a front image.");return}
 const front=await fileData($("frontInput").files[0]);
 const back=$("backInput").files[0]?await fileData($("backInput").files[0]):null;
 await addCard({front,back,created:Date.now()});
 $("editor").classList.add("hidden");await refresh();
};

function openViewer(i){
 current=i;$("viewer").classList.remove("hidden");renderViewer();
}
function renderViewer(){
 const c=cards[current];$("viewFront").src=c.front;$("viewBack").src=c.back||c.front;
 $("card").classList.remove("flipped");$("card").classList.toggle("no-back",!c.back);
 $("counter").textContent=`${current+1} / ${cards.length}`;
}
function flip(){if(cards[current]?.back)$("card").classList.toggle("flipped")}
$("cardStage").onclick=e=>{if(!moved)flip();moved=false};
$("cardStage").addEventListener("touchstart",e=>{startX=e.touches[0].clientX;moved=false},{passive:true});
$("cardStage").addEventListener("touchmove",()=>{moved=true},{passive:true});
$("cardStage").addEventListener("touchend",e=>{
 const dx=e.changedTouches[0].clientX-startX;
 if(Math.abs(dx)>50){if(dx<0&&current<cards.length-1)current++;else if(dx>0&&current>0)current--;else {moved=false;return}renderViewer()}
});
$("closeViewer").onclick=()=>$("viewer").classList.add("hidden");
document.addEventListener("keydown",e=>{
 if($("viewer").classList.contains("hidden"))return;
 if(e.key==="ArrowRight"&&current<cards.length-1){current++;renderViewer()}
 if(e.key==="ArrowLeft"&&current>0){current--;renderViewer()}
 if(e.key==="Escape")$("viewer").classList.add("hidden");
 if(e.key===" "){e.preventDefault();flip()}
});
openDB().then(refresh);

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
