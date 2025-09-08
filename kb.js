import{connect as C}from'cloudflare:sockets';
const S='222222',U='5aba5b77-48eb-4ae2-b60d-5bfee7ac169e',R='sjc.o00o.ooo',N='CFKB',
B=[90,186,91,119,72,235,74,226,182,13,91,254,231,172,22,158],K=new Uint8Array(2),
P=['104.16.160.145'],H=new Headers({'cache-control':'public,max-age=14400','content-type':'text/plain'}),
d=new TextDecoder(),M=new Map();
const B32=new Uint32Array(4);for(let i=0;i<4;i++)B32[i]=B[i*4]|(B[i*4+1]<<8)|(B[i*4+2]<<16)|(B[i*4+3]<<24);

const b64norm=s=>{let t=s.replace(/-/g,'+').replace(/_/g,'/'); while(t.length%4)t+='='; return t;};
const decodeFull=s=>{const b=atob(b64norm(s)),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;};
const decodePrefix=(s,bytes)=>{const chars=Math.max(4,Math.ceil(bytes/3)*4);const sub=b64norm(s).slice(0,chars);const b=atob(sub),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;};

const checkSig=a=>{if(a.length<18) return false; const dv=new DataView(a.buffer,a.byteOffset+1,16); for(let i=0;i<4;i++) if((dv.getUint32(i*4,true)^B32[i])!==0) return false; return true;};
const ipv4=(buf,off)=>`${buf[off]}.${buf[off+1]}.${buf[off+2]}.${buf[off+3]}`;
const ipv6=(buf,off)=>{let s='';for(let i=0;i<16;i+=2){s+=((buf[off+i]<<8)|buf[off+i+1]).toString(16); if(i<14) s+=':';}return s;};

const tryConn=async(opts,ms=3000)=>{try{const s=C(opts); return await Promise.race([s.opened.then(()=>s),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);}catch(e){throw e;}};

export default{
 async fetch(r){
  const url=r.url,sl=url.indexOf('//')+2,hEnd=url.indexOf('/',sl),host=hEnd===-1?url.slice(sl):url.slice(sl,hEnd),path=hEnd===-1?'/':url.slice(hEnd);
  if(r.headers.get('Upgrade')!=='websocket'){
   if(path===`/${S}`) return new Response(`订阅地址: https://${host}/${S}/vless`,{headers:H});
   if(path===`/${S}/vless`){
    if(M.has(host)) return new Response(M.get(host),{headers:H});
    const q=`host=${host}&sni=${host}&path=%2F%3Fed%3D2560#${N}`,f=i=>`vless://${U}@${i}:443?encryption=none&security=tls&type=ws&${q}`;
    const c = P.map(f).join('\n') + '\n' + f(host);
    if(M.size>30) M.delete(M.keys().next().value);
    M.set(host,c);
    return new Response(c,{headers:H});
   }
   return new Response(null,{status:404});
  }

  const pr=r.headers.get('sec-websocket-protocol'); if(!pr) return new Response(null,{status:400});
  const p1=decodePrefix(pr,18); if(!checkSig(p1)) return new Response(null,{status:403});
  const a=decodeFull(pr);
  if(a.length<19) return new Response(null,{status:400});
  const o=19+a[17],port=(a[o]<<8)|a[o+1],t=a[o+2]; let addr,e=o+3;
  if(t==1){ addr=ipv4(a,e); e+=4; }
  else if(t==3){ addr=ipv6(a,e); e+=16; }
  else { const L=a[e]; addr=d.decode(a.subarray(e+1,e+1+L)); e+=1+L; }

  let s;
  try{s=await tryConn({hostname:addr,port,secureTransport:'off'});}catch{try{s=await tryConn({hostname:R,port:443,secureTransport:'off'});}catch{return new Response(null,{status:502});}}
  await s.opened.catch(()=>0);

  const [c,sv]=new WebSocketPair(); sv.accept();
  const wr=s.writable.getWriter(); let ok=1,writing=0,q=[],qh=0;
  const push=v=>{ if(q.length-qh<100) q.push(v); };
  const writeNext=async()=>{
    if(writing||qh>=q.length||!ok) return;
    writing=1;
    try{ for(;qh<q.length&&ok;qh++) await wr.write(q[qh]);
      if(qh>256){ q.splice(0,qh); qh=0; }
    }catch{ ok=0 }
    writing=0;
  };
  const cleanup=()=>ok&&(ok=0,wr.close().catch(()=>0),s.close().catch(()=>0),sv.close());
  sv.onmessage=m=>{ if(wr.desiredSize>0) wr.write(m.data).catch(()=>push(m.data)); else push(m.data); writeNext(); };
  sv.onclose=sv.onerror=cleanup;
  sv.send(K);
  if(a.length>e){ push(a.subarray(e)); writeNext(); }

  (async()=>{
    try{
      const rdr=s.readable.getReader();
      while(ok){
        const {value:v,done:d}=await rdr.read();
        if(d) break;
        while(sv.bufferedAmount>32768&&ok) await new Promise(r=>setTimeout(r,10));
        ok&&sv.send(v);
      }
    }catch{} finally{ cleanup(); }
  })();

  return new Response(null,{status:101,webSocket:c});
 }
}