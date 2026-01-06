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
// AI-NOTE: Rate limiting only for failed authentication attempts (brute force protection)
// Successful authenticated requests are not rate limited to allow high-frequency LLM requests and streaming
const AUTH_FAIL_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_FAIL_RATE_LIMIT_WINDOW_MS || '300000', 10); // 5 minutes default
const AUTH_FAIL_RATE_LIMIT_MAX_ATTEMPTS = parseInt(process.env.AUTH_FAIL_RATE_LIMIT_MAX_ATTEMPTS || '10', 10); // 10 failed attempts per 5 minutes default

// Rate limiting: track failed authentication attempts per IP (brute force protection)
const authFailRateLimitMap = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of authFailRateLimitMap.entries()) {
    if (now > data.resetTime && (!data.blockedUntil || now > data.blockedUntil)) {
      authFailRateLimitMap.delete(ip);
    }
  }
}, 60000); // Clean up every minute

// Check if IP is blocked due to too many failed authentication attempts
function checkAuthFailRateLimit(clientIP: string): boolean {
  const now = Date.now();
  const entry = authFailRateLimitMap.get(clientIP);
  
  // If IP is temporarily blocked, deny access
  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return false;
  }
  
  // If entry exists but block period expired, reset it
  if (entry && now > entry.resetTime && (!entry.blockedUntil || now > entry.blockedUntil)) {
    authFailRateLimitMap.delete(clientIP);
  }
  
  return true;
}

