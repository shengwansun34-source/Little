// ==================== Little home.js — Home页面 v2.0 ====================

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
  const togetherNames=document.getElementById('togetherNames');const togetherDays=document.getElementById('togetherDays');
  if(togetherNames)togetherNames.textContent=userName+' & '+aiName;
  if(togetherDays)togetherDays.textContent=ann?Math.max(0,diff):0;
  const togetherQuote=document.getElementById('togetherQuote');const quote=DB.get('dailyQuote',null);if(togetherQuote&&quote&&quote.text)togetherQuote.textContent=quote.text;
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
    // v2.0: 注入 Profile 到每日一句
    const profileCtx=getProfileContext();
    if(profileCtx) memCtx+=profileCtx;
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
