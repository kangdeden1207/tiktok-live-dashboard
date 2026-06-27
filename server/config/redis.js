// server/config/redis.js
// Redis dipakai untuk data yang butuh akses SANGAT cepat & sifatnya sementara,
// contoh: viewer count realtime, cache N komentar terakhir, rate-limit, dsb.
// Kalau Redis belum jalan di lokal, app tetap bisa hidup (fallback in-memory)
// supaya development tidak terhambat.

const Redis = require('ioredis');

let client = null;
let isRedisAvailable = false;

function initRedis() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // jangan spam retry kalau memang tidak ada redis
    lazyConnect: true,
  });

  client.on('connect', () => {
    isRedisAvailable = true;
    console.log('✅ Redis terhubung:', url);
  });

  client.on('error', (err) => {
    if (isRedisAvailable) {
      console.warn('⚠️  Redis error:', err.message);
    }
    isRedisAvailable = false;
  });

  client.connect().catch(() => {
    console.warn('⚠️  Redis tidak tersedia, fallback ke in-memory store. (Cek REDIS_URL di .env)');
  });

  return client;
}

// Fallback sederhana kalau Redis mati, supaya server tidak crash
const memoryStore = new Map();

async function setValue(key, value, ttlSeconds = null) {
  if (isRedisAvailable && client) {
    if (ttlSeconds) return client.set(key, value, 'EX', ttlSeconds);
    return client.set(key, value);
  }
  memoryStore.set(key, value);
}

async function getValue(key) {
  if (isRedisAvailable && client) {
    return client.get(key);
  }
  return memoryStore.get(key) ?? null;
}

async function incr(key) {
  if (isRedisAvailable && client) {
    return client.incr(key);
  }
  const current = Number(memoryStore.get(key) || 0) + 1;
  memoryStore.set(key, current);
  return current;
}

module.exports = {
  initRedis,
  setValue,
  getValue,
  incr,
  get isRedisAvailable() {
    return isRedisAvailable;
  },
};
