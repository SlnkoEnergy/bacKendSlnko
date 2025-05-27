FROM node:16-alpine
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  nodejs \
  yarn
WORKDIR /protrac/backend
COPY package.json ./
RUN npm install
COPY . .
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DB_URL=${DB_URL}
ENV DB_DEVELOPMENT_URL=${DB_DEVELOPMENT_URL}
ENV USER=${USER}
ENV PASS=${PASS}
ENV PASSKEY=${PASSKEY}
ENV PORT=${PORT}
EXPOSE 8080
CMD ["npm", "start"]
