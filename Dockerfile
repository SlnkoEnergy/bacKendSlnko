FROM node:18-alpine

# Install Chromium and required dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init \
    && mkdir -p /protrac/backend

# Set working directory
WORKDIR /protrac/backend

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Puppeteer uses this Chromium path on Alpine
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Optional Puppeteer fix for sandboxing in Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# Add Chromium launch flags
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage"

# Set your app environment variables
ENV DB_URL=${DB_URL}
ENV DB_DEVELOPMENT_URL=${DB_DEVELOPMENT_URL}
ENV PASSKEY=${PASSKEY}
ENV PORT=${PORT}
ENV EMAIL_HOST=${EMAIL_HOST}
ENV EMAIL_PORT=${EMAIL_PORT}
ENV EMAIL_SECURE=${EMAIL_SECURE}
ENV EMAIL_SERVICE=${EMAIL_SERVICE}
ENV EMAIL_USER=${EMAIL_USER}
ENV EMAIL_PASS=${EMAIL_PASS}

EXPOSE 8080

CMD ["npm", "start"]
