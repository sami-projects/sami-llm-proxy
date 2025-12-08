/**
 * Sami LLM Proxy Server
 * 
 * HTTP/HTTPS прокси-сервер для маршрутизации запросов к LLM провайдерам
 * 
 * AI-NOTE: [СОЗДАНО] Простой и воспроизводимый прокси-сервер для развертывания на любом сервере
 * Использует стандартный HTTP прокси протокол, совместимый с https-proxy-agent
 */

import http from 'http';
import https from 'https';
import net from 'net';
import { parse as parseUrl } from 'url';

// Конфигурация из переменных окружения
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || '0.0.0.0'; // AI-NOTE: 0.0.0.0 = слушать на всех интерфейсах (правильно для Docker)
const PROXY_AUTH_USERNAME = process.env.PROXY_AUTH_USERNAME;
const PROXY_AUTH_PASSWORD = process.env.PROXY_AUTH_PASSWORD;
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase(); // AI-NOTE: По умолчанию info
const ALLOWED_IPS = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [];

// Логирование
function log(level: 'info' | 'debug' | 'error', message: string, data?: any) {
  const levels: Record<string, number> = { error: 0, info: 1, debug: 2 };
  const currentLevel = levels[LOG_LEVEL] ?? levels['info']; // AI-NOTE: По умолчанию info, если LOG_LEVEL невалиден (LOG_LEVEL уже нормализован в lowercase)
  const messageLevel = levels[level] ?? 0;
  
  // AI-NOTE: [ИСПРАВЛЕНО] Логируем только если уровень сообщения <= текущему уровню
  // error (0) <= info (1) <= debug (2)
  // Пример: при LOG_LEVEL=info выводятся error (0) и info (1), но не debug (2)
  if (messageLevel <= currentLevel) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

// Проверка Basic Auth
function checkAuth(authHeader: string | undefined): boolean {
  if (!PROXY_AUTH_USERNAME || !PROXY_AUTH_PASSWORD) {
    return true; // Аутентификация не требуется
  }

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    return username === PROXY_AUTH_USERNAME && password === PROXY_AUTH_PASSWORD;
  } catch {
    return false;
  }
}

// Проверка разрешенных IP
function checkIP(clientIP: string): boolean {
  if (ALLOWED_IPS.length === 0) {
    return true; // Ограничений нет
  }

  // Извлекаем IP из строки (может быть "::ffff:192.168.1.1" для IPv6)
  const cleanIP = clientIP.replace(/^::ffff:/, '');
  return ALLOWED_IPS.includes(cleanIP) || ALLOWED_IPS.includes(clientIP);
}

