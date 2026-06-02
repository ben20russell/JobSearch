import http from 'node:http';

const PORT = Number(process.env.PORT || 4173);
const HOST = '127.0.0.1';

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Job Search Agent Dev Server</title>
    <style>
      body { font-family: ui-sans-serif, system-ui; padding: 24px; background: #fafafa; color: #222; }
      .card { max-width: 760px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Job Search Agent</h1>
      <p>Use <code>npm run start</code> to refresh <code>data/agency_leads.csv</code>.</p>
    </div>
  </body>
</html>`;

const server = http.createServer((_, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
});

server.listen(PORT, HOST, () => {
  console.log(`Local:   http://${HOST}:${PORT}/`);
  console.log(`Network: http://192.168.1.140:${PORT}/`);
});
