const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// URL de la aplicación SAE-RADAR
const SAE_RADAR_URL = process.env.SAE_RADAR_URL || 'http://localhost:5173';

// Token de autenticación para el servicio
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// Token secreto para acceder a SAE-RADAR sin login
const SCREENSHOT_TOKEN = process.env.SCREENSHOT_TOKEN || 'sae-screenshot-secret-2025';

// Buscar Chromium en múltiples ubicaciones
function findChromium() {
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/app/.nix-profile/bin/chromium',
    '/nix/var/nix/profiles/default/bin/chromium',
  ];
  
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      console.log(`✅ Chromium encontrado en: ${p}`);
      return p;
    }
  }
  
  // Intentar encontrarlo con which
  try {
    const path = execSync('which chromium || which chromium-browser || which google-chrome', { encoding: 'utf8' }).trim();
    if (path && fs.existsSync(path)) {
      console.log(`✅ Chromium encontrado via which: ${path}`);
      return path;
    }
  } catch (e) {
    // Ignorar errores de which
  }
  
  console.error('❌ Chromium no encontrado en ninguna ubicación conocida');
  return null;
}

const CHROMIUM_PATH = findChromium();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: CHROMIUM_PATH ? 'ok' : 'error', 
    service: 'sae-screenshot-service', 
    version: '1.3.0',
    chromium: CHROMIUM_PATH || 'NOT FOUND'
  });
});

/**
 * POST /screenshot
 * Genera un screenshot del mapa con un vuelo seleccionado
 */
app.post('/screenshot', async (req, res) => {
  const startTime = Date.now();
  let browser = null;
  
  try {
    // Validar token si está configurado
    if (AUTH_TOKEN && req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!CHROMIUM_PATH) {
      return res.status(500).json({ error: 'Chromium no está disponible en el servidor' });
    }
    
    const {
      flightId,
      callsign,
      lat,
      lon,
      width = 1280,
      height = 720,
      zoom = 7,
      delay = 4000
    } = req.body;
    
    if (!flightId && !callsign) {
      return res.status(400).json({ error: 'Se requiere flightId o callsign' });
    }
    
    console.log(`📸 Generando screenshot para ${callsign || flightId}...`);
    
    // Iniciar navegador headless
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROMIUM_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--window-size=1280,720'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: parseInt(width), height: parseInt(height) });
    
    // Construir URL con parámetros para modo screenshot
    const params = new URLSearchParams();
    params.set('screenshot', 'true');
    params.set('screenshot_token', SCREENSHOT_TOKEN);
    if (flightId) params.set('flight', flightId);
    if (callsign) params.set('callsign', callsign);
    if (lat && lon) {
      params.set('lat', lat);
      params.set('lon', lon);
      params.set('zoom', zoom);
    }
    
    const url = `${SAE_RADAR_URL}?${params.toString()}`;
    console.log(`🌐 Navegando a: ${url}`);
    
    // Navegar a la página
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Esperar a que el mapa cargue
    await page.waitForSelector('.mapboxgl-map', { timeout: 15000 }).catch(() => {
      console.log('⚠️ Selector del mapa no encontrado, continuando...');
    });
    
    // Esperar tiempo adicional para que carguen los vuelos
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Verificar si el screenshot está listo
    const isReady = await page.evaluate(() => window.screenshotReady === true);
    if (isReady) {
      console.log('✅ Vuelo encontrado y seleccionado');
    } else {
      console.log('⚠️ Vuelo no encontrado, capturando de todos modos');
    }
    
    // Tomar screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      encoding: 'base64',
      fullPage: false
    });
    
    await browser.close();
    browser = null;
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Screenshot generado en ${elapsed}ms`);
    
    res.json({
      success: true,
      image: screenshot,
      contentType: 'image/png',
      elapsed: elapsed,
      flight: callsign || flightId,
      ready: isReady
    });
    
  } catch (error) {
    console.error('❌ Error generando screenshot:', error);
    
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      elapsed: Date.now() - startTime
    });
  }
});

/**
 * GET /screenshot/static
 * Screenshot usando Mapbox Static Images API (alternativa rápida)
 */
app.get('/screenshot/static', async (req, res) => {
  try {
    const { lat, lon, zoom = 8, width = 600, height = 400, marker = true } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Se requiere lat y lon' });
    }
    
    const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
    if (!MAPBOX_TOKEN) {
      return res.status(500).json({ error: 'MAPBOX_TOKEN no configurado' });
    }
    
    let url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/`;
    
    if (marker === 'true') {
      url += `pin-s-airport+ff0000(${lon},${lat})/`;
    }
    
    url += `${lon},${lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;
    
    res.redirect(url);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 SAE Screenshot Service running on port ${PORT}`);
  console.log(`📍 SAE-RADAR URL: ${SAE_RADAR_URL}`);
  console.log(`🌐 Chromium: ${CHROMIUM_PATH || 'NOT FOUND'}`);
  console.log(`🔑 Screenshot Token: ${SCREENSHOT_TOKEN.substring(0, 10)}...`);
  console.log(`🔐 Auth: ${AUTH_TOKEN ? 'Enabled' : 'Disabled'}\n`);
});
