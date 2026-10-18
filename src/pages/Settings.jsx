import React, { useEffect, useState } from 'react';
import { Settings as Cog, Cloud, Server as ServerIcon, Mail, Wrench, Cpu, FolderOpen, Save, Loader2, Plug, LogOut, Play, Square, Download, Trash2 } from 'lucide-react';
import { call } from '../api';
import { Field, Check, useToast, useConfirm } from '../components/ui.jsx';

const TABS = [
  { id: 'geral', label: 'Geral', icon: Cog },
  { id: 'servico', label: 'Serviço do Windows', icon: Cpu },
  { id: 'gdrive', label: 'Google Drive', icon: Cloud },
  { id: 'ftp', label: 'FTP', icon: ServerIcon },
  { id: 'email', label: 'E-mail', icon: Mail },
  { id: 'ferramentas', label: 'Ferramentas', icon: Wrench }
];

export default function Settings() {
  const [tab, setTab] = useState('geral');
  return (
    <div className="page">
      <div className="page-header"><div><h1>Configurações</h1><p>Preferências gerais, destinos remotos e notificações.</p></div></div>
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><t.icon size={16} /> {t.label}</button>)}
      </div>
      <div className="card"><div className="card-body">
        {tab === 'geral' && <General />}
        {tab === 'servico' && <ServiceTab />}
        {tab === 'gdrive' && <GDrive />}
        {tab === 'ftp' && <Ftp />}
        {tab === 'email' && <Email />}
        {tab === 'ferramentas' && <Tools />}
      </div></div>
    </div>
  );
}

function useSettings(key) {
  const toast = useToast();
  const [v, setV] = useState(null);
  const load = () => call('settings:get', key).then(setV).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, [key]);
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));
  const save = async (extra) => {
    try { const r = await call('settings:save', key, { ...v, ...(extra || {}) }); setV(r); toast('Configurações salvas.', 'success'); return true; } catch (e) { toast(e.message, 'error'); return false; }
  };
  return [v, set, save, load];
}

function SaveBtn({ onClick }) {
  return <button className="btn primary" onClick={onClick}><Save size={16} /> Salvar</button>;
}

// ------------------------------------------------------------------ geral
function General() {
  const [v, set, save] = useSettings('general');
  if (!v) return null;
  const pick = async () => { const p = await call('dialog:selectFolder', v.backupDir); if (p) set('backupDir', p); };
  return (
    <div className="form" style={{ maxWidth: 720 }}>
      <Field label="Pasta local dos backups" hint="Os arquivos são organizados em: pasta / tarefa / data.">
        <div className="input-group">
          <input className="input" value={v.backupDir} onChange={(e) => set('backupDir', e.target.value)} />
          <button className="btn" onClick={pick}><FolderOpen size={16} /> Procurar</button>
          <button className="btn" onClick={() => call('app:openPath', v.backupDir)}>Abrir</button>
        </div>
      </Field>
      <Check checked={v.startWithWindows} onChange={(x) => set('startWithWindows', x)} label="Iniciar junto com o Windows (na bandeja do sistema)" />
      <Check checked={v.startMinimized} onChange={(x) => set('startMinimized', x)} label="Ao iniciar com o Windows, ficar somente na bandeja" />
      <Check checked={v.closeToTray} onChange={(x) => set('closeToTray', x)} label="Ao fechar a janela, manter rodando na bandeja" />
      <Check checked={v.schedulerPaused} onChange={(x) => set('schedulerPaused', x)} label="Pausar todos os agendamentos" />
      <div><SaveBtn onClick={() => save()} /></div>
    </div>
  );
}

