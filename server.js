// Visent AI Coverage Assistant + AI Underwriter — zero-dependency Node 18+ server. API key stays server-side.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
try{fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2]})}catch{}
const E=process.env,PORT=+E.PORT||3000,KEY=E.GROQ_API_KEY,MODEL=E.GROQ_MODEL||'llama-3.3-70b-versatile';
const salt=crypto.randomBytes(16),H=p=>crypto.scryptSync(p,salt,32),UH=H(E.APP_USER||'siddhesh'),PH=H(E.APP_PASS||'Sidd@0395');
// ---------- Knowledge base: claims CSV ----------
function csv(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){r.push(f);f=''}else if(c=='\n'||c=='\r'){if(c=='\r'&&t[i+1]=='\n')i++;r.push(f);f='';if(r.length>1)rows.push(r);r=[]}else f+=c}if(f||r.length){r.push(f);rows.push(r)}const h=rows.shift();return rows.map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]])))}
let CLAIMS=[];try{CLAIMS=csv(fs.readFileSync(path.join(__dirname,'data/claims.csv'),'utf8'))}catch(e){console.error('Claims CSV failed:',e.message)}
// ---------- Knowledge base: policy chunks (section + page preserved) ----------
const POL=[
['S1','§1 About This Policy',1,'Summarizes selected benefits for three fictional plans: Gold, Silver, Bronze. Coverage is subject to eligibility, network status, medical necessity, plan limits, exclusions and prior authorization. A signed plan contract governs over this summary.'],
['S2','§2 Plan Overview',1,'Deductible (individual) Gold $500 / Silver $1,500 / Bronze $3,000. Out-of-pocket max Gold $3,500 / Silver $5,500 / Bronze $7,500. In-network coinsurance after deductible 10% / 20% / 30%. Primary care copay $20 / $30 / $45. Specialist copay $35 / $50 / $70. ER copay $150 / $250 / $350, waived if admitted. Preventive care covered at 100% on all plans.'],
['S3a','§3 Screening colonoscopy',1,'Covered as preventive care at 100% when age/risk and coding criteria are met. Diagnostic or surveillance colonoscopy follows applicable cost sharing. Prior auth: may be required for diagnostic/surveillance procedures; generally not required for routine in-network preventive screening.'],
['S3b','§3 Diagnostic colonoscopy',1,'Covered when medically necessary. Member cost share applies based on plan and deductible status. Prior authorization: Required.'],
['S3c','§3 Lumbar spine MRI',1,'Covered when medically necessary and ordered by an eligible treating provider. Member cost share applies. Prior authorization: Required.'],
['S3d','§3 Inpatient accident hospitalization',1,'Covered when medically necessary and admitted to an in-network facility; deductible and coinsurance apply. Emergency stabilization is subject to applicable rules. Prior auth required for planned/non-emergency admission; for emergencies, notify the plan as soon as reasonably possible.'],
['S3e','§3 Primary care and specialist visits',1,'Covered subject to the copays in the plan overview for in-network providers. No prior authorization for standard office visits.'],
['S3f','§3 Emergency services',1,'Covered for emergency medical conditions. Applicable emergency protections may affect member liability. No prior authorization for emergency stabilization.'],
['S3g','§3 Preventive services',1,'Covered at 100% in-network when billed and classified as eligible preventive care. No prior authorization for eligible preventive services.'],
['S4','§4 How Member Cost Share Works',1,'Copay = fixed amount per covered service. Deductible = amount paid before the plan pays deductible-subject benefits. Coinsurance = member % of allowed amount after deductible. Eligible cost sharing accumulates toward the out-of-pocket maximum; premiums and non-covered services do not.'],
['S5','§5 Coverage Conditions',2,'Member must be enrolled and eligible on date of service; service must be a covered benefit and meet medical necessity where applicable; network status affects coverage and cost share; required prior authorization must be obtained except where emergency rules apply; claims are adjudicated on procedure codes, diagnosis codes, provider, dates and plan rules. The summary does not define every coding scenario.'],
['S6','§6 Exclusions and Limitations',2,'May be excluded or limited: cosmetic procedures not medically necessary, experimental/investigational services, non-emergency services from non-network providers when no exception applies, services exceeding benefit limits. Not exhaustive.'],
['S7','§7 Examples (Illustrative)',2,'In-network diagnostic lumbar MRI after deductible met: member pays 10% Gold / 20% Silver / 30% Bronze of allowed amount. Specialist visit $35 / $50 / $70. Eligible in-network preventive screening colonoscopy 100% covered.'],
['S8','§8 Claims History Is Not a Coverage Guarantee',2,'Past claim outcomes are historical records, not a promise of future approval. Outcomes differ due to diagnosis, coding, records, network, prior authorization, eligibility and plan-year rules. Present historical patterns separately from policy rules; never treat a prior approval as a guarantee.'],
['S9','§9 Member Support',2,'For a real coverage determination contact the insurer using the member ID card and obtain required written authorization. Visent is fictional; no contact details provided.']];
const PLANS={Gold:{ded:500,oop:3500,co:10,pcp:20,sp:35,er:150},Silver:{ded:1500,oop:5500,co:20,pcp:30,sp:50,er:250},Bronze:{ded:3000,oop:7500,co:30,pcp:45,sp:70,er:350}};
const PROC={COLONOSCOPY_SCREEN:['Screening colonoscopy',['S3a','S3g']],COLONOSCOPY_DIAG:['Diagnostic colonoscopy',['S3b']],MRI_LUMBAR:['Lumbar spine MRI',['S3c']],ACCIDENT_INPATIENT:['Accident inpatient hospitalization',['S3d']],ER_VISIT:['Emergency room visit',['S3f']],SPECIALIST_VISIT:['Specialist visit',['S3e']],PCP_VISIT:['Primary care visit',['S3e']],PREVENTIVE_SCREEN:['Other preventive screening',['S3g']]};
function procs(t){const o=[];const add=c=>o.includes(c)||o.push(c);
 if(/colonoscop/i.test(t)){const s=/screen|preventive|routine/i.test(t),d=/diagnos|surveil/i.test(t);if(s||!d)add('COLONOSCOPY_SCREEN');if(d||!s)add('COLONOSCOPY_DIAG')}
 else if(/preventive|screening/i.test(t))add('PREVENTIVE_SCREEN');
 if(/\bmri\b|lumbar|spine/i.test(t))add('MRI_LUMBAR');if(/accident|inpatient|hospitali[sz]/i.test(t))add('ACCIDENT_INPATIENT');
 if(/\ber\b|emergency/i.test(t))add('ER_VISIT');if(/specialist/i.test(t))add('SPECIALIST_VISIT');if(/primary care|\bpcp\b/i.test(t))add('PCP_VISIT');return o}
