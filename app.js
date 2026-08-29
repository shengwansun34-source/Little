// ==================== Little app.js v1.2.0 ====================
// 主要变更：对话数据从 localStorage 迁移到 IndexedDB（LittleChatDB）
// 首次运行自动迁移旧 localStorage 数据，迁移完成后删除旧 key
// 头像也迁移到 IndexedDB，释放 localStorage 空间

// ==================== Marked 初始化 ====================
if(typeof marked!=='undefined'){marked.setOptions({breaks:true,gfm:true,highlight:function(code,lang){
  if(typeof hljs!=='undefined'&&lang&&hljs.getLanguage(lang)){try{return hljs.highlight(code,{language:lang}).value}catch{}}
  if(typeof hljs!=='undefined'){try{return hljs.highlightAuto(code).value}catch{}}return code;}});}

// ==================== localStorage 工具（仅用于 settings 等小数据） ====================
const DB={
  get(k,d=null){try{const v=localStorage.getItem('little_'+k);return v?JSON.parse(v):d}catch{return d}},
  set(k,v){localStorage.setItem('little_'+k,JSON.stringify(v))},
  del(k){localStorage.removeItem('little_'+k)}
};

// ==================== 对话存储（IndexedDB） ====================
class ChatStore{
  constructor(){this.dbName='LittleChatDB';this.storeName='chats';this.db=null;}
  async open(){
    if(this.db)return this.db;
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(this.dbName,1);
      req.onupgradeneeded=(e)=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains(this.storeName)){
          const store=db.createObjectStore(this.storeName,{keyPath:'id'});
          store.createIndex('created','created',{unique:false});
        }
      };
      req.onsuccess=(e)=>{this.db=e.target.result;resolve(this.db);};
      req.onerror=(e)=>reject(e);
    });
  }
  async put(chat){
    const db=await this.open();
    return new Promise((r,j)=>{
      const tx=db.transaction(this.storeName,'readwrite');
      tx.objectStore(this.storeName).put(chat);
      tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);
    });
  }
  async get(id){
    const db=await this.open();
    return new Promise((r,j)=>{
      const tx=db.transaction(this.storeName,'readonly');
      const req=tx.objectStore(this.storeName).get(id);
      req.onsuccess=()=>r(req.result||null);
      req.onerror=(e)=>j(e);
    });
  }
  async getAll(){
    const db=await this.open();
    return new Promise((r,j)=>{
      const tx=db.transaction(this.storeName,'readonly');
      const req=tx.objectStore(this.storeName).getAll();
      req.onsuccess=()=>r(req.result);
      req.onerror=(e)=>j(e);
    });
  }
  async remove(id){
    const db=await this.open();
    return new Promise((r,j)=>{
      const tx=db.transaction(this.storeName,'readwrite');
      tx.objectStore(this.storeName).delete(id);
      tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);
    });
  }
  async getAllMeta(){
    // 返回所有对话的元信息（不含完整 messages，用于列表展示）
    const all=await this.getAll();
    return all.map(c=>({id:c.id,title:c.title,created:c.created}));
  }
}
const chatStore=new ChatStore();

// ==================== 头像存储（IndexedDB） ====================
class AvatarStore{
  constructor(){this.dbName='LittleAvatarDB';this.storeName='avatars';this.db=null;}
  async open(){
    if(this.db)return this.db;
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(this.dbName,1);
      req.onupgradeneeded=(e)=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains(this.storeName)){
          db.createObjectStore(this.storeName,{keyPath:'id'});
        }
      };
      req.onsuccess=(e)=>{this.db=e.target.result;resolve(this.db);};
      req.onerror=(e)=>reject(e);
    });
  }
  async get(id){
    const db=await this.open();
    return new Promise((r,j)=>{
      const tx=db.transaction(this.storeName,'readonly');
      const req=tx.objectStore(this.storeName).get(id);
      req.onsuccess=()=>r(req.result?.data||null);
      req.onerror=(e)=>j(e);
    });
  }
  async set(id,data){
    const db=await this.open();
    return new Promise((r,j)=>{
      const tx=db.transaction(this.storeName,'readwrite');
      tx.objectStore(this.storeName).put({id,data});
      tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);
    });
  }
}
const avatarStore=new AvatarStore();

// ==================== 向量存储（IndexedDB） ====================
class VectorStore{
  constructor(){this.dbName='LittleMemoryDB';this.storeName='memories';this.db=null;}
  async open(){if(this.db)return this.db;return new Promise((resolve,reject)=>{const req=indexedDB.open(this.dbName,1);
    req.onupgradeneeded=(e)=>{const db=e.target.result;if(!db.objectStoreNames.contains(this.storeName)){const store=db.createObjectStore(this.storeName,{keyPath:'id'});store.createIndex('category','category',{unique:false});store.createIndex('time','time',{unique:false});}};
    req.onsuccess=(e)=>{this.db=e.target.result;resolve(this.db);};req.onerror=(e)=>reject(e);});}
  async add(m){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).put(m);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});}
  async getAll(){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readonly');const req=tx.objectStore(this.storeName).getAll();req.onsuccess=()=>r(req.result);req.onerror=(e)=>j(e);});}
  async remove(id){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).delete(id);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});}
  cosineSim(a,b){if(!a||!b||a.length!==b.length)return 0;let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return dot/(Math.sqrt(na)*Math.sqrt(nb)||1);}
  async search(qv,topK=5){const all=await this.getAll();if(!qv||all.length===0)return all.slice(0,topK);return all.filter(m=>m.vector&&m.vector.length>0).map(m=>({...m,score:this.cosineSim(qv,m.vector)})).sort((a,b)=>b.score-a.score).slice(0,topK);}
  async searchByKeyword(q,topK=5){const all=await this.getAll();const kws=q.toLowerCase().split(/\s+/);return all.map(m=>{const t=m.text.toLowerCase();let s=0;kws.forEach(k=>{if(t.includes(k))s+=1;});s+=Math.max(0,1-(Date.now()-m.time)/(1e3*60*60*24*365))*0.3;return{...m,score:s};}).sort((a,b)=>b.score-a.score).slice(0,topK);}
}
const vectorStore=new VectorStore();

// ==================== 表情包存储（IndexedDB） ====================
class StickerStore{
  constructor(){this.dbName='LittleStickerDB';this.storeName='stickers';this.db=null;}
  async open(){if(this.db)return this.db;return new Promise((r,j)=>{const req=indexedDB.open(this.dbName,1);
    req.onupgradeneeded=(e)=>{if(!e.target.result.objectStoreNames.contains(this.storeName))e.target.result.createObjectStore(this.storeName,{keyPath:'id'});};
    req.onsuccess=(e)=>{this.db=e.target.result;r(this.db);};req.onerror=(e)=>j(e);});}
  async add(s){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).put(s);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});}
  async getAll(){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readonly');const req=tx.objectStore(this.storeName).getAll();req.onsuccess=()=>r(req.result);req.onerror=(e)=>j(e);});}
  async remove(id){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).delete(id);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});}
}
const stickerStore=new StickerStore();

