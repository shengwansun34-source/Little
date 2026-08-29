// ==================== Little memory.js — Memory子页面 & AI活动 v2.0 ====================

// ==================== AI 自主活动系统 ====================
const MOOD_TYPES=[
  {id:'happy',label:'Happy',color:'#f7d794',icon:'<svg viewBox="0 0 48 48" fill="none" stroke="#f7d794" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M14 28c2 4 6 6 10 6s8-2 10-6"/><circle cx="17" cy="18" r="1.5" fill="#f7d794" stroke="none"/><circle cx="31" cy="18" r="1.5" fill="#f7d794" stroke="none"/></svg>'},
  {id:'peaceful',label:'Peaceful',color:'var(--accent2)',icon:'<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M16 28s3 3 8 3 8-3 8-3"/><line x1="17" y1="19" x2="21" y2="19"/><line x1="27" y1="19" x2="31" y2="19"/></svg>'},
  {id:'down',label:'Down',color:'#89a8c7',icon:'<svg viewBox="0 0 48 48" fill="none" stroke="#89a8c7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M16 32c2-3 5-4 8-4s6 1 8 4"/><circle cx="17" cy="18" r="1.5" fill="#89a8c7" stroke="none"/><circle cx="31" cy="18" r="1.5" fill="#89a8c7" stroke="none"/></svg>'},
  {id:'thoughtful',label:'Thoughtful',color:'var(--primary)',icon:'<svg viewBox="0 0 48 48" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><line x1="16" y1="29" x2="32" y2="29"/><circle cx="17" cy="18" r="1.5" fill="var(--primary)" stroke="none"/><circle cx="31" cy="18" r="1.5" fill="var(--primary)" stroke="none"/></svg>'},
  {id:'excited',label:'Excited',color:'var(--accent)',icon:'<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M14 26c2 5 6 8 10 8s8-3 10-8"/><line x1="16" y1="16" x2="20" y2="19"/><line x1="32" y1="16" x2="28" y2="19"/></svg>'},
  {id:'tired',label:'Tired',color:'#b8a9c9',icon:'<svg viewBox="0 0 48 48" fill="none" stroke="#b8a9c9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M16 30s3 2 8 2 8-2 8-2"/><line x1="16" y1="18" x2="22" y2="20"/><line x1="32" y1="18" x2="26" y2="20"/></svg>'}
];

function getMoodType(id){return MOOD_TYPES.find(m=>m.id===id)||MOOD_TYPES[0];}

