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

  // ---- Mode live (placeholder, siap dikembangkan) ----
  //
  // Untuk pakai koneksi live TikTok asli:
  //   1. npm install tiktok-live-connector
  //   2. set TIKTOK_MODE=live di .env
  //   3. isi logic di bawah ini (sudah disiapkan strukturnya)
  //
  // Contoh wiring (di-nonaktifkan secara default karena butuh
  // package tambahan & koneksi keluar ke server TikTok):
  //
  // async _connectRealTikTok(uniqueId) {
  //   const { WebcastPushConnection } = require('tiktok-live-connector');
  //   const tiktokLive = new WebcastPushConnection(uniqueId);
  //
  //   const state = await tiktokLive.connect();
  //   this.connected = true;
  //   this.roomId = state.roomId;
  //   this.emit('connected', { roomId: state.roomId, uniqueId, mode: 'live' });
  //
  //   tiktokLive.on('chat', (data) => {
  //     this.emit('comment', {
  //       id: data.msgId,
  //       username: data.uniqueId,
  //       text: data.comment,
  //       timestamp: Date.now(),
  //     });
  //   });
  //
  //   tiktokLive.on('gift', (data) => {
  //     this.emit('gift', {
  //       id: `${data.msgId}`,
  //       username: data.uniqueId,
  //       gift: { name: data.giftName, coinValue: data.diamondCount, icon: '🎁' },
  //       repeatCount: data.repeatCount,
  //       totalCoinValue: data.diamondCount * data.repeatCount,
  //       timestamp: Date.now(),
  //     });
  //   });
  //
  //   tiktokLive.on('like', (data) => {
  //     this.stats.likeCount = data.totalLikeCount;
  //     this.emit('like', {
  //       username: data.uniqueId,
  //       increment: data.likeCount,
  //       totalLikeCount: data.totalLikeCount,
  //     });
  //   });
  //
  //   tiktokLive.on('roomUser', (data) => {
  //     this.emit('viewerCount', { count: data.viewerCount });
  //   });
  //
  //   tiktokLive.on('share', (data) => {
  //     this.emit('share', { username: data.uniqueId, totalShareCount: data.totalShareCount });
  //   });
  //
  //   tiktokLive.on('streamEnd', () => this.disconnect());
  // }
  async _connectRealTikTok(uniqueId) {
    console.warn(
      '⚠️  Mode "live" belum diaktifkan. Install `tiktok-live-connector` lalu ' +
      'lengkapi implementasi di server/services/tiktokConnector.js (_connectRealTikTok). ' +
      'Fallback ke mode simulasi untuk sekarang.'
    );
    return this._connectSimulation(uniqueId);
  }
}

module.exports = TikTokConnector;
