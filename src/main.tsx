import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);

// Handy for inspecting state from the browser console while developing.
if (import.meta.env.DEV) {
  import('./state/store').then((m) => ((window as unknown as { __store: unknown }).__store = m.useStore));
}
