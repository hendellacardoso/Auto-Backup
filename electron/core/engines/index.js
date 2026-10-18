const engines = {
  sqlserver: require('./sqlserver'),
  postgres: require('./postgres'),
  mysql: require('./mysql'),
  oracle: require('./oracle')
};

function getEngine(type) {
  const e = engines[type];
  if (!e) throw new Error('Tipo de banco não suportado: ' + type);
  return e;
}

module.exports = { getEngine };
