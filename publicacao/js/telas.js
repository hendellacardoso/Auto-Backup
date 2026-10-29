// Lista das telas exibidas no visor. Para adicionar uma tela, coloque a imagem em img/prints/ e inclua um item aqui.
window.TELAS = [
  { id: '01-painel', grupo: 'Painel', titulo: 'Painel', descricao: 'Backups do dia, falhas, tarefas ativas, gráfico dos últimos 7 dias e execução em tempo real.' },
  { id: '02-conexoes', grupo: 'Conexões', titulo: 'Conexões', descricao: 'Servidores cadastrados: SQL Server, PostgreSQL, MySQL/MariaDB e Oracle.' },
  { id: '03-nova-conexao', grupo: 'Conexões', titulo: 'Nova conexão', descricao: 'Tipo do banco, servidor, porta, usuário e senha, com teste de conexão.' },
  { id: '04-tarefas', grupo: 'Tarefas', titulo: 'Tarefas de backup', descricao: 'Agenda, ZIP, destinos, limite por dia, retenção e próxima execução de cada tarefa.' },
  { id: '05-tarefa-edicao', grupo: 'Tarefas', titulo: 'Edição da tarefa', descricao: 'Seleção dos bancos, horários, dias da semana, ZIP com senha e retenção.' },
  { id: '06-historico', grupo: 'Histórico', titulo: 'Histórico de backups', descricao: 'Filtros por tarefa, status e data; locais do arquivo (local, Drive, FTP) e log de cada execução.' },
  { id: '07-restaurar', grupo: 'Histórico', titulo: 'Restaurar backup', descricao: 'Restaura no mesmo banco ou com outro nome, com confirmação e log em tempo real.' },
  { id: '08-config-geral', grupo: 'Configurações', titulo: 'Configurações gerais', descricao: 'Pasta dos backups, iniciar com o Windows, bandeja do sistema e pausa dos agendamentos.' },
  { id: '09-config-servico', grupo: 'Configurações', titulo: 'Serviço do Windows', descricao: 'Instala, inicia, para ou remove o serviço que executa os backups sem usuário logado.' },
  { id: '10-config-gdrive', grupo: 'Configurações', titulo: 'Google Drive', descricao: 'Client ID e Client Secret, nome da pasta e conexão com a conta Google.' },
  { id: '11-config-ftp', grupo: 'Configurações', titulo: 'FTP', descricao: 'Servidor, porta, usuário, senha, pasta remota e FTPS.' },
  { id: '12-config-email', grupo: 'Configurações', titulo: 'E-mail', descricao: 'Servidor SMTP, remetente e destinatários das notificações.' },
  { id: '13-sobre', grupo: 'Sobre', titulo: 'Sobre', descricao: 'Versão, desenvolvedor, contato e pastas de dados e logs.' }
];