const plan=t=>(t.match(/\b(gold|silver|bronze)\b/i)||[])[1]?.replace(/^./,c=>c.toUpperCase());
function cost(p,c){const P=PLANS[p];if(!P)return null;const d=`$${P.ded} deductible, then ${P.co}% coinsurance of the allowed amount (in-network), out-of-pocket max $${P.oop}`;
 return({COLONOSCOPY_SCREEN:`100% covered if preventive criteria met; if billed diagnostic/surveillance: ${d}`,COLONOSCOPY_DIAG:d,MRI_LUMBAR:d,ACCIDENT_INPATIENT:d,ER_VISIT:`$${P.er} copay (waived if admitted)`,SPECIALIST_VISIT:`$${P.sp} copay`,PCP_VISIT:`$${P.pcp} copay`,PREVENTIVE_SCREEN:'100% covered when eligible preventive'})[c]}
function retrieve(q,pc){const ids=new Set();pc.forEach(c=>PROC[c][1].forEach(i=>ids.add(i)));
 if(/copay|deductible|coinsurance|cost|pay|oop|out-of-pocket/i.test(q)){ids.add('S2');ids.add('S4')}
 if(/author|pre-?auth|\bpa\b/i.test(q)){ids.add('S5');if(!pc.length)['S3b','S3c','S3d'].forEach(i=>ids.add(i))}
 if(/exclu|limit|network/i.test(q))ids.add('S6');if(/guarant|histor|approv|denied|similar/i.test(q))ids.add('S8');
 if(!ids.size){const w=q.toLowerCase().match(/[a-z]{4,}/g)||[];POL.map(c=>[c,w.filter(x=>c[3].toLowerCase().includes(x)).length]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]).slice(0,2).forEach(x=>ids.add(x[0][0]))}
 return POL.filter(c=>ids.has(c[0])).slice(0,7)}