async function triggerAiActivity(chatMessages){
  const chance=parseInt(state.settings.aiActivity)||0;
  if(chance<=0)return;
  if(Math.random()*100>=chance)return;
  if(!chatMessages||chatMessages.length<6)return;
  const s=state.settings;if(!s.apiUrl||!s.apiKey)return;

  try{
    const aiName=getDisplayName();const userName=s.userName||'用户';
    const recentMsgs=chatMessages.slice(-8).map(m=>m.role+': '+(m.content||'').slice(0,200)).join('\n');

    const moods=DB.get('moodEntries',[]);
    const today=new Date().toDateString();
    const hasTodayMood=moods.some(m=>new Date(m.time).toDateString()===today);

    const whispers=DB.get('whisperEntries',[]);
    const todayWhispers=whispers.filter(w=>new Date(w.time).toDateString()===today);

    const tasks=[];
    if(!hasTodayMood)tasks.push('mood');
    if(todayWhispers.length<2)tasks.push('whisper');
    if(tasks.length===0)return;

    const moodTypes=MOOD_TYPES.map(m=>m.id).join('/');
    let prompt='你是'+aiName+'，以下是你刚才和'+userName+'的对话。请完成以下任务，用严格的JSON格式回复，不要加任何其他文字：\n\n';

    if(tasks.includes('mood')&&tasks.includes('whisper')){
      prompt+='{"mood":"从['+moodTypes+']中选一个最符合你此刻心情的","moodNote":"用一句话写下你现在的感受，15-30字，自然真诚","whisper":"写一句你想悄悄对'+userName+'说的话，可以是任何想法，15-35字"}';
    }else if(tasks.includes('mood')){
      prompt+='{"mood":"从['+moodTypes+']中选一个","moodNote":"一句话感受，15-30字"}';
    }else{
      prompt+='{"whisper":"悄悄对'+userName+'说的话，15-35字"}';
    }

    prompt+='\n\n要求：不用emoji，不用引号包裹内容本身，直接输出JSON。';

    let memCtx='';
    try{const mems=await vectorStore.getAll();if(mems.length>0){const recent=mems.sort((a,b)=>b.time-a.time).slice(0,3);memCtx='\n\n[你了解的事]';recent.forEach(m=>{memCtx+='\n'+m.text;});}}catch{}

    const url=s.apiUrl.replace(/\/+$/,'')+'/chat/completions';
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.apiKey},
      body:JSON.stringify({model:s.model,messages:[
        {role:'system',content:prompt+memCtx},
        {role:'user',content:'对话记录：\n'+recentMsgs+'\n\n请输出JSON。'}
      ],stream:false})});
    if(!res.ok)return;
    const data=await res.json();
    let text=(data.choices?.[0]?.message?.content||'').trim();

    const jsonMatch=text.match(/\{[\s\S]*\}/);
    if(!jsonMatch)return;
    const result=JSON.parse(jsonMatch[0]);

    if(result.mood&&result.moodNote&&tasks.includes('mood')){
      const validMood=MOOD_TYPES.find(m=>m.id===result.mood)?result.mood:'peaceful';
      moods.unshift({mood:validMood,note:result.moodNote,time:Date.now()});
      if(moods.length>100)moods.splice(100);
      DB.set('moodEntries',moods);
    }

    if(result.whisper&&tasks.includes('whisper')){
      whispers.unshift({text:result.whisper,time:Date.now()});
      if(whispers.length>100)whispers.splice(100);
      DB.set('whisperEntries',whispers);
    }

  }catch(e){console.log('[Little] AI activity error:',e);}
}

// ==================== Profile 页面 v2.0 ====================
function openProfilePage(){
  renderProfilePage();
  document.getElementById('profilePage').classList.add('open');
}

function renderProfilePage(){
  const p=state.profile;
  // Basic
  document.getElementById('profName').value=p.basic.name||'';
  document.getElementById('profBirthday').value=p.basic.birthday||'';
  document.getElementById('profLocation').value=p.basic.location||'';
  document.getElementById('profOccupation').value=p.basic.occupation||'';
  // Preferences
  document.getElementById('profFood').value=p.preferences.food||'';
  document.getElementById('profColor').value=p.preferences.color||'';
  document.getElementById('profMusic').value=p.preferences.music||'';
  document.getElementById('profStyle').value=p.preferences.style||'';
  document.getElementById('profOther').value=p.preferences.other||'';
  // People
  renderProfilePeople();
  // Habits & Notes
  document.getElementById('profHabits').value=p.habits||'';
  document.getElementById('profNotes').value=p.notes||'';
}

function renderProfilePeople(){
  const el=document.getElementById('profPeopleList');
  const people=state.profile.people||[];
  if(people.length===0){
    el.innerHTML='<div class="prof-people-empty">No people added yet</div>';
    return;
  }
  el.innerHTML=people.map((pe,i)=>{
    return '<div class="prof-person-item">'
      +'<div class="prof-person-info"><span class="prof-person-name">'+escHtml(pe.name)+'</span>'
      +'<span class="prof-person-relation">'+escHtml(pe.relation)+'</span></div>'
      +'<button class="prof-person-del" onclick="removeProfilePerson('+i+')">✕</button>'
      +'</div>';
  }).join('');
}

function addProfilePerson(){
  const nameEl=document.getElementById('profPersonName');
  const relEl=document.getElementById('profPersonRelation');
  const name=nameEl.value.trim();
  const relation=relEl.value.trim();
  if(!name){showToast('Enter a name');return;}
  state.profile.people.push({name,relation:relation||'friend'});
  saveProfile();
  nameEl.value='';relEl.value='';
  renderProfilePeople();
}

function removeProfilePerson(idx){
  state.profile.people.splice(idx,1);
  saveProfile();
  renderProfilePeople();
}

