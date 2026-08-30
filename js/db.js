// ==================== Little db.js — 数据库层 v2.0 ====================
// Marked 初始化 + localStorage 工具 + IndexedDB Stores + Jina 向量化

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
  async remove(id){
    const db=await this.open();
    return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).delete(id);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});
  }
}
const avatarStore=new AvatarStore();

// ==================== 向量存储（IndexedDB）v2.0 增强 ====================
class VectorStore{
  constructor(){this.dbName='LittleMemoryDB';this.storeName='memories';this.db=null;}
  async open(){if(this.db)return this.db;return new Promise((resolve,reject)=>{const req=indexedDB.open(this.dbName,2);
    req.onupgradeneeded=(e)=>{const db=e.target.result;
      if(!db.objectStoreNames.contains(this.storeName)){
        const store=db.createObjectStore(this.storeName,{keyPath:'id'});
        store.createIndex('category','category',{unique:false});
        store.createIndex('time','time',{unique:false});
        store.createIndex('core','core',{unique:false});
      } else {
        // v2 升级：如果 store 已存在但没有 core 索引，添加它
        const tx=e.target.transaction;
        const store=tx.objectStore(this.storeName);
        if(!store.indexNames.contains('core')){
          store.createIndex('core','core',{unique:false});
        }
      }
    };
    req.onsuccess=(e)=>{this.db=e.target.result;resolve(this.db);};req.onerror=(e)=>reject(e);});}

  async add(m){
    // v2.0: 确保新字段有默认值
    if(m.core===undefined) m.core=false;
    if(m.weight===undefined) m.weight=1.0;
    if(m.lastRecalled===undefined) m.lastRecalled=m.time||Date.now();
    if(m.tags===undefined) m.tags=[];
    if(m.relatedTo===undefined) m.relatedTo=[];
    const db=await this.open();
    return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).put(m);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});
  }

  async getAll(){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readonly');const req=tx.objectStore(this.storeName).getAll();req.onsuccess=()=>r(req.result);req.onerror=(e)=>j(e);});}

  async remove(id){const db=await this.open();return new Promise((r,j)=>{const tx=db.transaction(this.storeName,'readwrite');tx.objectStore(this.storeName).delete(id);tx.oncomplete=()=>r();tx.onerror=(e)=>j(e);});}

  // 获取所有核心记忆
  async getCoreMemories(){
    const all=await this.getAll();
    return all.filter(m=>m.core===true);
  }

  // 切换核心记忆状态
  async toggleCore(id){
    const all=await this.getAll();
    const mem=all.find(m=>m.id===id);
    if(!mem) return false;
    const coreCount=all.filter(m=>m.core===true).length;
    if(!mem.core && coreCount>=30){return 'limit';} // 上限30条
    mem.core=!mem.core;
    await this.add(mem);
    return mem.core;
  }

  // 更新记忆被召回时的权重
  async markRecalled(id){
    const all=await this.getAll();
    const mem=all.find(m=>m.id===id);
    if(mem){
      mem.weight=1.0;
      mem.lastRecalled=Date.now();
      await this.add(mem);
    }
  }

  // 权重衰减（每7天调用一次）
  async decayWeights(){
    const all=await this.getAll();
    const now=Date.now();
    const WEEK=7*24*60*60*1000;
    let updated=0;
    for(const m of all){
      if(m.core) continue; // 核心记忆不衰减
      if(!m.lastRecalled) m.lastRecalled=m.time||now;
      const elapsed=now-m.lastRecalled;
      const weeks=Math.floor(elapsed/WEEK);
      if(weeks>0){
        const newWeight=Math.max(0.1, (m.weight||1.0)*Math.pow(0.95, weeks));
        if(Math.abs(newWeight-(m.weight||1.0))>0.01){
          m.weight=newWeight;
          m.lastRecalled=now; // 重置衰减计时器
          await this.add(m);
          updated++;
        }
      }
    }
    return updated;
  }

  // 余弦相似度
  cosineSim(a,b){if(!a||!b||a.length!==b.length)return 0;let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return dot/(Math.sqrt(na)*Math.sqrt(nb)||1);}

  // 向量搜索（v2.0: 加入权重排序）
  async search(qv,topK=8){
    const all=await this.getAll();
    if(!qv||all.length===0)return all.slice(0,topK);
    return all.filter(m=>m.vector&&m.vector.length>0)
      .map(m=>({...m,score:this.cosineSim(qv,m.vector)*(m.weight||1.0)}))
      .sort((a,b)=>b.score-a.score).slice(0,topK);
  }

  // 关键词搜索（v2.0: 增强版，不依赖 Jina）
  async searchByKeyword(q,topK=8){
    const all=await this.getAll();
    // 分词：按空格、标点分割，过滤太短的
    const kws=q.toLowerCase().replace(/[，。！？、；：""''（）【】《》\s]+/g,' ').split(/\s+/).filter(k=>k.length>=2);
    if(kws.length===0) return all.sort((a,b)=>b.time-a.time).slice(0,topK);
    return all.map(m=>{
      const t=(m.text||'').toLowerCase();
      let s=0;
      kws.forEach(k=>{
        if(t.includes(k)) s+=1;
        // 部分匹配加分
        if(k.length>=3){
          const chars=[...k];
          const matched=chars.filter(c=>t.includes(c)).length;
          s+=matched/chars.length*0.3;
        }
      });
      // 时间新鲜度加分
      s+=Math.max(0,1-(Date.now()-m.time)/(1e3*60*60*24*180))*0.2;
      // 权重加成
      s*=(m.weight||1.0);
      return{...m,score:s};
    }).filter(m=>m.score>0.3).sort((a,b)=>b.score-a.score).slice(0,topK);
  }

  // 查找相似记忆（用于合并建议）
  async findSimilar(text,threshold=0.85){
    const all=await this.getAll();
    // 简单的文本相似度（Jaccard）
    const words1=new Set(text.toLowerCase().split(/\s+/));
    return all.filter(m=>{
      const words2=new Set((m.text||'').toLowerCase().split(/\s+/));
      const intersection=new Set([...words1].filter(x=>words2.has(x)));
      const union=new Set([...words1,...words2]);
      const sim=intersection.size/union.size;
      return sim>=threshold;
    });
  }
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
