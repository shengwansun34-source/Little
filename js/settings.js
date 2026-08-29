// ==================== Little settings.js — 设置/模型/备份/初始化 ====================

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
  document.getElementById('setAiActivity').value=s.aiActivity||'50';
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
    customCSS:document.getElementById('setCustomCSS').value,
    aiActivity:document.getElementById('setAiActivity').value
  };
  saveSettings();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateGlobalHeader();
  showToast('Saved');closePage('settingsPage');
}
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

    await new Promise(r=>setTimeout(r,600));

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

    prog.innerHTML=prog.innerHTML.replace('Preparing data...',count>0?'All done! '+count+' file'+(count>1?'s':'')+' exported':'Nothing selected');
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
  const oldChats=DB.get('chats',null);
  if(oldChats&&typeof oldChats==='object'&&Object.keys(oldChats).length>0){
    console.log('[Little] Migrating '+Object.keys(oldChats).length+' chats from localStorage to IndexedDB...');
    for(const id of Object.keys(oldChats)){
      const chat=oldChats[id];
      if(chat&&chat.id){
        await chatStore.put(chat);
      }
    }
    DB.del('chats');
    console.log('[Little] Chat migration complete. Removed old localStorage data.');
  }

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
    await migrateData();

    state.chatMetas=await chatStore.getAllMeta();

    if(state.currentChatId){
      state.currentChatData=await chatStore.get(state.currentChatId);
      if(!state.currentChatData){
        state.currentChatId=state.chatMetas.length>0?state.chatMetas.sort((a,b)=>b.created-a.created)[0].id:null;
        state.currentChatData=state.currentChatId?await chatStore.get(state.currentChatId):null;
        saveCurrentChatId();
      }
    }

    await loadAvatars();

    renderChatList();renderMessages();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();applyAvatarsToDOM();
    checkPeriodReminder();

    const savedTab=DB.get('currentTab','home');
    navigateTo(savedTab);

    setTimeout(hideSplash,1800);

    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){
    console.error('[Little] Init error:',e);
    renderChatList();renderMessages();applyCustomCSS();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();
    setTimeout(hideSplash,1800);
  }
}
init();
