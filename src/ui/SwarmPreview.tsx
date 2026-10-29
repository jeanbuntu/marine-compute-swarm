import { useEffect, useRef, useState } from 'react';

/** A separate window isolates the live preview from every simulator's editable state. */
export function SwarmPreview() {
  const root=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{
    const element=root.current!;
    let visible=true;
    const update=()=>frame.current?.contentWindow?.postMessage({type:'swarm-preview-playback',playing:visible&&!document.hidden},window.location.origin);
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)setMounted(true);update();});
    if(observer)observer.observe(element);else setMounted(true);
    const ready=(event:MessageEvent)=>{if(event.origin===window.location.origin&&event.source===frame.current?.contentWindow&&event.data?.type==='swarm-preview-ready')update();};
    window.addEventListener('message',ready);
    document.addEventListener('visibilitychange',update);
    return()=>{observer?.disconnect();window.removeEventListener('message',ready);document.removeEventListener('visibilitychange',update);};
  },[]);
  return <div ref={root} className="live-swarm-preview">
    {mounted&&<iframe ref={frame} title="Live isometric Swarm preview at 10× speed" src="/?view=swarm&preview=swarm" loading="lazy" tabIndex={-1} onLoad={()=>{const r=root.current!.getBoundingClientRect();frame.current?.contentWindow?.postMessage({type:'swarm-preview-playback',playing:!document.hidden&&r.bottom>0&&r.top<window.innerHeight},window.location.origin);}} />}
    <span className="preview-live-label">LIVE · ISOMETRIC · 10×</span>
  </div>;
}
