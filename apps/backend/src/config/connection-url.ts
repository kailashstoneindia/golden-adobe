export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface RedisConnectionConfig {
  url?: string;
  host: string;
  port: number;
  password: string;
}

export function parseDatabaseUrl(url: string): DatabaseConnectionConfig {
  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    name: parsed.pathname.replace(/^\//, ''),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: true,
  };
}

export function resolveDatabaseConfig(): DatabaseConnectionConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return parseDatabaseUrl(databaseUrl);
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'golden_abode',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    ssl: process.env.DB_SSL === 'true',
  };
}

export function resolveRedisConfig(): RedisConnectionConfig {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return {
      url: redisUrl,
      host: '',
      port: 6379,
      password: '',
    };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || '',
  };
}
