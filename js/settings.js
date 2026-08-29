// ==================== Little settings.js — 设置/模型/备份/初始化 v2.0 ====================

// ==================== Claude 对话导入 ====================
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

// ==================== Claude 记忆导入 v2.0 ====================
function handleClaudeMemoryImport(e){
  const file=e.target.files[0];if(!file)return;e.target.value='';showToast('Reading memory file...');
  const reader=new FileReader();
  reader.onload=async(ev)=>{
    try{
      const data=JSON.parse(ev.target.result);
      let importedMems=0;
      let importedProfile=false;

      // 1. 处理 conversations_memory（总结性文本 → 拆成记忆条目）
      if(data.conversations_memory&&typeof data.conversations_memory==='string'){
        const text=data.conversations_memory;
        // 按段落拆分
        const paragraphs=text.split(/\n\n+/).filter(p=>p.trim().length>10);
        for(const para of paragraphs){
          // 跳过 synthesis integrity 之类的 meta 段落
          if(para.includes('synthesis integrity')||para.includes('synthesis guidelines'))continue;
          // 按句子进一步拆分
          const sentences=para.split(/[.。]\s*/).filter(s=>s.trim().length>5);
          for(const sentence of sentences){
            const cleanSentence=sentence.replace(/\*\*/g,'').replace(/^\s*[-*]\s*/,'').trim();
            if(cleanSentence.length<5||cleanSentence.length>200)continue;
            if(cleanSentence.includes('synthesis')||cleanSentence.includes('guidelines'))continue;
            // 自动分类
            let category='fact';
            if(/喜欢|偏好|prefer|favorite|style|interest/i.test(cleanSentence))category='profile';
            else if(/关心|care|love|warm|miss|感情/i.test(cleanSentence))category='warm';
            const mem={
              id:'mem_claude_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
              category:category,
              text:cleanSentence,
              time:Date.now(),
              vector:null,
              core:false,
              weight:0.8,
              lastRecalled:Date.now(),
              tags:['claude-import'],
              relatedTo:[]
            };
            // 去重检查
            const similar=await vectorStore.findSimilar(cleanSentence,0.8);
            if(similar.length===0){
              if(state.settings.jinaKey)mem.vector=await getEmbedding(cleanSentence);
              await vectorStore.add(mem);
              importedMems++;
            }
          }
        }
      }

      // 2. 处理 memory_files（profile.md → 填充 Profile）
      if(data.memory_files&&Array.isArray(data.memory_files)){
        for(const mf of data.memory_files){
          if(mf.path==='/profile.md'&&mf.content){
            const lines=mf.content.split('\n');
            for(const line of lines){
              const clean=line.replace(/^[-*]\s*/, '').replace(/$$stated$$\s*/i,'').replace(/$$observed$$\s*/i,'').replace(/$$inferred$$\s*/i,'').trim();
              if(clean.length<3)continue;
              if(clean.startsWith('---')||clean.startsWith('name:')||clean.startsWith('description:'))continue;
              if(clean.startsWith('sources:')||clean.startsWith('aliases:'))continue;

              // 尝试智能填充 Profile
              if(/名字|叫做|name/i.test(clean)&&!state.profile.basic.name){
                const nameMatch=clean.match(/(?:叫|叫做|名字是|called|name\s*(?:is)?)\s*[：:]*\s*(.+)/i);
                if(nameMatch)state.profile.basic.name=nameMatch[1].trim().slice(0,20);
                importedProfile=true;
              }
              if(/生日|birthday|born/i.test(clean)&&!state.profile.basic.birthday){
                const dateMatch=clean.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
                if(dateMatch)state.profile.basic.birthday=dateMatch[0];
                importedProfile=true;
              }
              if(/在.*住|位置|location|based in|lives? in/i.test(clean)&&!state.profile.basic.location){
                state.profile.basic.location=clean.slice(0,50);
                importedProfile=true;
              }
              if(/职业|工作|occupation|work|job|前端|开发|developer/i.test(clean)&&!state.profile.basic.occupation){
                state.profile.basic.occupation=clean.slice(0,50);
                importedProfile=true;
              }
              if(/喜欢|偏好|prefer|favorite|love|enjoy/i.test(clean)){
                if(/吃|食|食物|food|eat/i.test(clean)){
                  state.profile.preferences.food=state.profile.preferences.food?(state.profile.preferences.food+', '+clean.slice(0,40)):clean.slice(0,40);
                }else if(/音乐|music|song|听/i.test(clean)){
                  state.profile.preferences.music=state.profile.preferences.music?(state.profile.preferences.music+', '+clean.slice(0,40)):clean.slice(0,40);
                }else if(/颜色|color/i.test(clean)){
                  state.profile.preferences.color=clean.slice(0,30);
                }else{
                  state.profile.preferences.other=state.profile.preferences.other?(state.profile.preferences.other+'; '+clean.slice(0,50)):clean.slice(0,50);
                }
                importedProfile=true;
              }
              if(/风格|style|沟通|communication|简短|brief|conversational/i.test(clean)){
                state.profile.preferences.style=state.profile.preferences.style?(state.profile.preferences.style+'; '+clean.slice(0,60)):clean.slice(0,60);
                importedProfile=true;
              }

              // 同时也作为记忆条目存储
              if(clean.length>=8&&clean.length<=200){
                let cat='fact';
                if(/喜欢|偏好|prefer|favorite|style/i.test(clean))cat='profile';
                const mem={
                  id:'mem_claudep_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
                  category:cat,text:clean,time:Date.now(),
                  vector:null,core:false,weight:0.8,lastRecalled:Date.now(),
                  tags:['claude-import','profile'],relatedTo:[]
                };
                const similar=await vectorStore.findSimilar(clean,0.8);
                if(similar.length===0){
                  if(state.settings.jinaKey)mem.vector=await getEmbedding(clean);
                  await vectorStore.add(mem);
                  importedMems++;
                }
              }
            }
          }
        }
      }

      if(importedProfile)saveProfile();

      const summary=[];
      if(importedMems>0)summary.push(importedMems+' memories');
      if(importedProfile)summary.push('profile updated');
      showToast(summary.length>0?'Imported: '+summary.join(', '):'No new data found');
    }catch(err){
      showToast('Import error: '+err.message);
      console.error('[Little] Claude memory import error:',err);
    }
  };
  reader.onerror=()=>showToast('Read failed');
  reader.readAsText(file);
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

// ==================== Bluetooth Low Energy ====================
let connectedBluetoothDevice=null;
async function connectBluetoothDevice(){
  const status=document.getElementById('bluetoothStatus');
  if(!navigator.bluetooth){if(status)status.textContent='Web Bluetooth is not supported in this browser.';showToast('Bluetooth is unavailable');return;}
  try{
    if(status)status.textContent='Choose a nearby Bluetooth device…';
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:['battery_service']});
    const server=await device.gatt.connect();connectedBluetoothDevice=device;
    if(status)status.textContent='Connected: '+(device.name||'Unnamed device');
    device.addEventListener('gattserverdisconnected',()=>{if(status)status.textContent='Disconnected';connectedBluetoothDevice=null;});
    showToast('Bluetooth connected');
    // `server` is retained by the browser connection; device-specific controls can be added after service discovery.
    void server;
  }catch(err){if(err.name==='NotFoundError'){if(status)status.textContent='No device selected.';return;}if(status)status.textContent='Connection failed: '+err.message;showToast('Bluetooth connection failed');}
}

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
  document.getElementById('setFontFamily').value=s.fontFamily||'system';
  document.getElementById('setFontSize').value=s.fontSize||'normal';
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
    fontFamily:document.getElementById('setFontFamily').value,
    fontSize:document.getElementById('setFontSize').value,
    customCSS:document.getElementById('setCustomCSS').value,
    aiActivity:document.getElementById('setAiActivity').value
  };
  saveSettings();applyCustomCSS();applyTypography();updateModelTag();updateHeaderTitle();updateInputHint();updateGlobalHeader();
  showToast('Saved');closePage('settingsPage');
}
function saveSettings_page(){saveSettingsPage();}