function stats(p,pc){let r=CLAIMS.filter(x=>(!p||x.plan==p)&&pc.includes(x.procedure_code));if(!r.length)return null;const cnt=(f)=>r.reduce((a,x)=>(a[x[f]]=(a[x[f]]||0)+1,a),{});const d=r.map(x=>x.date_of_service).sort();
 const bad=r.filter(x=>x.claim_status!='Approved');const rs=bad.reduce((a,x)=>(a[x.decision_reason]=(a[x.decision_reason]||0)+1,a),{});
 return{n:r.length,plan:p||'All plans',procs:pc.map(c=>PROC[c][0]),from:d[0],to:d[d.length-1],status:cnt('claim_status'),network:cnt('provider_network'),reasons:Object.entries(rs).sort((a,b)=>b[1]-a[1]).slice(0,3),small:r.length<10}}
// ---------- LLM (Groq, OpenAI-compatible) ----------
async function llm(messages,{stream,onTok,max=700}={}){if(!KEY)throw new Error('No API key');
 const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+KEY},body:JSON.stringify({model:MODEL,messages,temperature:.1,max_tokens:max,stream:!!stream}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error('LLM HTTP '+r.status);if(!stream)return(await r.json()).choices[0].message.content;
 const dec=new TextDecoder();let buf='',full='';for await(const c of r.body){buf+=dec.decode(c,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);if(l.startsWith('data:')&&!l.includes('[DONE]'))try{const t=JSON.parse(l.slice(5)).choices[0].delta.content;if(t){full+=t;onTok(t)}}catch{}}}return full}
const SYS=`You are the Visent AI Coverage Assistant for claim-support agents (fictional prototype, synthetic data). Answer ONLY from the EVIDENCE given. Use exactly these short markdown headings when relevant: "## Policy", "## Cost Share", "## Historical Claims", "## Important Note". Cite every policy statement inline like [§3, p.1]. Keep policy statements and historical statistics strictly separate. For history give sample size, date range, counts per outcome and the matching criteria; do not show percentages if the sample is flagged small. If evidence is missing, say you cannot confirm it from the supplied policy; never invent rules. Never say a past approval guarantees future approval. Never mention member or claim IDs. Be concise (under 220 words), plain language, no medical advice.`;
function fallback(ev){let s='';if(ev.pol.length)s+='## Policy\n'+ev.pol.map(c=>`- ${c[3]} [${c[1].split(' ')[0]}, p.${c[2]}]`).join('\n')+'\n\n';
 if(ev.cost.length)s+=`## Cost Share (${ev.plan})\n`+ev.cost.map(x=>'- '+x).join('\n')+'\n\n';
 if(ev.st)s+=`## Historical Claims\n- ${ev.st.n} synthetic ${ev.st.plan} claims (${ev.st.procs.join(', ')}), ${ev.st.from} to ${ev.st.to}: `+Object.entries(ev.st.status).map(([k,v])=>`${k} ${v}`).join(', ')+'\n\n';
 return s+'## Important Note\nHistorical outcomes are examples only and do not guarantee approval of a future claim. (AI model unavailable — showing retrieved evidence only.)'}
