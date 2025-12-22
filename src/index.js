const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3001;

// URL de la aplicación SAE-RADAR
const SAE_RADAR_URL = process.env.SAE_RADAR_URL || 'http://localhost:5173';

// Token de autenticación (opcional)
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sae-screenshot-service', version: '1.0.0' });
});

/**
 * POST /screenshot
 * Genera un screenshot del mapa con un vuelo seleccionado
 * 
 * Body:
 * - flightId: ICAO24 hex del vuelo (ej: "AE5F12")
 * - callsign: Callsign del vuelo (ej: "BAT91")
 * - lat: Latitud del vuelo
 * - lon: Longitud del vuelo
 * - width: Ancho del screenshot (default: 1280)
 * - height: Alto del screenshot (default: 720)
 */
app.post('/screenshot', async (req, res) => {
  const startTime = Date.now();
  let browser = null;
  
  try {
    // Validar token si está configurado
    if (AUTH_TOKEN && req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const {
      flightId,
      callsign,
      lat,
      lon,
      width = 1280,
      height = 720,
      zoom = 8,
      delay = 3000 // Tiempo de espera para que cargue el mapa
    } = req.body;
    
    if (!flightId && !callsign) {
      return res.status(400).json({ error: 'Se requiere flightId o callsign' });
    }
    
    console.log(`📸 Generando screenshot para ${callsign || flightId}...`);
    
    // Iniciar navegador headless
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: parseInt(width), height: parseInt(height) });
    
    // Construir URL con parámetros para pre-seleccionar el vuelo
    const params = new URLSearchParams();
    if (flightId) params.set('flight', flightId);
    if (callsign) params.set('callsign', callsign);
    if (lat && lon) {
      params.set('lat', lat);
      params.set('lon', lon);
      params.set('zoom', zoom);
    }
    params.set('screenshot', 'true'); // Flag para modo screenshot
    
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
    
    // Si hay callsign, intentar hacer clic en el avión
    if (callsign || flightId) {
      try {
        // Buscar y hacer clic en el marcador del vuelo
        const flightSelector = `[data-flight-id="${flightId}"], [data-callsign="${callsign}"]`;
        await page.click(flightSelector).catch(() => {
          console.log('⚠️ No se pudo hacer clic en el marcador del vuelo');
        });
        
        // Esperar a que aparezca el panel de detalles
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.log('⚠️ Error seleccionando vuelo:', e.message);
      }
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
    
    // Devolver imagen en base64
    res.json({
      success: true,
      image: screenshot,
      contentType: 'image/png',
      elapsed: elapsed,
      flight: callsign || flightId
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
 * Genera un screenshot usando Mapbox Static Images API (alternativa más rápida)
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
    
    // Construir URL de Mapbox Static Images
    let url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/`;
    
    if (marker === 'true') {
      url += `pin-s-airport+ff0000(${lon},${lat})/`;
    }
    
    url += `${lon},${lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;
    
    // Redirigir a la imagen de Mapbox
    res.redirect(url);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 SAE Screenshot Service running on port ${PORT}`);
  console.log(`📍 SAE-RADAR URL: ${SAE_RADAR_URL}`);
  console.log(`🔐 Auth: ${AUTH_TOKEN ? 'Enabled' : 'Disabled'}\n`);
});
