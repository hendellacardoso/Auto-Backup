import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Plug, Loader2, Database, FolderOpen } from 'lucide-react';
import { call, DB_TYPES } from '../api';
import { Modal, Field, Check, DbTag, useToast, useConfirm } from '../components/ui.jsx';

const EMPTY = {
  name: '', type: 'sqlserver', host: 'localhost', port: '', instance: '', auth_type: 'sql',
  username: '', password: '', service_name: '', options: { trustServerCertificate: true }
};

export default function Connections() {
  const toast = useToast();
  const [ask, confirmEl] = useConfirm();
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  const [dbs, setDbs] = useState(null);

  const load = () => call('connections:list').then(setList).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const remove = async (c) => {
    if (!(await ask(`Excluir a conexão "${c.name}"?\nAs tarefas que usam esta conexão também serão excluídas.`))) return;
    try { await call('connections:delete', c.id); toast('Conexão excluída.', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  const showDbs = async (c) => {
    setDbs({ name: c.name, loading: true, list: [] });
    try { setDbs({ name: c.name, list: await call('connections:databases', c) }); } catch (e) { setDbs(null); toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Conexões</h1><p>Servidores de banco de dados que serão copiados.</p></div>
        <button className="btn primary" onClick={() => setEdit({ ...EMPTY, options: { ...EMPTY.options } })}><Plus size={16} /> Nova conexão</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Tipo</th><th>Servidor</th><th>Usuário</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td><DbTag type={c.type} /></td>
                <td>{c.host}{c.instance ? `\\${c.instance}` : ''}{c.port ? `:${c.port}` : ''}{c.service_name ? `/${c.service_name}` : ''}</td>
                <td>{c.auth_type === 'windows' ? <i>Autenticação do Windows</i> : c.username}</td>
                <td>
                  <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => showDbs(c)}><Database size={14} /> Bancos</button>
                    <button className="btn sm" onClick={() => setEdit({ ...c, options: { ...c.options } })}><Pencil size={14} /> Editar</button>
                    <button className="btn sm danger" onClick={() => remove(c)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="empty">Nenhuma conexão cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <ConnectionForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {dbs && (
        <Modal title={`Bancos em ${dbs.name}`} onClose={() => setDbs(null)}>
          {dbs.loading ? <div className="flex"><Loader2 className="spin" size={16} /> Carregando...</div> : (
            <div className="dblist">{dbs.list.map((d) => <div key={d} className="check"><Database size={14} /> {d}</div>)}</div>
          )}
        </Modal>
      )}
      {confirmEl}
    </div>
  );
}

function ConnectionForm({ value, onClose, onSaved }) {
  const toast = useToast();
  const [c, setC] = useState(value);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const setOpt = (k, v) => setC((x) => ({ ...x, options: { ...x.options, [k]: v } }));

  const test = async () => {
    setTesting(true);
    try { const r = await call('connections:test', c); toast('Conexão OK: ' + r, 'success'); } catch (e) { toast(e.message, 'error'); }
    setTesting(false);
  };
  const save = async () => {
    if (!c.name.trim()) return toast('Informe o nome da conexão.', 'error');
    setSaving(true);
    try { await call('connections:save', c); toast('Conexão salva.', 'success'); onSaved(); } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  const pickFolder = async (k) => { const p = await call('dialog:selectFolder', c.options[k]); if (p) setOpt(k, p); };

  return (
    <Modal title={c.id ? 'Editar conexão' : 'Nova conexão'} onClose={onClose} footer={<>
      <button className="btn" onClick={test} disabled={testing}>{testing ? <Loader2 size={16} className="spin" /> : <Plug size={16} />} Testar conexão</button>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn primary" onClick={save} disabled={saving}>Salvar</button>
    </>}>
      <div className="form">
        <div className="row">
          <Field label="Nome da conexão"><input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Servidor ERP" autoFocus /></Field>
          <Field label="Tipo de banco">
            <select className="input" value={c.type} onChange={(e) => setC({ ...c, type: e.target.value, port: '' })}>
              {Object.entries(DB_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="row-3">
          <Field label="Servidor / Host"><input className="input" value={c.host} onChange={(e) => set('host', e.target.value)} /></Field>
          {c.type === 'sqlserver' && <Field label="Instância" hint="Ex.: SQLEXPRESS (vazio = padrão)"><input className="input" value={c.instance || ''} onChange={(e) => set('instance', e.target.value)} /></Field>}
          {c.type === 'oracle' && <Field label="Service name"><input className="input" value={c.service_name || ''} onChange={(e) => set('service_name', e.target.value)} placeholder="ORCL / XEPDB1" /></Field>}
          <Field label="Porta"><input className="input" type="number" value={c.port || ''} onChange={(e) => set('port', e.target.value)} placeholder={String(DB_TYPES[c.type].port)} /></Field>
        </div>

        {c.type === 'sqlserver' && (
          <Field label="Autenticação">
            <select className="input" value={c.auth_type} onChange={(e) => set('auth_type', e.target.value)}>
              <option value="sql">SQL Server (usuário e senha)</option>
              <option value="windows">Windows (requer sqlcmd instalado)</option>
            </select>
          </Field>
        )}
        {!(c.type === 'sqlserver' && c.auth_type === 'windows') && (
          <div className="row">
            <Field label="Usuário"><input className="input" value={c.username || ''} onChange={(e) => set('username', e.target.value)} placeholder={{ sqlserver: 'sa', postgres: 'postgres', mysql: 'root', oracle: 'system' }[c.type]} /></Field>
            <Field label="Senha"><input className="input" type="password" value={c.password || ''} onChange={(e) => set('password', e.target.value)} /></Field>
          </div>
        )}

        {c.type === 'sqlserver' && <>
          <div className="section-title">Opções do SQL Server</div>
          <div className="row">
            <Field label="Pasta de backup no servidor" hint="Caminho visto pelo SQL Server. Vazio = pasta padrão de backup da instância.">
              <input className="input" value={c.options.serverBackupDir || ''} onChange={(e) => setOpt('serverBackupDir', e.target.value)} placeholder="C:\Program Files\Microsoft SQL Server\...\Backup" />
            </Field>
            <Field label="Caminho de acesso local (servidor remoto)" hint="Mesma pasta acessada desta máquina, ex.: \\SERVIDOR\Backup. Vazio = servidor local.">
              <div className="input-group">
                <input className="input" value={c.options.localAccessDir || ''} onChange={(e) => setOpt('localAccessDir', e.target.value)} />
                <button className="btn icon" onClick={() => pickFolder('localAccessDir')}><FolderOpen size={16} /></button>
              </div>
            </Field>
          </div>
          <div className="flex" style={{ gap: 20, flexWrap: 'wrap' }}>
            <Check checked={c.options.compression} onChange={(v) => setOpt('compression', v)} label="Compressão nativa (não suportado no Express)" />
            <Check checked={c.options.encrypt} onChange={(v) => setOpt('encrypt', v)} label="Criptografar conexão" />
            <Check checked={c.options.trustServerCertificate !== false} onChange={(v) => setOpt('trustServerCertificate', v)} label="Confiar no certificado do servidor" />
          </div>
        </>}

        {(c.type === 'postgres' || c.type === 'mysql') && <>
          <div className="section-title">Opções</div>
          <div className="row">
            {c.type === 'postgres' && <Field label="Banco de manutenção" hint="Usado para listar os bancos."><input className="input" value={c.options.maintenanceDb || ''} onChange={(e) => setOpt('maintenanceDb', e.target.value)} placeholder="postgres" /></Field>}
            <div style={{ alignSelf: 'end', paddingBottom: 8 }}><Check checked={c.options.ssl} onChange={(v) => setOpt('ssl', v)} label="Usar SSL" /></div>
          </div>
        </>}

        {c.type === 'oracle' && <>
          <div className="section-title">Opções do Oracle (Data Pump)</div>
          <div className="row">
            <Field label="DIRECTORY do Data Pump" hint="Objeto DIRECTORY usado pelo expdp/impdp."><input className="input" value={c.options.directoryName || ''} onChange={(e) => setOpt('directoryName', e.target.value)} placeholder="DATA_PUMP_DIR" /></Field>
            <Field label="Caminho da pasta do DIRECTORY" hint="Como esta máquina acessa a pasta. Vazio = consulta ALL_DIRECTORIES.">
              <div className="input-group">
                <input className="input" value={c.options.directoryPath || ''} onChange={(e) => setOpt('directoryPath', e.target.value)} />
                <button className="btn icon" onClick={() => pickFolder('directoryPath')}><FolderOpen size={16} /></button>
              </div>
            </Field>
          </div>
          <Check checked={c.options.sysdba} onChange={(v) => setOpt('sysdba', v)} label="Conectar como SYSDBA" />
          <div className="alert info small">No Oracle, cada "banco" listado é um SCHEMA. O backup usa expdp/impdp (Oracle Client/Server instalado).</div>
        </>}
      </div>
    </Modal>
  );
}
