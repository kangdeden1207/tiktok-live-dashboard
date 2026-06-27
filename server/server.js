// server/server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const apiRoutes = require('./routes/api');
const registerSocketHandlers = require('./sockets/socketHandler');
const { initRedis } = require('./config/redis');
const { initSupabase } = require('./config/supabase');

const PORT = process.env.PORT || 3000;

// ---- Init koneksi eksternal (graceful: app tetap jalan walau gagal) ----
initRedis();
initSupabase();

// ---- App & server setup ----
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }, // longgarkan untuk development; ketatkan saat production
});

app.use(express.json());
app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback ke index.html (single page dashboard)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---- Socket.io wiring ----
registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`🚀 TikTok Live Dashboard jalan di http://localhost:${PORT}`);
  console.log(`   Mode TikTok connector: ${process.env.TIKTOK_MODE || 'simulation'}`);
});
