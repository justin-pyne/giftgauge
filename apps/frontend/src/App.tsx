import { useState } from 'react';
import Home from './pages/Home';
import ProfileBuilder from './pages/ProfileBuilder';
import GiftGiver from './pages/GiftGiver';
import Dashboard from './pages/Dashboard';

export type Route = 'home' | 'build' | 'score' | 'dashboard';

export default function App() {
  const [route, setRoute] = useState<Route>('home');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line/70 backdrop-blur-sm sticky top-0 z-10 bg-cream/80">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => setRoute('home')}
            className="flex items-baseline gap-2 group"
          >
            <span className="font-display text-2xl font-semibold tracking-tight">
              Gift<span className="text-rust">Gauge</span>
            </span>
            <span className="text-xs uppercase tracking-[0.2em] text-ash hidden sm:inline">
              private. precise.
            </span>
          </button>
          <nav className="flex items-center gap-1">
            <NavLink active={route === 'build'} onClick={() => setRoute('build')}>
              Build
            </NavLink>
            <NavLink active={route === 'score'} onClick={() => setRoute('score')}>
              Score
            </NavLink>
            <NavLink
              active={route === 'dashboard'}
              onClick={() => setRoute('dashboard')}
            >
              Dashboard
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {route === 'home' && <Home onNavigate={setRoute} />}
        {route === 'build' && <ProfileBuilder />}
        {route === 'score' && <GiftGiver />}
        {route === 'dashboard' && <Dashboard />}
      </main>

      <footer className="border-t border-line/70 mt-16">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-ash">
          <div>
            GiftGauge — graduate DevOps final project. Application layer only.
          </div>
          <div className="flex items-center gap-4">
            <span className="pill">3 services</span>
            <span className="pill">prom-client</span>
            <span className="pill">pino JSON</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        props.active
          ? 'bg-ink text-cream'
          : 'text-ink/70 hover:text-ink hover:bg-ink/5'
      }`}
    >
      {props.children}
    </button>
  );
}
