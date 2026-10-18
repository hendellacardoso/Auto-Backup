import React, { createContext, useCallback, useContext, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { DB_TYPES } from '../api';

// ----------------------------------------------------------------- toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={18} /> : t.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ modal
export function Modal({ title, onClose, children, footer, size }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={`modal ${size || ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          {onClose && <button className="btn icon" onClick={onClose}><X size={18} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ campos
export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Check({ checked, onChange, label, disabled }) {
  return (
    <label className="check" style={disabled ? { opacity: 0.5 } : null}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function StatusPill({ status }) {
  const map = {
    sucesso: ['green', 'Sucesso'], aviso: ['orange', 'Aviso'], erro: ['red', 'Erro'], executando: ['blue', 'Executando']
  };
  const [c, l] = map[status] || ['gray', status || '-'];
  return <span className={`pill ${c}`}>{l}</span>;
}

export function DbTag({ type }) {
  const t = DB_TYPES[type];
  if (!t) return null;
  return <span className="dbtag" style={{ background: t.color }}>{t.label}</span>;
}

export function LogView({ lines, refEl }) {
  return (
    <div className="log" ref={refEl}>
      {lines.length ? lines.map((l, i) => (
        <div key={i} className={/ERRO/.test(l) ? 'err' : /conclu[ií]d|sucesso|enviado/i.test(l) ? 'ok' : ''}>{l}</div>
      )) : <span className="muted">Aguardando...</span>}
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = (message, title = 'Confirmar') => new Promise((resolve) => setState({ message, title, resolve }));
  const el = state && (
    <Modal title={state.title} onClose={() => { state.resolve(false); setState(null); }}
      footer={<>
        <button className="btn" onClick={() => { state.resolve(false); setState(null); }}>Cancelar</button>
        <button className="btn primary" onClick={() => { state.resolve(true); setState(null); }}>Confirmar</button>
      </>}>
      <div style={{ whiteSpace: 'pre-wrap' }}>{state.message}</div>
    </Modal>
  );
  return [ask, el];
}
