/**
 * Sami LLM Proxy Server
 * 
 * HTTP/HTTPS proxy server for routing requests to LLM providers
 * 
 * AI-NOTE: [CREATED] Simple and reproducible proxy server for deployment on any server
 * Uses standard HTTP proxy protocol, compatible with https-proxy-agent
 */

import http from 'http';
import https from 'https';
import net from 'net';
import { parse as parseUrl } from 'url';

// Configuration from environment variables
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);
const PROXY_ADDRESS = process.env.PROXY_ADDRESS || '0.0.0.0'; // AI-NOTE: 0.0.0.0 = listen on all interfaces (correct for Docker)
const PROXY_AUTH_USERNAME = process.env.PROXY_AUTH_USERNAME;
const PROXY_AUTH_PASSWORD = process.env.PROXY_AUTH_PASSWORD;
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase(); // AI-NOTE: Default is info
const ALLOWED_IPS = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [];
// AI-NOTE: Request timeout in milliseconds (default: 20 minutes for slow LLM models with thinking mode)
// Can be set via PROXY_TIMEOUT_MS environment variable
const PROXY_TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS || '1200000', 10); // 20 minutes default

// Logging
function log(level: 'info' | 'debug' | 'error', message: string, data?: any) {
  const levels: Record<string, number> = { error: 0, info: 1, debug: 2 };
  const currentLevel = levels[LOG_LEVEL] ?? levels['info']; // AI-NOTE: Default to info if LOG_LEVEL is invalid (LOG_LEVEL is already normalized to lowercase)
  const messageLevel = levels[level] ?? 0;
  
  // AI-NOTE: [FIXED] Log only if message level <= current level
  // error (0) <= info (1) <= debug (2)
  // Example: with LOG_LEVEL=info, error (0) and info (1) are logged, but not debug (2)
  if (messageLevel <= currentLevel) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

// Basic Auth check
function checkAuth(authHeader: string | undefined): boolean {
  if (!PROXY_AUTH_USERNAME || !PROXY_AUTH_PASSWORD) {
    return true; // Authentication not required
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

// Allowed IP check
function checkIP(clientIP: string): boolean {
  if (ALLOWED_IPS.length === 0) {
    return true; // No restrictions
  }

  // Extract IP from string (may be "::ffff:192.168.1.1" for IPv6)
  const cleanIP = clientIP.replace(/^::ffff:/, '');
  return ALLOWED_IPS.includes(cleanIP) || ALLOWED_IPS.includes(clientIP);
}

// Function to proxy HTTP request
function proxyHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, targetUrl: string) {
  const parsedUrl = parseUrl(targetUrl);
  
  // AI-NOTE: [ERROR PROTECTION] If port is 443, it's always HTTPS, even if protocol is specified as http://
  // In normal operation, HttpsProxyAgent uses CONNECT for HTTPS requests (handled above, lines 180-236)
  // This code is needed for:
  // 1. Protection against incorrect URLs (http://target:443) - fix to HTTPS
  // 2. HTTP requests to servers on port 443 (rare case)
  // 3. Security - all data to LLM must be encrypted
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80);
  const isHttps = parsedUrl.protocol === 'https:' || port === 443;
  const client = isHttps ? https : http;
  
  // AI-NOTE: For HTTP proxy, path must be full (including query string)
  const path = parsedUrl.path || '/';
  const fullPath = parsedUrl.search ? `${path}${parsedUrl.search}` : path;
  
  // AI-NOTE: [FIXED] Correctly determine port and host header
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

  // Remove proxy headers
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
    // Copy status and headers
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

  // Forward request body
  req.pipe(proxyReq);

  // Timeout (configurable via PROXY_TIMEOUT_MS)
  proxyReq.setTimeout(PROXY_TIMEOUT_MS, () => {
    log('error', 'HTTP proxy request timeout', { 
      timeout: PROXY_TIMEOUT_MS, 
      targetUrl,
      hostname: options.hostname,
      port: options.port
    });
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Gateway Timeout');
    }
  });
}

  // Request handling
  const server = http.createServer();
  
  // AI-NOTE: [CRITICAL] For CONNECT requests, Node.js uses special 'connect' event
  // This event is called BEFORE http.createServer handler for CONNECT requests
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

    // IP check
    if (!checkIP(clientIP)) {
      log('error', 'IP not allowed', { clientIP });
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.end();
      return;
    }

    // Authentication check
    const authHeader = req.headers['proxy-authorization'];
    if (!checkAuth(authHeader)) {
      log('error', 'Authentication failed', { clientIP });
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Sami LLM Proxy"\r\n\r\n');
      clientSocket.end();
      return;
    }

    log('info', 'HTTPS tunnel request', { hostname, port, clientIP });

    // Create TCP connection to target server
    // AI-NOTE: Using PROXY_TIMEOUT_MS for CONNECT tunnel timeout as well
    const targetSocket = net.createConnection({
      host: hostname,
      port: port,
      timeout: PROXY_TIMEOUT_MS,
    }, () => {
      log('debug', 'Target connection established', { hostname, port });
      // AI-NOTE: [CRITICAL] Send success response to client
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      log('debug', 'CONNECT response sent', { hostname, port });
      
      // AI-NOTE: If there's data in head (sent before tunnel establishment), forward it
      if (head && head.length > 0) {
        targetSocket.write(head);
      }
      
      // Start data tunneling
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
  
  // Handle regular HTTP requests (not CONNECT)
  server.on('request', (req, res) => {
    // AI-NOTE: [DEBUG] Log ALL incoming requests for diagnostics
    // This should fire for ALL requests, including CONNECT
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
    
    // Request logging
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

  // IP check
  if (!checkIP(clientIP)) {
    log('error', 'IP not allowed', { clientIP });
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('IP address not allowed');
    return;
  }

  // Authentication check
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

  // AI-NOTE: CONNECT requests are handled in 'connect' event above
  // Here we handle only regular HTTP requests (GET, POST, etc.)
  // Regular HTTP request handling
  // AI-NOTE: For HTTP proxy, client sends full URL in req.url
  // Example: GET http://api.openrouter.ai/api/v1/models HTTP/1.1
  // But if this is a direct request to proxy (not through proxy agent),
  // then req.url will be a relative path
  
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: No URL');
    return;
  }

  let targetUrl: string;
  
  // If this is a full URL (starts with http:// or https://)
  // This is standard format for HTTP proxy
  if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
    targetUrl = req.url;
  } else {
    // If this is a relative path, it could be:
    // 1. Direct request to proxy (not through proxy agent) - ignore
    // 2. Client error
    
    // AI-NOTE: https-proxy-agent uses CONNECT for HTTPS,
    // and for HTTP may send full URL
    // If relative path arrives, it's most likely a direct request to proxy
    log('debug', 'Relative URL in proxy request (not a proxied request)', {
      url: req.url,
      host: req.headers.host,
      method: req.method
    });
    
    // Return proxy information
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Sami LLM Proxy Server is running. Use this as HTTP/HTTPS proxy.');
    return;
  }

  log('info', 'Proxying HTTP request', {
    method: req.method,
    targetUrl,
    clientIP
  });

  // Proxy HTTP request
  proxyHttpRequest(req, res, targetUrl);
});

  // AI-NOTE: [DEBUG] Log server events BEFORE startup
  // AI-NOTE: [CRITICAL] In Node.js, http.createServer should handle CONNECT automatically
  // But if request doesn't arrive, may need to use different approach
  server.on('connection', (socket) => {
    const netSocket = socket as net.Socket;
    log('debug', 'New connection', {
      remoteAddress: netSocket.remoteAddress,
      remotePort: netSocket.remotePort,
      localAddress: netSocket.localAddress,
      localPort: netSocket.localPort
    });
    
    // AI-NOTE: [DEBUG] Log only close and error events
    // DO NOT log 'data' - this intercepts data from stream and http.createServer cannot read it
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

// Start server
server.listen(PROXY_PORT, PROXY_ADDRESS, () => {
  log('info', `Sami LLM Proxy Server started`, {
    port: PROXY_PORT,
    address: PROXY_ADDRESS,
    auth: PROXY_AUTH_USERNAME ? 'enabled' : 'disabled',
    allowedIPs: ALLOWED_IPS.length > 0 ? ALLOWED_IPS : 'all',
    logLevel: LOG_LEVEL,
    timeout: `${PROXY_TIMEOUT_MS}ms (${Math.round(PROXY_TIMEOUT_MS / 60000)} minutes)`
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

