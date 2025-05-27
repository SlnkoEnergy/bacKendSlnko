FROM node:20-alpine
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  udev \
  bash
WORKDIR /protrac/backend
COPY package.json ./
RUN npm ci
COPY . .
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DB_URL=${DB_URL}
ENV DB_DEVELOPMENT_URL=${DB_DEVELOPMENT_URL}
ENV USER=${USER}
ENV PASS=${PASS}
ENV PASSKEY=${PASSKEY}
ENV PORT=${PORT}
EXPOSE 8080
CMD ["npm", "start"]
