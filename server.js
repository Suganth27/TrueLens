const http = require('http');
const https = require('https');
const formidable = require('formidable');
const fs = require('fs');
const FormData = require('form-data');

const PORT = 3000;
const BITMIND_API_HOST = 'api.bitmind.ai';
const BITMIND_IMAGE_URL = '/oracle/v1/34/detect-image';
const BITMIND_VIDEO_URL = '/oracle/v1/34/detect-video';
const API_KEY = process.env.BITMIND_API_KEY || 'oracle-dc220854-d6f1-4282-92d6-55d4f9fac521:64b25953';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  // -------------------- IMAGE DETECTION --------------------
  if (req.method === 'POST' && req.url === '/api/detect') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const options = {
        hostname: BITMIND_API_HOST,
        path: BITMIND_IMAGE_URL,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const apiReq = https.request(options, apiRes => {
        let apiBody = '';
        apiRes.on('data', d => apiBody += d);
        apiRes.on('end', () => {
          res.writeHead(apiRes.statusCode || 200, { 'Content-Type': 'application/json' });
          try {
            const jsonData = JSON.parse(apiBody);
            // Ensure confidence is always a number
            if (!jsonData.confidence) jsonData.confidence = 0;
            res.end(JSON.stringify(jsonData));
          } catch (err) {
            res.end(JSON.stringify({ error: 'Invalid JSON from API', response: apiBody }));
          }
        });
      });

      apiReq.on('error', e => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });

      apiReq.write(body);
      apiReq.end();
    });
    return;
  }

  // -------------------- VIDEO DETECTION --------------------
  if (req.method === 'POST' && req.url === '/api/detect-video') {
    const form = new formidable.IncomingForm();
    form.parse(req, (err, fields, files) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      const videoFile = files.file || files.video;
      if (!videoFile) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No video file provided' }));
        return;
      }

      const filePath = videoFile.filepath || videoFile.path || videoFile.newFilename;
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid video file path', videoFile }));
        return;
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('startTime', fields.startTime || '0');
      formData.append('endTime', fields.endTime || '0');
      formData.append('fps', fields.fps || '24');
      formData.append('rich', fields.rich || 'false');

      const options = {
        hostname: BITMIND_API_HOST,
        path: BITMIND_VIDEO_URL,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'accept': 'application/json',
          ...formData.getHeaders()
        }
      };

      const apiReq = https.request(options, apiRes => {
        let apiBody = '';
        apiRes.on('data', d => apiBody += d);
        apiRes.on('end', () => {
          try {
            const jsonData = JSON.parse(apiBody);

            // ---- Ensure confidence is meaningful ----
            if (jsonData.predictions && Array.isArray(jsonData.predictions) && jsonData.predictions.length > 0) {
              // Take max value from predictions array for demo
              const maxConf = Math.max(...jsonData.predictions.map(p => Number(p) || 0));
              jsonData.confidence = maxConf;
            } else {
              jsonData.confidence = 0;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(jsonData));
          } catch (parseErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid API response', response: apiBody }));
          }
        });
      });

      apiReq.on('error', e => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });

      formData.pipe(apiReq);
    });
    return;
  }

  // 404 fallback
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log(`✅ Proxy running on http://localhost:${PORT}`));
