// Vercel Serverless Function — génération via TON Soul (Anaelle 2.0).
// IMPORTANT : on utilise le client v1 (client.generate), car l'endpoint Soul
// exige un corps { params: {...} }. Le client v2 (subscribe) envoie à plat
// -> c'est ce qui provoquait l'erreur "body.params: Field required".
import { HiggsfieldClient } from '@higgsfield/client';

export const config = { maxDuration: 60 };

// --- Identifiants : accepte HF_API_KEY/HF_API_SECRET, ou HF_CREDENTIALS = "KEY_ID:KEY_SECRET" ---
function getCreds() {
  if (process.env.HF_API_KEY && process.env.HF_API_SECRET) {
    return { apiKey: process.env.HF_API_KEY, apiSecret: process.env.HF_API_SECRET };
  }
  const c = process.env.HF_CREDENTIALS || '';
  const i = c.indexOf(':');
  if (i === -1) return { apiKey: '', apiSecret: '' };
  return { apiKey: c.slice(0, i), apiSecret: c.slice(i + 1) };
}

// --- Réglages (surchargeables via variables d'env) ---
const SOUL_ID  = process.env.HF_SOUL_ID  || '77227054-5967-422b-87af-43e4c388fabe';
const QUALITY  = process.env.HF_QUALITY  || '1080p';           // max du modèle Soul (pas de "2k")
const BATCH    = Number(process.env.HF_BATCH || 1);            // 1 ou 4
const STRENGTH = Number(process.env.HF_SOUL_STRENGTH || 1);    // fidélité au visage (0..1)

// Ratio -> dimensions réelles supportées par le modèle Soul.
// 9:16 exact = 1152x2048 (~2K de haut) : le plus proche de ton "2k / 9:16".
function sizeFor(aspect) {
  if (process.env.HF_SIZE) return process.env.HF_SIZE;
  switch (aspect) {
    case '9:16': return '1152x2048';
    case '4:5':
    case '3:4':  return '1536x2048';
    case '1:1':  return '1536x1536';
    case '16:9': return '2048x1152';
    default:     return '1152x2048';
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { apiKey, apiSecret } = getCreds();
  if (!apiKey || !apiSecret) {
    res.status(500).json({ error: 'HF_CREDENTIALS (KEY_ID:KEY_SECRET) non configurée sur Vercel' }); return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { prompt, aspect_ratio = '9:16', seed } = body;
    if (!prompt || prompt.length < 10) { res.status(400).json({ error: 'Prompt manquant' }); return; }

    const client = new HiggsfieldClient({ apiKey, apiSecret });

    // client.generate() enveloppe automatiquement en { params: {...} }
    const jobSet = await client.generate('/v1/text2image/soul', {
      prompt,                                     // prompt propre (rien à ajouter)
      width_and_height: sizeFor(aspect_ratio),    // 9:16 -> 1152x2048
      quality: QUALITY,                           // '1080p'
      batch_size: BATCH,                          // 1
      custom_reference_id: SOUL_ID,               // TON Soul (Anaelle 2.0)
      custom_reference_strength: STRENGTH,        // 1 = fidélité max
      ...(seed ? { seed: Number(seed) } : {})
    }, { withPolling: true });

    const url = extractUrl(jobSet);
    if (!url) { res.status(502).json({ error: 'Aucune image renvoyée par Higgsfield' }); return; }
    res.status(200).json({ url });
  } catch (e) {
    const msg = (e && (e.detail || e.message)) ? (e.detail || e.message) : 'Échec de génération';
    const code = /auth|credential/i.test(String(msg)) ? 401 : /credit/i.test(String(msg)) ? 402 : 500;
    res.status(code).json({ error: String(msg) });
  }
}

function extractUrl(js) {
  try {
    const j = js && js.jobs && js.jobs[0];
    if (j && j.results) {
      if (j.results.raw && j.results.raw.url) return j.results.raw.url;
      if (j.results.min && j.results.min.url) return j.results.min.url;
    }
    const s = JSON.stringify(js);
    const m = s.match(/https?:\/\/[^"']+\.(?:png|jpg|jpeg|webp)/i);
    return m ? m[0] : null;
  } catch { return null; }
}