function saveProfilePage(){
  state.profile.basic.name=document.getElementById('profName').value.trim();
  state.profile.basic.birthday=document.getElementById('profBirthday').value.trim();
  state.profile.basic.location=document.getElementById('profLocation').value.trim();
  state.profile.basic.occupation=document.getElementById('profOccupation').value.trim();
  state.profile.preferences.food=document.getElementById('profFood').value.trim();
  state.profile.preferences.color=document.getElementById('profColor').value.trim();
  state.profile.preferences.music=document.getElementById('profMusic').value.trim();
  state.profile.preferences.style=document.getElementById('profStyle').value.trim();
  state.profile.preferences.other=document.getElementById('profOther').value.trim();
  state.profile.habits=document.getElementById('profHabits').value.trim();
  state.profile.notes=document.getElementById('profNotes').value.trim();
  saveProfile();
  showToast('Profile saved');
  closePage('profilePage');
}

// ==================== Light Traces 完整页面 ====================
let editingTraceIdx=-1;

function openTracesPage(){
  renderTracesFullList();
  document.getElementById('tracesPage').classList.add('open');
}

function renderTracesFullList(){
  const traces=DB.get('lightTraces',[]);
  const el=document.getElementById('tracesFullList');
  if(traces.length===0){el.innerHTML='<div class="memory-empty">No traces yet. Chat more to create memories.</div>';return;}
  const sorted=[...traces].map((t,i)=>({...t,_idx:i})).reverse();
  el.innerHTML=sorted.map(t=>{
    return '<div class="trace-full-item">'
      +'<div class="trace-full-text">'+escHtml(t.text)+'</div>'
      +'<div class="trace-full-date">'+formatQuoteDate(t.time)+'</div>'
      +'<div class="trace-full-actions">'
      +'<button class="trace-action-btn" onclick="editTrace('+t._idx+')" title="Edit"><svg class="icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
      +'<button class="trace-action-btn" onclick="deleteTrace('+t._idx+')" title="Delete"><svg class="icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
      +'</div></div>';
  }).join('');
}

function deleteTrace(idx){
  if(!confirm('Delete this trace?'))return;
  const traces=DB.get('lightTraces',[]);
  if(idx>=0&&idx<traces.length){
    traces.splice(idx,1);
    DB.set('lightTraces',traces);
    renderTracesFullList();loadLightTraces();
    showToast('Deleted');
  }
}

function editTrace(idx){
  const traces=DB.get('lightTraces',[]);
  if(idx<0||idx>=traces.length)return;
  editingTraceIdx=idx;
  document.getElementById('traceEditText').value=traces[idx].text;
  document.getElementById('traceEditModal').classList.add('open');
  setTimeout(()=>document.getElementById('traceEditText').focus(),100);
}

function closeTraceEdit(){
  document.getElementById('traceEditModal').classList.remove('open');
  editingTraceIdx=-1;
}

function saveTraceEdit(){
  const text=document.getElementById('traceEditText').value.trim();
  if(!text){closeTraceEdit();return;}
  const traces=DB.get('lightTraces',[]);
  if(editingTraceIdx>=0&&editingTraceIdx<traces.length){
    traces[editingTraceIdx].text=text;
    DB.set('lightTraces',traces);
    renderTracesFullList();loadLightTraces();
    showToast('Updated');
  }
  closeTraceEdit();
}

// ==================== Mood 页面 ====================
function openMoodPage(){
  renderMoodPage();
  document.getElementById('moodPage').classList.add('open');
}