// Record failed authentication attempt
function recordAuthFailure(clientIP: string): void {
  const now = Date.now();
  const entry = authFailRateLimitMap.get(clientIP);
  
  if (!entry || now > entry.resetTime) {
    // First failure or window expired - start new window
    authFailRateLimitMap.set(clientIP, { 
      count: 1, 
      resetTime: now + AUTH_FAIL_RATE_LIMIT_WINDOW_MS 
    });
  } else {
    // Increment failure count
    entry.count++;
    
    // If too many failures, block IP temporarily
    if (entry.count >= AUTH_FAIL_RATE_LIMIT_MAX_ATTEMPTS) {
      const blockDuration = Math.min(AUTH_FAIL_RATE_LIMIT_WINDOW_MS * 2, 3600000); // Max 1 hour
      entry.blockedUntil = now + blockDuration;
      log('info', 'IP temporarily blocked due to too many failed auth attempts', {
        clientIP,
        failures: entry.count,
        blockedUntil: new Date(entry.blockedUntil).toISOString()
      });
    }
  }
}

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

  // AI-NOTE: [INFO] Log target domain for monitoring and statistics
  log('info', 'Proxying request to domain', {
    domain: options.hostname,
    port: options.port,
    method: options.method,
    isHttps,
    clientIP: (req.socket.remoteAddress || 'unknown')
  });
  
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
      headers: Object.keys(proxyRes.headers),
      contentLength: proxyRes.headers['content-length']
    });
    
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    
    // AI-NOTE: [FIXED] Explicitly set { end: true } for proper stream completion
    // This ensures all data is properly transferred and stream is closed correctly
    proxyRes.pipe(res, { end: true });
    
    // AI-NOTE: [FIXED] Handle response stream errors to prevent IncompleteRead issues
    proxyRes.on('error', (err) => {
      log('error', 'Response stream error', {
        error: err.message,
        code: (err as any).code,
        targetUrl,
        hostname: options.hostname,
        port: options.port
      });
      // If headers not sent yet, send error response
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Response stream error: ' + err.message);
      } else {
        // Headers already sent, just close the connection
        res.end();
      }
    });
    
    // AI-NOTE: [FIXED] Track premature stream abortion
    proxyRes.on('aborted', () => {
      log('error', 'Response stream aborted', { 
        targetUrl,
        hostname: options.hostname 
      });
      if (!res.finished) {
        res.end();
      }
    });
    
    // AI-NOTE: [DEBUG] Log stream completion for debugging
    proxyRes.on('end', () => {
      log('debug', 'Response stream ended', { 
        targetUrl,
        hostname: options.hostname 
      });
    });
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
    } else {
      res.end();
    }
  });

  // AI-NOTE: [FIXED] Explicitly set { end: true } for proper request stream completion
  req.pipe(proxyReq, { end: true });
  
  // AI-NOTE: [FIXED] Handle incoming request stream errors
  req.on('error', (err) => {
    log('error', 'Request stream error', {
      error: err.message,
      code: (err as any).code,
      targetUrl,
      hostname: options.hostname
    });
    proxyReq.destroy();
  });
  
  // AI-NOTE: [FIXED] Handle client request abortion
  req.on('aborted', () => {
    log('info', 'Client request aborted', { 
      targetUrl,
      hostname: options.hostname 
    });
    proxyReq.destroy();
  });

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

    // Check if IP is blocked due to too many failed auth attempts (brute force protection)
    if (!checkAuthFailRateLimit(clientIP)) {
      const entry = authFailRateLimitMap.get(clientIP);
      log('info', 'Blocked IP (too many failed auth attempts)', { 
        clientIP,
        blockedUntil: entry?.blockedUntil ? new Date(entry.blockedUntil).toISOString() : undefined
      });
      clientSocket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      clientSocket.end();
      return;
    }

    // Authentication check
    const authHeader = req.headers['proxy-authorization'];
    if (!checkAuth(authHeader)) {
      // Record failed authentication attempt
      recordAuthFailure(clientIP);
      // AI-NOTE: Log as debug instead of error - this is normal for bots/scanners
      log('debug', 'Authentication failed', { clientIP });
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Sami LLM Proxy"\r\n\r\n');
      clientSocket.end();
      return;
    }
    
    // AI-NOTE: Successful authentication - clear any previous failures for this IP
    // This allows legitimate users to recover quickly if they made mistakes
    if (authFailRateLimitMap.has(clientIP)) {
      authFailRateLimitMap.delete(clientIP);
    }

    // AI-NOTE: [INFO] Log target domain for monitoring and statistics
    log('info', 'HTTPS tunnel request', { 
      domain: hostname, 
      port, 
      clientIP 
    });

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
      
      // AI-NOTE: [FIXED] Start data tunneling with proper stream completion
      // Removed { end: false } to ensure streams are properly closed and all data is transferred
      // This fixes IncompleteRead issues when downloading files through HTTPS tunnels (e.g., Google Slides images)
      targetSocket.pipe(clientSocket);
      clientSocket.pipe(targetSocket);
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
    const clientIP = req.socket.remoteAddress || 'unknown';
    
    // AI-NOTE: Health check endpoint for monitoring
    if (req.url === '/health' || req.url === '/status') {
      log('debug', 'Health check request', { clientIP });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      }));
      return;
    }
    
    // AI-NOTE: [DEBUG] Log ALL incoming requests for diagnostics
    // This should fire for ALL requests, including CONNECT
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

  // Check if IP is blocked due to too many failed auth attempts (brute force protection)
  if (!checkAuthFailRateLimit(clientIP)) {
    const entry = authFailRateLimitMap.get(clientIP);
    log('info', 'Blocked IP (too many failed auth attempts)', { 
      clientIP,
      blockedUntil: entry?.blockedUntil ? new Date(entry.blockedUntil).toISOString() : undefined
    });
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('Too Many Requests');
    return;
  }

  // Authentication check
  const authHeader = req.headers['proxy-authorization'];
  if (!checkAuth(authHeader)) {
    // Record failed authentication attempt
    recordAuthFailure(clientIP);
    // AI-NOTE: Log as debug instead of error - this is normal for bots/scanners
    log('debug', 'Authentication failed', { clientIP });
    res.writeHead(407, {
      'Content-Type': 'text/plain',
      'Proxy-Authenticate': 'Basic realm="Sami LLM Proxy"'
    });
    res.end('Proxy authentication required');
    return;
  }
  
  // AI-NOTE: Successful authentication - clear any previous failures for this IP
  // This allows legitimate users to recover quickly if they made mistakes
  if (authFailRateLimitMap.has(clientIP)) {
    authFailRateLimitMap.delete(clientIP);
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

  // Extract domain from targetUrl for logging
  try {
    const parsedTargetUrl = parseUrl(targetUrl);
    log('info', 'Proxying HTTP request', {
      method: req.method,
      domain: parsedTargetUrl.hostname,
      port: parsedTargetUrl.port || (parsedTargetUrl.protocol === 'https:' ? 443 : 80),
      path: parsedTargetUrl.path,
      clientIP
    });
  } catch (err) {
    // Fallback to full URL if parsing fails
    log('info', 'Proxying HTTP request', {
      method: req.method,
      targetUrl,
      clientIP
    });
  }

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
      const errorCode = (err as any).code;
      const knownConnectionErrors = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'];
      const isKnownError = knownConnectionErrors.includes(errorCode);
      
      // Log known connection errors as debug (common from bots)
      if (isKnownError) {
        log('debug', 'Socket error (likely bot/scanner)', {
          remoteAddress: netSocket.remoteAddress,
          error: err.message,
          code: errorCode
        });
      } else {
        log('error', 'Socket error', {
          remoteAddress: netSocket.remoteAddress,
          error: err.message,
          code: errorCode
        });
      }
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
    timeout: `${PROXY_TIMEOUT_MS}ms (${Math.round(PROXY_TIMEOUT_MS / 60000)} minutes)`,
    bruteForceProtection: `${AUTH_FAIL_RATE_LIMIT_MAX_ATTEMPTS} failed auth attempts per ${AUTH_FAIL_RATE_LIMIT_WINDOW_MS / 1000}s (authenticated requests unlimited)`
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
  const errorCode = (err as any).code;
  const remoteAddress = netSocket.remoteAddress || 'unknown';
  
  // AI-NOTE: Many parse errors are from bots/scanners sending malformed requests
  // These are expected on a public proxy server, so log as debug instead of error
  const knownBotErrors = [
    'HPE_PAUSED_H2_UPGRADE',      // HTTP/2 upgrade attempts
    'HPE_INVALID_METHOD',         // Invalid HTTP method
    'HPE_INVALID_CONSTANT',       // Invalid HTTP constant
    'HPE_UNEXPECTED_CONTENT_LENGTH', // Unexpected content length
    'ECONNRESET',                 // Connection reset by client
    'EPIPE',                      // Broken pipe
    'ETIMEDOUT'                   // Connection timeout
  ];
  
  const isKnownBotError = knownBotErrors.some(code => 
    errorCode === code || err.message.includes(code)
  );
  
  // Log known bot errors as debug, others as error
  if (isKnownBotError) {
    log('debug', 'Client error (likely bot/scanner)', {
      error: err.message,
      code: errorCode,
      remoteAddress
    });
  } else {
    log('error', 'Client error', {
      error: err.message,
      code: errorCode,
      remoteAddress
    });
  }
  
  // Close the socket
  if (!netSocket.destroyed) {
    netSocket.destroy();
  }
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

