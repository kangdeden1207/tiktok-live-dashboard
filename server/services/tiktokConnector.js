// server/services/tiktokConnector.js
//
// Modul ini membungkus "sumber data" room TikTok Live di belakang satu
// interface yang konsisten, supaya bagian lain dari app (socketHandler, dsb)
// tidak peduli datanya dari simulasi atau dari koneksi live asli.
//
// MODE "simulation" (default): generate data dummy (komentar, like, gift,
// share, viewer count, product pin) supaya UI/dashboard bisa dikembangkan
// tanpa harus live di TikTok dulu.
//
// MODE "live": tinggal pasang package `tiktok-live-connector` (sudah ada di
// optionalDependencies package.json) lalu npm install. Lihat blok
// `_connectRealTikTok()` di bagian bawah untuk contoh wiring-nya — struktur
// event yang di-emit SAMA dengan mode simulasi, jadi frontend tidak perlu
// diubah sama sekali.

const EventEmitter = require('events');

const SAMPLE_USERNAMES = [
  'sasa_cantik', 'budi.shop', 'rara_official', 'dimas99', 'lily_kece',
  'mama_indah', 'reza_store', 'citra.live', 'agus_jaya', 'nia_beauty',
];

const SAMPLE_COMMENTS = [
  'Halo kak, ini ready stock?',
  'Spill warna lain dong kak',
  'Diskon nya sampai jam berapa?',
  'Ukuran L masih ada gak?',
  'Mantap kak produknya',
  'Yang merah masih ready kak?',
  'Ongkirnya berapa ke Jakarta?',
  'Cantik bangettt',
  'Aku checkout ya kak',
  'Boleh COD gak kak?',
  'Diskon kak buat yang follow',
  'Spill harga aslinya berapa',
];

const SAMPLE_PRODUCTS = [
  { id: 'p1', name: 'Serum Vitamin C 30ml', price: 49000, image: '🧪' },
  { id: 'p2', name: 'Kaos Oversize Unisex', price: 65000, image: '👕' },
  { id: 'p3', name: 'Sepatu Sneakers Lokal', price: 159000, image: '👟' },
  { id: 'p4', name: 'Tas Selempang Kanvas', price: 89000, image: '👜' },
];

