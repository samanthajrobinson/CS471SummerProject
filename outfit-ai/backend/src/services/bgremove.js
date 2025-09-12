// backend/src/services/bgremove.js
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

export async function removeBackgroundFile(absInputPath, outDir) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error('Missing REMOVE_BG_API_KEY');

  const form = new FormData();
  form.append('image_file', fs.createReadStream(absInputPath));
  form.append('size', 'auto');   // keep largest
  form.append('format', 'png');  // transparent output

  const url = 'https://api.remove.bg/v1.0/removebg';
  const resp = await axios.post(url, form, {
    headers: { ...form.getHeaders(), 'X-Api-Key': apiKey },
    responseType: 'arraybuffer',
    timeout: 60000
  });

  // output filename: <original-basename>.no-bg.png
  const base = path.parse(absInputPath).name;
  const outName = `${base}.no-bg.png`;
  const outPath = path.join(outDir, outName);

  fs.writeFileSync(outPath, resp.data);
  return { outPath, outName };
}
