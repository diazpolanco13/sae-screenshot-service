FROM node:18-slim

# Instalar Chromium y dependencias
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copiar package.json
COPY package.json ./

# Instalar dependencias (puppeteer-core no descarga Chromium)
RUN npm install --omit=dev

# Copiar código fuente
COPY src ./src

# Configurar ruta de Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Puerto por defecto
EXPOSE 3001

# Usuario no-root para seguridad
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

USER pptruser

CMD ["node", "src/index.js"]
