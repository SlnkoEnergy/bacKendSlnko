FROM node:16-alpine
WORKDIR /protrac/backend
COPY package.json ./
RUN npm install
COPY . .
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


# FROM node:16-slim

# # Install dependencies
# RUN apt-get update && apt-get install -y \
#     chromium \
#     --no-install-recommends && \
#     apt-get clean && \
#     rm -rf /var/lib/apt/lists/*

# # Set working directory
# WORKDIR /protrac/backend

# # Copy package.json and install deps
# COPY package.json ./
# RUN npm install

# # Copy source code
# COPY . .

# # Puppeteer expects this path
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ENV DB_URL=${DB_URL}
# ENV DB_DEVELOPMENT_URL=${DB_DEVELOPMENT_URL}
# ENV USER=${USER}
# ENV PASS=${PASS}
# ENV PASSKEY=${PASSKEY}
# ENV PORT=${PORT}
# # Expose port
# EXPOSE 4002

# CMD ["npm", "start"]
