'use strict';

function parseDatabaseUrl(url) {
  const parsed = new URL(url);

  return {
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    dialect: 'postgres',
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  };
}

function fromEnv() {
  if (process.env.DATABASE_URL) {
    return parseDatabaseUrl(process.env.DATABASE_URL);
  }

  const config = {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'golden_abode',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    dialect: 'postgres',
  };

  if (process.env.DB_SSL === 'true') {
    config.dialectOptions = {
      ssl: { require: true, rejectUnauthorized: false },
    };
  }

  return config;
}

module.exports = {
  development: {
    username: 'postgres',
    password: 'postgres',
    database: 'golden_abode',
    host: '127.0.0.1',
    port: 5432,
    dialect: 'postgres',
  },
  test: {
    username: 'postgres',
    password: 'postgres',
    database: 'golden_abode_test',
    host: '127.0.0.1',
    port: 5432,
    dialect: 'postgres',
  },
  production: fromEnv(),
};