// ==================== 记忆页面（增强 v2.0） ====================
async function openMemory(){await renderMemoryList();document.getElementById('memoryPage').classList.add('open');}
function closePage(id){document.getElementById(id).classList.remove('open');}

async function renderMemoryList(){
  const el=document.getElementById('memoryList');const statsEl=document.getElementById('memoryStats');
  try{const all=await vectorStore.getAll();
    if(all.length===0){statsEl.innerHTML='';el.innerHTML='<div class="memory-empty">No memories yet</div>';return;}
    const counts={profile:0,warm:0,fact:0,corridor:0};
    let coreCount=0;
    all.forEach(m=>{counts[m.category]=(counts[m.category]||0)+1;if(m.core)coreCount++;});
    statsEl.innerHTML='<div><div class="memory-stat-num">'+all.length+'</div><div class="memory-stat-label">Total</div></div>'
      +'<div><div class="memory-stat-num" style="color:var(--accent3)">'+coreCount+'</div><div class="memory-stat-label">Core</div></div>'
      +'<div><div class="memory-stat-num">'+counts.profile+'</div><div class="memory-stat-label">Profile</div></div>'
      +'<div><div class="memory-stat-num">'+counts.fact+'</div><div class="memory-stat-label">Fact</div></div>'
      +'<div><div class="memory-stat-num">'+counts.warm+'</div><div class="memory-stat-label">Warm</div></div>';

    // 排序：core 置顶，然后按时间降序
    all.sort((a,b)=>{
      if(a.core&&!b.core)return -1;
      if(!a.core&&b.core)return 1;
      return b.time-a.time;
    });

    const folders={};
    all.forEach(m=>{
      // A tag is a folder name; untagged memories stay in their category folder.
      const folder=(m.tags&&m.tags[0])||cnFolderName(m.category);
      (folders[folder]||(folders[folder]=[])).push(m);
    });
    el.innerHTML=Object.entries(folders).map(([folder,memories])=>{
      const items=memories.map(m=>renderMemoryItem(m)).join('');
      return '<section class="memory-folder"><div class="memory-folder-head"><span class="memory-folder-icon"></span><span>'+escHtml(folder)+'</span><span class="memory-folder-count">'+memories.length+' memories</span></div>'+items+'</section>';
    }).join('');
  }catch(e){el.innerHTML='<div class="memory-empty">Load error</div>';}
}

