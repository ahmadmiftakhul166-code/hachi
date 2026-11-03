// HaChi: chat + foto + video + VN. Tanpa npm install, cukup Node.js.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const UP = path.join(__dirname, 'uploads'); fs.mkdirSync(UP, { recursive: true });
const MAX = 200 * 1024 * 1024;
let history = [], clients = new Set();
const send = (m) => { history.push(m); if (history.length > 500) history.shift();
  clients.forEach(r => r.write('data: ' + JSON.stringify(m) + '\n\n')); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    history.forEach(m => res.write('data: ' + JSON.stringify(m) + '\n\n'));
    clients.add(res); const ka = setInterval(() => res.write(': ka\n\n'), 20000);
    return req.on('close', () => { clients.delete(res); clearInterval(ka); });
  }
  if (u.pathname === '/text' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); return req.on('end', () => {
      try { const j = JSON.parse(b); send({ id: crypto.randomUUID(), from: String(j.from).slice(0, 30), kind: 'text', text: String(j.text).slice(0, 5000), t: Date.now() }); } catch {}
      res.end('ok'); });
  }
  if (u.pathname === '/file' && req.method === 'POST') {
    const name = path.basename(decodeURIComponent(req.headers['x-name'] || 'file'));
    const id = crypto.randomUUID(), fn = id + '_' + name, ws = fs.createWriteStream(path.join(UP, fn));
    let size = 0, dead = false;
    req.on('data', d => { size += d.length; if (size > MAX && !dead) { dead = true; req.destroy(); ws.destroy(); fs.unlink(path.join(UP, fn), () => {}); } });
    req.pipe(ws); return ws.on('finish', () => { if (dead) return;
      const type = req.headers['content-type'] || '';
      const kind = req.headers['x-kind'] === 'voice' ? 'voice' : type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : 'file';
      send({ id, from: String(decodeURIComponent(req.headers['x-from'] || '?')).slice(0, 30), kind, name, url: '/u/' + encodeURIComponent(fn), t: Date.now() });
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
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.json': 'application/manifest+json' }[path.extname(fp)] || 'text/plain' }); res.end(d); });
}).listen(PORT, '0.0.0.0', () => {
  console.log('\nHaChi jalan! Buka link ini di kedua HP:');
  Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal)
    .forEach(i => console.log('  http://' + i.address + ':' + PORT));
  console.log('');
});
