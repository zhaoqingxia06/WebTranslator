(()=>{
 if(window.__bilingualInstalled)return;window.__bilingualInstalled=true;
 let next=0,pending=false,expectedScroll=null;
 let scroller=document.scrollingElement;
 function pickScroller(el){
   for(let parent=el?.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
     if(/^(auto|scroll|overlay)$/.test(getComputedStyle(parent).overflowY)&&parent.scrollHeight>parent.clientHeight+1)return parent;
   }
   return document.scrollingElement;
 }
 const position=()=>scroller.scrollTop;
 const maximum=()=>Math.max(0,scroller.scrollHeight-scroller.clientHeight);
 function syncScroll(delta){
   const target=Math.max(0,Math.min(maximum(),position()+delta));
   if(Math.abs(target-position())<0.5)return;
   expectedScroll={target,until:performance.now()+500};
   scroller.scrollTo({top:target,behavior:'instant'});
 }
 function isSyncedScroll(){if(!expectedScroll)return false;const expected=expectedScroll;expectedScroll=null;return performance.now()<expected.until&&Math.abs(position()-expected.target)<2}
 const markers=new Map();
 let tail=null;
 function setTail(height){
   if(height<0.25){tail?.remove();tail=null;return}
   const parent=scroller===document.scrollingElement?document.body:scroller;
   if(!tail){tail=document.createElement("div");tail.setAttribute("aria-hidden","true");tail.style.cssText="display:block;flex:none;pointer-events:none;margin:0;padding:0;border:0"}
   if(tail.parentNode!==parent||parent.lastElementChild!==tail)parent.append(tail);
   tail.style.height=height+"px";
 }
 let connections=0;function clean(){setTail(0);for(const x of markers.values())restore(x);markers.clear();document.querySelectorAll('[data-bi-id]').forEach(x=>delete x.dataset.biId)}
 function restore(x){
   if(x.original) x.el.style.setProperty('padding-top',x.original,x.priority);
   else x.el.style.removeProperty('padding-top');
 }
 function setPad({id,height}){
   const el=find(id); if(!el)return;
   let x=markers.get(id);
   if(x && x.el!==el){restore(x);markers.delete(id);x=null}
   if(height<0.25){if(x){restore(x);markers.delete(id)}return}
   if(!x){x={el,original:el.style.getPropertyValue('padding-top'),priority:el.style.getPropertyPriority('padding-top'),base:parseFloat(getComputedStyle(el).paddingTop)||0};markers.set(id,x)}
   x.height=height;
   el.style.setProperty('padding-top',(x.base+height)+'px','important');
 }
 function lineTop(el){
   if(el.tagName==='IMG')return el.getBoundingClientRect().top+(parseFloat(getComputedStyle(el).paddingTop)||0);
   return readerLayout.firstLine(el);
 }
 function content(){let main=document.querySelector('main')||document.body,article=main.querySelector('article'),h=main.querySelector('h1');let root=article||main;let nodes=[...root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,td,th,img')];if(article&&h&&!article.contains(h)){let hero=h.closest('header,section')||h.parentElement;let extras=[...hero.querySelectorAll('h1,h2,h3,h4,p,li,img')];nodes=[...extras,...nodes]}scroller=pickScroller(nodes.find(e=>e.tagName==="P"&&e.getClientRects().length)||root);return [...new Set(nodes)].filter(e=>{if(e.closest('nav,footer,button,script,style,aside,[data-bi-spacer]'))return false;if(e.closest('a')&&e.tagName==='IMG')return false;if(e.tagName!=='IMG'&&e.querySelector('p,li,blockquote,pre'))return false;let rect=e.getBoundingClientRect();return rect.width>0&&rect.height>0&&(e.tagName==='IMG'||(e.innerText||'').trim().length>1)}).map(e=>{if(!e.dataset.biId)e.dataset.biId=String(++next);let r=e.getBoundingClientRect();return{id:e.dataset.biId,tag:e.tagName,text:(e.innerText||'').trim(),width:r.width,height:r.height-(markers.get(e.dataset.biId)?.height||0),top:lineTop(e)+position()}})}
 function find(id){return document.querySelector('[data-bi-id="'+CSS.escape(String(id))+'"]')}
 function pageAccent(){
  const heading='h1,h2,h3,h4,h5,h6,[role="heading"]';
  const action='button,input[type="submit"],[role="button"],a[class*="button" i],a[class*="btn" i]';
  const decoration='hr,[class*="divider" i],[class*="separator" i],[class*="accent" i],[style*="border"]';
  const elements=document.querySelectorAll(heading+','+action+','+decoration+',a,main p,main span,article p,article span,footer p,footer span,footer div,[class*="label" i]');
  const wrappers=new Set(),palette=[];
  const colorCache=new Map();
  let canvas;
  function add(value,role,weight){
   if(!value||value==='transparent')return;
   let rgba=colorCache.get(value);
   if(!rgba){
    const rgb=/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(value);
    if(rgb)rgba=[+rgb[1],+rgb[2],+rgb[3],rgb[4]===undefined?1:+rgb[4]];
    else {
     canvas??=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
     if(!canvas||!CSS.supports('color',value))return;
     canvas.clearRect(0,0,1,1);
     canvas.fillStyle=value;
     canvas.fillRect(0,0,1,1);
     const [r,g,b,alpha]=canvas.getImageData(0,0,1,1).data;
     rgba=[r,g,b,alpha/255];
    }
    colorCache.set(value,rgba);
   }
   const rgb=rgba.slice(0,3);
   const max=Math.max(...rgb),min=Math.min(...rgb),chroma=max-min;
   if(rgba[3]<.55||max<70||chroma<30||chroma/max<.22)return;
   let group=palette.find(item=>item.rgb.every((channel,i)=>Math.abs(channel-rgb[i])<=26));
   if(!group){group={rgb,roles:new Map(),strongest:0};palette.push(group)}
   const score=weight+chroma/32;
   group.roles.set(role,Math.max(score,group.roles.get(role)||0));
   if(score>group.strongest){group.rgb=rgb;group.strongest=score}
  }
  function borders(style){
   for(const side of ['Top','Right','Bottom','Left']){
    const width=parseFloat(style['border'+side+'Width']);
    if(width>0&&width<=6&&/^(solid|dashed|dotted|double)$/.test(style['border'+side+'Style']))
      add(style['border'+side+'Color'],'rule',48);
   }
  }
  function rendered(element,style){
   return !element.closest('dialog,[role="dialog"],[hidden],[aria-hidden="true"]')&&
     style.visibility==='visible'&&Number(style.opacity)>0&&
     [...element.getClientRects()].some(rect=>rect.width>0&&rect.height>0);
  }
  for(const element of elements){
   const style=getComputedStyle(element);
   if(!rendered(element,style))continue;
   if(element.matches(heading)){
    add(style.color,'heading',65);
    let parent=element.parentElement;
    for(let depth=0;parent&&depth<3;depth++,parent=parent.parentElement)wrappers.add(parent);
   }else if(element.matches(action)){
    add(style.backgroundColor,'action',59);
    add(style.color,'action',45);
   }else if(element.matches('a[href]')){
    add(style.color,'link',27);
   }else if(element.childElementCount===0){
    const text=element.textContent.trim();
    if(text.length>1&&text.length<=55&&style.color!==getComputedStyle(element.parentElement).color)
      add(style.color,'label',48);
   }
   borders(style);
  }
  for(const element of wrappers){
   const style=getComputedStyle(element);
   if(rendered(element,style))borders(style);
  }
  // Repeated links count once. A hue shared by titles, rules and controls
  // has stronger evidence than the size or number of elements using it.
  const score=group=>group.strongest+(group.roles.size-1)*14;
  let best;
  for(const group of palette)if(!best||score(group)>score(best))best=group;
  return best?.rgb||null;
 }
 function scan(includeAccent){let items=content();for(const item of items)item.spacerHeight=markers.get(item.id)?.height||0;let visible=items.find(x=>x.top+ x.height>position()+100);let textRoot=document.querySelector('main')||document.body;let languageSample=(textRoot.innerText||'').slice(0,30000);let declaredLanguage=document.documentElement.lang||'';return {pointer:readerLayout.sample(),viewportHeight:innerHeight,scale:devicePixelRatio,scroll:position(),tailHeight:tail?.getBoundingClientRect().height||0,maxScroll:maximum(),items,languageSample,declaredLanguage,accent:includeAccent?pageAccent():null,pageUrl:location.href,anchor:visible?{id:visible.id,offset:visible.top-position()}:null}}
 chrome.runtime.onMessage.addListener((m,s,reply)=>{if(m.type==='scan'){reply(scan(m.includeAccent));return}if(m.type==='pad'){for(const x of m.pads)setPad(x);reply({ok:true});return}if(m.type==='tail'){setTail(m.height);reply({ok:true});return}if(m.type==='clear'){clean();reply({ok:true});return}if(m.type==='scrollTo'){if(Number.isFinite(m.position))syncScroll(m.position-position());reply({ok:true})}});
 chrome.runtime.onConnect.addListener(port=>{if(port.name==='bilingual-session'){connections++;port.onDisconnect.addListener(()=>{connections=Math.max(0,connections-1);setTimeout(()=>{if(!connections)clean()},500)})}});
 addEventListener('scroll',event=>{if(event.target!==scroller&&!(event.target===document&&scroller===document.scrollingElement))return;if(isSyncedScroll()||pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(connections)chrome.runtime.sendMessage({type:'sourceScroll',position:position(),scale:devicePixelRatio}).catch(()=>{})})},{passive:true,capture:true});
 let selectionTimer;
 document.addEventListener('selectionchange',()=>{
   clearTimeout(selectionTimer);
   selectionTimer=setTimeout(()=>{
     const selection=getSelection();
     const parts=[];
     if(selection?.rangeCount && !selection.isCollapsed){
       const range=selection.getRangeAt(0);
       for(const el of document.querySelectorAll('[data-bi-id]')){
         if(!range.intersectsNode(el))continue;
         const part=document.createRange();
         part.selectNodeContents(el);
         if(el.contains(range.startContainer))part.setStart(range.startContainer,range.startOffset);
         if(el.contains(range.endContainer))part.setEnd(range.endContainer,range.endOffset);
         const raw=part.toString(),text=raw.trim();
         if(!text)continue;
         const preceding=document.createRange();
         preceding.selectNodeContents(el);preceding.setEnd(part.startContainer,part.startOffset);
         const before=preceding.toString().replace(/^\s+/u,'');
         const selectionStart=before.length+(before ? raw.length-raw.trimStart().length : 0);
         const compact=value=>value.replace(/\s/gu,'').normalize('NFKC').toLowerCase();
         // The DOM range uses raw text; only reuse its offset when its text
         // agrees with the rendered paragraph after removing whitespace.
         const compactOffset=compact(el.textContent)===compact(el.innerText)
           ? compact(preceding.toString()).length
           : undefined;
         parts.push({id:el.dataset.biId,text,selectionStart,compactOffset});
       }
     }
     chrome.runtime.sendMessage(parts.length?{type:'selected',parts}:{type:'selectionClear'}).catch(()=>{});
   },35);
 });
})();
