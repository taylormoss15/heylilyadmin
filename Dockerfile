# Hey Lily Admin — production image.
# Includes Chromium (via Playwright) because the accessibility scanner and
# the site-builder validation gate run a real headless browser. Prisma needs
# OpenSSL at runtime.

FROM node:22-bookworm-slim

# OpenSSL for Prisma; ca-certificates for outbound HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all dependencies (dev deps are needed for the build + prisma CLI).
COPY package*.json ./
RUN npm ci

# Copy source and generate the Prisma client.
COPY . .
RUN npx prisma generate

# Install Chromium + its system libraries for Playwright. Left unset,
# PLAYWRIGHT_EXECUTABLE_PATH makes the scanner use this managed browser.
RUN npx playwright install --with-deps chromium

# Build the Next.js app.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

RUN chmod +x ./docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]
