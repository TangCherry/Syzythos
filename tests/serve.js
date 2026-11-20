const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (pathname === '/supabase-config.js' && request.headers['x-muscules-playwright'] === '1') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/javascript; charset=utf-8'
    });
    response.end('window.MUSCULES_SUPABASE_CONFIG = Object.freeze({});');
    return;
  }
  if (pathname === '/__tests__/supabase-mock.js' && request.headers['x-muscules-playwright'] === '1') {
    fs.readFile(path.join(__dirname, 'supabase-mock.js'), (error, content) => {
      if (error) {
        response.writeHead(500).end();
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/javascript; charset=utf-8'
      });
      response.end(content);
    });
    return;
  }
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
      return;
    }
    let responseContent = content;
    if (path.extname(filePath) === '.html'
      && request.headers['x-muscules-playwright'] === '1'
      && pathname !== '/combate-qa.html') {
      responseContent = content.toString('utf8').replace(
        '</head>',
        '<script src="/__tests__/supabase-mock.js"></script></head>'
      );
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    response.end(responseContent);
  });
});

server.listen(port, '127.0.0.1');
