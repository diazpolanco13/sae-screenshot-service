# SAE Screenshot Service 📸

Servicio de capturas de pantalla para alertas de incursiones aéreas del sistema SAE-RADAR.

Genera screenshots del mapa con detalles del vuelo detectado para enviar a Telegram.

## 🚀 Despliegue en Dokploy

### 1. Crear nuevo servicio

1. En Dokploy, crear un nuevo **Application**
2. Seleccionar **GitHub** como source
3. Conectar este repositorio: `diazpolanco13/sae-screenshot-service`
4. Build Type: **Dockerfile**

### 2. Configurar variables de entorno

```env
# URL de tu aplicación SAE-RADAR en producción
SAE_RADAR_URL=https://tu-sae-radar.dokploy.com

# Puerto del servicio (Dokploy lo asigna automáticamente)
PORT=3001

# Token de autenticación (generar uno seguro)
AUTH_TOKEN=tu-token-secreto-aqui

# Token de Mapbox (para screenshots estáticos)
MAPBOX_TOKEN=pk.xxx
```

### 3. Configurar dominio/puerto

- Asignar un dominio o subdominio, ej: `screenshot.tu-dominio.com`
- O usar el puerto interno si está en la misma red que SAE-RADAR

### 4. Deploy

¡Listo! El servicio estará disponible.

## 📡 Endpoints

### Health Check
```bash
GET /health
```

### Generar Screenshot (Puppeteer)
```bash
POST /screenshot
Content-Type: application/json
Authorization: Bearer <AUTH_TOKEN>

{
  "flightId": "AE5F12",
  "callsign": "BAT91",
  "lat": 10.5,
  "lon": -66.9,
  "width": 1280,
  "height": 720,
  "zoom": 8,
  "delay": 3000
}
```

Respuesta:
```json
{
  "success": true,
  "image": "base64...",
  "contentType": "image/png",
  "elapsed": 4500,
  "flight": "BAT91"
}
```

### Screenshot Estático (Mapbox)
```bash
GET /screenshot/static?lat=10.5&lon=-66.9&zoom=8&width=600&height=400&marker=true
```

Redirige a una imagen de Mapbox Static API.

## 🔧 Integración con Edge Function

Modificar `military-airspace-monitor` para enviar fotos a Telegram:

```typescript
// Después de detectar incursión, obtener screenshot
const screenshotResponse = await fetch('https://screenshot.tu-dominio.com/screenshot', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SCREENSHOT_AUTH_TOKEN}`
  },
  body: JSON.stringify({
    flightId: inc.hex,
    callsign: inc.callsign,
    lat: inc.lat,
    lon: inc.lon
  })
});

const { image } = await screenshotResponse.json();

// Enviar foto a Telegram
await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: CHAT_ID,
    photo: `data:image/png;base64,${image}`,
    caption: `🚨 INCURSIÓN: ${inc.callsign}\n✈️ ${inc.type}\n📍 ${inc.lat}, ${inc.lon}`
  })
});
```

## 🐳 Desarrollo Local

```bash
# Instalar dependencias
npm install

# Iniciar en desarrollo
npm run dev

# Con Docker
docker build -t sae-screenshot .
docker run -p 3001:3001 -e SAE_RADAR_URL=http://host.docker.internal:5173 sae-screenshot
```

## 📋 Requisitos

- Node.js 18+
- Chromium (incluido en Dockerfile)
- Acceso a la aplicación SAE-RADAR

## 🔐 Seguridad

- Siempre configurar `AUTH_TOKEN` en producción
- El servicio debe estar en red privada o protegido
- No exponer públicamente sin autenticación
