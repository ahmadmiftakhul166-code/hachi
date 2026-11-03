// HaChi: chat + foto + video + VN, dengan ruang (room) lewat kode/QR. Tanpa npm install.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const UP = path.join(__dirname, 'uploads'); fs.mkdirSync(UP, { recursive: true });
const MAX = 200 * 1024 * 1024, HF = path.join(__dirname, 'history.json');
let rooms = {}; try { rooms = JSON.parse(fs.readFileSync(HF, 'utf8')); } catch {}
if (Array.isArray(rooms) || typeof rooms !== 'object') rooms = {};
const clients = {};
const okRoom = r => /^[a-z0-9]{4,32}$/.test(r || '');
const save = () => fs.writeFile(HF, JSON.stringify(rooms), () => {});
const send = (room, m) => { const h = rooms[room] = rooms[room] || []; h.push(m); if (h.length > 500) h.shift(); save();
  (clients[room] || []).forEach(r => r.write('data: ' + JSON.stringify(m) + '\n\n')); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/events') {
    const room = (u.searchParams.get('room') || '').toLowerCase();
    if (!okRoom(room)) { res.writeHead(400); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    (rooms[room] || []).forEach(m => res.write('data: ' + JSON.stringify(m) + '\n\n'));
    (clients[room] = clients[room] || new Set()).add(res);
    const ka = setInterval(() => res.write(': ka\n\n'), 20000);
    return req.on('close', () => { clients[room].delete(res); clearInterval(ka); });
  }
  if (u.pathname === '/text' && req.method === 'POST') {
    let b = ''; req.on('data', d => { if (b.length < 20000) b += d; }); return req.on('end', () => {
      try { const j = JSON.parse(b), room = String(j.room).toLowerCase(); if (okRoom(room))
        send(room, { id: crypto.randomUUID(), from: String(j.from).slice(0, 30), kind: 'text', text: String(j.text).slice(0, 5000), t: Date.now() }); } catch {}
      res.end('ok'); });
  }
  if (u.pathname === '/file' && req.method === 'POST') {
    const room = String(req.headers['x-room'] || '').toLowerCase();
    if (!okRoom(room)) { res.writeHead(400); return res.end(); }
    const name = path.basename(decodeURIComponent(req.headers['x-name'] || 'file'));
    const id = crypto.randomUUID(), fn = id + '_' + name, ws = fs.createWriteStream(path.join(UP, fn));
    let size = 0, dead = false;
    req.on('data', d => { size += d.length; if (size > MAX && !dead) { dead = true; req.destroy(); ws.destroy(); fs.unlink(path.join(UP, fn), () => {}); } });
    req.pipe(ws); return ws.on('finish', () => { if (dead) return;
      const type = req.headers['content-type'] || '';
      const kind = req.headers['x-kind'] === 'voice' ? 'voice' : type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : 'file';
      send(room, { id, from: String(decodeURIComponent(req.headers['x-from'] || '?')).slice(0, 30), kind, name, url: '/u/' + encodeURIComponent(fn), t: Date.now() });
      res.end('ok'); });
  }
  if (u.pathname.startsWith('/u/')) {
    const fp = path.join(UP, path.basename(decodeURIComponent(u.pathname.slice(3))));
    fs.stat(fp, (e, st) => { if (e) { res.writeHead(404); return res.end(); }
      const rg = req.headers.range, ext = path.extname(fp).toLowerCase();
      const ct = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4a': 'audio/mp4', '.webm': 'audio/webm' }[ext] || 'application/octet-stream';
      if (rg) { const [s, en] = rg.replace('bytes=', '').split('-'); const a = +s, z = en ? +en : st.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${a}-${z}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': z - a + 1, 'Content-Type': ct });
        fs.createReadStream(fp, { start: a, end: z }).pipe(res);
      } else { res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': ct, 'Accept-Ranges': 'bytes' }); fs.createReadStream(fp).pipe(res); } });
    return;
  }
  const f = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  const fp = path.join(__dirname, 'public', path.basename(f));
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.json': 'application/manifest+json' }[path.extname(fp)] || 'text/plain' }); res.end(d); });
}).listen(PORT, '0.0.0.0', () => console.log('HaChi jalan di port ' + PORT));
