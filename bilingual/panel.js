const out=document.querySelector('#out'), status=document.querySelector('#status'), language=document.querySelector('#lang');let tabId=null,port=null,session=0,items=new Map(),activeLang='',expectedScroll=null,frame=false,poll=null,calTimer=null,busy=false,working=false,pageUrl='',sameMode=false;
const send=m=>chrome.tabs.sendMessage(tabId,m);
function syncScroll(delta){const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);const target=Math.max(0,Math.min(max,scrollY+delta));if(Math.abs(target-scrollY)<1)return;expectedScroll={target,until:performance.now()+500};scrollTo({top:target,behavior:'instant'})}
function isSyncedScroll(){if(!expectedScroll)return false;const expected=expectedScroll;expectedScroll=null;return performance.now()<expected.until&&Math.abs(scrollY-expected.target)<2}

const fallbackAccent=[211,92,73];
const panelBackground=[251,250,248];
const highlightText=[29,32,41];
function highlightColors(rgb){
 const valid=Array.isArray(rgb)&&rgb.length===3&&rgb.every(n=>Number.isFinite(n)&&n>=0&&n<=255)
   &&Math.max(...rgb)-Math.min(...rgb)>=30;
 const accent=valid?rgb.map(Math.round):fallbackAccent;
 const luminance=color=>color.reduce((total,channel,i)=>{
   const value=channel/255;
   return total+[.2126,.7152,.0722][i]*(value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 },0);
 const minimum=(luminance(highlightText)+.05)*7-.05;
 // Resolve the translucent tint against the reading pane before testing contrast.
 for(const opacity of [.32,.24,.16]){
   const background=panelBackground.map((channel,i)=>Math.round(channel*(1-opacity)+accent[i]*opacity));
   if(luminance(background)>=minimum)return {background,accent};
 }
 return {background:[241,212,206],accent:fallbackAccent};
}
function applyPageAccent(rgb){
 const {background,accent}=highlightColors(rgb);
 document.documentElement.style.setProperty('--selection-bg',`rgb(${background.join(' ')})`);
 document.documentElement.style.setProperty('--selection-fg',`rgb(${highlightText.join(' ')})`);
 document.documentElement.style.setProperty('--selection-line',`rgb(${accent.join(' ')})`);
}
function report(){let all=[...items.values()].filter(x=>x.state!=='skip'),ok=all.filter(x=>x.state==='done').length,fail=all.filter(x=>x.state==='failed').length;status.replaceChildren(document.createTextNode(`已识别 ${all.length} 段 · 已翻译 ${ok} 段${fail?' · 失败 '+fail+' 段':''}`));if(fail){let b=document.createElement('button');b.textContent='重试';b.onclick=()=>{for(let x of items.values())if(x.state==='failed')x.state='pending';translate(session)};status.append(' ',b)}}
function block(x){let w=document.createElement('div');w.className='block';w.dataset.id=x.id;let e;if(x.tag==='IMG'){e=document.createElement('div');e.className='placeholder';e.textContent='✦  原文图片';e.style.aspectRatio=(x.width||2)+' / '+(x.height||1)}else{e=document.createElement(({H1:'h1',H2:'h2',H3:'h3',H4:'h4',P:'p',LI:'p',BLOCKQUOTE:'blockquote',PRE:'pre',TD:'p',TH:'p'})[x.tag]||'p');e.textContent=x.text;if(/^H/.test(x.tag))w.classList.add('heading')}w.append(e);out.append(w);return {...x,wrapper:w,el:e,state:x.tag==='IMG'||x.tag==='PRE'?'skip':'pending'}}
function add(xs){let added=false;for(const x of xs)if(!items.has(x.id)){items.set(x.id,block(x));added=true}report();if(added){translate(session);schedule()}return added}
async function translateItem(item, id) {
 item.state='working';
 try {
   const result=await chrome.runtime.sendMessage({type:'translate',lang:activeLang,text:item.text});
   if(id!==session)return;
   if(!result?.text||result.error)throw Error(result?.error||'无返回');
   item.el.textContent=result.text;
   item.segments=Array.isArray(result.segments)?result.segments:[];
   item.el.classList.remove('failed');
   item.state='done';
 } catch {
   if(id!==session)return;
   item.state='failed';
   item.el.classList.add('failed');
   item.el.textContent=item.text+'（翻译失败）';
 }
 report();schedule();
 if(activeSelection?.some(part=>part.id===item.id))renderSelection(activeSelection);
}
async function translate(id) {
 if(working)return;
 working=true;
 try {
   while(id===session){
     const next=[...items.values()].find(item=>item.state==='pending');
     if(!next)break;
     await translateItem(next,id);
   }
 } finally {
   working=false;
   if(id!==session&&[...items.values()].some(item=>item.state==='pending'))translate(session);
 }
}
let priorityTranslation=false;
async function translateSelected() {
 if(priorityTranslation)return;
 priorityTranslation=true;
 try {
   const id=session;
   while(id===session){
     const next=activeSelection?.map(part=>items.get(part.id)).find(item=>item?.state==='pending');
     if(!next)break;
     await translateItem(next,id);
   }
 } finally {
   priorityTranslation=false;
   if(activeSelection?.some(part=>items.get(part.id)?.state==='pending'))translateSelected();
 }
}
let ratio=1;
function schedule(){
 if(calTimer!==null)return;
 calTimer=setTimeout(()=>{calTimer=null;calibrate()},60);
}
async function calibrate(){
 if(!tabId||!items.size)return;
 if(busy){schedule();return}
 busy=true;
 const run=session;
 try{
   for(let pass=0;pass<4;pass++){
     const data=await send({type:'scan'});
     if(run!==session)return;
     ratio=data.scale/devicePixelRatio;
     const origin=readerLayout.origin(data,ratio);
     const source=data.items.filter(x=>items.has(x.id));
     const target=source.map(x=>{
       const entry=items.get(x.id);
       return {id:x.id,top:(entry.tag==='IMG'?entry.el.getBoundingClientRect().top:readerLayout.firstLine(entry.el))+scrollY,pad:parseFloat(entry.wrapper.style.paddingTop)||0};
     });
     const corrections=readerLayout.corrections(source,target,ratio,origin);
     const pads=[];
     let changed=false;
     corrections.forEach((c,i)=>{
       if(Math.abs(c.right-target[i].pad)>.45){
         items.get(c.id).wrapper.style.paddingTop=c.right+'px';changed=true;
       }
       const item=items.get(c.id);
       const preceding=i?source[i-1].top:0;
       const gap=source[i].top-preceding;
       // Items sharing a CSS grid row cannot be separated by repeatedly
       // padding their content. Stop adding space if the last write did
       // not move this line relative to the preceding one.
       const blocked=item.lastPad && Math.abs(gap-item.lastPad.gap)<0.45 &&
         Math.abs(source[i].spacerHeight-item.lastPad.height)<0.45 &&
         c.left>source[i].spacerHeight && item.lastPad.previous<item.lastPad.height;
       if(!blocked&&Math.abs(c.left-source[i].spacerHeight)*ratio>.45){
         pads.push({id:c.id,height:c.left});
         item.lastPad={gap,height:c.left,previous:source[i].spacerHeight};
       }
     });
     if(pads.length)await send({type:'pad',pads});
     if(run!==session)return;
     if(!changed&&!pads.length)break;
   }
   const data=await send({type:'scan'});
   if(run!==session)return;
   const tail=parseFloat(out.style.paddingBottom)||0;
   const contentBottom=out.getBoundingClientRect().bottom+scrollY-tail;
   const naturalPanelMax=Math.max(0,contentBottom-innerHeight);
   const naturalSourceMax=Math.max(0,data.maxScroll-data.tailHeight);
   const endDifference=naturalSourceMax*ratio-naturalPanelMax;
   out.style.paddingBottom=Math.max(0,endDifference)+'px';
   const sourceTail=Math.max(0,-endDifference/ratio);
   if(Math.abs(sourceTail-data.tailHeight)>.5)await send({type:'tail',height:sourceTail});
   if(run!==session)return;
   syncScroll(data.scroll*ratio-scrollY);
 }catch(e){if(run===session)status.textContent='对齐失败，请刷新网页后重新打开插件'}
 finally{busy=false}
}
async function sameLanguage(xs,target,provided='',declared=''){let contentSample=xs.filter(x=>x.tag!=='IMG'&&x.tag!=='PRE').map(x=>x.text).join(' ');let sample=(contentSample||provided||'').slice(0,30000);let letters=sample.match(/\p{L}/gu)||[];if(letters.length<10)return false;let dst=target.toLowerCase(),detected=[];try{let r=await chrome.i18n.detectLanguage(sample);detected=r.languages||[]}catch{}if(dst.startsWith('zh')){let han=(sample.match(/\p{Script=Han}/gu)||[]).length;if(han/letters.length<0.5)return false;let kana=(sample.match(/[\u3040-\u30ff]/gu)||[]).length;if(kana/letters.length>=0.15)return false;if(kana/letters.length>0.05&&detected[0]?.language?.toLowerCase().startsWith('ja'))return false;let zh=detected.find(x=>/^zh(?:-|$)/i.test(x.language));let code=(zh?.language||'').toLowerCase(),page=declared.toLowerCase();let trad=code==='zh-tw'||code==='zh-hant'||code==='zh-hk'||code==='zh-mo'||((!code||code==='zh')&&/^zh-(tw|hk|hant|mo)/.test(page));let simp=code==='zh-cn'||code==='zh-hans'||code==='zh-sg'||((!code||code==='zh')&&/^zh-(cn|sg|hans)/.test(page));if(dst==='zh-tw')return trad;if(dst==='zh-cn')return !trad||simp;return false}return detected.some(x=>x.language.toLowerCase().split('-')[0]===dst.split('-')[0]&&x.percentage>=50)}
function empty(){out.innerHTML='<div class="empty"><div><svg viewBox="0 0 120 100" fill="none"><rect x="17" y="20" width="86" height="60" rx="15" stroke="#b7b9c4" stroke-width="3"/><path d="M38 50h44M60 29v42" stroke="#9da6ba" stroke-width="3" stroke-linecap="round"/><circle cx="93" cy="20" r="8" fill="#d8c5b6"/></svg><p>网页已是目标语言，继续阅读吧</p></div></div>';status.textContent=''}
async function start(){activeSelection=null;highlightSequence++;let id=++session;clearInterval(poll);clearTimeout(calTimer);calTimer=null;out.style.paddingBottom="";if(port){port.disconnect();port=null}out.replaceChildren();items.clear();tabId=null;status.textContent='正在读取网页…';activeLang=language.value;try{let [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});if(id!==session)return;if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('请切换到普通网页');tabId=tab.id;await chrome.scripting.executeScript({target:{tabId},files:['layout.js','source.js']});if(id!==session)return;port=chrome.tabs.connect(tabId,{name:'bilingual-session'});await send({type:'clear'});if(id!==session)return;let data=await send({type:'scan',includeAccent:true});if(id!==session)return;if(!data?.items?.length)throw Error('未能识别文章内容');pageUrl=data.pageUrl||tab.url;applyPageAccent(data.accent);sameMode=await sameLanguage(data.items,activeLang,data.languageSample,data.declaredLanguage);if(id!==session)return;if(sameMode)empty();else add(data.items);poll=setInterval(async()=>{if(busy)return;try{let d=await send({type:'scan'});if(id!==session)return;if(d.pageUrl&&d.pageUrl!==pageUrl){start();return}if(!sameMode){add(d.items);schedule()}}catch{}},3000)}catch(e){if(id===session)status.textContent='读取失败：'+e.message}}
language.onchange=start;chrome.tabs.onActivated.addListener(info=>{if(info.tabId!==tabId)start()});chrome.tabs.onUpdated.addListener((id,change)=>{if(id===tabId&&change.status==='complete')start()});window.addEventListener('pagehide',()=>{if(port)port.disconnect()});
let highlightSequence=0, activeSelection=null;
function clearHighlights(){out.querySelectorAll('mark.selected-translation').forEach(mark=>{let text=document.createTextNode(mark.textContent);mark.replaceWith(text);text.parentNode?.normalize()})}
// Match the rendered text without depending on CSS whitespace or typographic quotes.
function textIndex(value, compact=false) {
 let text='';
 const starts=[],ends=[];
 let offset=0;
 for(const ch of value){
   const start=offset;
   offset+=ch.length;
   if(compact&&/\s/u.test(ch))continue;
   const normalized=/\s/u.test(ch)?' ':ch.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').toLowerCase();
   if(normalized===' '&&text.endsWith(' ')){ends[ends.length-1]=offset;continue}
   text+=normalized;
   for(let i=0;i<normalized.length;i++){starts.push(start);ends.push(offset)}
 }
 return {text,starts,ends};
}
const latinWord=/[\p{Script=Latin}\p{M}\d_]/u;
function uniqueMatch(haystack,needle){
 const index=textIndex(haystack);
 const query=textIndex(needle.trim().replace(/^[\s.,!?;:，。！？；：、]+|[\s.,!?;:，。！？；：、]+$/gu,'')).text;
 if(!query)return null;
 let result=null;
 for(let i=index.text.indexOf(query);i>=0;i=index.text.indexOf(query,i+1)){
   const end=i+query.length;
   if(latinWord.test(query[0])&&latinWord.test(index.text[i-1]||''))continue;
   if(latinWord.test(query.at(-1))&&latinWord.test(index.text[end]||''))continue;
   if(result)return null;
   result={start:index.starts[i],end:index.ends[end-1]};
 }
 return result;
}
const lookupCache=new Map();
function translatedText(text){
 if(!text.trim())return Promise.resolve('');
 const key=JSON.stringify([activeLang,text]);
 if(lookupCache.has(key))return lookupCache.get(key);
 const request=chrome.runtime.sendMessage({type:'translate',lang:activeLang,text,lookup:true})
   .then(result=>result?.error?'':result?.text||'',()=> '')
   .then(result=>{if(!result&&lookupCache.get(key)===request)lookupCache.delete(key);return result});
 if(lookupCache.size>=384)lookupCache.delete(lookupCache.keys().next().value);
 lookupCache.set(key,request);
 return request;
}
function normalizedSelection(source,text,hint,compactOffset){
 const index=textIndex(source,true);
 const query=textIndex(text,true).text;
 if(!query)return null;
 const first=index.text.indexOf(query);
 if(first<0)return null;
 const exact=index.starts.indexOf(hint);
 let from=Number.isInteger(compactOffset)&&index.text.startsWith(query,compactOffset)?compactOffset:exact;
 if(from<0||!index.text.startsWith(query,from)){
   if(index.text.indexOf(query,first+1)>=0)return null;
   from=first;
 }
 let start=index.starts[from],end=index.ends[from+query.length-1];
 while(start>0&&latinWord.test(source[start-1])&&latinWord.test(source[start]))start--;
 while(end<source.length&&latinWord.test(source[end-1])&&latinWord.test(source[end]))end++;
 return {index:start,end,text:source.slice(start,end)};
}
let hintTimer;function hint(message){let e=document.querySelector('#selection-status');if(!e){e=document.createElement('div');e.id='selection-status';document.body.append(e)}clearTimeout(hintTimer);e.textContent=message;if(message&&message!=='正在定位…')hintTimer=setTimeout(()=>{e.textContent=''},2500)}
function sentenceScopes(entry,selection,translated){
 const source=textIndex(entry.text,true);
 let sourceEnd=0,targetEnd=0,covered=selection.index;
 const scopes=[];
 for(const pair of entry.segments||[]){
   const query=textIndex(pair.source,true).text;
   if(!query||!pair.translated)continue;
   const index=source.text.indexOf(query,sourceEnd);
   const ti=translated.indexOf(pair.translated,targetEnd);
   if(index<0||ti<0)continue;
   sourceEnd=index+query.length;
   targetEnd=ti+pair.translated.length;
   const si=source.starts[index],end=source.ends[sourceEnd-1];
   if(end<=selection.index||si>=selection.end)continue;
   if(entry.text.slice(covered,si).trim())break;
   const start=Math.max(si,selection.index);
   const selectedEnd=Math.min(end,selection.end);
   scopes.push({source:entry.text.slice(si,end),target:pair.translated,ti,
     start:start-si,end:selectedEnd-si});
   covered=selectedEnd;
   if(covered>=selection.end)return scopes;
 }
 return [{source:entry.text,target:translated,ti:0,start:selection.index,end:selection.end}];
}

