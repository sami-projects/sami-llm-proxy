# Sami LLM Proxy Server

A lightweight HTTP/HTTPS proxy server for routing LLM API requests through a neutral server. Designed for use with Sami or any application that needs to proxy LLM API calls.

## Features

- ✅ **HTTP/HTTPS Proxy** - Standard HTTP proxy protocol with CONNECT method support
- ✅ **Basic Authentication** - Optional username/password protection
- ✅ **IP Filtering** - Restrict access by IP addresses
- ✅ **Configurable Logging** - Control log verbosity (error, info, debug)
- ✅ **Docker Ready** - Pre-configured for easy deployment
- ✅ **Lightweight** - Minimal dependencies, fast startup

## Quick Start

### Docker (Recommended)

```bash
# Pull and run
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  --restart unless-stopped \
  samiapp/sami-llm-proxy:latest
```

### Docker Compose

**Option 1: Using environment variables in docker-compose.yml**
```yaml
version: '3.8'
services:
  proxy:
    image: samiapp/sami-llm-proxy:latest
    ports:
      - "8080:8080"
    environment:
      - PROXY_PORT=8080
      - PROXY_AUTH_USERNAME=admin
      - PROXY_AUTH_PASSWORD=secret
    restart: unless-stopped
```

**Option 2: Using .env file (recommended)**
```yaml
version: '3.8'
services:
  proxy:
    image: samiapp/sami-llm-proxy:latest
    ports:
      - "8080:8080"
    env_file:
      - .env
    restart: unless-stopped
```

Create `.env` file (see `.env.example` for template):
```bash
PROXY_PORT=8080
PROXY_AUTH_USERNAME=admin
PROXY_AUTH_PASSWORD=secret
LOG_LEVEL=info
PROXY_TIMEOUT_MS=1200000
```

```bash
docker-compose up -d
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | `8080` | Port to listen on |
| `PROXY_ADDRESS` | `0.0.0.0` | Address to bind to (`0.0.0.0` = all interfaces) |
| `PROXY_AUTH_USERNAME` | - | Basic Auth username (optional) |
| `PROXY_AUTH_PASSWORD` | - | Basic Auth password (optional) |
| `LOG_LEVEL` | `info` | Logging level: `error`, `info`, or `debug` |
| `ALLOWED_IPS` | - | Comma-separated list of allowed IP addresses |
| `PROXY_TIMEOUT_MS` | `1200000` | Request timeout in milliseconds (default: 20 minutes). Increase for slow LLM models with thinking mode |

### Example: With Authentication

**Option 1: Using environment variables directly**
```bash
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  -e PROXY_AUTH_USERNAME=admin \
  -e PROXY_AUTH_PASSWORD=secret123 \
  samiapp/sami-llm-proxy:latest
```

**Option 2: Using .env file (recommended)**
```bash
# Create .env file (see .env.example for template)
cat > .env << EOF
PROXY_PORT=8080
PROXY_AUTH_USERNAME=admin
PROXY_AUTH_PASSWORD=secret123
LOG_LEVEL=info
PROXY_TIMEOUT_MS=1200000
EOF

# Run with --env-file
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  --env-file .env \
  samiapp/sami-llm-proxy:latest
```

### Example: With IP Filtering

```bash
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  -e ALLOWED_IPS="192.168.1.100,10.0.0.50" \
  samiapp/sami-llm-proxy:latest
```

### Example: With Custom Timeout (for slow LLM models)

```bash
# 30 minutes timeout for slow thinking models
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  -e PROXY_TIMEOUT_MS=1800000 \
  samiapp/sami-llm-proxy:latest
```

## Configuration with .env File

For easier configuration, you can use a `.env` file. This is especially useful for Docker Compose or when managing multiple environment variables.

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your settings:**
   ```bash
   PROXY_PORT=8080
   PROXY_AUTH_USERNAME=admin
   PROXY_AUTH_PASSWORD=your-secure-password
   LOG_LEVEL=info
   PROXY_TIMEOUT_MS=1200000
   ```

3. **Use with Docker:**
   ```bash
   docker run -d \
     --name sami-llm-proxy \
     -p 8080:8080 \
     --env-file .env \
     samiapp/sami-llm-proxy:latest
   ```

4. **Use with Docker Compose:**
   ```yaml
   services:
     proxy:
       image: samiapp/sami-llm-proxy:latest
       env_file:
         - .env
   ```

**Security Note:** The `.env` file is excluded from Git (see `.gitignore`). Never commit your `.env` file with real credentials to version control. Use `.env.example` as a template.

## Usage

### In Sami Application

Configure proxy settings in Sami:
- **Host**: Your server IP or domain
- **Port**: `8080` (or your configured port)
- **Type**: `http`
- **Username**: (if authentication is enabled)
- **Password**: (if authentication is enabled)

### Testing

```bash
# Test proxy connectivity
curl http://your-server:8080

# Test proxied request
curl -x http://your-server:8080 https://api.openai.com/v1/models

# With authentication
curl -x http://admin:secret123@your-server:8080 https://api.openai.com/v1/models
```

## Logs

```bash
# View logs
docker logs sami-llm-proxy

# Follow logs
docker logs -f sami-llm-proxy

# Last 100 lines
docker logs --tail 100 sami-llm-proxy
```

## Security Recommendations

1. **Use HTTPS** - Set up a reverse proxy (Nginx/Caddy) with SSL/TLS
2. **Enable Authentication** - Always set `PROXY_AUTH_USERNAME` and `PROXY_AUTH_PASSWORD`
3. **Restrict IPs** - Use `ALLOWED_IPS` to limit access
4. **Firewall** - Configure firewall rules to restrict access
5. **Keep Updated** - Regularly pull the latest image

## Building from Source

```bash
# Clone repository
git clone https://github.com/sami-projects/sami-llm-proxy.git
cd sami-llm-proxy

# Build Docker image
docker build -t sami-llm-proxy .

# Or run directly with Node.js
npm install
npm run build
npm start
```

## Requirements

- Docker (for containerized deployment)
- Node.js 20+ (for direct deployment)
- Open port (default: 8080)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Full Documentation](https://github.com/sami-projects/sami-llm-proxy#readme)
- 🐛 [Issue Tracker](https://github.com/sami-projects/sami-llm-proxy/issues)
- 💬 [Discussions](https://github.com/sami-projects/sami-llm-proxy/discussions)

## Links

- 🐳 [Docker Hub](https://hub.docker.com/r/samiapp/sami-llm-proxy)
- 📦 [GitHub Repository](https://github.com/sami-projects/sami-llm-proxy)
