// public/js/app.js
// Komponen Alpine.js utama untuk dashboard. Semua state UI hidup di sini,
// dan disinkronkan secara real-time lewat Socket.io ke backend.

document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => ({
    // ---- State koneksi & sesi ----
    socket: null,
    connected: false,
    uniqueIdInput: '',
    connectionMode: 'simulation',
    sessionStatusText: 'Belum ada sesi aktif.',

    // ---- Stats ----
    viewerCount: 0,
    likeCount: 0,
    shareCount: 0,

    // ---- Comments & filter ----
    comments: [],
    filterKeywords: [],
    newKeywordInput: '',
    MAX_COMMENTS_RENDERED: 80,

    // ---- Notifications (gift/purchase pop-up) ----
    notifications: [],
    _notifId: 0,

    // ---- Product pin ----
    pinnedProduct: null,
    pinnedHistory: [],

    init() {
      this.socket = io(); // connect ke server yang sama (same-origin)
      this._bindSocketEvents();
    },

    _bindSocketEvents() {
      const s = this.socket;

      s.on('connect', () => {
        console.log('Socket terhubung ke server:', s.id);
      });

      s.on('connector:status', (data) => {
        this.connected = data.connected;
        if (data.stats) {
          this.viewerCount = data.stats.viewerCount || 0;
          this.likeCount = data.stats.likeCount || 0;
          this.shareCount = data.stats.shareCount || 0;
        }
      });

      s.on('session:connected', () => {
        this.connected = true;
        this.sessionStatusText = `Sesi aktif sejak ${this.formatTime(Date.now())}`;
      });

      s.on('session:ended', () => {
        this.connected = false;
        this.sessionStatusText = 'Sesi dihentikan.';
      });

      s.on('session:error', (err) => {
        this.sessionStatusText = `Gagal konek: ${err.message}`;
      });

      // Backlog komentar saat pertama kali load (kalau sesi sudah berjalan)
      s.on('comment:backlog', (backlog) => {
        this.comments = backlog.slice().reverse();
      });

      s.on('comment:new', (comment) => {
        this.comments.unshift(comment);
        if (this.comments.length > this.MAX_COMMENTS_RENDERED) {
          this.comments.pop();
        }
      });

      s.on('stats:like', (data) => {
        this.likeCount = data.totalLikeCount;
      });

      s.on('stats:share', (data) => {
        this.shareCount = data.totalShareCount;
      });

      s.on('stats:viewer', (data) => {
        this.viewerCount = data.count;
      });

      s.on('filter:list', (keywords) => {
        this.filterKeywords = keywords;
      });

      s.on('product:pinned', (data) => {
        if (this.pinnedProduct) {
          this.pinnedHistory.unshift(this.pinnedProduct);
          if (this.pinnedHistory.length > 6) this.pinnedHistory.pop();
        }
        this.pinnedProduct = data.product;
      });

      s.on('notification:gift', (data) => {
        this._pushNotification({
          type: 'gift',
          icon: data.gift.icon || '🎁',
          title: `${data.username} kirim ${data.gift.name} x${data.repeatCount}`,
          subtitle: `≈ ${data.totalCoinValue.toLocaleString('id-ID')} coin`,
        });
      });

      s.on('notification:purchase', (data) => {
        this._pushNotification({
          type: 'purchase',
          icon: '🛒',
          title: `${data.username} checkout ${data.product.name}`,
          subtitle: `${data.qty}x • ${this.formatPrice(data.product.price * data.qty)}`,
        });
      });
    },

    // ---- Actions: session control ----
    startSession() {
      if (this.connectionMode === 'live' && !this.uniqueIdInput.trim()) {
        this.sessionStatusText = 'Isi username TikTok dulu buat mode Live.';
        return;
      }
      this.socket.emit('session:start', {
        uniqueId: this.uniqueIdInput || 'demo_user',
        mode: this.connectionMode,
      });
    },

    stopSession() {
      this.socket.emit('session:stop');
    },

    // ---- Actions: keyword filter ----
    addFilterKeyword() {
      const kw = this.newKeywordInput.trim();
      if (!kw) return;
      this.socket.emit('filter:add', kw);
      this.newKeywordInput = '';
    },

    removeFilterKeyword(kw) {
      this.socket.emit('filter:remove', kw);
    },

    // ---- Notification helper (auto-dismiss) ----
    _pushNotification(payload) {
      const id = ++this._notifId;
      this.notifications.push({ id, ...payload });
      setTimeout(() => {
        this.notifications = this.notifications.filter((n) => n.id !== id);
      }, 5000);
    },

    // ---- Formatters ----
    formatPrice(value) {
      return 'Rp' + Number(value || 0).toLocaleString('id-ID');
    },

    formatTime(ts) {
      const d = new Date(ts);
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
  }));
});
