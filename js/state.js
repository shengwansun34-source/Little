// ==================== Little state.js — 全局状态 & 基础工具 v2.0 ====================

// ==================== 全局状态 ====================
let state={
  chatMetas:[],
  currentChatId:DB.get('currentChat',null),
  currentChatData:null,
  settings:DB.get('settings',{
    apiUrl:'',apiKey:'',model:'gpt-4o',charName:'Little',charNickname:'',
    userName:'',anniversary:'',
    systemPrompt:'你是 Little，一个温柔、真诚的 AI。你会自然地记住关于用户的事情，像老朋友一样。读完记忆后像已经知道一样说话，不要说"根据我的记忆"这种话。不知道的事就直说不知道，绝不编造。',
    autoMemory:'on',jinaKey:'',thinking:'off',customCSS:'',splitReply:'off',aiActivity:'50',fontFamily:'system',fontSize:'normal',chatBackground:'mist',chatBackgroundImage:''
  }),
  lastChatTime:DB.get('lastChatTime',null),
  generating:false,
  profile:DB.get('profile',{
    basic:{name:'',birthday:'',location:'',occupation:''},
    preferences:{food:'',color:'',music:'',style:'',other:''},
    people:[],
    habits:'',
    notes:''
  })
};

// 设置字段兼容
if(!state.settings.thinking)state.settings.thinking='off';
if(!state.settings.customCSS)state.settings.customCSS='';
if(!state.settings.charName)state.settings.charName='Little';
if(!state.settings.charNickname&&state.settings.charNickname!=='')state.settings.charNickname='';
if(!state.settings.splitReply)state.settings.splitReply='off';
if(!state.settings.userName&&state.settings.userName!=='')state.settings.userName='';
if(!state.settings.anniversary&&state.settings.anniversary!=='')state.settings.anniversary='';
if(!state.settings.aiActivity)state.settings.aiActivity='50';
if(!state.settings.fontFamily)state.settings.fontFamily='system';
if(!state.settings.fontSize)state.settings.fontSize='normal';
if(!state.settings.chatBackground)state.settings.chatBackground='mist';
if(state.settings.chatBackgroundImage===undefined)state.settings.chatBackgroundImage='';

// Profile 兼容
if(!state.profile.basic)state.profile.basic={name:'',birthday:'',location:'',occupation:''};
if(!state.profile.preferences)state.profile.preferences={food:'',color:'',music:'',style:'',other:''};
if(!state.profile.people)state.profile.people=[];
if(state.profile.habits===undefined)state.profile.habits='';
if(state.profile.notes===undefined)state.profile.notes='';

let currentTab='home';
let fetchedModels=[];
let pendingAttachments=[];
let renamingChatId=null;
let editingMessageIndex=null;
let stickerEditing=false;
let pendingImportData=[];
let currentAbortController=null;
let currentHtmlPreviewCode='';
let currentHtmlPreviewName='index.html';
let htmlBlockStore={};
let replyQueue=[];
let processingReplyQueue=false;
let cancelQueuedReplies=false;

let cachedUserAvatar=null;
let cachedAiAvatar=null;