// ==================== Jina 向量化 ====================
async function getEmbedding(text){
  const k=state.settings.jinaKey;if(!k)return null;
  try{const res=await fetch('https://api.jina.ai/v1/embeddings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+k},body:JSON.stringify({model:'jina-embeddings-v3',task:'text-matching',dimensions:256,input:[{text}]})});
  if(!res.ok)return null;const d=await res.json();return d.data?.[0]?.embedding||null;}catch{return null;}
}

// ==================== 全局状态 ====================
let state={
  chatMetas:[],  // [{id, title, created}] — 轻量列表，从 IndexedDB 加载
  currentChatId:DB.get('currentChat',null),
  currentChatData:null,  // 当前对话的完整数据（含 messages）
  settings:DB.get('settings',{
    apiUrl:'',apiKey:'',model:'gpt-4o',charName:'Little',charNickname:'',
    userName:'',anniversary:'',
    systemPrompt:'你是 Little，一个温柔、真诚的 AI。你会自然地记住关于用户的事情，像老朋友一样。读完记忆后像已经知道一样说话，不要说"根据我的记忆"这种话。不知道的事就直说不知道，绝不编造。',
    autoMemory:'on',jinaKey:'',thinking:'off',customCSS:'',splitReply:'off'
  }),
  lastChatTime:DB.get('lastChatTime',null),
  generating:false
};
if(!state.settings.thinking)state.settings.thinking='off';
if(!state.settings.customCSS)state.settings.customCSS='';
if(!state.settings.charName)state.settings.charName='Little';
if(!state.settings.charNickname&&state.settings.charNickname!=='')state.settings.charNickname='';
if(!state.settings.splitReply)state.settings.splitReply='off';
if(!state.settings.userName&&state.settings.userName!=='')state.settings.userName='';
if(!state.settings.anniversary&&state.settings.anniversary!=='')state.settings.anniversary='';

let currentTab='home';
let fetchedModels=[];
let pendingAttachments=[];
let renamingChatId=null;
let stickerEditing=false;
let pendingImportData=[];
let currentAbortController=null;
let currentHtmlPreviewCode='';
let currentHtmlPreviewName='index.html';
let htmlBlockStore={};

// 缓存头像 base64，避免每次渲染都读 IndexedDB
let cachedUserAvatar=null;
let cachedAiAvatar=null;

// ==================== 基础工具函数 ====================
function saveSettings(){DB.set('settings',state.settings);DB.set('lastChatTime',state.lastChatTime);}
function saveCurrentChatId(){DB.set('currentChat',state.currentChatId);}
async function saveCurrentChat(){
  if(state.currentChatData){
    await chatStore.put(state.currentChatData);
    // 同步更新 meta 列表
    const idx=state.chatMetas.findIndex(m=>m.id===state.currentChatData.id);
    const meta={id:state.currentChatData.id,title:state.currentChatData.title,created:state.currentChatData.created};
    if(idx>=0)state.chatMetas[idx]=meta;
    else state.chatMetas.push(meta);
  }
}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000);}
function now(){return new Date();}
function fmtTime(d){const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;}
function getDisplayName(){return state.settings.charNickname||state.settings.charName||'Little';}
function getTimeContext(){
  const n=now();const wd=['日','一','二','三','四','五','六'];
  let ctx=`当前时间：${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日 星期${wd[n.getDay()]} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  if(state.lastChatTime){const diff=Date.now()-state.lastChatTime;const mins=Math.floor(diff/60000);
    if(mins<5)ctx+='\n（你们刚刚还在聊，话题还热着）';
    else if(mins<30)ctx+=`\n（用户离开了${mins}分钟，刚回来）`;
    else if(mins<180)ctx+=`\n（用户离开了${Math.floor(mins/60)}小时${mins%60}分钟）`;
    else if(mins<1440)ctx+=`\n（距离上次对话已经${Math.floor(mins/60)}小时了）`;
    else ctx+=`\n（距离上次对话已经${Math.floor(mins/1440)}天了）`;
  }else ctx+='\n（这是你们的第一次对话）';
  return ctx;
}
function escHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function renderMarkdown(text){if(typeof marked!=='undefined'){try{return marked.parse(text);}catch{}}return escHtml(text).replace(/\n/g,'<br>');}
function applyCustomCSS(){document.getElementById('customCSSTag').textContent=state.settings.customCSS||'';}

// ==================== 开屏动画 ====================
function hideSplash(){
  const s=document.getElementById('splashScreen');
  if(s){s.classList.add('hide');setTimeout(()=>{if(s.parentNode)s.parentNode.removeChild(s);},800);}
}

// ==================== 全局顶栏 ====================
function updateGlobalHeader(){
  const userName=state.settings.userName||'';
  const aiName=getDisplayName();
  const el=document.getElementById('ghTitle');
  if(el) el.textContent=userName?(userName+'&'+aiName):aiName;
}

// ==================== 左侧 Category 导航 ====================
function toggleCategoryMenu(){
  document.getElementById('catMenu').classList.toggle('open');
  document.getElementById('catOverlay').classList.toggle('open');
}

// ==================== 头像系统（IndexedDB） ====================
function pickUserAvatar(){document.getElementById('userAvatarInput').click();}
function pickAiAvatar(){document.getElementById('aiAvatarInput').click();}
function handleAvatarUpload(e,who){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=(ev)=>{
    const img=new Image();
    img.onload=async()=>{
      const c=document.createElement('canvas');const max=200;
      let w=img.width,h=img.height;
      if(w>h){if(w>max){h*=max/w;w=max;}}else{if(h>max){w*=max/h;h=max;}}
      c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
      const data=c.toDataURL('image/webp',0.8);
      await avatarStore.set(who,data);
      if(who==='user')cachedUserAvatar=data;else cachedAiAvatar=data;
      applyAvatarsToDOM();showToast('Avatar updated');
    };img.src=ev.target.result;
  };reader.readAsDataURL(file);e.target.value='';
}
async function loadAvatars(){
  cachedUserAvatar=await avatarStore.get('user');
  cachedAiAvatar=await avatarStore.get('ai');
  applyAvatarsToDOM();
}
function applyAvatarsToDOM(){
  const ua=cachedUserAvatar;const aa=cachedAiAvatar;
  // Home 页头像
  const uImg=document.getElementById('userAvatarImg');
  const aImg=document.getElementById('aiAvatarImg');
  if(uImg){
    if(ua){uImg.src=ua;uImg.style.display='block';const ph=uImg.parentElement.querySelector('.avatar-ph');if(ph)ph.style.display='none';}
    else{uImg.style.display='none';const ph=uImg.parentElement.querySelector('.avatar-ph');if(ph)ph.style.display='block';}
  }
  if(aImg){
    if(aa){aImg.src=aa;aImg.style.display='block';const ph=aImg.parentElement.querySelector('.avatar-ph');if(ph)ph.style.display='none';}
    else{aImg.style.display='none';const ph=aImg.parentElement.querySelector('.avatar-ph');if(ph)ph.style.display='block';}
  }
}

// ==================== 天气 ====================
async function loadWeather(){
  const el=document.getElementById('weatherContent');
  const sub=document.getElementById('weatherSub');
  if(!el)return;
  el.textContent='Loading...';
  try{
    const res=await fetch('https://wttr.in/?format=%c+%t&lang=zh');
    if(!res.ok)throw new Error(''+res.status);
    const text=await res.text();
    el.textContent=text.trim();
    const n=new Date();const wd=['日','一','二','三','四','五','六'];
    if(sub)sub.textContent=(n.getMonth()+1)+'月'+n.getDate()+'日 星期'+wd[n.getDay()];
  }catch{el.textContent='Tap to load';if(sub)sub.textContent='';}
}

// ==================== Memory 页面计数 ====================
async function updateMemoryGrid(){
  try{const mems=await vectorStore.getAll();const el=document.getElementById('memBankCount');if(el)el.textContent=mems.length+' memories';}catch{}
  const traces=DB.get('lightTraces',[]);const tel=document.getElementById('tracesCount');if(tel)tel.textContent=traces.length+' traces';
}

// ==================== 页面导航系统 ====================
function navigateTo(tab){
  currentTab=tab;
  const pages={home:'homePage',memory:'memoryTabPage',chat:'chatPage',together:'togetherPage',mine:'minePage'};
  Object.values(pages).forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const target=document.getElementById(pages[tab]);if(target)target.style.display='flex';
  const tabs=document.getElementById('bottomTabs');
  const gh=document.getElementById('globalHeader');
  if(tab==='chat'){tabs.classList.add('hidden');gh.classList.add('hidden');}
  else{tabs.classList.remove('hidden');gh.classList.remove('hidden');}
  document.querySelectorAll('.tab-item').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);});
  updateGlobalHeader();
  if(tab==='home'){updateHomePage();applyAvatarsToDOM();}
  if(tab==='memory')updateMemoryGrid();
  DB.set('currentTab',tab);
}

// ==================== HOME 页面逻辑 ====================
function updateHomePage(){
  const userName=state.settings.userName||'You';
  const aiName=getDisplayName();
  document.getElementById('homeNames').textContent=userName+' & '+aiName;
  const ann=state.settings.anniversary;
  if(ann){
    const start=new Date(ann);start.setHours(0,0,0,0);
    const today=new Date();today.setHours(0,0,0,0);
    const diff=Math.floor((today-start)/(1000*60*60*24));
    document.getElementById('homeDaysNum').textContent=Math.max(0,diff);
    const dateStr=ann.replace(/-/g,'.');
    document.getElementById('homeSinceText').textContent='since '+dateStr;
  }else{
    document.getElementById('homeDaysNum').textContent='0';
    document.getElementById('homeSinceText').textContent='Set anniversary in Mine';
  }
  loadDailyQuote();
  loadLightTraces();
}

function loadDailyQuote(){
  const saved=DB.get('dailyQuote',null);
  const today=new Date().toDateString();
  if(saved&&saved.date===today&&saved.text){
    document.getElementById('homeQuoteText').textContent=saved.text;
    const dateEl=document.getElementById('homeQuoteDate');
    if(dateEl)dateEl.textContent=formatQuoteDate(saved.timestamp);
  }else{generateDailyQuote();}
}

function formatQuoteDate(ts){
  if(!ts)return '';const d=new Date(ts);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();
}

async function generateDailyQuote(){
  const s=state.settings;
  if(!s.apiUrl||!s.apiKey){
    document.getElementById('homeQuoteText').textContent='Set up API in Settings to get daily words.';
    return;
  }
  document.getElementById('homeQuoteText').textContent='Thinking...';
  const dateEl=document.getElementById('homeQuoteDate');if(dateEl)dateEl.textContent='';
  try{
    const userName=s.userName||'用户';const aiName=getDisplayName();
    const prompt='你是'+aiName+'。请用一句温柔的话对'+userName+'说点什么，可以是关心、鼓励、或者想对ta说的话。要自然真诚，不要太长（30字以内），不要用引号包裹，不要加标点以外的符号，不要用emoji。直接输出这句话，不要任何前缀或解释。';
    let memCtx='';
    try{const mems=await vectorStore.getAll();if(mems.length>0){const recent=mems.sort((a,b)=>b.time-a.time).slice(0,5);memCtx='\n\n[你了解的关于用户的事]';recent.forEach(m=>{memCtx+='\n'+m.text;});}}catch{}
    const url=s.apiUrl.replace(/\/+$/,'')+'/chat/completions';
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.apiKey},
      body:JSON.stringify({model:s.model,messages:[{role:'system',content:prompt+memCtx},{role:'user',content:'请说一句话给我'}],stream:false})});
    if(!res.ok)throw new Error(''+res.status);
    const data=await res.json();const text=(data.choices?.[0]?.message?.content||'').trim();
    if(text){
      const quoteData={text:text,date:new Date().toDateString(),timestamp:Date.now()};
      DB.set('dailyQuote',quoteData);
      document.getElementById('homeQuoteText').textContent=text;
      if(dateEl)dateEl.textContent=formatQuoteDate(Date.now());
    }
  }catch{document.getElementById('homeQuoteText').textContent='Could not generate today\'s words.';}
}

function refreshDailyQuote(){DB.del('dailyQuote');generateDailyQuote();}

function loadLightTraces(){
  const traces=DB.get('lightTraces',[]);
  const el=document.getElementById('homeTraces');
  if(!el)return;
  if(traces.length===0){el.innerHTML='<div class="home-trace-empty">No traces yet. Chat more to create memories.</div>';return;}
  const recent=traces.slice(-5).reverse();
  el.innerHTML=recent.map(t=>{
    return '<div class="home-trace-item"><div class="home-trace-text">'+escHtml(t.text)+'</div><div class="home-trace-date">'+formatQuoteDate(t.time)+'</div></div>';
  }).join('');
}

async function generateLightTrace(chatMessages){
  const s=state.settings;if(!s.apiUrl||!s.apiKey)return;
  if(!chatMessages||chatMessages.length<4)return;
  const traces=DB.get('lightTraces',[]);
  const today=new Date().toDateString();
  const todayTraces=traces.filter(t=>new Date(t.time).toDateString()===today);
  if(todayTraces.length>=3)return;
  try{
    const aiName=getDisplayName();const userName=s.userName||'用户';
    const recentMsgs=chatMessages.slice(-6).map(m=>m.role+': '+m.content).join('\n');
    const prompt='你是'+aiName+'。根据刚才的对话，用一句简短温暖的话记录此刻的感受或对'+userName+'的想法。像日记碎片一样，15-30字，不要用emoji，不要引号，直接输出。';
    const url=s.apiUrl.replace(/\/+$/,'')+'/chat/completions';
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.apiKey},
      body:JSON.stringify({model:s.model,messages:[{role:'system',content:prompt},{role:'user',content:'对话记录：\n'+recentMsgs+'\n\n请记录一句感受。'}],stream:false})});
    if(!res.ok)return;
    const data=await res.json();const text=(data.choices?.[0]?.message?.content||'').trim();
    if(text&&text.length>2&&text.length<100){
      traces.push({text:text,time:Date.now()});
      if(traces.length>50)traces.splice(0,traces.length-50);
      DB.set('lightTraces',traces);
    }
  }catch{}
}

// ==================== 侧栏 & 对话管理（异步 IndexedDB） ====================
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebarOverlay').classList.toggle('open');}

async function newChat(){
  const id='chat_'+Date.now();
  const chat={id,title:'New Chat',messages:[],created:Date.now()};
  await chatStore.put(chat);
  state.chatMetas.push({id:chat.id,title:chat.title,created:chat.created});
  state.currentChatId=id;
  state.currentChatData=chat;
  saveCurrentChatId();
  renderChatList();renderMessages();updateInputHint();toggleSidebar();
}

async function switchChat(id){
  state.currentChatId=id;
  state.currentChatData=await chatStore.get(id);
  saveCurrentChatId();
  renderChatList();renderMessages();updateInputHint();toggleSidebar();
}

async function deleteChat(id,e){
  e.stopPropagation();if(!confirm('Delete this chat?'))return;
  await chatStore.remove(id);
  state.chatMetas=state.chatMetas.filter(m=>m.id!==id);
  if(state.currentChatId===id){
    state.currentChatId=state.chatMetas.length>0?state.chatMetas[state.chatMetas.length-1].id:null;
    state.currentChatData=state.currentChatId?await chatStore.get(state.currentChatId):null;
  }
  saveCurrentChatId();renderChatList();renderMessages();updateInputHint();
}

async function renameChat(id,e){
  e.stopPropagation();renamingChatId=id;
  const chat=await chatStore.get(id);
  document.getElementById('renameInput').value=chat?.title||'';
  document.getElementById('renameModal').classList.add('open');
  setTimeout(()=>document.getElementById('renameInput').focus(),100);
}
function closeRename(){document.getElementById('renameModal').classList.remove('open');renamingChatId=null;}
async function confirmRename(){
  const t=document.getElementById('renameInput').value.trim();
  if(!t||!renamingChatId){closeRename();return;}
  const chat=await chatStore.get(renamingChatId);
  if(chat){chat.title=t;await chatStore.put(chat);
    const idx=state.chatMetas.findIndex(m=>m.id===renamingChatId);
    if(idx>=0)state.chatMetas[idx].title=t;
    if(state.currentChatData&&state.currentChatData.id===renamingChatId)state.currentChatData.title=t;
  }
  renderChatList();closeRename();showToast('Renamed');
}

function currentChat(){return state.currentChatData;}

function renderChatList(){
  const el=document.getElementById('chatList');
  const sorted=[...state.chatMetas].sort((a,b)=>b.created-a.created);
  if(sorted.length===0){el.innerHTML='<p style="text-align:center;color:var(--text-light);padding:20px;font-size:14px">No chats yet</p>';return;}
  el.innerHTML=sorted.map(c=>{
    return '<div class="chat-item '+(c.id===state.currentChatId?'active':'')+'" onclick="switchChat(\''+c.id+'\')">'
      +'<span class="chat-item-title">'+escHtml(c.title)+'</span>'
      +'<div class="chat-item-actions">'
      +'<button class="chat-item-btn" onclick="renameChat(\''+c.id+'\',event)" title="Rename"><svg class="icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
      +'<button class="chat-item-btn" onclick="deleteChat(\''+c.id+'\',event)" title="Delete"><svg class="icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>'
      +'</div></div>';
  }).join('');
}

// ==================== UI 更新 ====================
function updateHeaderTitle(){const el=document.getElementById('headerTitle');if(el)el.textContent=getDisplayName();}
function updateInputHint(){const el=document.getElementById('msgInput');if(el)el.placeholder='Reply to '+getDisplayName();}
function updateModelTag(){const tag=document.getElementById('modelTag');const m=state.settings.model;if(tag)tag.textContent=m?m.replace(/^\[.*?\]/,'').slice(0,18):'Not set';}
function updateSendBtn(){
  const input=document.getElementById('msgInput');const btn=document.getElementById('sendBtn');
  if(!input||!btn)return;
  const hasContent=input.value.trim()||pendingAttachments.length>0;
  if(state.generating){btn.classList.add('show','stop-mode');btn.classList.remove('send-mode');}
  else if(hasContent){btn.classList.add('show','send-mode');btn.classList.remove('stop-mode');}
  else{btn.classList.remove('show','send-mode','stop-mode');}
}
function handleSendStop(){
  if(state.generating){
    if(currentAbortController){currentAbortController.abort();currentAbortController=null;}
    state.generating=false;const t=document.getElementById('typing');if(t)t.classList.remove('show');
    updateSendBtn();showToast('Stopped');
  }else{sendMessage();}
}

// ==================== 加号菜单 ====================
function togglePlusMenu(){
  const menu=document.getElementById('plusMenu');const overlay=document.getElementById('plusMenuOverlay');
  if(menu.classList.contains('open')){menu.classList.remove('open');overlay.classList.remove('open');}
  else{menu.classList.add('open');overlay.classList.add('open');}
}
function closePlusMenu(){document.getElementById('plusMenu').classList.remove('open');document.getElementById('plusMenuOverlay').classList.remove('open');}
function pickPhoto(){document.getElementById('photoInput').click();}
function pickFile(){document.getElementById('fileInput').click();}
function pickCamera(){document.getElementById('cameraInput').click();}

// ==================== 思维链 & 图片查看 ====================
function openThinking(text){document.getElementById('thinkingOverlayBody').textContent=text;document.getElementById('thinkingOverlay').classList.add('open');}
function closeThinking(){document.getElementById('thinkingOverlay').classList.remove('open');}
function viewImage(src){document.getElementById('imgViewerSrc').src=src;document.getElementById('imgViewer').classList.add('open');}
function closeImgViewer(){document.getElementById('imgViewer').classList.remove('open');}

// ==================== HTML 预览系统 ====================
function processHtmlBlocks(html){
  const re=/<pre><code class="[^"]*language-html[^"]*">([\s\S]*?)<\/code><\/pre>/g;
  let match;const blocks=[];
  while((match=re.exec(html))!==null){const el=document.createElement('textarea');el.innerHTML=match[1];const code=el.value;if(code.trim().length<20)continue;blocks.push({full:match[0],code:code});}
  if(blocks.length===0)return html;
  let result=html;
  blocks.forEach((b,i)=>{
    const cardId='hc_'+Date.now()+'_'+i;
    const titleMatch=b.code.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const fileName=(titleMatch&&titleMatch[1].trim())?titleMatch[1].trim()+'.html':'index.html';
    htmlBlockStore[cardId]={code:b.code,fileName:fileName};
    const sizeB=(new Blob([b.code])).size;const sizeStr=sizeB<1024?sizeB+' B':(sizeB/1024).toFixed(1)+' KB';
    const card='<div class="html-file-card" onclick="previewHtml(\''+cardId+'\')">'
      +'<div class="html-file-card-icon"><svg style="width:18px;height:18px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div>'
      +'<div class="html-file-card-info"><div class="html-file-card-name">'+escHtml(fileName)+'</div><div class="html-file-card-meta">HTML Document · '+sizeStr+'</div></div>'
      +'<div class="html-file-card-arrow"><svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div></div>';
    result=result.replace(b.full,card);
  });
  return result;
}
function previewHtml(cardId){
  const item=htmlBlockStore[cardId];if(!item)return;
  currentHtmlPreviewCode=item.code;currentHtmlPreviewName=item.fileName;
  document.getElementById('htmlPreviewTitle').textContent=item.fileName;
  document.getElementById('htmlPreviewFrame').srcdoc=item.code;
  document.getElementById('htmlPreviewOverlay').classList.add('open');
}
function closeHtmlPreview(){document.getElementById('htmlPreviewOverlay').classList.remove('open');document.getElementById('htmlPreviewFrame').srcdoc='';}
function openHtmlNewTab(){const blob=new Blob([currentHtmlPreviewCode],{type:'text/html'});window.open(URL.createObjectURL(blob),'_blank');}
function downloadHtml(){const blob=new Blob([currentHtmlPreviewCode],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=currentHtmlPreviewName||'index.html';a.click();URL.revokeObjectURL(a.href);}
function toggleHtmlFold(id){const el=document.getElementById(id);if(el)el.classList.toggle('open');}

// ==================== 复制 & 重新回复 ====================
function copyMsgText(msgIdx){
  const chat=currentChat();if(!chat)return;
  const m=chat.messages.filter(x=>x.role==='user'||x.role==='assistant')[msgIdx];if(!m)return;
  navigator.clipboard.writeText(m.content).then(()=>showToast('Copied')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=m.content;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Copied');
  });
}
async function regenerateMsg(msgIdx){
  if(state.generating)return;const chat=currentChat();if(!chat)return;
  const visibleMsgs=chat.messages.filter(x=>x.role==='user'||x.role==='assistant');
  const m=visibleMsgs[msgIdx];if(!m||m.role!=='assistant')return;
  const realIdx=chat.messages.indexOf(m);if(realIdx===-1)return;
  chat.messages.splice(realIdx,1);await saveCurrentChat();renderMessages();
  const lastUserMsg=[...chat.messages].reverse().find(x=>x.role==='user');
  const queryText=lastUserMsg?lastUserMsg.content:'';
  state.generating=true;updateSendBtn();
  const typing=document.getElementById('typing');if(typing)typing.classList.add('show');scrollToBottom();
  try{
    const sp=await buildSystemPrompt(queryText||'(regenerate)');const result=await callAPI(chat,sp);
    const{cleanReply,newMemories}=extractMemories(result.content);
    const ro={role:'assistant',content:cleanReply,time:Date.now()};
    if(result.thinking)ro.thinking=result.thinking;
    chat.messages.push(ro);state.lastChatTime=Date.now();saveSettings();await saveCurrentChat();renderMessages();renderChatList();
    if(newMemories.length>0)storeMemories(newMemories);
  }catch(err){if(err.name!=='AbortError')showToast('Error: '+err.message);}
  finally{state.generating=false;currentAbortController=null;updateSendBtn();const t=document.getElementById('typing');if(t)t.classList.remove('show');}
}

// ==================== 消息渲染（含头像） ====================
function renderMessages(){
  const area=document.getElementById('chatArea');const chat=currentChat();updateHeaderTitle();
  if(!chat||chat.messages.length===0){
    area.innerHTML='<div class="empty-state"><svg class="es-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>What\'s on your mind?</p></div>';return;
  }
  htmlBlockStore={};
  let html='';let visibleIdx=0;
  const ua=cachedUserAvatar;const aa=cachedAiAvatar;
  const uAv='<div class="msg-avatar">'+(ua?'<img src="'+ua+'">':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')+'</div>';
  const aAv='<div class="msg-avatar">'+(aa?'<img src="'+aa+'">':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>')+'</div>';

  chat.messages.filter(m=>m.role==='user'||m.role==='assistant').forEach(m=>{
    const mi=visibleIdx++;
    let thinkingHtml='';
    if(m.role==='assistant'&&m.thinking){
      const preview=m.thinking.slice(0,30).replace(/\n/g,' ')+(m.thinking.length>30?'…':'');
      thinkingHtml='<div class="thinking-toggle" onclick="openThinking(this.dataset.think)" data-think="'+escHtml(m.thinking)+'"><span class="thinking-label">Thinking</span><span class="thinking-preview">'+escHtml(preview)+'</span><span class="thinking-arrow">›</span></div>';
    }
    if(m.sticker){
      if(m.role==='assistant') html+='<div class="msg assistant">'+aAv+'<div class="msg-inner">'+thinkingHtml+'<img class="msg-sticker" src="'+m.sticker+'" onclick="viewImage(this.src)"><div class="msg-time">'+(m.time?fmtTime(m.time):'')+'</div></div></div>';
      else html+='<div class="msg user"><div class="msg-inner"><img class="msg-sticker" src="'+m.sticker+'" onclick="viewImage(this.src)"><div class="msg-time">'+(m.time?fmtTime(m.time):'')+'</div></div>'+uAv+'</div>';
      return;
    }
    let imagesHtml='';if(m.images&&m.images.length>0)imagesHtml=m.images.map(img=>'<img class="msg-image" src="'+img+'" onclick="viewImage(this.src)">').join('');
    let filesHtml='';if(m.files&&m.files.length>0)filesHtml=m.files.map(f=>'<div style="font-size:12px;color:'+(m.role==='user'?'rgba(255,255,255,.8)':'var(--text-light)')+';margin-bottom:4px;display:flex;align-items:center;gap:4px"><svg style="width:14px;height:14px;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'+escHtml(f)+'</div>').join('');
    let actionsHtml='';
    if(m.role==='assistant'){
      actionsHtml='<div class="msg-actions">'
        +'<button class="msg-action-btn" onclick="copyMsgText('+mi+')" title="Copy"><svg style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'
        +'<button class="msg-action-btn" onclick="regenerateMsg('+mi+')" title="Regenerate"><svg style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>'
        +'</div>';
    }
    if(m.role==='assistant'&&state.settings.splitReply==='on'){
      const parts=m.content.split(/\n\n+/).filter(p=>p.trim());
      if(parts.length>1){
        html+='<div class="msg assistant">'+aAv+'<div class="msg-inner">'+thinkingHtml+imagesHtml+filesHtml;
        parts.forEach((part,i)=>{let rendered=renderMarkdown(part);rendered=processHtmlBlocks(rendered);html+='<div class="msg-bubble" style="'+(i>0?'margin-top:6px;':'')+'">'+rendered+'</div>';});
        html+=actionsHtml+'<div class="msg-time">'+(m.time?fmtTime(m.time):'')+'</div></div></div>';return;
      }
    }
    let contentHtml;
    if(m.role==='assistant'){contentHtml=renderMarkdown(m.content);contentHtml=processHtmlBlocks(contentHtml);}
    else{contentHtml=escHtml(m.content).replace(/\n/g,'<br>');}

    if(m.role==='user'){
      html+='<div class="msg user"><div class="msg-inner">'+imagesHtml+filesHtml+'<div class="msg-bubble">'+contentHtml+'</div><div class="msg-time">'+(m.time?fmtTime(m.time):'')+'</div></div>'+uAv+'</div>';
    }else{
      html+='<div class="msg assistant">'+aAv+'<div class="msg-inner">'+thinkingHtml+imagesHtml+filesHtml+'<div class="msg-bubble">'+contentHtml+'</div>'+actionsHtml+'<div class="msg-time">'+(m.time?fmtTime(m.time):'')+'</div></div></div>';
    }
  });
  area.innerHTML=html+'<div class="typing-indicator" id="typing"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
  scrollToBottom();
}
function scrollToBottom(){const area=document.getElementById('chatArea');requestAnimationFrame(()=>{area.scrollTop=area.scrollHeight;});}
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';}
function handleKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}

// ==================== 附件处理 ====================
function handlePhotoSelect(e){
  Array.from(e.target.files).forEach(file=>{if(!file.type.startsWith('image/'))return;
    const reader=new FileReader();reader.onload=(ev)=>{pendingAttachments.push({type:'image',name:file.name,data:ev.target.result});renderAttachPreview();updateSendBtn();};reader.readAsDataURL(file);
  });e.target.value='';
}
function handleFileSelect(e){
  Array.from(e.target.files).forEach(file=>{const reader=new FileReader();reader.onload=(ev)=>{pendingAttachments.push({type:'file',name:file.name,data:ev.target.result});renderAttachPreview();updateSendBtn();};reader.readAsText(file);
  });e.target.value='';
}
function renderAttachPreview(){
  const el=document.getElementById('attachPreview');
  if(pendingAttachments.length===0){el.classList.remove('show');el.innerHTML='';return;}
  el.classList.add('show');
  el.innerHTML=pendingAttachments.map((att,i)=>{
    if(att.type==='image')return '<div class="attach-preview-item"><img src="'+att.data+'"><button class="attach-remove" onclick="removeAttach('+i+')">✕</button></div>';
    return '<div class="attach-preview-item"><div class="file-info">'+escHtml(att.name)+'</div><button class="attach-remove" onclick="removeAttach('+i+')">✕</button></div>';
  }).join('');
}
function removeAttach(i){pendingAttachments.splice(i,1);renderAttachPreview();updateSendBtn();}

// ==================== 表情包 ====================
function toggleStickerPanel(){
  const panel=document.getElementById('stickerPanel');const btn=document.getElementById('stickerToggleBtn');
  if(panel.classList.contains('open')){panel.classList.remove('open');btn.classList.remove('active');stickerEditing=false;
    document.getElementById('stickerGrid').classList.remove('editing');const eb=document.getElementById('stickerEditBtn');eb.classList.remove('active');eb.textContent='Manage';
  }else{panel.classList.add('open');btn.classList.add('active');renderStickerGrid();}
}
function toggleStickerEdit(){
  stickerEditing=!stickerEditing;const grid=document.getElementById('stickerGrid');const btn=document.getElementById('stickerEditBtn');
  if(stickerEditing){grid.classList.add('editing');btn.classList.add('active');btn.textContent='Done';}
  else{grid.classList.remove('editing');btn.classList.remove('active');btn.textContent='Manage';}
}
async function handleStickerImport(e){
  const files=Array.from(e.target.files);if(files.length===0)return;let added=0;
  for(const file of files){if(!file.type.startsWith('image/'))continue;
    const data=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>{
      const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const max=256;let w=img.width,h=img.height;if(w>h){if(w>max){h*=max/w;w=max;}}else{if(h>max){w*=max/h;h=max;}}c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);r(c.toDataURL('image/webp',0.8));};img.src=reader.result;};reader.readAsDataURL(file);});
    await stickerStore.add({id:'stk_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),data,time:Date.now()});added++;
  }
  if(added>0){showToast('Added '+added+' sticker'+(added>1?'s':''));renderStickerGrid();}
  e.target.value='';
}
async function renderStickerGrid(){
  const grid=document.getElementById('stickerGrid');const countEl=document.getElementById('stickerCount');
  try{const all=await stickerStore.getAll();all.sort((a,b)=>b.time-a.time);countEl.textContent=all.length;
    if(all.length===0){grid.innerHTML='<div class="sticker-empty">No stickers yet<br>Tap "Import" to add</div>';return;}
    grid.innerHTML=all.map(s=>'<div class="sticker-grid-item" onclick="sendSticker(\''+s.id+'\')"><img src="'+s.data+'" loading="lazy"><button class="sticker-del-btn" onclick="event.stopPropagation();deleteSticker(\''+s.id+'\')">✕</button></div>').join('');
  }catch(e){grid.innerHTML='<div class="sticker-empty">Failed to load</div>';}
}
async function deleteSticker(id){await stickerStore.remove(id);showToast('Deleted');renderStickerGrid();}
async function sendSticker(id){
  if(state.generating)return;const all=await stickerStore.getAll();const sticker=all.find(s=>s.id===id);if(!sticker)return;
  if(!state.settings.apiUrl||!state.settings.apiKey){showToast('Configure API first');openSettings();return;}
  if(!state.currentChatId){
    const cid='chat_'+Date.now();
    const chat={id:cid,title:'New Chat',messages:[],created:Date.now()};
    await chatStore.put(chat);
    state.chatMetas.push({id:cid,title:chat.title,created:chat.created});
    state.currentChatId=cid;state.currentChatData=chat;saveCurrentChatId();
  }
  const chat=currentChat();
  chat.messages.push({role:'user',content:'[用户发送了一个表情包]',sticker:sticker.data,time:Date.now()});
  if(chat.messages.filter(m=>m.role==='user').length===1)chat.title='Sticker chat';
  await saveCurrentChat();renderMessages();renderChatList();toggleStickerPanel();
  state.generating=true;updateSendBtn();
  const typing=document.getElementById('typing');if(typing)typing.classList.add('show');scrollToBottom();
  try{const sp=await buildSystemPrompt('用户发送了一个表情包');const result=await callAPI(chat,sp);
    const{cleanReply,newMemories}=extractMemories(result.content);const ro={role:'assistant',content:cleanReply,time:Date.now()};
    if(result.thinking)ro.thinking=result.thinking;chat.messages.push(ro);state.lastChatTime=Date.now();saveSettings();await saveCurrentChat();renderMessages();renderChatList();
    if(newMemories.length>0)storeMemories(newMemories);generateLightTrace(chat.messages);
  }catch(err){if(err.name!=='AbortError')showToast('Error: '+err.message);}
  finally{state.generating=false;currentAbortController=null;updateSendBtn();const t=document.getElementById('typing');if(t)t.classList.remove('show');}
}

// ==================== 记忆系统 ====================
async function retrieveMemories(q){try{if(state.settings.jinaKey){const qv=await getEmbedding(q);if(qv)return await vectorStore.search(qv,8);}return await vectorStore.searchByKeyword(q,8);}catch{return[];}}
async function buildSystemPrompt(uq){
  const s=state.settings;let sys=s.systemPrompt||'';
  if(s.charNickname){sys+='\n\n[身份信息]\n你的名字是'+s.charName+'，但用户给你起了一个亲密的备注叫「'+s.charNickname+'」。用户界面上显示的是这个备注。你知道这个备注的存在，可以自然地回应，但不需要每次都提及。';}
  if(s.thinking==='on')sys+='\n\n请在思考时使用中文。';
  sys+='\n\n'+getTimeContext();
  const mems=await retrieveMemories(uq);
  if(mems.length>0){sys+='\n\n[你关于用户的记忆]';mems.forEach(m=>{const cats={profile:'画像',warm:'暖记忆',fact:'事实',corridor:'便条'};sys+='\n'+(cats[m.category]||'事实')+'：'+m.text;});sys+='\n（以上是你记住的事情，像自然知道一样说话）';}
  if(s.autoMemory==='on')sys+='\n\n[记忆提取指令]\n如果用户分享了值得记住的信息，或明确要求记住，请在回复最末尾另起一行标记：\n[MEM|类别|内容]\n类别：profile/warm/fact/corridor\n没有值得记忆的不要加。只记重要的。';
  return sys;
}

// ==================== 发送消息 ====================
async function sendMessage(){
  const input=document.getElementById('msgInput');const text=input.value.trim();const attachments=[...pendingAttachments];
  if((!text&&attachments.length===0)||state.generating)return;
  if(!state.settings.apiUrl||!state.settings.apiKey){showToast('Configure API first');openSettings();return;}
  if(!state.currentChatId){
    const id='chat_'+Date.now();
    const chat={id,title:'New Chat',messages:[],created:Date.now()};
    await chatStore.put(chat);
    state.chatMetas.push({id:chat.id,title:chat.title,created:chat.created});
    state.currentChatId=id;state.currentChatData=chat;saveCurrentChatId();
  }
  const chat=currentChat();const msgObj={role:'user',content:text||'',time:Date.now()};
  const imgs=[];const fns=[];let fc='';
  attachments.forEach(a=>{if(a.type==='image')imgs.push(a.data);else{fns.push(a.name);fc+='\n\n--- 文件: '+a.name+' ---\n'+a.data;}});
  if(imgs.length>0)msgObj.images=imgs;
  if(fns.length>0){msgObj.files=fns;msgObj.content=(text||'')+fc;}
  chat.messages.push(msgObj);
  if(chat.messages.filter(m=>m.role==='user').length===1)chat.title=(text||attachments[0]?.name||'New Chat').slice(0,20);
  pendingAttachments=[];renderAttachPreview();await saveCurrentChat();saveCurrentChatId();input.value='';input.style.height='auto';updateSendBtn();
  renderMessages();renderChatList();
  state.generating=true;updateSendBtn();
  const typing=document.getElementById('typing');if(typing)typing.classList.add('show');scrollToBottom();
  try{const sp=await buildSystemPrompt(text||'(图片)');const result=await callAPI(chat,sp);
    const{cleanReply,newMemories}=extractMemories(result.content);const ro={role:'assistant',content:cleanReply,time:Date.now()};
    if(result.thinking)ro.thinking=result.thinking;chat.messages.push(ro);state.lastChatTime=Date.now();
    saveSettings();await saveCurrentChat();renderMessages();renderChatList();if(newMemories.length>0)storeMemories(newMemories);
    generateLightTrace(chat.messages);
  }catch(err){if(err.name!=='AbortError')showToast('Error: '+err.message);}
  finally{state.generating=false;currentAbortController=null;updateSendBtn();const t=document.getElementById('typing');if(t)t.classList.remove('show');}
}

// ==================== API 调用 ====================
async function callAPI(chat,systemPrompt){
  const s=state.settings;const url=s.apiUrl.replace(/\/+$/,'')+'/chat/completions';
  const messages=[{role:'system',content:systemPrompt}];
  chat.messages.slice(-100).forEach(m=>{
    if(m.role==='user'&&(m.images?.length>0||m.sticker)){
      const cp=[];
      if(m.content&&m.content!=='[用户发送了一个表情包]')cp.push({type:'text',text:m.content});
      else if(m.sticker)cp.push({type:'text',text:'用户发送了一个表情包图片，请看图片内容自然回应。'});
      if(m.images)m.images.forEach(img=>cp.push({type:'image_url',image_url:{url:img}}));
      if(m.sticker)cp.push({type:'image_url',image_url:{url:m.sticker}});
      messages.push({role:'user',content:cp});
    }else messages.push({role:m.role,content:m.content});
  });
  currentAbortController=new AbortController();
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.apiKey},body:JSON.stringify({model:s.model,messages,stream:false}),signal:currentAbortController.signal});
  if(!res.ok){const et=await res.text();throw new Error(res.status+' '+et.slice(0,100));}
  const data=await res.json();const msg=data.choices?.[0]?.message;const content=msg?.content||'(No response)';
  let thinking=null;if(s.thinking==='on'){thinking=msg?.reasoning_content||msg?.reasoning||msg?.thinking||null;}
  return{content,thinking};
}

// ==================== 记忆提取 & 存储 ====================
function extractMemories(reply){
  const re=/\[MEM\|(\w+)\|(.+?)\]/g;let m;let clean=reply;const mems=[];
  while((m=re.exec(reply))!==null){mems.push({id:'mem_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),category:m[1].trim(),text:m[2].trim(),time:Date.now(),vector:null});clean=clean.replace(m[0],'');}
  return{cleanReply:clean.replace(/\n+$/,'').trim(),newMemories:mems};
}
async function storeMemories(mems){
  let n=0;for(const m of mems){try{if(state.settings.jinaKey)m.vector=await getEmbedding(m.text);await vectorStore.add(m);n++;}catch(e){console.error(e);}}
  if(n>0)showToast('Memorized '+n);
}
async function addManualMemory(){
  const cat=document.getElementById('memAddCategory').value;const text=document.getElementById('memAddText').value.trim();
  if(!text){showToast('Enter content');return;}
  const m={id:'mem_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),category:cat,text,time:Date.now(),vector:null};
  try{if(state.settings.jinaKey)m.vector=await getEmbedding(text);await vectorStore.add(m);
    document.getElementById('memAddText').value='';document.getElementById('memAddText').style.height='auto';
    showToast('Added');await renderMemoryList();
  }catch(e){showToast('Failed: '+e.message);}
}

// ==================== Claude 导入 ====================
function handleClaudeImport(e){
  const file=e.target.files[0];if(!file)return;e.target.value='';showToast('Reading file...');
  const reader=new FileReader();
  reader.onload=(ev)=>{
    try{const data=JSON.parse(ev.target.result);if(!Array.isArray(data)){showToast('Invalid format');return;}
      pendingImportData=data;renderImportList(data);document.getElementById('importOverlay').classList.add('open');
    }catch(err){showToast('Parse error: '+err.message);}
  };reader.onerror=()=>showToast('Read failed');reader.readAsText(file);
}
function renderImportList(conversations){
  const list=document.getElementById('importList');const info=document.getElementById('importInfo');
  info.textContent='Found '+conversations.length+' conversations. Select which to import:';
  list.innerHTML=conversations.map((c,i)=>{
    const msgs=c.chat_messages||[];const msgCount=msgs.length;const title=c.name||c.title||'Chat '+(i+1);
    const firstDate=msgs.length>0&&msgs[0].created_at?new Date(msgs[0].created_at).toLocaleDateString():'';
    const preview=(msgs.find(m=>m.sender==='human')?.text||'').slice(0,60);
    return '<div class="import-item" data-idx="'+i+'" onclick="toggleImportItem(this)">'
      +'<div class="import-check"></div><div class="import-info">'
      +'<div class="import-title">'+escHtml(title)+'</div>'
      +'<div class="import-meta">'+msgCount+' messages · '+firstDate+'</div>'
      +(preview?'<div class="import-meta" style="margin-top:2px">'+escHtml(preview)+'…</div>':'')
      +'</div></div>';
  }).join('');updateImportBtn();
}
function toggleImportItem(el){el.classList.toggle('selected');updateImportBtn();}
function updateImportBtn(){
  const selected=document.querySelectorAll('.import-item.selected').length;const btn=document.getElementById('importConfirmBtn');
  btn.disabled=selected===0;btn.textContent=selected>0?'Import '+selected+' Chat'+(selected>1?'s':''):'Import Selected';
}
function closeImport(){document.getElementById('importOverlay').classList.remove('open');pendingImportData=[];}
async function confirmImport(){
  const selectedEls=document.querySelectorAll('.import-item.selected');if(selectedEls.length===0)return;
  let imported=0;
  for(const el of selectedEls){
    const idx=parseInt(el.dataset.idx);const conv=pendingImportData[idx];if(!conv)continue;
    const msgs=conv.chat_messages||[];if(msgs.length===0)continue;
    const id='chat_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
    const title=conv.name||conv.title||'Imported '+(imported+1);
    const created=msgs[0]?.created_at?new Date(msgs[0].created_at).getTime():Date.now();
    const messages=[];
    msgs.forEach(m=>{
      const role=m.sender==='human'?'user':'assistant';let text=m.text||'';
      if((!text||text.trim()==='')==true&&m.content&&Array.isArray(m.content)){text=m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');}
      if(!text||text.trim()==='')return;
      const msgObj={role,content:text,time:m.created_at?new Date(m.created_at).getTime():created};
      if(m.files&&m.files.length>0){msgObj.files=m.files.map(f=>f.file_name);const fileNotes=m.files.map(f=>'[attachment: '+f.file_name+']').join(' ');if(!msgObj.content.includes(fileNotes))msgObj.content+='\n'+fileNotes;}
      messages.push(msgObj);
    });
    if(messages.length===0)continue;
    const chat={id,title,messages,created};
    await chatStore.put(chat);
    state.chatMetas.push({id,title,created});
    imported++;
  }
  if(imported>0){renderChatList();showToast('Imported '+imported+' chat'+(imported>1?'s':''));}
  else{showToast('No messages to import');}closeImport();
}

// ==================== 模型列表 ====================
async function fetchModels(){
  const apiUrl=document.getElementById('setApiUrl').value.trim();const apiKey=document.getElementById('setApiKey').value.trim();
  if(!apiUrl||!apiKey){showToast('Fill in endpoint and key first');return;}
  const btn=document.getElementById('fetchModelBtn');btn.disabled=true;btn.textContent='...';
  try{const url=apiUrl.replace(/\/+$/,'')+'/models';const res=await fetch(url,{headers:{'Authorization':'Bearer '+apiKey}});
    if(!res.ok)throw new Error(''+res.status);const data=await res.json();let models=[];
    if(Array.isArray(data.data))models=data.data.map(m=>m.id).filter(Boolean);
    else if(Array.isArray(data))models=data.map(m=>typeof m==='string'?m:m.id).filter(Boolean);
    if(models.length===0){showToast('No models found');return;}
    models.sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));fetchedModels=models;
    showToast('Found '+models.length+' models');renderModelList();document.getElementById('modelPickerPage').classList.add('open');
  }catch(err){showToast('Failed: '+err.message);}
  finally{btn.disabled=false;btn.textContent='Fetch';}
}
function renderModelList(){
  const c=document.getElementById('modelListContainer');const sv=(document.getElementById('modelSearchInput').value||'').toLowerCase();
  const cm=document.getElementById('setModel').value.trim();let filtered=fetchedModels;if(sv)filtered=fetchedModels.filter(m=>m.toLowerCase().includes(sv));
  if(filtered.length===0){c.innerHTML='<div class="model-list-empty">No match</div>';return;}
  c.innerHTML=filtered.map(m=>'<div class="model-list-item '+(m===cm?'current':'')+'" onclick="pickModel(this.dataset.model)" data-model="'+escHtml(m)+'">'+escHtml(m)+(m===cm?' ✓':'')+'</div>').join('');
}
function filterModels(){renderModelList();}
function pickModel(id){document.getElementById('setModel').value=id;showToast('Selected: '+id);closePage('modelPickerPage');}

// ==================== 设置页 ====================
function openSettings(){
  const s=state.settings;
  document.getElementById('setApiUrl').value=s.apiUrl||'';
  document.getElementById('setApiKey').value=s.apiKey||'';
  document.getElementById('setModel').value=s.model||'';
  document.getElementById('setCharName').value=s.charName||'Little';
  document.getElementById('setCharNickname').value=s.charNickname||'';
  document.getElementById('setUserName').value=s.userName||'';
  document.getElementById('setAnniversary').value=s.anniversary||'';
  document.getElementById('setSystemPrompt').value=s.systemPrompt||'';
  document.getElementById('setAutoMemory').value=s.autoMemory||'on';
  document.getElementById('setJinaKey').value=s.jinaKey||'';
  document.getElementById('setThinking').value=s.thinking||'off';
  document.getElementById('setSplitReply').value=s.splitReply||'off';
  document.getElementById('setCustomCSS').value=s.customCSS||'';
  document.getElementById('settingsPage').classList.add('open');
}
function saveSettingsPage(){
  state.settings={
    apiUrl:document.getElementById('setApiUrl').value.trim(),
    apiKey:document.getElementById('setApiKey').value.trim(),
    model:document.getElementById('setModel').value.trim(),
    charName:document.getElementById('setCharName').value.trim()||'Little',
    charNickname:document.getElementById('setCharNickname').value.trim(),
    userName:document.getElementById('setUserName').value.trim(),
    anniversary:document.getElementById('setAnniversary').value,
    systemPrompt:document.getElementById('setSystemPrompt').value,
    autoMemory:document.getElementById('setAutoMemory').value,
    jinaKey:document.getElementById('setJinaKey').value.trim(),
    thinking:document.getElementById('setThinking').value,
    splitReply:document.getElementById('setSplitReply').value,
    customCSS:document.getElementById('setCustomCSS').value
  };
  saveSettings();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateGlobalHeader();
  showToast('Saved');closePage('settingsPage');
}
// 保持向后兼容：HTML 中 onclick="saveSettings()" 仍然能用
function saveSettings_page(){saveSettingsPage();}

// ==================== 记忆页面 ====================
async function openMemory(){await renderMemoryList();document.getElementById('memoryPage').classList.add('open');}
function closePage(id){document.getElementById(id).classList.remove('open');}
async function renderMemoryList(){
  const el=document.getElementById('memoryList');const statsEl=document.getElementById('memoryStats');
  try{const all=await vectorStore.getAll();
    if(all.length===0){statsEl.innerHTML='';el.innerHTML='<div class="memory-empty">No memories yet</div>';return;}
    const counts={profile:0,warm:0,fact:0,corridor:0};all.forEach(m=>{counts[m.category]=(counts[m.category]||0)+1;});
    statsEl.innerHTML='<div><div class="memory-stat-num">'+all.length+'</div><div class="memory-stat-label">Total</div></div>'
      +'<div><div class="memory-stat-num">'+counts.profile+'</div><div class="memory-stat-label">Profile</div></div>'
      +'<div><div class="memory-stat-num">'+counts.fact+'</div><div class="memory-stat-label">Fact</div></div>'
      +'<div><div class="memory-stat-num">'+counts.warm+'</div><div class="memory-stat-label">Warm</div></div>'
      +'<div><div class="memory-stat-num">'+counts.corridor+'</div><div class="memory-stat-label">Note</div></div>';
    all.sort((a,b)=>b.time-a.time);
    el.innerHTML=all.map(m=>{const cn={profile:'Profile',warm:'Warm',fact:'Fact',corridor:'Note'};
      return '<div class="memory-item"><div><div class="memory-item-text"><span class="memory-tag '+m.category+'">'+cn[m.category]+'</span>'+escHtml(m.text)+'</div>'
      +'<div class="memory-item-meta">'+fmtTime(m.time)+(m.vector?' · vectorized':'')+'</div></div>'
      +'<button class="memory-item-del" onclick="deleteMemory(\''+m.id+'\')">✕</button></div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="memory-empty">Load error</div>';}
}
async function deleteMemory(id){await vectorStore.remove(id);showToast('Deleted');renderMemoryList();}

// ==================== 数据备份（导出/导入） ====================
function openBackupPage(){
  updateExportCounts();
  document.getElementById('exportProgress').innerHTML='';
  document.getElementById('importProgress').innerHTML='';
  document.getElementById('backupPage').classList.add('open');
}

async function updateExportCounts(){
  try{
    const chats=await chatStore.getAll();
    document.getElementById('expChatsDesc').textContent=chats.length+' conversations';
  }catch{document.getElementById('expChatsDesc').textContent='All conversations';}
  try{
    const mems=await vectorStore.getAll();
    document.getElementById('expMemoriesDesc').textContent=mems.length+' memories';
  }catch{document.getElementById('expMemoriesDesc').textContent='Memory bank data';}
  try{
    const stks=await stickerStore.getAll();
    document.getElementById('expStickersDesc').textContent=stks.length+' stickers';
  }catch{document.getElementById('expStickersDesc').textContent='Sticker images';}
}

function downloadJSON(data,filename){
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function bpLine(icon,text){
  const icons={
    done:'<svg class="bp-icon done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    fail:'<svg class="bp-icon fail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    wait:'<svg class="bp-icon wait" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  };
  return '<div class="bp-item">'+(icons[icon]||'')+' <span class="bp-text">'+text+'</span></div>';
}

async function startExport(){
  const prog=document.getElementById('exportProgress');
  const btn=document.getElementById('exportBtn');
  btn.disabled=true;btn.textContent='Exporting...';
  prog.innerHTML=bpLine('wait','Preparing data...');
  const ts=new Date().toISOString().slice(0,10).replace(/-/g,'');
  let count=0;

  try{
    // 1. 对话
    if(document.getElementById('expChats').checked){
      prog.innerHTML+=bpLine('wait','Exporting chats...');
      const chats=await chatStore.getAll();
      if(chats.length>0){
        downloadJSON({type:'little_chats',version:'1.2.0',exported:Date.now(),data:chats},'little_chats_'+ts+'.json');
        count++;
        prog.innerHTML=prog.innerHTML.replace('Exporting chats...','Chats exported ('+chats.length+')');
      }else{
        prog.innerHTML=prog.innerHTML.replace('Exporting chats...','No chats to export');
      }
    }

    // 小延迟防止浏览器吞下载
    await new Promise(r=>setTimeout(r,600));

    // 2. 记忆
    if(document.getElementById('expMemories').checked){
      prog.innerHTML+=bpLine('wait','Exporting memories...');
      const mems=await vectorStore.getAll();
      if(mems.length>0){
        downloadJSON({type:'little_memories',version:'1.2.0',exported:Date.now(),data:mems},'little_memories_'+ts+'.json');
        count++;
        prog.innerHTML=prog.innerHTML.replace('Exporting memories...','Memories exported ('+mems.length+')');
      }else{
        prog.innerHTML=prog.innerHTML.replace('Exporting memories...','No memories to export');
      }
    }

    await new Promise(r=>setTimeout(r,600));

    // 3. 表情包
    if(document.getElementById('expStickers').checked){
      prog.innerHTML+=bpLine('wait','Exporting stickers...');
      const stks=await stickerStore.getAll();
      if(stks.length>0){
        downloadJSON({type:'little_stickers',version:'1.2.0',exported:Date.now(),data:stks},'little_stickers_'+ts+'.json');
        count++;
        prog.innerHTML=prog.innerHTML.replace('Exporting stickers...','Stickers exported ('+stks.length+')');
      }else{
        prog.innerHTML=prog.innerHTML.replace('Exporting stickers...','No stickers to export');
      }
    }

    await new Promise(r=>setTimeout(r,600));

    // 4. 设置 + 头像 + 小数据
    if(document.getElementById('expSettings').checked){
      prog.innerHTML+=bpLine('wait','Exporting settings...');
      const bundle={
        settings:state.settings,
        currentChatId:state.currentChatId,
        lastChatTime:state.lastChatTime,
        dailyQuote:DB.get('dailyQuote',null),
        lightTraces:DB.get('lightTraces',[]),
        currentTab:DB.get('currentTab','home'),
        userAvatar:cachedUserAvatar,
        aiAvatar:cachedAiAvatar
      };
      downloadJSON({type:'little_settings',version:'1.2.0',exported:Date.now(),data:bundle},'little_settings_'+ts+'.json');
      count++;
      prog.innerHTML=prog.innerHTML.replace('Exporting settings...','Settings & avatars exported');
    }

    // 替换第一行
    prog.innerHTML=prog.innerHTML.replace('Preparing data...',count>0?'All done! '+count+' file'+(count>1?'s':'')+' exported':'Nothing selected');
    // 将所有 wait icon 替换为 done
    prog.innerHTML=prog.innerHTML.replace(/bp-icon wait/g,'bp-icon done');

    if(count>0)showToast('Exported '+count+' file'+(count>1?'s':''));
  }catch(err){
    prog.innerHTML+=bpLine('fail','Error: '+err.message);
    showToast('Export failed');
  }finally{
    btn.disabled=false;btn.textContent='Export Selected';
  }
}

async function handleBackupImport(e){
  const files=Array.from(e.target.files);
  if(files.length===0)return;
  e.target.value='';

  const mode=document.getElementById('importMode').value;
  const prog=document.getElementById('importProgress');
  prog.innerHTML=bpLine('wait','Reading '+files.length+' file'+(files.length>1?'s':'')+'...');

  let totalChats=0,totalMems=0,totalStks=0,didSettings=false;

  for(const file of files){
    try{
      const text=await file.text();
      const json=JSON.parse(text);
      if(!json.type||!json.data){
        prog.innerHTML+=bpLine('fail',file.name+' — invalid format');
        continue;
      }

      if(json.type==='little_chats'){
        prog.innerHTML+=bpLine('wait','Importing chats...');
        const chats=json.data;
        if(mode==='overwrite'){
          // 清空现有对话
          const existing=await chatStore.getAll();
          for(const c of existing)await chatStore.remove(c.id);
        }
        let added=0,skipped=0;
        for(const chat of chats){
          if(!chat||!chat.id)continue;
          if(mode==='merge'){
            const existing=await chatStore.get(chat.id);
            if(existing){skipped++;continue;}
          }
          await chatStore.put(chat);
          added++;
        }
        totalChats+=added;
        prog.innerHTML=prog.innerHTML.replace('Importing chats...','Chats: +'+added+(skipped>0?', skipped '+skipped:''));
      }

      else if(json.type==='little_memories'){
        prog.innerHTML+=bpLine('wait','Importing memories...');
        const mems=json.data;
        if(mode==='overwrite'){
          const existing=await vectorStore.getAll();
          for(const m of existing)await vectorStore.remove(m.id);
        }
        let added=0,skipped=0;
        for(const mem of mems){
          if(!mem||!mem.id)continue;
          if(mode==='merge'){
            const all=await vectorStore.getAll();
            if(all.find(m=>m.id===mem.id)){skipped++;continue;}
          }
          await vectorStore.add(mem);
          added++;
        }
        totalMems+=added;
        prog.innerHTML=prog.innerHTML.replace('Importing memories...','Memories: +'+added+(skipped>0?', skipped '+skipped:''));
      }

      else if(json.type==='little_stickers'){
        prog.innerHTML+=bpLine('wait','Importing stickers...');
        const stks=json.data;
        if(mode==='overwrite'){
          const existing=await stickerStore.getAll();
          for(const s of existing)await stickerStore.remove(s.id);
        }
        let added=0,skipped=0;
        for(const stk of stks){
          if(!stk||!stk.id)continue;
          if(mode==='merge'){
            const all=await stickerStore.getAll();
            if(all.find(s=>s.id===stk.id)){skipped++;continue;}
          }
          await stickerStore.add(stk);
          added++;
        }
        totalStks+=added;
        prog.innerHTML=prog.innerHTML.replace('Importing stickers...','Stickers: +'+added+(skipped>0?', skipped '+skipped:''));
      }

      else if(json.type==='little_settings'){
        prog.innerHTML+=bpLine('wait','Importing settings...');
        const d=json.data;
        if(d.settings){
          // 合并模式下保留当前 API 配置
          if(mode==='merge'){
            const keep={apiUrl:state.settings.apiUrl,apiKey:state.settings.apiKey};
            state.settings={...d.settings,...keep};
          }else{
            state.settings=d.settings;
          }
          saveSettings();
        }
        if(d.lastChatTime)state.lastChatTime=d.lastChatTime;
        if(d.dailyQuote)DB.set('dailyQuote',d.dailyQuote);
        if(d.lightTraces)DB.set('lightTraces',d.lightTraces);
        if(d.currentTab)DB.set('currentTab',d.currentTab);
        // 头像
        if(d.userAvatar){await avatarStore.set('user',d.userAvatar);cachedUserAvatar=d.userAvatar;}
        if(d.aiAvatar){await avatarStore.set('ai',d.aiAvatar);cachedAiAvatar=d.aiAvatar;}
        didSettings=true;
        prog.innerHTML=prog.innerHTML.replace('Importing settings...','Settings & avatars restored');
      }

      else{
        prog.innerHTML+=bpLine('fail',file.name+' — unknown type: '+json.type);
      }

    }catch(err){
      prog.innerHTML+=bpLine('fail',file.name+' — '+err.message);
    }
  }

  // 刷新状态
  state.chatMetas=await chatStore.getAllMeta();
  if(state.currentChatId){
    state.currentChatData=await chatStore.get(state.currentChatId);
    if(!state.currentChatData&&state.chatMetas.length>0){
      state.currentChatId=state.chatMetas.sort((a,b)=>b.created-a.created)[0].id;
      state.currentChatData=await chatStore.get(state.currentChatId);
      saveCurrentChatId();
    }
  }else if(state.chatMetas.length>0){
    state.currentChatId=state.chatMetas.sort((a,b)=>b.created-a.created)[0].id;
    state.currentChatData=await chatStore.get(state.currentChatId);
    saveCurrentChatId();
  }

  renderChatList();renderMessages();applyCustomCSS();updateModelTag();
  updateHeaderTitle();updateInputHint();updateGlobalHeader();
  applyAvatarsToDOM();updateExportCounts();

  // 完成
  prog.innerHTML=prog.innerHTML.replace('Reading '+files.length+' file'+(files.length>1?'s':'')+'...','Import complete!');
  prog.innerHTML=prog.innerHTML.replace(/bp-icon wait/g,'bp-icon done');

  const summary=[];
  if(totalChats>0)summary.push(totalChats+' chats');
  if(totalMems>0)summary.push(totalMems+' memories');
  if(totalStks>0)summary.push(totalStks+' stickers');
  if(didSettings)summary.push('settings');
  showToast(summary.length>0?'Imported: '+summary.join(', '):'Import done');
}

// ==================== 数据迁移（localStorage → IndexedDB） ====================
async function migrateData(){
  // 1. 迁移对话数据
  const oldChats=DB.get('chats',null);
  if(oldChats&&typeof oldChats==='object'&&Object.keys(oldChats).length>0){
    console.log('[Little] Migrating '+Object.keys(oldChats).length+' chats from localStorage to IndexedDB...');
    for(const id of Object.keys(oldChats)){
      const chat=oldChats[id];
      if(chat&&chat.id){
        await chatStore.put(chat);
      }
    }
    // 迁移成功后删除旧数据
    DB.del('chats');
    console.log('[Little] Chat migration complete. Removed old localStorage data.');
  }

  // 2. 迁移头像数据
  const oldUA=DB.get('userAvatar',null);
  const oldAA=DB.get('aiAvatar',null);
  if(oldUA){
    await avatarStore.set('user',oldUA);
    DB.del('userAvatar');
    console.log('[Little] User avatar migrated to IndexedDB.');
  }
  if(oldAA){
    await avatarStore.set('ai',oldAA);
    DB.del('aiAvatar');
    console.log('[Little] AI avatar migrated to IndexedDB.');
  }
}

// ==================== 初始化 ====================
async function init(){
  try{
    // 先执行数据迁移（首次运行时把 localStorage 旧数据搬到 IndexedDB）
    await migrateData();

    // 从 IndexedDB 加载对话元信息
    state.chatMetas=await chatStore.getAllMeta();

    // 加载当前对话的完整数据
    if(state.currentChatId){
      state.currentChatData=await chatStore.get(state.currentChatId);
      if(!state.currentChatData){
        // 当前对话不存在了，切到最新的
        state.currentChatId=state.chatMetas.length>0?state.chatMetas.sort((a,b)=>b.created-a.created)[0].id:null;
        state.currentChatData=state.currentChatId?await chatStore.get(state.currentChatId):null;
        saveCurrentChatId();
      }
    }

    // 加载头像缓存
    await loadAvatars();

    renderChatList();renderMessages();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();applyAvatarsToDOM();

    const savedTab=DB.get('currentTab','home');
    navigateTo(savedTab);

    // 开屏动画：1.8秒后隐藏
    setTimeout(hideSplash,1800);

    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){
    console.error('[Little] Init error:',e);
    // 降级：即使迁移失败也尝试显示界面
    renderChatList();renderMessages();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();
    setTimeout(hideSplash,1800);
  }
}
init();
