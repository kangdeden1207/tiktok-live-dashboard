// server/config/supabase.js
// Supabase (Postgres) dipakai untuk data yang harus PERSISTENT,
// contoh: histori sesi live, log gift/order, leaderboard penonton, dsb.
//
// Buat tabel minimal di Supabase SQL editor:
//
// create table live_events (
//   id bigint generated always as identity primary key,
//   session_id text not null,
//   type text not null,           -- 'gift' | 'purchase' | 'comment' | 'session_start' | 'session_end'
//   payload jsonb not null,
//   created_at timestamptz default now()
// );

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key || url.includes('xxxxx')) {
    console.warn('⚠️  Supabase belum dikonfigurasi (.env). Persistent log dimatikan untuk sekarang.');
    return null;
  }

  supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  console.log('✅ Supabase client siap.');
  return supabase;
}

async function logEvent(sessionId, type, payload) {
  if (!supabase) return; // diam-diam skip kalau supabase belum dikonfigurasi
  try {
    await supabase.from('live_events').insert({
      session_id: sessionId,
      type,
      payload,
    });
  } catch (err) {
    console.error('Gagal simpan event ke Supabase:', err.message);
  }
}

module.exports = { initSupabase, logEvent };