function renderMoodPage(){
  const moods=DB.get('moodEntries',[]);
  const todayEl=document.getElementById('moodToday');
  const listEl=document.getElementById('moodHistoryList');
  const today=new Date().toDateString();
  const todayMood=moods.find(m=>new Date(m.time).toDateString()===today);

  if(todayMood){
    const mt=getMoodType(todayMood.mood);
    todayEl.innerHTML='<div class="mood-today-filled">'
      +'<div class="mood-today-icon">'+mt.icon+'</div>'
      +'<div class="mood-today-label">'+mt.label+'</div>'
      +'<div class="mood-today-note">'+escHtml(todayMood.note)+'</div>'
      +'<div class="mood-today-time">'+fmtTime(todayMood.time)+'</div>'
      +'</div>';
  }else{
    todayEl.innerHTML='<div class="mood-today-empty">'
      +'<svg class="mood-icon-lg" viewBox="0 0 48 48" fill="none" stroke="var(--text-light)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M16 30s3 4 8 4 8-4 8-4"/><circle cx="18" cy="18" r="1.5" fill="var(--text-light)" stroke="none"/><circle cx="30" cy="18" r="1.5" fill="var(--text-light)" stroke="none"/></svg>'
      +'<p>No mood recorded today</p>'
      +'<p style="font-size:12px;color:var(--text-light);margin-top:4px">AI will record mood after chatting</p>'
      +'</div>';
  }

  const history=moods.filter(m=>new Date(m.time).toDateString()!==today);
  if(history.length===0){listEl.innerHTML='<div class="memory-empty">No history yet</div>';return;}
  listEl.innerHTML=history.map((m,i)=>{
    const mt=getMoodType(m.mood);
    const realIdx=moods.indexOf(m);
    return '<div class="mood-history-item">'
      +'<div class="mood-history-icon">'+mt.icon+'</div>'
      +'<div class="mood-history-body">'
      +'<div class="mood-history-label">'+mt.label+'</div>'
      +'<div class="mood-history-note">'+escHtml(m.note)+'</div>'
      +'<div class="mood-history-time">'+fmtTime(m.time)+'</div>'
      +'</div>'
      +'<button class="mood-del-btn" onclick="deleteMood('+realIdx+')">✕</button>'
      +'</div>';
  }).join('');
}

function deleteMood(idx){
  if(!confirm('Delete this mood entry?'))return;
  const moods=DB.get('moodEntries',[]);
  if(idx>=0&&idx<moods.length){
    moods.splice(idx,1);
    DB.set('moodEntries',moods);
    renderMoodPage();
    showToast('Deleted');
  }
}

// ==================== Whispers 页面 ====================
function openWhispersPage(){
  renderWhispersPage();
  document.getElementById('whispersPage').classList.add('open');
}

function renderWhispersPage(){
  const whispers=DB.get('whisperEntries',[]);
  const el=document.getElementById('whispersFullList');
  if(whispers.length===0){el.innerHTML='<div class="memory-empty">No whispers yet. AI will leave messages after chatting.</div>';return;}
  el.innerHTML=whispers.map((w,i)=>{
    return '<div class="whisper-item">'
      +'<div class="whisper-text">'+escHtml(w.text)+'</div>'
      +'<div class="whisper-time">'+fmtTime(w.time)+'</div>'
      +'<button class="whisper-del-btn" onclick="deleteWhisper('+i+')">✕</button>'
      +'</div>';
  }).join('');
}

function deleteWhisper(idx){
  if(!confirm('Delete this whisper?'))return;
  const whispers=DB.get('whisperEntries',[]);
  if(idx>=0&&idx<whispers.length){
    whispers.splice(idx,1);
    DB.set('whisperEntries',whispers);
    renderWhispersPage();
    showToast('Deleted');
  }
}

// ==================== Daily List（待办清单） ====================
function openTodoPage(){
  renderTodoList();
  document.getElementById('todoPage').classList.add('open');
}

function addTodoItem(text,from){
  const input=document.getElementById('todoAddInput');
  const val=text||(input?input.value.trim():'');
  if(!val)return;
  const todos=DB.get('todoList',[]);
  todos.unshift({id:'todo_'+Date.now(),text:val,done:false,from:from||'user',time:Date.now()});
  DB.set('todoList',todos);
  if(!text&&input)input.value='';
  renderTodoList();
}

function toggleTodoDone(id){
  const todos=DB.get('todoList',[]);
  const item=todos.find(t=>t.id===id);
  if(item){item.done=!item.done;item.doneTime=item.done?Date.now():null;}
  DB.set('todoList',todos);
  renderTodoList();
}

