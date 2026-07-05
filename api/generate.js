// Vercel Serverless Function — génération via TON Soul (Anaelle 2.0), côté serveur.
// La clé Higgsfield reste dans les variables d'environnement Vercel, jamais dans le HTML.
import { higgsfield } from '@higgsfield/client/v2';

export const config = { maxDuration: 60 };

// --- Réglages (surchargeable via variables d'env Vercel) ---
// Endpoint du modèle SOUL : c'est le SEUL modèle qui accepte un Soul entraîné.
const ENDPOINT = process.env.HF_ENDPOINT || '/v1/text2image/soul';
// Ton Soul "Anaelle 2.0" (l'ID que tu m'as donné). Mets-le plutôt en variable d'env HF_SOUL_ID.
const SOUL_ID  = process.env.HF_SOUL_ID  || '77227054-5967-422b-87af-43e4c388fabe';
// Qualité max du modèle Soul = 1080p (il n'y a pas de palier "2k" ici).
const QUALITY  = process.env.HF_QUALITY  || '1080p';
const BATCH    = Number(process.env.HF_BATCH || 1);        // 1 ou 4
const STRENGTH = Number(process.env.HF_SOUL_STRENGTH || 1); // fidélité au Soul (0..1)

// Ratio -> dimensions réelles supportées par le modèle Soul.
// 9:16 exact = 1152x2048 (~2K de haut). C'est le plus proche de ton "2k / 9:16".
function sizeFor(aspect) {
  if (process.env.HF_SIZE) return process.env.HF_SIZE; // force globale si tu veux
  switch (aspect) {
    case '9:16': return '1152x2048'; // stories / reels (9:16, ~2K)
    case '4:5':
    case '3:4':  return '1536x2048'; // posts feed (portrait proche 4:5)
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
  if (!process.env.HF_CREDENTIALS && !process.env.HF_API_KEY) {
    res.status(500).json({ error: 'HF_CREDENTIALS non configurée sur Vercel' }); return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { prompt, aspect_ratio = '9:16', seed } = body;
    if (!prompt || prompt.length < 10) { res.status(400).json({ error: 'Prompt manquant' }); return; }

    const jobSet = await higgsfield.subscribe(ENDPOINT, {
      input: {
        prompt,                                   // <-- prompt propre (rien à ajouter dedans)
        width_and_height: sizeFor(aspect_ratio),  // 9:16 -> 1152x2048
        quality: QUALITY,                         // '1080p'
        batch_size: BATCH,                        // 1
        custom_reference_id: SOUL_ID,             // <-- TON SOUL va ICI (pas "soul_id")
        custom_reference_strength: STRENGTH,      // 1 = fidélité max au visage
        enhance_prompt: true,
        ...(seed ? { seed } : {})
      },
      withPolling: true,
    });

    const url = extractUrl(jobSet);
    if (!url) { res.status(502).json({ error: 'Aucune image renvoyée par Higgsfield' }); return; }
    res.status(200).json({ url });
  } catch (e) {
    const msg = (e && e.message) ? e.message : 'Échec de génération';
    const code = /auth|credential/i.test(msg) ? 401 : /credit/i.test(msg) ? 402 : 500;
    res.status(code).json({ error: msg });
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
