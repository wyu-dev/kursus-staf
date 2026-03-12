// api/simpan.js — Vercel Serverless Function
// Proxy: Browser → Vercel → GAS doPost
// Selesaikan: CORS + URL length limit

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, data, gasUrl } = req.body;

    if (!gasUrl || !action || !data) {
      return res.status(400).json({ ok: false, msg: 'Data tidak lengkap.' });
    }

    // Hantar terus ke GAS doPost sebagai JSON
    // GAS akan redirect sekali — node fetch handle redirect automatically
    const gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ action, ...data }),
      // Penting: ikut redirect yang GAS buat
      redirect: 'follow'
    });

    const responseText = await gasRes.text();

    // Cuba parse sebagai JSON
    try {
      const result = JSON.parse(responseText);
      return res.status(200).json(result);
    } catch {
      // Kalau bukan JSON, return error dengan teks asal untuk debug
      console.error('GAS response (non-JSON):', responseText.slice(0, 500));
      return res.status(200).json({
        ok: false,
        msg: 'GAS response tidak dijangka. Status: ' + gasRes.status,
        debug: responseText.slice(0, 200)
      });
    }

  } catch (err) {
    console.error('simpan.js error:', err);
    return res.status(500).json({ ok: false, msg: 'Server error: ' + err.message });
  }
}