const SAMPLE_GIFTS = [
  { name: 'Rose', coinValue: 1, icon: '🌹' },
  { name: 'Perfume', coinValue: 20, icon: '💐' },
  { name: 'GG', coinValue: 1, icon: '🎮' },
  { name: 'Universe', coinValue: 34999, icon: '🪐' },
  { name: 'Lion', coinValue: 29999, icon: '🦁' },
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class TikTokConnector extends EventEmitter {
  constructor() {
    super();
    this.roomId = null;
    this.uniqueId = null;
    this.connected = false;
    this.stats = { viewerCount: 0, likeCount: 0, shareCount: 0 };
    this._timers = [];
  }

  // ---- Interface publik (dipakai oleh socketHandler) ----

  async connect(uniqueId, { mode = 'simulation' } = {}) {
    this.uniqueId = uniqueId;
    this.roomId = `room_${Date.now()}`;

    if (mode === 'live') {
      return this._connectRealTikTok(uniqueId);
    }
    return this._connectSimulation(uniqueId);
  }

  disconnect() {
    this.connected = false;
    this._timers.forEach((t) => clearInterval(t));
    this._timers = [];
    if (this._liveConnection) {
      this._liveConnection.disconnect().catch(() => {});
      this._liveConnection = null;
    }
    this.emit('streamEnd', { roomId: this.roomId });
  }

  // ---- Mode simulasi ----

  async _connectSimulation(uniqueId) {
    this.connected = true;
    this.stats.viewerCount = randomInt(80, 250);

    this.emit('connected', {
      roomId: this.roomId,
      uniqueId,
      mode: 'simulation',
    });

    // Komentar masuk setiap ~1.2 - 3s
    this._timers.push(
      setInterval(() => this._emitFakeComment(), randomInt(1200, 3000))
    );

    // Like bertambah setiap ~1s (TikTok like itu datang dalam batch)
    this._timers.push(
      setInterval(() => this._emitFakeLike(), 1000)
    );

    // Share, sesekali saja
    this._timers.push(
      setInterval(() => this._emitFakeShare(), randomInt(8000, 20000))
    );

    // Gift / pembelian, sesekali, ini yang trigger notifikasi pop-up
    this._timers.push(
      setInterval(() => this._emitFakeGiftOrPurchase(), randomInt(5000, 12000))
    );

    // Viewer count naik-turun supaya kelihatan "hidup"
    this._timers.push(
      setInterval(() => this._emitViewerFluctuation(), 4000)
    );

    // Produk yang di-pin berganti tiap beberapa detik
    this._timers.push(
      setInterval(() => this._emitProductPin(), randomInt(15000, 30000))
    );

    // Langsung kirim 1 product pin awal
    this._emitProductPin();
  }

  _emitFakeComment() {
    const comment = {
      id: `c_${Date.now()}_${randomInt(0, 9999)}`,
      username: randomFrom(SAMPLE_USERNAMES),
      text: randomFrom(SAMPLE_COMMENTS),
      timestamp: Date.now(),
    };
    this.emit('comment', comment);
  }

  _emitFakeLike() {
    const increment = randomInt(1, 15);
    this.stats.likeCount += increment;
    this.emit('like', {
      username: randomFrom(SAMPLE_USERNAMES),
      increment,
      totalLikeCount: this.stats.likeCount,
    });
  }

  _emitFakeShare() {
    this.stats.shareCount += 1;
    this.emit('share', {
      username: randomFrom(SAMPLE_USERNAMES),
      totalShareCount: this.stats.shareCount,
    });
  }

  _emitFakeGiftOrPurchase() {
    const isPurchase = Math.random() < 0.45; // 45% kemungkinan "purchase"

    if (isPurchase) {
      const product = randomFrom(SAMPLE_PRODUCTS);
      this.emit('purchase', {
        id: `purchase_${Date.now()}`,
        username: randomFrom(SAMPLE_USERNAMES),
        product,
        qty: randomInt(1, 3),
        timestamp: Date.now(),
      });
    } else {
      const gift = randomFrom(SAMPLE_GIFTS);
      const repeatCount = randomInt(1, 5);
      this.emit('gift', {
        id: `gift_${Date.now()}`,
        username: randomFrom(SAMPLE_USERNAMES),
        gift,
        repeatCount,
        totalCoinValue: gift.coinValue * repeatCount,
        timestamp: Date.now(),
      });
    }
  }

  _emitViewerFluctuation() {
    const delta = randomInt(-8, 12);
    this.stats.viewerCount = Math.max(10, this.stats.viewerCount + delta);
    this.emit('viewerCount', { count: this.stats.viewerCount });
  }

  _emitProductPin() {
    const product = randomFrom(SAMPLE_PRODUCTS);
    this.emit('productPin', { product, pinnedAt: Date.now() });
  }

  // ---- Mode live: koneksi TikTok asli via tiktok-live-connector + Euler Stream ----
  //
  // Butuh:
  //   1. npm install tiktok-live-connector (sudah ada di package.json)
  //   2. EULER_SIGN_API_KEY di .env / Railway Variables (dari eulerstream.com)
  //   3. Username yang dipantau HARUS sedang live saat ini
  //
  // Pakai dynamic import() karena tiktok-live-connector adalah paket ESM —
  // ini tetap aman dipanggil dari project CommonJS seperti project kita.
  async _connectRealTikTok(uniqueId) {
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');

    const connection = new TikTokLiveConnection(uniqueId, {
      signApiKey: process.env.EULER_SIGN_API_KEY,
      enableExtendedGiftInfo: true, // biar dapat info harga/diamond gift
    });

    this._liveConnection = connection;

    let state;
    try {
      state = await connection.connect();
    } catch (err) {
      this.connected = false;
      this._liveConnection = null;
      const isOffline = /offline|not.*live|UserOfflineError/i.test(err?.name + ' ' + err?.message);
      throw new Error(
        isOffline
          ? `@${uniqueId} sedang tidak live sekarang. Pastikan host sudah mulai live TikTok dulu, baru tekan "Mulai Pantau".`
          : `Gagal connect ke TikTok: ${err.message}`
      );
    }

    this.connected = true;
    this.roomId = state.roomId;
    this.emit('connected', { roomId: state.roomId, uniqueId, mode: 'live' });

    connection.on(ControlEvent.ERROR, ({ info, exception }) => {
      console.error('TikTok live error:', info, exception?.message || '');
    });

    connection.on(ControlEvent.DISCONNECTED, ({ code, reason } = {}) => {
      console.log('TikTok live disconnected', code, reason || '');
      this.connected = false;
      this.emit('streamEnd', { roomId: this.roomId });
    });

    connection.on(WebcastEvent.CHAT, (data) => {
      this.emit('comment', {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        username: data.user?.uniqueId || data.user?.nickname || 'unknown',
        text: data.comment || '',
        timestamp: Date.now(),
      });
    });

    connection.on(WebcastEvent.GIFT, (data) => {
      // Gift streak (giftType 1) emit event berulang sampai selesai —
      // kita tunggu sampai repeatEnd biar gak spam notifikasi tiap detik.
      if (data.giftDetails?.giftType === 1 && !data.repeatEnd) return;

      const coinValue = data.extendedGiftInfo?.diamond_count || 0;
      const repeatCount = data.repeatCount || 1;

      this.emit('gift', {
        id: `gift_${data.msgId || Date.now()}`,
        username: data.user?.uniqueId || 'unknown',
        gift: {
          name: data.giftDetails?.giftName || 'Gift',
          coinValue,
          icon: '🎁',
        },
        repeatCount,
        totalCoinValue: coinValue * repeatCount,
        timestamp: Date.now(),
      });
    });

    connection.on(WebcastEvent.LIKE, (data) => {
      this.stats.likeCount = data.totalLikeCount ?? this.stats.likeCount;
      this.emit('like', {
        username: data.user?.uniqueId || 'unknown',
        increment: data.likeCount || 0,
        totalLikeCount: this.stats.likeCount,
      });
    });

    connection.on(WebcastEvent.SHARE, (data) => {
      this.stats.shareCount += 1;
      this.emit('share', {
        username: data.user?.uniqueId || 'unknown',
        totalShareCount: this.stats.shareCount,
      });
    });

    connection.on(WebcastEvent.ROOM_USER, (data) => {
      this.stats.viewerCount = data.viewerCount ?? this.stats.viewerCount;
      this.emit('viewerCount', { count: this.stats.viewerCount });
    });

    connection.on(WebcastEvent.STREAM_END, () => {
      this.disconnect();
    });
  }
}

module.exports = TikTokConnector;
