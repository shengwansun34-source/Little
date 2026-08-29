// ==================== Little db.js — 数据库层 ====================
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
