# TikTok Live Dashboard — Real-Time Monitoring untuk Live Shopping

Dashboard untuk admin/host memantau komentar, like, share, gift, pembelian,
dan produk yang sedang di-pin selama TikTok Live Jualan berlangsung.

Default-nya jalan dalam **mode simulasi** (data dummy) supaya bisa langsung
dicoba tanpa setup apapun. Redis & Supabase bersifat opsional — kalau belum
disetup, app tetap jalan (fallback in-memory, log persistent dimatikan).

## 1. Instalasi

```bash
cd tiktok-live-dashboard
npm install
cp .env.example .env
```

Edit `.env` sesuai kebutuhan (boleh dibiarkan default untuk coba-coba lokal).

## 2. Jalankan

```bash
npm run dev      # pakai nodemon, auto-restart saat edit file
# atau
npm start
```

Buka **http://localhost:3000** di browser. Klik **"▶ Mulai Pantau"** —
dashboard akan langsung menerima komentar, like, gift, dan pin produk dummy
secara real-time.

## 3. (Opsional) Aktifkan Redis

```bash
# via Docker, paling simpel:
docker run -d -p 6379:6379 redis:alpine
```

Pastikan `REDIS_URL` di `.env` sesuai. Tanpa ini, app tetap jalan normal.

## 4. (Opsional) Aktifkan Supabase

1. Buat project di supabase.com
2. Jalankan SQL ini di SQL Editor:
   ```sql
   create table live_events (
     id bigint generated always as identity primary key,
     session_id text not null,
     type text not null,
     payload jsonb not null,
     created_at timestamptz default now()
   );
   ```
3. Isi `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` di `.env`.

## 5. Beralih ke mode "live" (koneksi room TikTok asli)

> ⚠️ `tiktok-live-connector` mengandalkan endpoint internal TikTok yang tidak
> resmi dan bisa berubah/diblokir sewaktu-waktu. Gunakan dengan risiko
> sendiri dan patuhi Terms of Service TikTok.

```bash
npm install tiktok-live-connector
```

Lalu lengkapi blok `_connectRealTikTok()` di
`server/services/tiktokConnector.js` (contoh kode lengkap sudah ada sebagai
komentar di file tersebut — tinggal uncomment & sesuaikan), dan set
`TIKTOK_MODE=live` di `.env`. Karena struktur event-nya sama persis dengan
mode simulasi, frontend **tidak perlu diubah** sama sekali.

## Struktur Folder

```
tiktok-live-dashboard/
├── package.json
├── .env.example
├── server/
│   ├── server.js               # entrypoint Express + Socket.io
│   ├── config/
│   │   ├── redis.js             # state cepat (viewer count, dsb)
│   │   └── supabase.js          # persistent log (gift, purchase, sesi)
│   ├── services/
│   │   ├── tiktokConnector.js   # sumber data (simulasi <-> live, swappable)
│   │   └── commentFilter.js     # logic filter keyword komentar
│   ├── sockets/
│   │   └── socketHandler.js     # jembatan connector <-> client socket.io
│   └── routes/
│       └── api.js               # REST kecil (health check, dst)
└── public/
    ├── index.html                # UI dashboard (Tailwind + Alpine.js)
    └── js/
        └── app.js                # state & socket client (Alpine component)
```

## Mengembangkan lebih lanjut

- **Auth admin**: tambahkan middleware login sebelum `/api` & socket connection.
- **Multi-sesi**: saat ini 1 instance server = 1 room aktif. Untuk banyak host
  sekaligus, buat `Map<sessionId, TikTokConnector>` di `socketHandler.js` dan
  gunakan Socket.io **rooms** (`socket.join(roomId)`) supaya broadcast terisolasi.
- **Histori & analytics**: data sudah dicatat ke tabel `live_events` Supabase —
  bisa dipakai untuk bikin laporan performa live (gift terbanyak, jam ramai, dst).
- **Export leaderboard pembeli/gifter**: agregasi dari `live_events` per sesi.