// ---------- AI Underwriter ----------
const Q={age:'What is the client\'s age?',firstSurgery:'Is this the client\'s first surgery/major procedure in the current calendar year?',priorSurg:'Has the client had any previous surgeries or major medical procedures?',alcohol:'How would you describe the client\'s alcohol consumption (none / moderate / heavy)?',smoking:'Does the client smoke or use tobacco products?',family:'Is there relevant family history of medical conditions?',conditions:'Does the client have any existing or previously diagnosed medical conditions?',priorClaims:'Are there previous claims or hospitalizations relevant to this claim?'};
function underwrite(c,a){const f=[],miss=Object.keys(Q).filter(k=>a[k]===undefined||a[k]===''),age=a.age===''||a.age==null?null:+a.age,esc=[];
 if(a.smoking=='yes')esc.push('Client smokes / uses tobacco');if(a.alcohol=='heavy')esc.push('Heavy alcohol consumption reported');if(a.conditions=='yes')esc.push('Existing or previously diagnosed medical condition(s)');
 if(a.priorSurg=='yes')esc.push('Previous surgeries / major procedures');if(a.firstSurgery=='no')esc.push('Not the first surgery in the current calendar year');if(a.family=='yes')esc.push('Relevant family medical history');if(a.priorClaims=='yes')esc.push('Relevant previous claims / hospitalizations');
 let L,rule;
 if(age==null||isNaN(age)){L='PENDING';rule='Age is required before a classification can be made. Missing information is not treated as a risk factor.'}
 else if(age>=75){L='RED';rule='Rule A: age 75 or above → Red.';f.push(`Age ${age} is in the 75+ band`)}
 else if(age>60){L='AMBER';rule='Rule B: age 61–74 → Amber.';f.push(`Age ${age} is in the 61–74 band`)}
 else if(age>=10){rule='Rule C: age 10–60 → Green, unless scenario conditions apply.';if(esc.length){L='AMBER';rule+=' Scenario condition(s) found → Amber.'}else L='GREEN'}
 else{L='AMBER';rule='Rule D (assumption): age under 10 is not covered by the supplied rules → Amber for human review.';f.push(`Age ${age} is below the defined 10–60 band`)}
 if(L!='GREEN'&&L!='PENDING'||esc.length)esc.forEach(e=>f.push(e));
 const proc=PROC[c.procedure]?.[0]||'the claim';const qs=miss.sort((x,y)=>(x=='age'?-1:0)-(y=='age'?-1:0)).map(k=>({key:k,q:Q[k]+(k=='priorClaims'||k=='firstSurgery'?` (re: ${proc})`:'')}));
 const nx={PENDING:['Ask the client the suggested questions, starting with age.','Enter the answers to update the classification.'],RED:['Do NOT proceed to automatic approval.','Refer to a human underwriter for further investigation.'],AMBER:['Refer to a human underwriter for additional evaluation.','Collect any missing information before proceeding.'],GREEN:['May proceed to the next approval stage, subject to normal verification.','Green is not a guarantee of claim approval.']}[L].slice();
 if(L=='GREEN'&&miss.length)nx.unshift('Provisional: some answers are still missing — collect them to confirm Green.');
 return{level:L,provisional:L=='GREEN'&&miss.length>0,rule,factors:f,missing:miss.map(k=>Q[k].replace(/\?$/,'')),questions:qs,next:nx,humanReview:L=='RED'||L=='AMBER'}}
