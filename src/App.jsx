import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Server, CalendarClock, History as HistoryIcon, Settings as SettingsIcon, Info } from 'lucide-react';
import { ToastProvider } from './components/ui.jsx';
import { call, on } from './api';
import logo from './logo.png';
import Dashboard from './pages/Dashboard.jsx';
import Connections from './pages/Connections.jsx';
import Jobs from './pages/Jobs.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import About from './pages/About.jsx';

const ROUTES = [
  { path: '/', label: 'Painel', icon: LayoutDashboard, el: Dashboard },
  { path: '/conexoes', label: 'Conexões', icon: Server, el: Connections },
  { path: '/tarefas', label: 'Tarefas de backup', icon: CalendarClock, el: Jobs },
  { path: '/historico', label: 'Histórico / Restaurar', icon: HistoryIcon, el: History },
  { path: '/configuracoes', label: 'Configurações', icon: SettingsIcon, el: Settings },
  { path: '/sobre', label: 'Sobre', icon: Info, el: About }
];

export default function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    const off = on('navigate', (r) => { window.location.hash = r; });
    const load = () => call('app:info').then(setInfo).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { window.removeEventListener('hashchange', onHash); off(); clearInterval(t); };
  }, []);

  const current = ROUTES.find((r) => r.path === route) || ROUTES[0];
  const Page = current.el;

  return (
    <ToastProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <img src={logo} alt="" />
            <div><b>API2Dev Backup</b><small>Backups automáticos</small></div>
          </div>
          <nav className="nav">
            {ROUTES.map((r) => (
              <button key={r.path} className={r.path === current.path ? 'active' : ''} onClick={() => { window.location.hash = r.path; }}>
                <r.icon size={18} /> {r.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div>Agendador</div>
            {info && (
              <span className={`pill ${info.paused ? 'orange' : 'green'}`}>
                {info.paused ? 'Pausado' : info.schedulerMode === 'servico' ? 'Serviço do Windows' : 'Aplicativo (bandeja)'}
              </span>
            )}
            <div style={{ marginTop: 10 }}>v{info ? info.version : '-'} · API2Dev</div>
          </div>
        </aside>
        <main className="main">
          <Page key={current.path} info={info} />
        </main>
      </div>
    </ToastProvider>
  );
}
