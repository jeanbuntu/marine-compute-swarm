import { useEffect, useRef, useState } from 'react';

export const SITE_PAGES = [
  { id: 'swarm', name: 'Swarm', href: '/?view=swarm', description: 'Follow sunlight, energy & fleet compute' },
  { id: 'unit', name: 'Unit Bench', href: '/?view=unit', description: 'Inspect master and worker hardware' },
  { id: 'weather', name: 'Weather Simulator', href: '/?view=weather', description: 'Weather, recovery & optional Muse coordination' },
] as const;
export type SitePage = typeof SITE_PAGES[number]['id'] | 'home';

export function SiteHeader({ page }: { page: SitePage }) {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null), button = useRef<HTMLButtonElement>(null), nav = useRef<HTMLElement>(null);
  const current = SITE_PAGES.find(p => p.id === page) ?? { name: 'Explore' };
  useEffect(() => { document.title = `${current.name} · Marine Compute Swarm`; }, [current.name]);
  useEffect(() => {
    if (!open) return;
    (nav.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ?? nav.current?.querySelector<HTMLAnchorElement>('a'))?.focus();
    const outside = (e: PointerEvent) => { if (!header.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <header className="site-header" ref={header}>
    <a className="site-brand" href="/" aria-label="Marine Compute Swarm home"><span aria-hidden="true">✳</span><strong>Marine Compute Swarm</strong></a>
    <span className="site-divider" aria-hidden="true" />
    <span className="site-page-title" aria-label="Current page">{current.name}</span>
    <button className="site-menu-toggle" ref={button} aria-label="Project menu" aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)} onKeyDown={e => { if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);} }}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><span>Menu</span>
    </button>
    {open && <nav className="site-navigation" id="site-navigation" aria-label="Project navigation" ref={nav} onBlur={e => { if(!header.current?.contains(e.relatedTarget as Node)) setOpen(false); }} onKeyDown={e => {
      const links = Array.from(nav.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next = e.key==='ArrowDown' ? (index+1)%links.length : e.key==='ArrowUp' ? (index+links.length-1)%links.length : e.key==='Home' ? 0 : e.key==='End' ? links.length-1 : -1;
      if(next>=0){e.preventDefault();links[next]?.focus();}
    }}>
      <div className="site-menu-label">Explore Marine Compute Swarm</div>
      {SITE_PAGES.map(p => <a href={p.href} key={p.id} aria-current={p.id===page?'page':undefined} onClick={()=>setOpen(false)}><div><b>{p.name}</b><small>{p.description}</small></div><span aria-hidden="true">{p.id===page?'●':'↗'}</span></a>)}
    </nav>}
  </header>;
}
