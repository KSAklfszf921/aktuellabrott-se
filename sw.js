// Professional Service Worker for Police Events Map
// Provides offline functionality, caching, and performance optimization

'use strict';

const CACHE_NAME = 'police-events-professional-v2.0';
const DATA_CACHE_NAME = 'police-events-data-v2.0';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/js/app.js',
  '/js/enhanced-popup.js',
  '/js/data-sync-manager.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// API endpoints that should use network-first strategy
const API_ENDPOINTS = [
  'polisen.se/api/',
  'allorigins.win/get'
];

// Cache duration for different types of content (in milliseconds)
const CACHE_DURATION = {
  STATIC: 7 * 24 * 60 * 60 * 1000,      // 7 days
  API_DATA: 30 * 60 * 1000,             // 30 minutes
  RSS_FEED: 60 * 60 * 1000              // 1 hour
};

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing...');

  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => {
          return new Request(url, { mode: 'cors' });
        }));
      }),
      caches.open(DATA_CACHE_NAME)
    ]).then(() => {
      console.log('[ServiceWorker] Installation complete');
      return self.skipWaiting();
    }).catch(error => {
      console.error('[ServiceWorker] Installation failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activating...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Activation complete');
      return self.clients.claim();
    }).catch(error => {
      console.error('[ServiceWorker] Activation failed:', error);
    })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle API requests with network-first strategy
  if (isApiRequest(request.url)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(cacheFirstStrategy(request));
});

// Check if request is to an API endpoint
function isApiRequest(url) {
  return API_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

// Network-first strategy for API data
async function networkFirstStrategy(request) {
  const cacheName = DATA_CACHE_NAME;

  try {
    // Try network first
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      // Clone the response for caching
      const responseClone = networkResponse.clone();

      // Cache the fresh response
      caches.open(cacheName).then(cache => {
        cache.put(request, responseClone);
      });

      // Add cache metadata headers
      const response = new Response(networkResponse.body, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: {
          ...Object.fromEntries(networkResponse.headers),
          'sw-cache-status': 'network-fresh',
          'sw-cache-timestamp': Date.now().toString()
        }
      });

      return response;
    }

    throw new Error(`Network response not ok: ${networkResponse.status}`);

  } catch (error) {
    console.warn('[ServiceWorker] Network failed, trying cache:', error.message);

    // Network failed, try cache
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Check if cached response is still valid
      const cacheTimestamp = parseInt(cachedResponse.headers.get('sw-cache-timestamp') || '0');
      const age = Date.now() - cacheTimestamp;

      // Add cache status header
      const response = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: {
          ...Object.fromEntries(cachedResponse.headers),
          'sw-cache-status': age > CACHE_DURATION.API_DATA ? 'cache-stale' : 'cache-fresh'
        }
      });

      return response;
    }

    // No cache available, return offline fallback
    return createOfflineFallback(request);
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request) {
  const cacheName = CACHE_NAME;

  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Check cache age for static assets
      const cacheTimestamp = parseInt(cachedResponse.headers.get('sw-cache-timestamp') || '0');
      const age = Date.now() - cacheTimestamp;

      // If cache is fresh or we're offline, return cached version
      if (age < CACHE_DURATION.STATIC || !navigator.onLine) {
        const response = new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: {
            ...Object.fromEntries(cachedResponse.headers),
            'sw-cache-status': 'cache-hit'
          }
        });

        return response;
      }
    }

    // Try network for fresh content
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      // Cache the fresh response
      const responseClone = networkResponse.clone();

      cache.put(request, new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: {
          ...Object.fromEntries(responseClone.headers),
          'sw-cache-timestamp': Date.now().toString()
        }
      }));

      const response = new Response(networkResponse.body, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: {
          ...Object.fromEntries(networkResponse.headers),
          'sw-cache-status': 'network-fresh'
        }
      });

      return response;
    }

    // Network failed, return cached version if available
    if (cachedResponse) {
      const response = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: {
          ...Object.fromEntries(cachedResponse.headers),
          'sw-cache-status': 'cache-fallback'
        }
      });

      return response;
    }

    throw new Error('No cached response available');

  } catch (error) {
    console.error('[ServiceWorker] Cache-first strategy failed:', error);
    return createOfflineFallback(request);
  }
}

