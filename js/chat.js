// ==================== Little chat.js — 聊天核心 v2.0 ====================

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
    if(newMemories.length>0)storeMemories(newMemories);generateLightTrace(chat.messages);triggerAiActivity(chat.messages);
    autoExtractProfile(''||'',cleanReply);
  }catch(err){if(err.name!=='AbortError')showToast('Error: '+err.message);}
  finally{state.generating=false;currentAbortController=null;updateSendBtn();const t=document.getElementById('typing');if(t)t.classList.remove('show');}
}

// ==================== 记忆系统 v2.0 ====================
async function retrieveMemories(q){
  try{
    if(state.settings.jinaKey){
      const qv=await getEmbedding(q);
      if(qv){
        const results=await vectorStore.search(qv,8);
        // 标记被召回的记忆
        for(const r of results){
          if(r.score>0.3) await vectorStore.markRecalled(r.id);
        }
        return results;
      }
    }
    // 备用：关键词搜索
    return await vectorStore.searchByKeyword(q,8);
  }catch{return [];}
}

async function buildSystemPrompt(uq){
  const s=state.settings;let sys=s.systemPrompt||'';

  if(s.charNickname){sys+='\n\n[身份信息]\n你的名字是'+s.charName+'，但用户给你起了一个亲密的备注叫「'+s.charNickname+'」。用户界面上显示的是这个备注。你知道这个备注的存在，可以自然地回应，但不需要每次都提及。';}
  if(s.thinking==='on')sys+='\n\n请在思考时使用中文。';
  sys+='\n\n'+getTimeContext();

  // v2.0: 注入 Profile
  const profileCtx=getProfileContext();
  if(profileCtx) sys+=profileCtx;

  // v2.0: 核心记忆（永远注入）
  try{
    const coreMems=await vectorStore.getCoreMemories();
    if(coreMems.length>0){
      sys+='\n\n[核心记忆 — 你一直记得的事]';
      coreMems.forEach(m=>{
        const cats={profile:'画像',warm:'暖记忆',fact:'事实',corridor:'便条'};
        sys+='\n'+( cats[m.category]||'事实')+'：'+m.text;
      });
    }
  }catch{}

  // 普通记忆（向量/关键词搜索）
  const mems=await retrieveMemories(uq);
  const nonCoreMems=mems.filter(m=>!m.core); // 排除已注入的核心记忆
  if(nonCoreMems.length>0){
    sys+='\n\n[相关记忆]';
    nonCoreMems.forEach(m=>{
      const cats={profile:'画像',warm:'暖记忆',fact:'事实',corridor:'便条'};
      sys+='\n'+(cats[m.category]||'事实')+'：'+m.text;
    });
    sys+='\n（像自然知道一样说话，不要说"根据我的记忆"）';
  }

  // v2.0: 上下文激活（日历/纪念日触发）
  const triggers=getContextTriggers();
  if(triggers.length>0){
    sys+='\n\n[今日提醒]';
    triggers.forEach(t=>sys+='\n'+t);
    sys+='\n（如果与对话相关，可以自然地提起；不相关则不必刻意提及）';
  }

  // 月经信息
  const pc=getPeriodContext();if(pc)sys+=pc;

  // v2.0: AI 主动引用记忆的指令
  sys+='\n\n[记忆使用指南]\n如果你的记忆中有与当前对话高度相关的内容，请自然地体现出来。例如"之前你说过..."、"我记得你..."，但不要生硬或频繁。让对方感受到你真的记住了。';

  // 记忆提取指令
  if(s.autoMemory==='on')sys+='\n\n[记忆提取指令]\n如果用户分享了值得记住的信息，或明确要求记住，请在回复最末尾另起一行标记：\n[MEM|类别|内容]\n类别：profile/warm/fact/corridor\n没有值得记忆的不要加。只记重要的。';

  // v2.0: Profile 自动提取指令
  sys+='\n\n[个人信息提取]\n如果用户在对话中透露了个人信息（如名字、生日、喜好、职业、家人朋友等），请在回复末尾标记：\n[PROF|字段|值]\n字段可以是：name/birthday/location/occupation/food/color/music/style/habit/person(名字,关系)/note\n例如：[PROF|food|火锅] [PROF|person|妈妈,母亲]\n只在检测到新信息时标记，不要重复已知的。';

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
    const{cleanReply,newMemories,profileUpdates}=extractMemories(result.content);
    const ro={role:'assistant',content:cleanReply,time:Date.now()};
    if(result.thinking)ro.thinking=result.thinking;chat.messages.push(ro);state.lastChatTime=Date.now();
    saveSettings();await saveCurrentChat();renderMessages();renderChatList();
    if(newMemories.length>0)storeMemories(newMemories);
    if(profileUpdates.length>0)applyProfileUpdates(profileUpdates);
    generateLightTrace(chat.messages);triggerAiActivity(chat.messages);autoExtractTodos(text||'',cleanReply);
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

// ==================== 记忆提取 & 存储 v2.0 ====================
function extractMemories(reply){
  // 提取 [MEM|category|text]
  const memRe=/\[MEM\|(\w+)\|(.+?)\]/g;let m;let clean=reply;const mems=[];
  while((m=memRe.exec(reply))!==null){
    mems.push({id:'mem_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),category:m[1].trim(),text:m[2].trim(),time:Date.now(),vector:null,core:false,weight:1.0,lastRecalled:Date.now(),tags:[],relatedTo:[]});
    clean=clean.replace(m[0],'');
  }

  // v2.0: 提取 [PROF|field|value]
  const profRe=/\[PROF\|(\w+)\|(.+?)\]/g;let p;const profileUpdates=[];
  while((p=profRe.exec(clean))!==null){
    profileUpdates.push({field:p[1].trim(),value:p[2].trim()});
    clean=clean.replace(p[0],'');
  }

  return{cleanReply:clean.replace(/\n+$/,'').trim(),newMemories:mems,profileUpdates};
}

// v2.0: 应用 Profile 更新
function applyProfileUpdates(updates){
  if(!updates||updates.length===0)return;
  let changed=false;
  for(const u of updates){
    switch(u.field){
      case 'name': if(!state.profile.basic.name||state.profile.basic.name!==u.value){state.profile.basic.name=u.value;changed=true;} break;
      case 'birthday': if(!state.profile.basic.birthday){state.profile.basic.birthday=u.value;changed=true;} break;
      case 'location': state.profile.basic.location=u.value;changed=true; break;
      case 'occupation': state.profile.basic.occupation=u.value;changed=true; break;
      case 'food': {const cur=state.profile.preferences.food;state.profile.preferences.food=cur?(cur+', '+u.value):u.value;changed=true;} break;
      case 'color': state.profile.preferences.color=u.value;changed=true; break;
      case 'music': {const cur=state.profile.preferences.music;state.profile.preferences.music=cur?(cur+', '+u.value):u.value;changed=true;} break;
      case 'style': state.profile.preferences.style=u.value;changed=true; break;
      case 'habit': {state.profile.habits=state.profile.habits?(state.profile.habits+'; '+u.value):u.value;changed=true;} break;
      case 'person': {
        const parts=u.value.split(',');
        const name=parts[0]?.trim();const relation=parts[1]?.trim()||'';
        if(name&&!state.profile.people.find(p=>p.name===name)){
          state.profile.people.push({name,relation});changed=true;
        }
      } break;
      case 'note': {state.profile.notes=state.profile.notes?(state.profile.notes+'; '+u.value):u.value;changed=true;} break;
    }
  }
  if(changed){
    saveProfile();
    console.log('[Little] Profile updated:',updates.map(u=>u.field+'='+u.value).join(', '));
  }
}

async function storeMemories(mems){
  let n=0;for(const m of mems){
    try{
      // 检查是否有相似记忆（避免重复）
      const similar=await vectorStore.findSimilar(m.text,0.85);
      if(similar.length>0){
        console.log('[Little] Skipping duplicate memory:',m.text.slice(0,30));
        continue;
      }
      if(state.settings.jinaKey)m.vector=await getEmbedding(m.text);
      await vectorStore.add(m);n++;
    }catch(e){console.error(e);}
  }
  if(n>0)showToast('Memorized '+n);
}

async function addManualMemory(){
  const cat=document.getElementById('memAddCategory').value;const text=document.getElementById('memAddText').value.trim();
  if(!text){showToast('Enter content');return;}
  const m={id:'mem_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),category:cat,text,time:Date.now(),vector:null,core:false,weight:1.0,lastRecalled:Date.now(),tags:[],relatedTo:[]};
  try{if(state.settings.jinaKey)m.vector=await getEmbedding(text);await vectorStore.add(m);
    document.getElementById('memAddText').value='';document.getElementById('memAddText').style.height='auto';
    showToast('Added');await renderMemoryList();
  }catch(e){showToast('Failed: '+e.message);}
}