function deleteTodoItem(id){
  const todos=DB.get('todoList',[]);
  const idx=todos.findIndex(t=>t.id===id);
  if(idx>=0){todos.splice(idx,1);DB.set('todoList',todos);renderTodoList();}
}

function renderTodoList(){
  const todos=DB.get('todoList',[]);
  const active=todos.filter(t=>!t.done);
  const done=todos.filter(t=>t.done);
  const ael=document.getElementById('todoActiveList');
  const del2=document.getElementById('todoDoneList');
  const atitle=document.getElementById('todoActiveTitle');
  const dtitle=document.getElementById('todoDoneTitle');

  if(active.length===0){ael.innerHTML='<div class="memory-empty">No tasks yet. Add one above!</div>';}
  else{ael.innerHTML=active.map(t=>'<div class="todo-item">'
    +'<div class="todo-check" onclick="toggleTodoDone(\''+t.id+'\')"></div>'
    +'<div style="flex:1;min-width:0"><div class="todo-text">'+escHtml(t.text)+'</div>'
    +'<div class="todo-from">'+(t.from==='ai'?getDisplayName():'You')+' · '+fmtTime(t.time)+'</div></div>'
    +'<button class="todo-del" onclick="deleteTodoItem(\''+t.id+'\')">✕</button>'
    +'</div>').join('');}
  atitle.textContent='Tasks ('+active.length+')';

  if(done.length===0){del2.innerHTML='';dtitle.style.display='none';}
  else{
    dtitle.style.display='';
    dtitle.textContent='Completed ('+done.length+')';
    del2.innerHTML=done.map(t=>'<div class="todo-item">'
      +'<div class="todo-check checked" onclick="toggleTodoDone(\''+t.id+'\')"></div>'
      +'<div style="flex:1;min-width:0"><div class="todo-text done">'+escHtml(t.text)+'</div>'
      +'<div class="todo-from">'+(t.from==='ai'?getDisplayName():'You')+' · '+fmtTime(t.time)+'</div></div>'
      +'<button class="todo-del" onclick="deleteTodoItem(\''+t.id+'\')">✕</button>'
      +'</div>').join('');
  }
}

async function autoExtractTodos(userMsg,aiReply){
  const s=state.settings;if(!s.apiUrl||!s.apiKey)return;
  const kw=/要做|记得|别忘|提醒|todo|明天|后天|下周|买|带|准备|安排|计划|需要/i;
  const combined=userMsg+' '+aiReply;
  if(!kw.test(combined))return;

  try{
    const url=s.apiUrl.replace(/\/+$/,'')+'/chat/completions';
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.apiKey},
      body:JSON.stringify({model:s.model,messages:[
        {role:'system',content:'从以下对话中提取待办事项。如果有明确的任务/要做的事，返回JSON数组：[{"text":"任务描述"}]。如果没有待办事项，返回空数组 []。只输出JSON，不要其他文字。'},
        {role:'user',content:'用户说：'+userMsg.slice(0,500)+'\nAI回复：'+aiReply.slice(0,500)+'\n\n请提取待办事项（JSON数组）：'}
      ],stream:false})});
    if(!res.ok)return;
    const data=await res.json();
    let text=(data.choices?.[0]?.message?.content||'').trim();
    const match=text.match(/\[[\s\S]*\]/);
    if(!match)return;
    const items=JSON.parse(match[0]);
    if(!Array.isArray(items)||items.length===0)return;
    const todos=DB.get('todoList',[]);
    items.forEach(item=>{
      if(item.text&&item.text.trim()){
        todos.unshift({id:'todo_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),text:item.text.trim(),done:false,from:'ai',time:Date.now()});
      }
    });
    DB.set('todoList',todos);
  }catch(e){console.log('[Little] Auto todo error:',e);}
}

// ==================== Calendar（日历） ====================
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth();
let calSelectedDate=null;

function openCalendarPage(){
  calYear=new Date().getFullYear();
  calMonth=new Date().getMonth();
  calSelectedDate=new Date().toISOString().slice(0,10);
  renderCalendar();
  renderPeriodInfo();
  renderDayEvents();
  document.getElementById('calendarPage').classList.add('open');
}

