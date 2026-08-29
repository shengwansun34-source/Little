// ==================== Little state.js — 全局状态 & 基础工具 ====================

// ==================== 全局状态 ====================
let state={
  chatMetas:[],
  currentChatId:DB.get('currentChat',null),
  currentChatData:null,
  settings:DB.get('settings',{
    apiUrl:'',apiKey:'',model:'gpt-4o',charName:'Little',charNickname:'',
    userName:'',anniversary:'',
    systemPrompt:'你是 Little，一个温柔、真诚的 AI。你会自然地记住关于用户的事情，像老朋友一样。读完记忆后像已经知道一样说话，不要说"根据我的记忆"这种话。不知道的事就直说不知道，绝不编造。',
    autoMemory:'on',jinaKey:'',thinking:'off',customCSS:'',splitReply:'off',aiActivity:'50'
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
if(!state.settings.aiActivity)state.settings.aiActivity='50';

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

let cachedUserAvatar=null;
let cachedAiAvatar=null;

// ==================== 基础工具函数 ====================
function saveSettings(){DB.set('settings',state.settings);DB.set('lastChatTime',state.lastChatTime);}
function saveCurrentChatId(){DB.set('currentChat',state.currentChatId);}
async function saveCurrentChat(){
  if(state.currentChatData){
    await chatStore.put(state.currentChatData);
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
  const moods=DB.get('moodEntries',[]);const mel=document.getElementById('moodCount');if(mel)mel.textContent=moods.length+' entries';
  const whispers=DB.get('whisperEntries',[]);const wel=document.getElementById('whisperCount');if(wel)wel.textContent=whispers.length+' whispers';
  const todos=DB.get('todoList',[]);const toel=document.getElementById('todoCount');if(toel)toel.textContent=todos.filter(t=>!t.done).length+' tasks';
  const events=DB.get('calendarEvents',[]);const cel=document.getElementById('calendarCount');if(cel)cel.textContent=events.length+' events';
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