// ---------- HTTP ----------
const sess=new Map(),tries=new Map(),ttfts=[],log=o=>fs.appendFile(path.join(__dirname,'data/log.jsonl'),JSON.stringify({ts:new Date().toISOString(),...o})+'\n',()=>{});
const pct=(a,p)=>a.length?[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
const body=req=>new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e5){no();req.destroy()}});req.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch{ok({})}})});
const json=(res,c,o,h={})=>{res.writeHead(c,{'Content-Type':'application/json',...h});res.end(JSON.stringify(o))};
const eq=(a,b)=>crypto.timingSafeEqual(a,b);
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{const u=req.url.split('?')[0],sid=(req.headers.cookie||'').match(/sid=([a-f0-9]+)/)?.[1],ok=sess.has(sid);
 if(u=='/api/login'&&req.method=='POST'){const ip=req.socket.remoteAddress,t=(tries.get(ip)||[]).filter(x=>Date.now()-x<6e4);if(t.length>=5)return json(res,429,{error:'Too many attempts. Wait a minute.'});
  const b=await body(req);if(eq(H(String(b.id||'')),UH)&eq(H(String(b.password||'')),PH)){const s=crypto.randomBytes(24).toString('hex');sess.set(s,b.id);return json(res,200,{ok:true,user:b.id},{'Set-Cookie':`sid=${s}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`})}
  t.push(Date.now());tries.set(ip,t);return json(res,401,{error:'Invalid login ID or password.'})}
 if(u=='/api/me')return json(res,200,{auth:ok,user:sess.get(sid),llm:!!KEY,claims:CLAIMS.length,chunks:POL.length});
 if(u=='/api/logout'){sess.delete(sid);return json(res,200,{ok:1},{'Set-Cookie':'sid=; Max-Age=0; Path=/'})}
 if(u.startsWith('/api/')){if(!ok)return json(res,401,{error:'Not authenticated'});
  if(u=='/api/metrics')return json(res,200,{n:ttfts.length,ttft_p50_ms:pct(ttfts,.5),ttft_p95_ms:pct(ttfts,.95)});
  if(u=='/api/feedback'){const b=await body(req);log({feedback:b.rating,id:b.id});return json(res,200,{ok:1})}
  if(u=='/api/underwrite'){const b=await body(req);if(!b.consent)return json(res,400,{error:'Client consent is required before health information is processed.'});
   const r=underwrite(b.claim||{},b.answers||{});if(b.explain&&r.level!='PENDING')try{r.summary=await llm([{role:'system',content:'You support (never replace) a human underwriter. In 2 sentences, explain this risk classification for a claim agent using ONLY the given rule and factors. Do not approve or reject the claim. Fictional prototype.'},{role:'user',content:JSON.stringify({level:r.level,rule:r.rule,factors:r.factors,missing:r.missing})}],{max:150})}catch{}
   return json(res,200,r)}
  if(u=='/api/chat'){const b=await body(req),msgs=(b.messages||[]).slice(-10),q=String(msgs.at(-1)?.content||'').slice(0,800);const t0=Date.now();
   const users=msgs.filter(m=>m.role=='user').map(m=>m.content).reverse();let pc=procs(q);if(!pc.length)for(const m of users){pc=procs(m);if(pc.length)break}
   let p=plan(q);if(!p)p=b.plan&&PLANS[b.plan]?b.plan:null;if(!p)for(const m of users){p=plan(m);if(p)break}
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});const ev=(e,d)=>res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);const id=crypto.randomBytes(4).toString('hex');
   const hist=/how many|how often|approv|denied|histor|similar|claims|percent|rate/i.test(q),costQ=/copay|deductible|coinsurance|cost|pay|owe/i.test(q);
   if(!p&&(hist||costQ)&&!/all plans/i.test(q)){ev('meta',{id,plan:null,procs:pc,sources:[]});const m='Which plan does the member have — **Gold**, **Silver** or **Bronze**? (Plan-specific cost share and claim history depend on it.)';ev('tok',{t:m});ev('done',{ms:Date.now()-t0,clarify:1});return res.end()}
   const pol=retrieve(q,pc),cs=p?pc.map(c=>cost(p,c)&&`${PROC[c][0]}: ${cost(p,c)}`).filter(Boolean):[],st=(hist||(pc.length&&!costQ))&&pc.length?stats(p,pc):null;
   const evd={pol,cost:cs,st,plan:p};ev('meta',{id,plan:p,procs:pc,sources:pol.map(c=>({id:c[0],sec:c[1],page:c[2],text:c[3]})),stats:st});
   const E_=`PLAN: ${p||'not specified'}\nPOLICY EVIDENCE:\n${pol.map(c=>`[${c[1].split(' ')[0]}, p.${c[2]}] ${c[1]}: ${c[3]}`).join('\n')||'(none retrieved)'}\nCOST SHARE (${p||'n/a'}):\n${cs.join('\n')||'(n/a)'}\nHISTORICAL CLAIMS (synthetic CSV aggregate):\n${st?JSON.stringify(st):'(none matched or not requested)'}`;
   let first=0,fb=0,out='';try{out=await llm([{role:'system',content:SYS},...msgs.slice(0,-1).map(m=>({role:m.role,content:String(m.content).slice(0,1500)})),{role:'user',content:`${q}\n\n${E_}`}],{stream:1,onTok:t=>{if(!first){first=Date.now()-t0;ttfts.push(first)}ev('tok',{t})}})}
   catch(e){fb=1;out=fallback(evd);ev('tok',{t:out});first=first||Date.now()-t0}
   if(st&&!/guarantee/i.test(out))ev('tok',{t:'\n\n*Note: historical outcomes do not guarantee approval of a future claim.*'});
   ev('done',{ms:Date.now()-t0,ttft:first,fallback:fb});log({id,q:q.slice(0,200),plan:p,sources:pol.map(c=>c[0]),ms:Date.now()-t0,ttft:first,fb});return res.end()}
  return json(res,404,{error:'Not found'})}
 let f=u=='/'?'index.html':u.slice(1);f=path.join(__dirname,'public',path.normalize(f).replace(/^(\.\.[\/\\])+/,''));
 fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d)})
}catch(e){try{json(res,500,{error:'Server error'})}catch{}}}).listen(PORT,()=>console.log(`Visent app: http://localhost:${PORT}  | claims:${CLAIMS.length} policy chunks:${POL.length} LLM:${KEY?MODEL:'OFF'}`));
