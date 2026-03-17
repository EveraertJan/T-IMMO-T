const express = require('express');
const path    = require('path');
const db      = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/listings/matched',   (req, res) => res.json(db.getMatched()));
app.get('/api/listings/all',       (req, res) => res.json(db.getAll()));
app.get('/api/listings/dismissed', (req, res) => res.json(db.getDismissed()));

app.patch('/api/listings', (req, res) => {
  const { vendor, id, field, value } = req.body;
  if (!vendor || !id || !field) return res.status(400).json({ error: 'vendor, id and field required' });
  try {
    db.updateListing(vendor, id, field, value ?? null);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/listings/dismiss', (req, res) => {
  const { vendor, id } = req.body;
  if (!vendor || !id) return res.status(400).json({ error: 'vendor and id required' });
  db.dismiss(vendor, id);
  res.json({ ok: true });
});
app.get('/api/whatsapp-qr', (req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'data', 'whatsapp-qr.png'),
    err => { if (err) res.status(404).end(); }
  );
});

function start(port = process.env.PORT || 3000) {
  app.listen(port, () => console.log(`[server] http://localhost:${port}`));
}

module.exports = { start };