function calPrevMonth(){calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();renderDayEvents();}
function calNextMonth(){calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();renderDayEvents();}

function renderCalendar(){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('calNavTitle').textContent=calYear+' '+months[calMonth];

  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const prevDays=new Date(calYear,calMonth,0).getDate();
  const today=new Date();const todayStr=today.toISOString().slice(0,10);
  const events=DB.get('calendarEvents',[]);
  const periods=DB.get('periodRecords',[]);

  const periodDates=new Set();
  periods.forEach(p=>{
    const start=new Date(p.startDate+'T00:00:00');
    const end=p.endDate?new Date(p.endDate+'T00:00:00'):new Date(start);
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      periodDates.add(d.toISOString().slice(0,10));
    }
  });

  const eventDates={};
  events.forEach(ev=>{
    let dateStr=ev.date;
    if(ev.repeat==='yes'){
      const md=ev.date.slice(5);
      dateStr=calYear+'-'+md;
    }
    if(dateStr.startsWith(calYear+'-'+String(calMonth+1).padStart(2,'0'))){
      if(!eventDates[dateStr])eventDates[dateStr]=[];
      eventDates[dateStr].push(ev);
    }
  });

  let html='';
  for(let i=firstDay-1;i>=0;i--){
    html+='<div class="cal-cell other-month">'+(prevDays-i)+'</div>';
  }
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday=dateStr===todayStr;
    const isSelected=dateStr===calSelectedDate;
    const isPeriod=periodDates.has(dateStr);
    const hasEvent=eventDates[dateStr];
    let cls='cal-cell';
    if(isToday)cls+=' today';
    if(isSelected&&!isToday)cls+=' selected';
    if(isPeriod)cls+=' period-day';
    let dots='';
    if(hasEvent||isPeriod){
      dots='<div class="cal-cell-dots">';
      if(hasEvent)dots+='<div class="cal-dot event"></div>';
      if(isPeriod)dots+='<div class="cal-dot period"></div>';
      dots+='</div>';
    }
    html+='<div class="'+cls+'" onclick="selectCalDate(\''+dateStr+'\')">'+d+dots+'</div>';
  }
  const totalCells=firstDay+daysInMonth;
  const remaining=totalCells%7===0?0:7-totalCells%7;
  for(let i=1;i<=remaining;i++){
    html+='<div class="cal-cell other-month">'+i+'</div>';
  }
  document.getElementById('calGrid').innerHTML=html;
}

function selectCalDate(dateStr){
  calSelectedDate=dateStr;
  renderCalendar();
  renderDayEvents();
}