// Create appropriate offline fallback responses
function createOfflineFallback(request) {
  const url = new URL(request.url);

  // For API requests, return empty but valid JSON
  if (isApiRequest(request.url)) {
    return new Response(JSON.stringify([]), {
      status: 200,
      statusText: 'OK (Offline)',
      headers: {
        'Content-Type': 'application/json',
        'sw-cache-status': 'offline-fallback'
      }
    });
  }

  // For HTML requests, try to serve offline.html from cache
  if (request.headers.get('accept').includes('text/html')) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const offlinePage = await cache.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    } catch (error) {
      console.warn('Could not serve offline page from cache:', error);
    }

    // Fallback to inline HTML if offline.html is not cached
    return new Response(createOfflineHTML(), {
      status: 200,
      statusText: 'OK (Offline)',
      headers: {
        'Content-Type': 'text/html',
        'sw-cache-status': 'offline-fallback'
      }
    });
  }

  // For other requests, return appropriate error
  return new Response('Offline - Innehåll ej tillgängligt', {
    status: 503,
    statusText: 'Service Unavailable (Offline)',
    headers: {
      'sw-cache-status': 'offline-fallback'
    }
  });
}

// Create offline HTML page
function createOfflineHTML() {
  return `
    <!DOCTYPE html>
    <html lang="sv">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline - Polishändelser Sverige</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f8fafc;
          color: #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
          box-sizing: border-box;
        }
        .offline-container {
          text-align: center;
          max-width: 400px;
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .offline-icon {
          font-size: 4rem;
          margin-bottom: 20px;
        }
        h1 {
          color: #1e40af;
          margin-bottom: 16px;
          font-size: 1.5rem;
        }
        p {
          color: #64748b;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .retry-btn {
          background: #1e40af;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .retry-btn:hover {
          background: #1e3a8a;
        }
        .status {
          margin-top: 20px;
          font-size: 0.875rem;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="offline-icon">📡</div>
        <h1>Du är offline</h1>
        <p>Polishändelser-kartan kräver internetuppkoppling för att visa aktuell data. Kontrollera din anslutning och försök igen.</p>
        <button class="retry-btn" onclick="window.location.reload()">
          Försök igen
        </button>
        <div class="status" id="connection-status">
          Kontrollerar anslutning...
        </div>
      </div>

      <script>
        function updateConnectionStatus() {
          const status = document.getElementById('connection-status');
          if (navigator.onLine) {
            status.textContent = 'Anslutning återställd - klicka "Försök igen"';
            status.style.color = '#059669';
          } else {
            status.textContent = 'Ingen internetanslutning';
            status.style.color = '#dc2626';
          }
        }

        // Update status on load and when connection changes
        updateConnectionStatus();
        window.addEventListener('online', updateConnectionStatus);
        window.addEventListener('offline', updateConnectionStatus);

        // Auto-reload when back online
        window.addEventListener('online', () => {
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        });
      </script>
    </body>
    </html>
  `;
}

// Handle messages from main thread
self.addEventListener('message', event => {
  const { type, payload } = event.data;

  switch (type) {
    case 'CACHE_STATS':
      getCacheStats().then(stats => {
        event.ports[0].postMessage({ type: 'CACHE_STATS_RESPONSE', payload: stats });
      });
      break;

    case 'CLEAR_CACHE':
      clearAllCaches().then(success => {
        event.ports[0].postMessage({ type: 'CLEAR_CACHE_RESPONSE', payload: { success } });
      });
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    default:
      console.warn('[ServiceWorker] Unknown message type:', type);
  }
});

// Get cache statistics
async function getCacheStats() {
  try {
    const [staticCache, dataCache] = await Promise.all([
      caches.open(CACHE_NAME),
      caches.open(DATA_CACHE_NAME)
    ]);

    const [staticKeys, dataKeys] = await Promise.all([
      staticCache.keys(),
      dataCache.keys()
    ]);

    return {
      staticAssets: staticKeys.length,
      cachedData: dataKeys.length,
      totalCaches: staticKeys.length + dataKeys.length,
      cacheNames: [CACHE_NAME, DATA_CACHE_NAME]
    };

  } catch (error) {
    console.error('[ServiceWorker] Error getting cache stats:', error);
    return { error: error.message };
  }
}

// Clear all caches
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );

    console.log('[ServiceWorker] All caches cleared');
    return true;

  } catch (error) {
    console.error('[ServiceWorker] Error clearing caches:', error);
    return false;
  }
}

// Enhanced Background sync for improved data management
if ('sync' in self.registration) {
  self.addEventListener('sync', event => {
    console.log('[ServiceWorker] Background sync triggered:', event.tag);

    switch (event.tag) {
      case 'background-sync-police-data':
        event.waitUntil(
          syncPoliceData()
            .then(() => {
              console.log('[ServiceWorker] Background sync completed successfully');
              // Notify main app that new data is available
              broadcastUpdate('background-sync-complete');
            })
            .catch(error => {
              console.error('[ServiceWorker] Background sync failed:', error);
              // Schedule retry
              scheduleBackgroundSync('background-sync-police-data', 60000); // Retry in 1 minute
            })
        );
        break;

      case 'background-data-sync':
        event.waitUntil(
          performIntelligentSync()
            .then(() => {
              console.log('[ServiceWorker] Intelligent background sync completed');
              broadcastUpdate('intelligent-sync-complete');
            })
            .catch(error => {
              console.error('[ServiceWorker] Intelligent background sync failed:', error);
            })
        );
        break;

      default:
        console.warn('[ServiceWorker] Unknown sync tag:', event.tag);
    }
  });
}