// ---------------------------------------------------------------- serviço
function ServiceTab() {
  const toast = useToast();
  const [portable, setPortable] = useState(false);
  useEffect(() => { call('app:info').then((i) => setPortable(!!i.portable)).catch(() => {}); }, []);
  const [ask, confirmEl] = useConfirm();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => call('service:status').then(setSt).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const act = async (channel, msg) => {
    setBusy(true);
    try { setSt(await call(channel)); toast(msg, 'success'); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="form" style={{ maxWidth: 760 }}>
      <div className="alert info">
        <div>
          Instalado como <b>serviço do Windows</b>, os backups continuam rodando mesmo sem usuário logado.
          Enquanto o serviço estiver ativo, ele executa os agendamentos e o aplicativo da bandeja apenas gerencia as configurações.
          A instalação solicita permissão de administrador (UAC).
        </div>
      </div>
      {portable && (
        <div className="alert warn">
          Você está usando a <b>versão portátil</b>. Ela funciona na bandeja e inicia com o Windows, mas não pode ser instalada como serviço.
          Para usar o serviço do Windows, instale pelo instalador (Setup).
        </div>
      )}
      <div className="flex">
        <b>Status:</b>
        {st ? <span className={`pill ${st.running ? 'green' : st.installed ? 'orange' : 'gray'}`}>{st.state}</span> : <Loader2 size={16} className="spin" />}
        <button className="btn sm" onClick={load}>Atualizar</button>
      </div>
      <div className="actions">
        {!st?.installed && <button className="btn primary" disabled={busy || portable} onClick={() => act('service:install', 'Serviço instalado e iniciado.')}>{busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Instalar serviço</button>}
        {st?.installed && !st.running && <button className="btn success" disabled={busy} onClick={() => act('service:start', 'Serviço iniciado.')}><Play size={16} /> Iniciar</button>}
        {st?.running && <button className="btn" disabled={busy} onClick={() => act('service:stop', 'Serviço parado.')}><Square size={16} /> Parar</button>}
        {st?.installed && <button className="btn" disabled={busy} onClick={() => act('service:install', 'Serviço reinstalado.')}>Reinstalar</button>}
        {st?.installed && <button className="btn danger" disabled={busy} onClick={async () => { if (await ask('Remover o serviço do Windows? Os agendamentos voltarão a ser executados pelo aplicativo da bandeja.')) act('service:uninstall', 'Serviço removido.'); }}><Trash2 size={16} /> Remover serviço</button>}
      </div>
      <div className="alert warn small">
        O serviço roda como <b>LocalSystem</b>. Para SQL Server com autenticação do Windows ou pastas de rede (\\servidor\...), altere a conta de logon do serviço "API2Dev Backup" em services.msc.
      </div>
      {confirmEl}
    </div>
  );
}

// ----------------------------------------------------------- google drive
function GDrive() {
  const toast = useToast();
  const [v, set, save, load] = useSettings('gdrive');
  const [busy, setBusy] = useState(false);
  if (!v) return null;

  const connect = async () => {
    if (!(await save())) return;
    setBusy(true);
    toast('Conclua a autorização no navegador...', 'info');
    try { const r = await call('gdrive:authorize'); toast('Conta conectada: ' + r.account, 'success'); load(); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await call('gdrive:test');
      const q = r.storageQuota || {};
      toast(`OK - ${r.user?.emailAddress}${q.limit ? ` · ${(q.usage / 1e9).toFixed(1)} de ${(q.limit / 1e9).toFixed(0)} GB usados` : ''}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const disconnect = async () => { await call('gdrive:disconnect'); load(); toast('Conta desconectada.', 'success'); };

  return (
    <div className="form" style={{ maxWidth: 760 }}>
      <Check checked={v.enabled} onChange={(x) => set('enabled', x)} label="Habilitar envio para o Google Drive" />
      <div className="alert info small">
        <div>
          1. No <b>Google Cloud Console</b>, crie um projeto e ative a <b>Google Drive API</b>.<br />
          2. Em "Credenciais", crie um <b>ID do cliente OAuth</b> do tipo <b>App para computador</b>.<br />
          3. Copie o Client ID e o Client Secret abaixo e clique em "Conectar conta Google".
        </div>
      </div>
      <div className="row">
        <Field label="Client ID"><input className="input" value={v.clientId} onChange={(e) => set('clientId', e.target.value)} /></Field>
        <Field label="Client Secret"><input className="input" type="password" value={v.clientSecret} onChange={(e) => set('clientSecret', e.target.value)} /></Field>
      </div>
      <Field label="Nome da pasta no Drive" hint="Criada automaticamente pelo sistema na raiz do seu Drive.">
        <input className="input" value={v.folderName || ''} onChange={(e) => set('folderName', e.target.value)} placeholder="API2Dev Backup" />
      </Field>
      <div className="flex">
        <b>Conta:</b> {v.account ? <span className="pill green">{v.account}</span> : <span className="pill gray">Não conectada</span>}
      </div>
      <div className="actions">
        <SaveBtn onClick={() => save()} />
        <button className="btn" disabled={busy} onClick={connect}>{busy ? <Loader2 size={16} className="spin" /> : <Cloud size={16} />} Conectar conta Google</button>
        {v.account && <button className="btn" disabled={busy} onClick={test}><Plug size={16} /> Testar</button>}
        {v.account && <button className="btn danger" onClick={disconnect}><LogOut size={16} /> Desconectar</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- ftp
function Ftp() {
  const toast = useToast();
  const [v, set, save] = useSettings('ftp');
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const test = async () => {
    setBusy(true);
    try { toast(await call('ftp:test', v), 'success'); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <div className="form" style={{ maxWidth: 760 }}>
      <Check checked={v.enabled} onChange={(x) => set('enabled', x)} label="Habilitar envio para FTP" />
      <div className="row-3">
        <Field label="Servidor"><input className="input" value={v.host} onChange={(e) => set('host', e.target.value)} placeholder="ftp.seudominio.com.br" /></Field>
        <Field label="Porta"><input className="input" type="number" value={v.port} onChange={(e) => set('port', Number(e.target.value))} /></Field>
        <Field label="Pasta remota"><input className="input" value={v.remoteDir} onChange={(e) => set('remoteDir', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Usuário"><input className="input" value={v.user} onChange={(e) => set('user', e.target.value)} /></Field>
        <Field label="Senha"><input className="input" type="password" value={v.password} onChange={(e) => set('password', e.target.value)} /></Field>
      </div>
      <Check checked={v.secure} onChange={(x) => set('secure', x)} label="Usar FTPS (TLS explícito)" />
      <div className="actions">
        <SaveBtn onClick={() => save()} />
        <button className="btn" disabled={busy} onClick={test}>{busy ? <Loader2 size={16} className="spin" /> : <Plug size={16} />} Testar conexão</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- email
function Email() {
  const toast = useToast();
  const [v, set, save] = useSettings('email');
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const test = async () => {
    setBusy(true);
    try { await call('email:test', v); toast('E-mail de teste enviado.', 'success'); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <div className="form" style={{ maxWidth: 760 }}>
      <Check checked={v.enabled} onChange={(x) => set('enabled', x)} label="Habilitar notificações por e-mail" />
      <div className="row-3">
        <Field label="Servidor SMTP"><input className="input" value={v.host} onChange={(e) => set('host', e.target.value)} placeholder="smtp.gmail.com" /></Field>
        <Field label="Porta"><input className="input" type="number" value={v.port} onChange={(e) => set('port', Number(e.target.value))} /></Field>
        <div style={{ alignSelf: 'end', paddingBottom: 8 }}><Check checked={v.secure} onChange={(x) => set('secure', x)} label="SSL/TLS (porta 465)" /></div>
      </div>
      <div className="row">
        <Field label="Usuário"><input className="input" value={v.user} onChange={(e) => set('user', e.target.value)} /></Field>
        <Field label="Senha" hint="No Gmail, use uma senha de app."><input className="input" type="password" value={v.password} onChange={(e) => set('password', e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Remetente"><input className="input" value={v.from} onChange={(e) => set('from', e.target.value)} placeholder="Backup <backup@empresa.com.br>" /></Field>
        <Field label="Destinatários" hint="Separe vários e-mails por vírgula."><input className="input" value={v.to} onChange={(e) => set('to', e.target.value)} /></Field>
      </div>
      <div className="actions">
        <SaveBtn onClick={() => save()} />
        <button className="btn" disabled={busy} onClick={test}>{busy ? <Loader2 size={16} className="spin" /> : <Mail size={16} />} Enviar e-mail de teste</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- ferramentas
const BINS = [
  ['sqlcmd', 'sqlcmd (SQL Server - autenticação Windows)'],
  ['pg_dump', 'pg_dump (PostgreSQL)'], ['pg_restore', 'pg_restore (PostgreSQL)'],
  ['mysqldump', 'mysqldump (MySQL)'], ['mysql', 'mysql (MySQL)'],
  ['expdp', 'expdp (Oracle)'], ['impdp', 'impdp (Oracle)']
];

function Tools() {
  const [v, set, save] = useSettings('general');
  if (!v) return null;
  const bp = v.binPaths || {};
  const setBin = (k, val) => set('binPaths', { ...bp, [k]: val });
  const pick = async (k) => { const p = await call('dialog:selectFile', [{ name: 'Executável', extensions: ['exe'] }]); if (p) setBin(k, p); };
  return (
    <div className="form" style={{ maxWidth: 820 }}>
      <div className="alert info small">
        Caminhos dos utilitários de linha de comando. Deixe em branco para detecção automática
        (pastas padrão de instalação e variável PATH). O SQL Server com usuário/senha não precisa de ferramentas externas.
      </div>
      {BINS.map(([k, label]) => (
        <Field key={k} label={label}>
          <div className="input-group">
            <input className="input" value={bp[k] || ''} onChange={(e) => setBin(k, e.target.value)} placeholder="Automático" />
            <button className="btn icon" onClick={() => pick(k)}><FolderOpen size={16} /></button>
          </div>
        </Field>
      ))}
      <div><SaveBtn onClick={() => save()} /></div>
    </div>
  );
}