// ==================== 基础工具函数 ====================
function saveSettings(){DB.set('settings',state.settings);DB.set('lastChatTime',state.lastChatTime);}
function saveProfile(){DB.set('profile',state.profile);}
function saveCurrentChatId(){DB.set('currentChat',state.currentChatId);}
async function saveChatData(chat){
  if(!chat)return;
  await chatStore.put(chat);
  const idx=state.chatMetas.findIndex(m=>m.id===chat.id);
  const meta={id:chat.id,title:chat.title,created:chat.created};
  if(idx>=0)state.chatMetas[idx]=meta;
  else state.chatMetas.push(meta);
}
async function saveCurrentChat(){await saveChatData(state.currentChatData);}
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
function applyTypography(){
  const families={system:"-apple-system, 'SF Pro Text', 'PingFang SC', sans-serif",serif:"Georgia, 'Songti SC', 'SimSun', serif",rounded:"'Arial Rounded MT Bold', 'PingFang SC', sans-serif",mono:"'SF Mono', Menlo, Consolas, monospace"};
  const scales={small:'0.9',normal:'1',large:'1.12',xlarge:'1.25'};
  const root=document.documentElement;
  root.style.setProperty('--app-font-family',families[state.settings.fontFamily]||families.system);
  root.style.setProperty('--font-scale',scales[state.settings.fontSize]||scales.normal);
}
function applyChatBackground(){
  const presets={mist:'linear-gradient(160deg,#eaf3ff,#f6f9fd)',blush:'linear-gradient(160deg,#fff1f4,#f7edf7)',lavender:'linear-gradient(160deg,#eeecff,#f5f7ff)',paper:'#f8fafc'};
  const area=document.getElementById('chatArea');if(!area)return;
  const image=state.settings.chatBackgroundImage;
  area.style.backgroundImage=image?'linear-gradient(rgba(248,251,255,.62),rgba(248,251,255,.62)), url("'+image.replace(/"/g,'\\"')+'")':(presets[state.settings.chatBackground]||presets.mist);
  area.style.backgroundSize=image?'cover':'auto';area.style.backgroundPosition='center';
}

// ==================== Profile 工具函数 ====================
function getProfileContext(){
  const p=state.profile;
  let ctx='';
  const parts=[];
  if(p.basic.name) parts.push('名字：'+p.basic.name);
  if(p.basic.birthday) parts.push('生日：'+p.basic.birthday);
  if(p.basic.location) parts.push('位置：'+p.basic.location);
  if(p.basic.occupation) parts.push('职业：'+p.basic.occupation);
  if(p.preferences.food) parts.push('喜欢的食物：'+p.preferences.food);
  if(p.preferences.color) parts.push('喜欢的颜色：'+p.preferences.color);
  if(p.preferences.music) parts.push('喜欢的音乐：'+p.preferences.music);
  if(p.preferences.style) parts.push('沟通风格偏好：'+p.preferences.style);
  if(p.preferences.other) parts.push('其他喜好：'+p.preferences.other);
  if(p.people.length>0){
    parts.push('重要的人：'+p.people.map(pe=>pe.name+'('+pe.relation+')').join('、'));
  }
  if(p.habits) parts.push('习惯：'+p.habits);
  if(p.notes) parts.push('备注：'+p.notes);
  if(parts.length>0){
    ctx='\n\n[用户档案 Profile]\n'+parts.join('\n')+'\n（以上是你了解的用户信息，自然地运用，不要特意提及"根据你的档案"）';
  }
  return ctx;
}

// 检查 Profile 是否有内容
function hasProfileContent(){
  const p=state.profile;
  return p.basic.name||p.basic.birthday||p.basic.location||p.basic.occupation||
    p.preferences.food||p.preferences.color||p.preferences.music||p.preferences.style||p.preferences.other||
    p.people.length>0||p.habits||p.notes;
}

// ==================== 上下文激活（日历/纪念日触发记忆） ====================
function getContextTriggers(){
  const triggers=[];
  const today=new Date();
  const todayStr=today.toISOString().slice(0,10);
  const todayMD=todayStr.slice(5); // MM-DD

  // 纪念日触发
  if(state.settings.anniversary){
    const annMD=state.settings.anniversary.slice(5);
    const annDate=new Date(state.settings.anniversary+'T00:00:00');
    const daysUntil=Math.floor((new Date(today.getFullYear()+'-'+annMD+'T00:00:00')-today)/(86400000));
    if(daysUntil>=0 && daysUntil<=3) triggers.push('纪念日快到了（'+daysUntil+'天后）');
    if(daysUntil===0) triggers.push('今天是纪念日');
  }

  // 日历事件触发
  const events=DB.get('calendarEvents',[]);
  events.forEach(ev=>{
    let match=false;
    if(ev.repeat==='yes') match=ev.date.slice(5)===todayMD;
    else match=ev.date===todayStr;
    if(match) triggers.push('今天有事件：'+ev.title+'（'+ev.type+'）');
  });

  // 检查即将到来的事件（3天内）
  events.forEach(ev=>{
    let evDate;
    if(ev.repeat==='yes') evDate=today.getFullYear()+'-'+ev.date.slice(5);
    else evDate=ev.date;
    const d=new Date(evDate+'T00:00:00');
    const diff=Math.floor((d-today)/(86400000));
    if(diff>0 && diff<=3) triggers.push(diff+'天后有事件：'+ev.title);
  });

  return triggers;
}

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

// ==================== Memory 页面计数 v2.0 ====================
async function updateMemoryGrid(){
  try{
    const mems=await vectorStore.getAll();
    const coreCount=mems.filter(m=>m.core===true).length;
    const el=document.getElementById('memBankCount');
    if(el)el.textContent=mems.length+' memories'+(coreCount>0?' · '+coreCount+' core':'');
  }catch{}
  // Profile 计数
  const profileEl=document.getElementById('profileCount');
  if(profileEl) profileEl.textContent=hasProfileContent()?'Active':'Not set';

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
  if(tab==='home'||tab==='together'){updateHomePage();applyAvatarsToDOM();}
  if(tab==='memory')updateMemoryGrid();
  DB.set('currentTab',tab);
}