// Функция для проксирования HTTP запроса
function proxyHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, targetUrl: string) {
  const parsedUrl = parseUrl(targetUrl);
  
  // AI-NOTE: [ЗАЩИТА ОТ ОШИБОК] Если порт 443, это всегда HTTPS, даже если протокол указан как http://
  // В нормальной работе HttpsProxyAgent использует CONNECT для HTTPS запросов (обрабатывается выше, строки 180-236)
  // Этот код нужен для:
  // 1. Защиты от неправильных URL (http://target:443) - исправляем на HTTPS
  // 2. HTTP запросов к серверам на порту 443 (редкий случай)
  // 3. Обеспечения безопасности - все данные к LLM должны быть зашифрованы
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80);
  const isHttps = parsedUrl.protocol === 'https:' || port === 443;
  const client = isHttps ? https : http;
  
  // AI-NOTE: Для HTTP прокси, path должен быть полным (включая query string)
  const path = parsedUrl.path || '/';
  const fullPath = parsedUrl.search ? `${path}${parsedUrl.search}` : path;
  
  // AI-NOTE: [ИСПРАВЛЕНО] Правильно определяем порт и host заголовок
  const finalPort = port || (isHttps ? 443 : 80);
  const hostHeader = parsedUrl.host || `${parsedUrl.hostname}:${finalPort}`;
  
  const options = {
    hostname: parsedUrl.hostname,
    port: finalPort,
    path: fullPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: hostHeader,
    }
  };

  // Удаляем заголовки прокси
  delete (options.headers as any)['proxy-authorization'];
  delete (options.headers as any)['proxy-connection'];
  delete (options.headers as any)['connection'];

  log('debug', 'Making proxy request', {
    hostname: options.hostname,
    port: options.port,
    path: options.path,
    method: options.method,
    isHttps
  });

  const proxyReq = client.request(options, (proxyRes) => {
    // Копируем статус и заголовки
    log('debug', 'Proxy response received', {
      statusCode: proxyRes.statusCode,
      headers: Object.keys(proxyRes.headers)
    });
    
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    log('error', 'Proxy request error', { 
      error: err.message, 
      targetUrl,
      code: (err as any).code,
      hostname: options.hostname,
      port: options.port
    });
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy error: ' + err.message);
    }
  });

  // Пересылаем тело запроса
  req.pipe(proxyReq);

  // Таймаут
  proxyReq.setTimeout(300000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Gateway Timeout');
    }
  });
}

  // Обработка запросов
  const server = http.createServer();
  
  // AI-NOTE: [КРИТИЧНО] Для CONNECT запросов Node.js использует специальное событие 'connect'
  // Это событие вызывается ДО обработчика http.createServer для CONNECT запросов
  server.on('connect', (req, clientSocket, head) => {
    const netSocket = clientSocket as net.Socket;
    const clientIP = netSocket.remoteAddress || 'unknown';
    const targetUrl = req.url || '';
    const [hostname, portStr] = targetUrl.split(':');
    const port = portStr ? parseInt(portStr, 10) : 443;

    log('info', 'CONNECT request received', {
      hostname,
      port,
      clientIP,
      url: targetUrl
    });

    if (!hostname) {
      log('error', 'Invalid CONNECT target', { targetUrl, clientIP });
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.end();
      return;
    }

    // Проверка IP
    if (!checkIP(clientIP)) {
      log('error', 'IP not allowed', { clientIP });
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.end();
      return;
    }

    // Проверка аутентификации
    const authHeader = req.headers['proxy-authorization'];
    if (!checkAuth(authHeader)) {
      log('error', 'Authentication failed', { clientIP });
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Sami LLM Proxy"\r\n\r\n');
      clientSocket.end();
      return;
    }

    log('info', 'HTTPS tunnel request', { hostname, port, clientIP });

    // Создаем TCP соединение с целевым сервером
    const targetSocket = net.createConnection({
      host: hostname,
      port: port,
      timeout: 300000,
    }, () => {
      log('debug', 'Target connection established', { hostname, port });
      // AI-NOTE: [КРИТИЧНО] Отправляем успешный ответ клиенту
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      log('debug', 'CONNECT response sent', { hostname, port });
      
      // AI-NOTE: Если есть данные в head (отправленные до установки туннеля), отправляем их
      if (head && head.length > 0) {
        targetSocket.write(head);
      }
      
      // Начинаем туннелирование данных
      targetSocket.pipe(clientSocket, { end: false });
      clientSocket.pipe(targetSocket, { end: false });
    });

    targetSocket.on('error', (err) => {
      log('error', 'HTTPS tunnel error', { 
        error: err.message, 
        code: (err as any).code,
        hostname, 
        port 
      });
      if (!clientSocket.destroyed && !clientSocket.writableEnded) {
        try {
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        } catch (writeErr) {
          log('debug', 'Failed to write error response', { error: writeErr });
        }
        clientSocket.end();
      }
    });

    targetSocket.on('timeout', () => {
      log('error', 'HTTPS tunnel timeout', { hostname, port });
      if (!clientSocket.destroyed && !clientSocket.writableEnded) {
        try {
          clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
        } catch (writeErr) {
          log('debug', 'Failed to write timeout response', { error: writeErr });
        }
        clientSocket.end();
      }
      targetSocket.destroy();
    });

    clientSocket.on('error', (err) => {
      log('debug', 'Client socket error', { error: err.message });
      if (!targetSocket.destroyed) {
        targetSocket.destroy();
      }
    });

    clientSocket.on('close', () => {
      log('debug', 'Client socket closed', { hostname, port });
      if (!targetSocket.destroyed) {
        targetSocket.destroy();
      }
    });

    targetSocket.on('close', () => {
      log('debug', 'Target socket closed', { hostname, port });
      if (!clientSocket.destroyed) {
        clientSocket.destroy();
      }
    });
  });
  
  // Обработка обычных HTTP запросов (не CONNECT)
  server.on('request', (req, res) => {
    // AI-NOTE: [ОТЛАДКА] Логируем ВСЕ входящие запросы для диагностики
    // Это должно срабатывать для ВСЕХ запросов, включая CONNECT
    const clientIP = req.socket.remoteAddress || 'unknown';
    log('info', '=== INCOMING REQUEST ===', {
      method: req.method,
      url: req.url,
      clientIP,
      socketReadyState: req.socket.readyState,
      socketDestroyed: req.socket.destroyed,
      socketWritableEnded: req.socket.writableEnded,
      headers: Object.keys(req.headers),
      httpVersion: req.httpVersion,
      complete: req.complete
    });
    
    // Логирование запроса
    log('debug', 'Incoming request', {
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'proxy-authorization': req.headers['proxy-authorization'] ? '***' : undefined
      },
      clientIP,
      socketReadyState: req.socket.readyState
    });

  // Проверка IP
  if (!checkIP(clientIP)) {
    log('error', 'IP not allowed', { clientIP });
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('IP address not allowed');
    return;
  }

  // Проверка аутентификации
  const authHeader = req.headers['proxy-authorization'];
  if (!checkAuth(authHeader)) {
    log('error', 'Authentication failed', { clientIP });
    res.writeHead(407, {
      'Content-Type': 'text/plain',
      'Proxy-Authenticate': 'Basic realm="Sami LLM Proxy"'
    });
    res.end('Proxy authentication required');
    return;
  }

  // AI-NOTE: CONNECT запросы обрабатываются в событии 'connect' выше
  // Здесь обрабатываем только обычные HTTP запросы (GET, POST, etc.)
  // Обработка обычных HTTP запросов
  // AI-NOTE: Для HTTP прокси, клиент отправляет полный URL в req.url
  // Например: GET http://api.openrouter.ai/api/v1/models HTTP/1.1
  // Но если это прямой запрос к прокси (не через прокси-агент), 
  // то req.url будет относительным путем
  
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: No URL');
    return;
  }

  let targetUrl: string;
  
  // Если это полный URL (начинается с http:// или https://)
  // Это стандартный формат для HTTP прокси
  if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
    targetUrl = req.url;
  } else {
    // Если это относительный путь, это может быть:
    // 1. Прямой запрос к прокси (не через прокси-агент) - игнорируем
    // 2. Ошибка в клиенте
    
    // AI-NOTE: https-proxy-agent использует CONNECT для HTTPS, 
    // а для HTTP может отправлять полный URL
    // Если приходит относительный путь, это скорее всего прямой запрос к прокси
    log('debug', 'Relative URL in proxy request (not a proxied request)', {
      url: req.url,
      host: req.headers.host,
      method: req.method
    });
    
    // Возвращаем информацию о прокси
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Sami LLM Proxy Server is running. Use this as HTTP/HTTPS proxy.');
    return;
  }

  log('info', 'Proxying HTTP request', {
    method: req.method,
    targetUrl,
    clientIP
  });

  // Проксируем HTTP запрос
  proxyHttpRequest(req, res, targetUrl);
});

  // AI-NOTE: [ОТЛАДКА] Логируем события сервера ДО запуска
  // AI-NOTE: [КРИТИЧНО] В Node.js http.createServer должен обрабатывать CONNECT автоматически
  // Но если запрос не доходит, возможно нужно использовать другой подход
  server.on('connection', (socket) => {
    const netSocket = socket as net.Socket;
    log('debug', 'New connection', {
      remoteAddress: netSocket.remoteAddress,
      remotePort: netSocket.remotePort,
      localAddress: netSocket.localAddress,
      localPort: netSocket.localPort
    });
    
    // AI-NOTE: [ОТЛАДКА] Логируем только события закрытия и ошибок
    // НЕ логируем 'data' - это перехватывает данные из потока и http.createServer не может их прочитать
    netSocket.on('close', () => {
      log('debug', 'Socket closed', {
        remoteAddress: netSocket.remoteAddress
      });
    });
    
    netSocket.on('error', (err) => {
      log('error', 'Socket error', {
        remoteAddress: netSocket.remoteAddress,
        error: err.message
      });
    });
  });

// Запуск сервера
server.listen(PROXY_PORT, PROXY_ADDRESS, () => {
  log('info', `Sami LLM Proxy Server started`, {
    port: PROXY_PORT,
    address: PROXY_ADDRESS,
    auth: PROXY_AUTH_USERNAME ? 'enabled' : 'disabled',
    allowedIPs: ALLOWED_IPS.length > 0 ? ALLOWED_IPS : 'all',
    logLevel: LOG_LEVEL
  });
});

server.on('error', (err) => {
  log('error', 'Server error', {
    error: err.message,
    code: (err as any).code
  });
});

server.on('clientError', (err, socket) => {
  const netSocket = socket as net.Socket;
  log('error', 'Client error', {
    error: err.message,
    code: (err as any).code,
    remoteAddress: netSocket.remoteAddress
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down gracefully');
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down gracefully');
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
});

