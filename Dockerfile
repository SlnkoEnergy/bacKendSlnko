# FROM node:16-alpine
# WORKDIR /protrac/backend
# COPY package.json ./
# RUN npm install
# COPY . .
# ENV DB_URL=${DB_URL}
# ENV DB_DEVELOPMENT_URL=${DB_DEVELOPMENT_URL}
# ENV USER=${USER}
# ENV PASS=${PASS}
# ENV PASSKEY=${PASSKEY}
# ENV PORT=${PORT}
# EXPOSE 8080
# CMD ["npm", "start"]


FROM node:16-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /protrac/backend

# Copy package.json and install deps
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

# Puppeteer expects this path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

ENV DB_URL=${DB_URL}
ENV DB_DEVELOPMENT_URL=${DB_DEVELOPMENT_URL}
ENV USER=${USER}
ENV PASS=${PASS}
ENV PASSKEY=${PASSKEY}
ENV PORT=${PORT}
# Expose port
EXPOSE 8080

CMD ["npm", "start"]
