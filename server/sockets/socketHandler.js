// server/sockets/socketHandler.js
// Menjembatani: TikTokConnector (sumber data) <----> Socket.io clients (dashboard)
// Semua client yang connect ke server akan menerima broadcast yang sama,
// supaya admin/host bisa pantau dari beberapa device sekaligus.

const TikTokConnector = require('../services/tiktokConnector');
const CommentFilter = require('../services/commentFilter');
const { logEvent } = require('../config/supabase');
const { setValue, incr } = require('../config/redis');

const DEFAULT_KEYWORDS = ['spill', 'diskon', 'ready'];

function registerSocketHandlers(io) {
  const connector = new TikTokConnector();
  const commentFilter = new CommentFilter(DEFAULT_KEYWORDS);

  let sessionId = null;
  let recentComments = []; // buffer kecil untuk client yang baru join
  const MAX_BUFFER = 30;

  // ---- Wiring: connector -> semua client ----

  connector.on('connected', (data) => {
    sessionId = data.roomId;
    io.emit('session:connected', data);
    logEvent(sessionId, 'session_start', data);
  });

  connector.on('comment', (comment) => {
    const enriched = commentFilter.enrich(comment);
    recentComments.push(enriched);
    if (recentComments.length > MAX_BUFFER) recentComments.shift();
    io.emit('comment:new', enriched);
  });

  connector.on('like', (data) => {
    setValue('stats:likeCount', data.totalLikeCount);
    io.emit('stats:like', data);
  });

  connector.on('share', (data) => {
    setValue('stats:shareCount', data.totalShareCount);
    io.emit('stats:share', data);
  });

  connector.on('viewerCount', (data) => {
    setValue('stats:viewerCount', data.count);
    io.emit('stats:viewer', data);
  });

  connector.on('gift', (data) => {
    io.emit('notification:gift', data);
    incr('counter:totalGifts');
    logEvent(sessionId, 'gift', data);
  });

  connector.on('purchase', (data) => {
    io.emit('notification:purchase', data);
    incr('counter:totalPurchases');
    logEvent(sessionId, 'purchase', data);
  });

  connector.on('productPin', (data) => {
    io.emit('product:pinned', data);
  });

  connector.on('streamEnd', (data) => {
    io.emit('session:ended', data);
    logEvent(sessionId, 'session_end', data);
    recentComments = [];
  });

  // ---- Wiring: client -> server ----

  io.on('connection', (socket) => {
    console.log('🔌 Client terhubung:', socket.id);

    // Kirim state awal ke client yang baru join (filter aktif + buffer komentar)
    socket.emit('filter:list', commentFilter.getKeywords());
    socket.emit('comment:backlog', recentComments);
    socket.emit('connector:status', {
      connected: connector.connected,
      stats: connector.stats,
    });

    // Admin menekan tombol "Mulai Pantau" di dashboard
    socket.on('session:start', async ({ uniqueId, mode }) => {
      try {
        await connector.connect(uniqueId || 'demo_user', { mode: mode || 'simulation' });
      } catch (err) {
        socket.emit('session:error', { message: err.message });
      }
    });

    socket.on('session:stop', () => {
      connector.disconnect();
    });

    // Admin tambah/hapus keyword filter dari UI
    socket.on('filter:add', (keyword) => {
      const updated = commentFilter.addKeyword(keyword);
      io.emit('filter:list', updated);
    });

    socket.on('filter:remove', (keyword) => {
      const updated = commentFilter.removeKeyword(keyword);
      io.emit('filter:list', updated);
    });

    socket.on('disconnect', () => {
      console.log('❌ Client putus:', socket.id);
    });
  });
}

module.exports = registerSocketHandlers;
