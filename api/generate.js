import { higgsfield } from '@higgsfield/client/v2';

export const config = { maxDuration: 60 };

// On définit Nano Banana Pro comme modèle par défaut
const MODEL = process.env.HF_IMAGE_MODEL || 'nano-banana-pro';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!process.env.HF_CREDENTIALS && !process.env.HF_API_KEY) {
    res.status(500).json({ error: 'HF_CREDENTIALS non configurée sur le serveur' }); return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { prompt, seed } = body;
    if (!prompt || prompt.length < 10) { res.status(400).json({ error: 'Prompt manquant' }); return; }

    // Injection de tes paramètres spécifiques dans la requête Higgsfield
    const jobSet = await higgsfield.subscribe(MODEL, {
      input: { 
        prompt: prompt + " unlimited -2k", // Ajoute automatiquement tes instructions de qualité
        aspect_ratio: '9:16',              // Force le format vertical
        safety_tolerance: 2, 
        soul_id: 'TON_SOUL_ID_ICI',        // Remplace par la vraie chaîne de caractères de ton Soul
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
