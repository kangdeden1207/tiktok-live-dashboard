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
// MODE "live": connect langsung ke WebSocket gateway Euler Stream
// (wss://ws.eulerstream.com) pakai API key dari eulerstream.com. Struktur
// event yang di-emit SAMA dengan mode simulasi, jadi frontend tidak perlu
// diubah sama sekali.

const EventEmitter = require('events');
const WebSocket = require('ws');

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
    if (this._liveSocket) {
      try {
        this._liveSocket.close(1000);
      } catch {
        // diam-diam, koneksi mungkin sudah tertutup
      }
      this._liveSocket = null;
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

  // ---- Mode live: koneksi TikTok asli via WebSocket gateway Euler Stream ----
  //
  // Kita connect LANGSUNG ke wss://ws.eulerstream.com (bukan lewat library
  // tiktok-live-connector lagi) — ini fitur "WebSocket Server" Euler Stream
  // yang sudah termasuk di plan Community (gratis), beda dari endpoint sign
  // request yang butuh plan Business. Detail: eulerstream.com/websockets
  //
  // Butuh:
  //   1. EULER_SIGN_API_KEY di .env / Railway Variables (dari eulerstream.com)
  //   2. Username yang dipantau HARUS sedang live saat ini
  async _connectRealTikTok(uniqueId) {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.EULER_SIGN_API_KEY;
      if (!apiKey) {
        reject(new Error('EULER_SIGN_API_KEY belum diset di Variables Railway.'));
        return;
      }

      const cleanId = uniqueId.replace(/^@/, '').trim();
      const wsUrl = `wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(cleanId)}&apiKey=${encodeURIComponent(apiKey)}`;
      const ws = new WebSocket(wsUrl);
      this._liveSocket = ws;

      let settled = false;

      ws.on('open', () => {
        this.connected = true;
        this.roomId = `live_${cleanId}`;
        this.emit('connected', { roomId: this.roomId, uniqueId: cleanId, mode: 'live' });
        if (!settled) {
          settled = true;
          resolve({ roomId: this.roomId });
        }
      });

      ws.on('message', (raw) => {
        let payload;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const messages = payload?.messages || (payload?.type ? [payload] : []);
        messages.forEach((msg) => this._handleEulerMessage(msg));
      });

      ws.on('close', (code, reasonBuf) => {
        this.connected = false;
        this._liveSocket = null;
        const reason = reasonBuf ? reasonBuf.toString() : '';
        if (!settled) {
          settled = true;
          reject(new Error(this._describeEulerCloseCode(code, cleanId, reason)));
          return;
        }
        console.log('TikTok live ws closed:', code, reason);
        this.emit('streamEnd', { roomId: this.roomId });
      });

      ws.on('error', (err) => {
        console.error('TikTok live ws error:', err.message);
        if (!settled) {
          settled = true;
          reject(new Error(`Gagal connect WebSocket: ${err.message}`));
        }
      });
    });
  }

  // Terjemahan kode penutupan WebSocket Euler Stream ke pesan yang dimengerti
  _describeEulerCloseCode(code, uniqueId, reason) {
    const map = {
      4404: `@${uniqueId} sedang tidak live sekarang. Pastikan host sudah mulai live, baru tekan "Mulai Pantau".`,
      4400: `Username "${uniqueId}" gak valid.`,
      4401: 'API key Euler Stream gak valid. Cek lagi EULER_SIGN_API_KEY di Railway Variables.',
      4403: 'API key gak punya izin akses ke username ini.',
      4429: 'Terlalu banyak koneksi atau connect terlalu cepat. Tunggu sebentar lalu coba lagi.',
      4555: 'Koneksi sudah lewat batas 8 jam, otomatis ditutup.',
      4556: 'Gagal fetch data webcast dari TikTok.',
      4557: 'Gagal fetch room info dari TikTok.',
      4500: 'TikTok menutup koneksi secara tidak terduga.',
      4005: 'Live stream sudah berakhir.',
      4006: 'Tidak ada aktivitas dari room, koneksi otomatis ditutup.',
    };
    return map[code] || `Gagal connect ke TikTok (code ${code})${reason ? ': ' + reason : ''}`;
  }

  // Pecah satu event JSON dari Euler Stream jadi event internal kita
  _handleEulerMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'chat':
        this.emit('comment', {
          id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          username: msg.user?.uniqueId || msg.user?.nickname || 'unknown',
          text: msg.comment || '',
          timestamp: Date.now(),
        });
        break;

      case 'gift': {
        const coinValue = msg.gift?.diamondCount || 0;
        const repeatCount = msg.gift?.repeatCount || 1;
        this.emit('gift', {
          id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          username: msg.user?.uniqueId || 'unknown',
          gift: { name: msg.gift?.name || 'Gift', coinValue, icon: '🎁' },
          repeatCount,
          totalCoinValue: msg.totalValue || coinValue * repeatCount,
          timestamp: Date.now(),
        });
        break;
      }

      case 'like':
        this.stats.likeCount = msg.totalLikes ?? this.stats.likeCount;
        this.emit('like', {
          username: msg.user?.uniqueId || 'unknown',
          increment: msg.likeCount || 0,
          totalLikeCount: this.stats.likeCount,
        });
        break;

      case 'share':
        this.stats.shareCount += 1;
        this.emit('share', {
          username: msg.user?.uniqueId || 'unknown',
          totalShareCount: this.stats.shareCount,
        });
        break;

      case 'member':
      case 'roomUser':
        if (typeof msg.viewerCount === 'number') {
          this.stats.viewerCount = msg.viewerCount;
          this.emit('viewerCount', { count: this.stats.viewerCount });
        }
        break;

      default:
        // event lain (follow, roomInfo, dll) — diamkan dulu, bisa dikembangkan nanti
        break;
    }
  }
}

module.exports = TikTokConnector;
