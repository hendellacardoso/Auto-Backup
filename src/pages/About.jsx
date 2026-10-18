import React from 'react';
import { call } from '../api';
import logo from '../logo.png';

export default function About({ info }) {
  const open = (url) => call('app:openExternal', url);
  return (
    <div className="page">
      <div className="card"><div className="card-body about">
        <img src={logo} alt="API2Dev Backup" />
        <h2>API2Dev Backup</h2>
        <div className="muted">Backups automáticos agendados para SQL Server, PostgreSQL, MySQL e Oracle</div>
        <div className="muted small" style={{ marginTop: 4 }}>Versão {info ? info.version : '-'}</div>

        <div className="about-info">
          <span>Empresa</span><b>API2Dev</b>
          <span>Desenvolvedor</span><b>Hendell Cardoso</b>
          <span>E-mail</span><a onClick={() => open('mailto:suporte@api2dev.com.br')}>suporte@api2dev.com.br</a>
          <span>WhatsApp</span><a onClick={() => open('https://wa.me/5562993148955')}>(62) 9.9314-8955</a>
          {info && <><span>Pasta de dados</span><a onClick={() => call('app:openPath', info.dataDir)}>{info.dataDir}</a></>}
          {info && <><span>Logs</span><a onClick={() => call('app:openPath', info.logDir)}>{info.logDir}</a></>}
        </div>
        <div className="muted small" style={{ marginTop: 28 }}>© {new Date().getFullYear()} API2Dev. Todos os direitos reservados.</div>
      </div></div>
    </div>
  );
}