async function syncPoliceData() {
  // Attempt to fetch fresh police data when back online
  const apiUrls = [
    'https://polisen.se/api/events',
    'https://polisen.se/api/policestations'
  ];

  const cache = await caches.open(DATA_CACHE_NAME);

  for (const url of apiUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const responseWithTimestamp = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers),
            'sw-cache-timestamp': Date.now().toString()
          }
        });

        await cache.put(url, responseWithTimestamp);
        console.log(`[ServiceWorker] Synced ${url}`);
      }
    } catch (error) {
      console.warn(`[ServiceWorker] Failed to sync ${url}:`, error);
    }
  }
}

// Periodic cache cleanup (every 24 hours)
setInterval(() => {
  cleanupExpiredCaches()
    .then(() => {
      console.log('[ServiceWorker] Cache cleanup completed');
    })
    .catch(error => {
      console.error('[ServiceWorker] Cache cleanup failed:', error);
    });
}, 24 * 60 * 60 * 1000);

async function cleanupExpiredCaches() {
  const cache = await caches.open(DATA_CACHE_NAME);
  const requests = await cache.keys();

  const now = Date.now();
  let cleanedCount = 0;

  for (const request of requests) {
    const response = await cache.match(request);
    if (response) {
      const timestamp = parseInt(response.headers.get('sw-cache-timestamp') || '0');
      const age = now - timestamp;

      // Remove if older than 7 days
      if (age > 7 * 24 * 60 * 60 * 1000) {
        await cache.delete(request);
        cleanedCount++;
      }
    }
  }

  console.log(`[ServiceWorker] Cleaned ${cleanedCount} expired cache entries`);
  return cleanedCount;
}

// Enhanced sync functions for improved data management
async function performIntelligentSync() {
  console.log('[ServiceWorker] Starting intelligent background sync...');

  try {
    // Check if we're on a metered connection
    if ('connection' in navigator && navigator.connection.effectiveType === 'slow-2g') {
      console.log('[ServiceWorker] Skipping sync on slow connection');
      return;
    }

    // Sync in priority order
    await syncPoliceData();

    // Clear old data to manage storage
    await cleanupExpiredCaches();

    console.log('[ServiceWorker] Intelligent sync completed successfully');
  } catch (error) {
    console.error('[ServiceWorker] Intelligent sync failed:', error);
    throw error;
  }
}

// Broadcast updates to all clients
function broadcastUpdate(type, data = {}) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_UPDATE',
        payload: { type, data, timestamp: Date.now() }
      });
    });
  });
}

// Schedule background sync with retry logic
async function scheduleBackgroundSync(tag, delay = 0) {
  try {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      if (delay > 0) {
        setTimeout(async () => {
          const registration = await navigator.serviceWorker.ready;
          await registration.sync.register(tag);
        }, delay);
      } else {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(tag);
      }
      console.log(`[ServiceWorker] Scheduled background sync: ${tag}`);
    }
  } catch (error) {
    console.error('[ServiceWorker] Failed to schedule background sync:', error);
  }
}

// Enhanced message handling for better communication with main app
self.addEventListener('message', event => {
  const { type, payload } = event.data;

  console.log('[ServiceWorker] Message received:', type);

  switch (type) {
    case 'CACHE_STATS':
      getCacheStats().then(stats => {
        event.ports[0].postMessage({ type: 'CACHE_STATS_RESPONSE', payload: stats });
      });
      break;

    case 'CLEAR_CACHE':
      clearAllCaches().then(success => {
        event.ports[0].postMessage({ type: 'CLEAR_CACHE_RESPONSE', payload: { success } });
      });
      break;

    case 'FORCE_SYNC':
      performIntelligentSync()
        .then(() => {
          event.ports[0].postMessage({ type: 'FORCE_SYNC_RESPONSE', payload: { success: true } });
          broadcastUpdate('force-sync-complete');
        })
        .catch(error => {
          event.ports[0].postMessage({ type: 'FORCE_SYNC_RESPONSE', payload: { success: false, error: error.message } });
        });
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'REQUEST_SYNC':
      scheduleBackgroundSync(payload.tag || 'background-data-sync');
      break;

    default:
      console.warn('[ServiceWorker] Unknown message type:', type);
  }
});

console.log('[ServiceWorker] Professional Police Events Service Worker v2.0 loaded with enhanced sync capabilities');