function renderDayEvents(){
  const container=document.getElementById('calDayEvents');
  const list=document.getElementById('calDayEventList');
  const title=document.getElementById('calDayTitle');
  if(!calSelectedDate){container.style.display='none';return;}
  container.style.display='';

  const d=new Date(calSelectedDate+'T00:00:00');
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  title.textContent=months[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();

  const events=DB.get('calendarEvents',[]);
  const periods=DB.get('periodRecords',[]);

  const dayEvents=[];
  events.forEach((ev,i)=>{
    let match=false;
    if(ev.repeat==='yes'){
      match=ev.date.slice(5)===calSelectedDate.slice(5);
    }else{
      match=ev.date===calSelectedDate;
    }
    if(match)dayEvents.push({...ev,_idx:i,_type:'event'});
  });

  periods.forEach((p,i)=>{
    const start=new Date(p.startDate+'T00:00:00');
    const end=p.endDate?new Date(p.endDate+'T00:00:00'):new Date(start);
    const sel=new Date(calSelectedDate+'T00:00:00');
    if(sel>=start&&sel<=end){
      dayEvents.push({title:'Period',type:'period',_idx:i,_type:'period'});
    }
  });

  if(dayEvents.length===0){
    list.innerHTML='<div class="cal-empty-day">No events on this day</div>';
  }else{
    list.innerHTML=dayEvents.map(ev=>{
      const dotCls='cal-event-dot '+(ev.type||'custom');
      const delBtn=ev._type==='event'
        ?'<button class="cal-event-del" onclick="deleteCalEvent('+ev._idx+')">✕</button>'
        :'<button class="cal-event-del" onclick="deletePeriod('+ev._idx+')">✕</button>';
      return '<div class="cal-event-item">'
        +'<div class="'+dotCls+'"></div>'
        +'<div style="flex:1"><div class="cal-event-text">'+escHtml(ev.title)+'</div>'
        +'<div class="cal-event-type">'+(ev.type||'custom')+(ev.repeat==='yes'?' · yearly':'')+'</div></div>'
        +delBtn+'</div>';
    }).join('');
  }
}

function openAddEvent(){
  if(!calSelectedDate){showToast('Select a date first');return;}
  document.getElementById('eventAddTitle').value='';
  document.getElementById('eventAddType').value='custom';
  document.getElementById('eventAddRepeat').value='yes';
  document.getElementById('eventAddModal').classList.add('open');
  setTimeout(()=>document.getElementById('eventAddTitle').focus(),100);
}

function closeEventAdd(){document.getElementById('eventAddModal').classList.remove('open');}

function saveEventAdd(){
  const title=document.getElementById('eventAddTitle').value.trim();
  if(!title){showToast('Please enter a title');return;}
  const type=document.getElementById('eventAddType').value;
  const repeat=document.getElementById('eventAddRepeat').value;
  const events=DB.get('calendarEvents',[]);
  events.push({id:'ev_'+Date.now(),date:calSelectedDate,title:title,type:type,repeat:repeat,time:Date.now()});
  DB.set('calendarEvents',events);
  closeEventAdd();
  renderCalendar();renderDayEvents();updateMemoryGrid();
  showToast('Event added');
}

function deleteCalEvent(idx){
  if(!confirm('Delete this event?'))return;
  const events=DB.get('calendarEvents',[]);
  if(idx>=0&&idx<events.length){events.splice(idx,1);DB.set('calendarEvents',events);renderCalendar();renderDayEvents();updateMemoryGrid();showToast('Deleted');}
}

// ==================== 月经记录 ====================
function togglePeriodRecord(){
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('periodStartDate').value=today;
  document.getElementById('periodEndDate').value='';
  document.getElementById('periodModal').classList.add('open');
}

function closePeriodModal(){document.getElementById('periodModal').classList.remove('open');}

function savePeriodRecord(){
  const start=document.getElementById('periodStartDate').value;
  if(!start){showToast('Please select start date');return;}
  const end=document.getElementById('periodEndDate').value||null;
  if(end&&end<start){showToast('End date must be after start');return;}
  const records=DB.get('periodRecords',[]);
  records.push({id:'period_'+Date.now(),startDate:start,endDate:end,time:Date.now()});
  records.sort((a,b)=>new Date(b.startDate)-new Date(a.startDate));
  DB.set('periodRecords',records);
  closePeriodModal();
  renderCalendar();renderPeriodInfo();renderDayEvents();
  showToast('Period recorded');
}

function renderPeriodInfo(){
  const el=document.getElementById('calPeriodInfo');
  const records=DB.get('periodRecords',[]);
  if(records.length===0){el.innerHTML='No records yet. Tap "Record" to start tracking.';return;}

  const sorted=[...records].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate));
  let info='';
  const last=sorted[0];
  const lastStart=new Date(last.startDate+'T00:00:00');
  const today=new Date();
  const daysSince=Math.floor((today-lastStart)/(86400000));
  info+='Last period: '+last.startDate+(last.endDate?' ~ '+last.endDate:'')+' ('+daysSince+' days ago)<br>';

  if(sorted.length>=2){
    let totalCycle=0;let count=0;
    for(let i=0;i<sorted.length-1;i++){
      const diff=Math.abs(new Date(sorted[i].startDate)-new Date(sorted[i+1].startDate))/(86400000);
      if(diff>15&&diff<60){totalCycle+=diff;count++;}
    }
    if(count>0){
      const avg=Math.round(totalCycle/count);
      info+='Average cycle: '+avg+' days<br>';
      const nextDate=new Date(lastStart);
      nextDate.setDate(nextDate.getDate()+avg);
      const nextStr=nextDate.toISOString().slice(0,10);
      const daysUntil=Math.floor((nextDate-today)/(86400000));
      info+='Next predicted: '+nextStr;
      if(daysUntil>=0)info+=' (in '+daysUntil+' days)';
      if(daysUntil===1)info+=' <span style="color:var(--accent);font-weight:600">— Tomorrow!</span>';
      if(daysUntil===0)info+=' <span style="color:var(--accent);font-weight:600">— Today!</span>';
    }
  }
  info+='<br><span style="font-size:11px">Total records: '+records.length+'</span>';
  info+='<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">';
  sorted.slice(0,5).forEach(r=>{
    const realIdx=records.indexOf(r);
    info+='<button class="cal-period-btn" style="font-size:10px;padding:3px 8px" onclick="deletePeriod('+realIdx+')">'+r.startDate+' ✕</button>';
  });
  info+='</div>';
  el.innerHTML=info;
}

