FROM ghcr.io/puppeteer/puppeteer:21.5.0

# Cambiamos a root para evitar problemas de permisos
USER root

# Variables de entorno para que Puppeteer use el Chrome instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Copiamos los archivos de dependencias
COPY package*.json ./

# === EL CAMBIO ESTÁ AQUÍ ABAJO ===
# Usamos 'npm install' en lugar de 'npm ci' para que genere el lockfile automáticamente
RUN npm install 

# Copiamos el resto del código
COPY . .

# Comando de arranque
CMD [ "node", "server.js" ]
