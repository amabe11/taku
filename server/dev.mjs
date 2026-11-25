// Servidor local que imita a Vercel para probar la API sin desplegar.
// Uso (PowerShell):  $env:MONGODB_URI="mongodb+srv://…"; $env:AHG_TEAM_KEY="clave"; npm run dev
// Uso (bash):        MONGODB_URI="mongodb+srv://…" AHG_TEAM_KEY="clave" npm run dev
import { createServer } from 'node:http';
import health from './api/health.js';
import sync from './api/sync.js';
import datos from './api/datos.js';
import alertas from './api/alertas.js';

const ROUTES = { '/api/health': health, '/api/sync': sync, '/api/datos': datos, '/api/alertas': alertas };
const PORT = Number(process.env.PORT || 3001);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const fn = ROUTES[url.pathname];
  // Adaptadores mínimos al estilo de Vercel: req.query, req.body, res.status().json()
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  req.query = Object.fromEntries(url.searchParams);
  if (!fn) return res.status(404).json({ error: 'Ruta no encontrada' });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { req.body = raw ? JSON.parse(raw) : undefined; } catch { return res.status(400).json({ error: 'JSON inválido' }); }
  await fn(req, res);
}).listen(PORT, () => console.log(`API local de Ahgora en http://localhost:${PORT}/api/health`));