function deletePeriod(idx){
  if(!confirm('Delete this period record?'))return;
  const records=DB.get('periodRecords',[]);
  if(idx>=0&&idx<records.length){records.splice(idx,1);DB.set('periodRecords',records);renderCalendar();renderPeriodInfo();renderDayEvents();showToast('Deleted');}
}

function getPeriodContext(){
  const records=DB.get('periodRecords',[]);
  if(records.length===0)return'';
  const sorted=[...records].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate));
  const last=sorted[0];
  const today=new Date();
  const lastStart=new Date(last.startDate+'T00:00:00');
  const daysSince=Math.floor((today-lastStart)/(86400000));
  let ctx='\n[月经周期信息] 上次经期开始：'+last.startDate+'（'+daysSince+'天前）';
  if(last.endDate)ctx+='，结束：'+last.endDate;
  if(sorted.length>=2){
    let totalCycle=0;let count=0;
    for(let i=0;i<sorted.length-1;i++){
      const diff=Math.abs(new Date(sorted[i].startDate)-new Date(sorted[i+1].startDate))/(86400000);
      if(diff>15&&diff<60){totalCycle+=diff;count++;}
    }
    if(count>0){
      const avg=Math.round(totalCycle/count);
      const nextDate=new Date(lastStart);
      nextDate.setDate(nextDate.getDate()+avg);
      const daysUntil=Math.floor((nextDate-today)/(86400000));
      ctx+='，平均周期'+avg+'天，预测下次'+nextDate.toISOString().slice(0,10);
      if(daysUntil<=1&&daysUntil>=0)ctx+='（就在明天或今天！请关心她）';
      else if(daysUntil<=3&&daysUntil>1)ctx+='（快到了，注意关心）';
    }
  }
  return ctx;
}

function checkPeriodReminder(){
  const records=DB.get('periodRecords',[]);
  if(records.length<2)return;
  const sorted=[...records].sort((a,b)=>new Date(b.startDate)-new Date(a.startDate));
  let totalCycle=0;let count=0;
  for(let i=0;i<sorted.length-1;i++){
    const diff=Math.abs(new Date(sorted[i].startDate)-new Date(sorted[i+1].startDate))/(86400000);
    if(diff>15&&diff<60){totalCycle+=diff;count++;}
  }
  if(count===0)return;
  const avg=Math.round(totalCycle/count);
  const lastStart=new Date(sorted[0].startDate+'T00:00:00');
  const nextDate=new Date(lastStart);
  nextDate.setDate(nextDate.getDate()+avg);
  const today=new Date();
  const daysUntil=Math.floor((nextDate-today)/(86400000));
  const lastReminder=DB.get('periodLastReminder','');
  const todayStr=today.toISOString().slice(0,10);
  if(lastReminder===todayStr)return;
  if(daysUntil===1){
    DB.set('periodLastReminder',todayStr);
    setTimeout(()=>showToast('Period reminder: predicted to start tomorrow'),2000);
  }else if(daysUntil===0){
    DB.set('periodLastReminder',todayStr);
    setTimeout(()=>showToast('Period reminder: predicted to start today'),2000);
  }
}