function cnFolderName(category){return {profile:'Profile',warm:'Warm moments',fact:'Facts',corridor:'Notes'}[category]||'Unsorted';}
function renderMemoryItem(m){
  const cn={profile:'Profile',warm:'Warm',fact:'Fact',corridor:'Note'};
  const coreBtn=m.core
    ?'<button class="mem-core-btn active" onclick="toggleCoreMemory(\''+m.id+'\')" title="Core Memory">★</button>'
    :'<button class="mem-core-btn" onclick="toggleCoreMemory(\''+m.id+'\')" title="Set as Core">☆</button>';
  const weightStr=m.weight!==undefined&&m.weight<1.0?' · w:'+m.weight.toFixed(2):'';
  const tagBadges=(m.tags||[]).map(t=>'<span class="mem-tag-badge">'+escHtml(t)+'</span>').join('');
  return '<div class="memory-item'+(m.core?' core-memory':'')+'">'
    +'<div><div class="memory-item-text"><span class="memory-tag '+m.category+'">'+(cn[m.category]||'Note')+'</span>'+escHtml(m.text)+'</div>'
    +'<div class="memory-item-meta">'+fmtTime(m.time)+(m.vector?' · vectorized':'')+weightStr+tagBadges+'</div></div>'
    +'<div class="mem-item-actions">'+coreBtn+'<button class="memory-item-del" onclick="deleteMemory(\''+m.id+'\')">✕</button></div></div>';
}