// Ignore punctuation and spacing while comparing the unchanged context.
// Keep the offsets into the actual text so highlights never change the translation.
function contextIndex(value){
 const normalized=textIndex(value,true);
 let text='';
 const starts=[],ends=[];
 for(let i=0;i<normalized.text.length;i++){
   const ch=normalized.text[i];
   if(/\p{P}/u.test(ch))continue;
   text+=ch;
   starts.push(normalized.starts[i]);ends.push(normalized.ends[i]);
 }
 return {text,starts,ends};
}
function markedMatch(marked,displayed){
 const match=/⟦([^⟦⟧]+)⟧/u.exec(marked);
 if(!match||marked.indexOf('⟦',match.index+1)>=0)return null;
 const index=contextIndex(displayed);
 if(contextIndex(marked.replace(match[0],match[1])).text!==index.text)return null;
 const start=contextIndex(marked.slice(0,match.index)).text.length;
 const length=contextIndex(match[1]).text.length;
 return length?{start:index.starts[start],end:index.ends[start+length-1]}:null;
}
const selectionPlaceholder='ZXQV742';
function maskedMatch(masked,displayed){
 const index=contextIndex(displayed);
 const parts=contextIndex(masked).text.split(selectionPlaceholder.toLowerCase());
 if(parts.length!==2)return null;
 const [before,after]=parts;
 // A translation with different wording elsewhere cannot locate this selection.
 if(!index.text.startsWith(before)||!index.text.endsWith(after))return null;
 const start=before.length,end=index.text.length-after.length;
 if(end<=start||before.length+after.length<2)return null;
 return {start:index.starts[start],end:index.ends[end-1]};
}
async function locateScope(scope){
 const selected=scope.source.slice(scope.start,scope.end);
 const whole=contextIndex(scope.source).text;
 if(whole&&contextIndex(selected).text===whole)
   return {start:scope.ti,end:scope.ti+scope.target.length};

 const direct=uniqueMatch(scope.target,selected);
 if(direct&&contextIndex(scope.target.slice(direct.start,direct.end)).text!==contextIndex(scope.target).text)
   return {start:scope.ti+direct.start,end:scope.ti+direct.end};

 const before=scope.source.slice(0,scope.start),after=scope.source.slice(scope.end);
 const lookup=[
   translatedText(selected).then(value=>uniqueMatch(scope.target,value)),
   translatedText(before+'⟦'+selected+'⟧'+after).then(value=>markedMatch(value,scope.target))
 ];
 if(!scope.source.toUpperCase().includes(selectionPlaceholder)){
   lookup.push(translatedText(before+' '+selectionPlaceholder+' '+after)
     .then(value=>maskedMatch(value,scope.target)));
 }
 const result=await Promise.any(lookup.map(request=>request.then(match=>{
   if(!match||!Number.isInteger(match.start)||!Number.isInteger(match.end))throw Error('No matching range');
   // Never turn a partial selection into a whole translated sentence.
   if(contextIndex(scope.target.slice(match.start,match.end)).text===contextIndex(scope.target).text)
     throw Error('Selection is smaller than the translated range');
   return match;
 }))).catch(()=>null);
 return result&&{start:scope.ti+result.start,end:scope.ti+result.end};
}
async function locate(entry,part,token){
 if(token!==highlightSequence)return null;
 const selected=normalizedSelection(entry.text,part.text,part.selectionStart,part.compactOffset);
 if(!selected)return null;
 const full=entry.el.textContent;
 if(selected.text===entry.text)return {start:0,end:full.length};
 const scopes=sentenceScopes(entry,selected,full);
 const ranges=await Promise.all(scopes.map(locateScope));
 if(token!==highlightSequence||ranges.some(range=>!range))return null;
 return ranges.length===1?ranges[0]:ranges;
}
async function renderSelection(parts){
 const token=++highlightSequence;
 clearHighlights();hint('正在定位…');
 const results=await Promise.all(parts.map(async part=>{
   const entry=items.get(part.id);
   if(!entry)return 'missing';
   if(entry.state==='pending'||entry.state==='working')return 'pending';
   if(entry.state!=='done')return 'missing';
   try{
     const match=await locate(entry,part,token);
     if(token!==highlightSequence)return;
     if(!match)return 'missing';
     const full=entry.el.textContent;
     const nodes=[];
     let offset=0;
     for(const range of Array.isArray(match)?match:[match]){
       nodes.push(document.createTextNode(full.slice(offset,range.start)));
       const mark=document.createElement('mark');
       mark.className='selected-translation';
       mark.textContent=full.slice(range.start,range.end);
       nodes.push(mark);
       offset=range.end;
     }
     nodes.push(document.createTextNode(full.slice(offset)));
     entry.el.replaceChildren(...nodes);
   }catch{return 'missing'}
 }));
 if(token===highlightSequence)hint(results.includes('pending')?'译文生成中':results.includes('missing')?'未能准确定位':'');
}
chrome.runtime.onMessage.addListener((m,s)=>{
 if(s.tab?.id!==tabId)return;
 if(m.type==='sourceScroll'){syncScroll(m.position*m.scale/devicePixelRatio-scrollY);return}
 if(m.type==='selectionClear'){activeSelection=null;highlightSequence++;clearHighlights();hint('')}
 if(m.type==='selected'){activeSelection=m.parts;renderSelection(m.parts);translateSelected()}
});
addEventListener('scroll',()=>{if(isSyncedScroll()||frame||!tabId)return;frame=true;requestAnimationFrame(()=>{frame=false;send({type:'scrollTo',position:scrollY/ratio}).catch(()=>{})})},{passive:true});let observedWidth=0;new ResizeObserver(entries=>{let width=entries[0].contentRect.width;if(Math.abs(width-observedWidth)>1){observedWidth=width;schedule()}}).observe(out);start();
