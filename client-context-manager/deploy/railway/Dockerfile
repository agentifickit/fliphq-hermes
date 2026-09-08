# Evolution API v2 — pinned image for Railway.
# Railway builds this image and injects env vars from the dashboard (see .env.example).
# The instance/session data lives in the /evolution volume (Railway's persistent volume).
FROM atendai/evolution-api:v2.2.1

# Evolution v2 listens on SERVER_PORT (default 8080 in the image).
EXPOSE 8080

# Simple healthcheck so Railway can mark the service healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"