async function toggleCoreMemory(id){
  const result=await vectorStore.toggleCore(id);
  if(result==='limit'){
    showToast('Core memory limit reached (30 max)');
    return;
  }
  showToast(result?'Marked as core memory':'Removed from core');
  await renderMemoryList();
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
        downloadJSON({type:'little_chats',version:'2.0.0',exported:Date.now(),data:chats},'little_chats_'+ts+'.json');
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
        downloadJSON({type:'little_memories',version:'2.0.0',exported:Date.now(),data:mems},'little_memories_'+ts+'.json');
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
        downloadJSON({type:'little_stickers',version:'2.0.0',exported:Date.now(),data:stks},'little_stickers_'+ts+'.json');
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
        profile:state.profile,
        currentChatId:state.currentChatId,
        lastChatTime:state.lastChatTime,
        dailyQuote:DB.get('dailyQuote',null),
        lightTraces:DB.get('lightTraces',[]),
        currentTab:DB.get('currentTab','home'),
        userAvatar:cachedUserAvatar,
        aiAvatar:cachedAiAvatar,
        moodEntries:DB.get('moodEntries',[]),
        whisperEntries:DB.get('whisperEntries',[]),
        todoList:DB.get('todoList',[]),
        calendarEvents:DB.get('calendarEvents',[]),
        periodRecords:DB.get('periodRecords',[])
      };
      downloadJSON({type:'little_settings',version:'2.0.0',exported:Date.now(),data:bundle},'little_settings_'+ts+'.json');
      count++;
      prog.innerHTML=prog.innerHTML.replace('Exporting settings...','Settings & profile exported');
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
        // v2.0: Profile 导入
        if(d.profile){
          if(mode==='overwrite'){
            state.profile=d.profile;
          }else{
            // merge: 只填充空字段
            const dp=d.profile;
            if(dp.basic){
              if(!state.profile.basic.name&&dp.basic.name)state.profile.basic.name=dp.basic.name;
              if(!state.profile.basic.birthday&&dp.basic.birthday)state.profile.basic.birthday=dp.basic.birthday;
              if(!state.profile.basic.location&&dp.basic.location)state.profile.basic.location=dp.basic.location;
              if(!state.profile.basic.occupation&&dp.basic.occupation)state.profile.basic.occupation=dp.basic.occupation;
            }
            if(dp.preferences){
              if(!state.profile.preferences.food&&dp.preferences.food)state.profile.preferences.food=dp.preferences.food;
              if(!state.profile.preferences.color&&dp.preferences.color)state.profile.preferences.color=dp.preferences.color;
              if(!state.profile.preferences.music&&dp.preferences.music)state.profile.preferences.music=dp.preferences.music;
              if(!state.profile.preferences.style&&dp.preferences.style)state.profile.preferences.style=dp.preferences.style;
              if(!state.profile.preferences.other&&dp.preferences.other)state.profile.preferences.other=dp.preferences.other;
            }
            if(dp.people&&dp.people.length>0){
              dp.people.forEach(p=>{
                if(!state.profile.people.find(ep=>ep.name===p.name)){
                  state.profile.people.push(p);
                }
              });
            }
            if(!state.profile.habits&&dp.habits)state.profile.habits=dp.habits;
            if(!state.profile.notes&&dp.notes)state.profile.notes=dp.notes;
          }
          saveProfile();
        }
        if(d.lastChatTime)state.lastChatTime=d.lastChatTime;
        if(d.dailyQuote)DB.set('dailyQuote',d.dailyQuote);
        if(d.lightTraces)DB.set('lightTraces',d.lightTraces);
        if(d.currentTab)DB.set('currentTab',d.currentTab);
        if(d.moodEntries)DB.set('moodEntries',d.moodEntries);
        if(d.whisperEntries)DB.set('whisperEntries',d.whisperEntries);
        if(d.todoList)DB.set('todoList',d.todoList);
        if(d.calendarEvents)DB.set('calendarEvents',d.calendarEvents);
        if(d.periodRecords)DB.set('periodRecords',d.periodRecords);
        if(d.userAvatar){await avatarStore.set('user',d.userAvatar);cachedUserAvatar=d.userAvatar;}
        if(d.aiAvatar){await avatarStore.set('ai',d.aiAvatar);cachedAiAvatar=d.aiAvatar;}
        didSettings=true;
        prog.innerHTML=prog.innerHTML.replace('Importing settings...','Settings & profile restored');
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

  renderChatList();renderMessages();applyCustomCSS();applyTypography();updateModelTag();
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

// ==================== 记忆衰减定时检查 ====================
async function checkMemoryDecay(){
  const lastDecay=DB.get('lastMemoryDecay',0);
  const now=Date.now();
  const WEEK=7*24*60*60*1000;
  if(now-lastDecay>=WEEK){
    const updated=await vectorStore.decayWeights();
    DB.set('lastMemoryDecay',now);
    if(updated>0) console.log('[Little] Memory decay: '+updated+' memories updated');
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

    renderChatList();renderMessages();applyCustomCSS();applyTypography();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();applyAvatarsToDOM();
    checkPeriodReminder();
    checkMemoryDecay(); // v2.0: 记忆衰减检查

    const savedTab=DB.get('currentTab','home');
    navigateTo(savedTab);

    setTimeout(hideSplash,1800);

    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){
    console.error('[Little] Init error:',e);
    renderChatList();renderMessages();applyCustomCSS();applyTypography();updateModelTag();updateHeaderTitle();updateInputHint();updateSendBtn();
    updateGlobalHeader();
    setTimeout(hideSplash,1800);
  }
}
init();
