'use strict';

/**
 * Aktuella Brott - Professional Police Events Map Application
 *
 * A sophisticated, production-ready web application for visualizing
 * real-time police events across Sweden with enhanced data persistence,
 * professional UX, and comprehensive error handling.
 *
 * @version 2.0.0
 * @author Aktuella Brott Team
 */

// ===== CONFIGURATION & CONSTANTS =====
const CONFIG = {
  API: {
    EVENTS: 'https://polisen.se/api/events',
    STATIONS: 'https://polisen.se/api/policestations',
    RSS_SOURCES: [
      'https://polisen.se/aktuellt/rss/',
      'https://api.allorigins.win/get?url=' + encodeURIComponent('https://polisen.se/aktuellt/rss/'),
      'https://polisen.se/aktuellt/handelser/rss/'
    ]
  },
  STORAGE: {
    DB_NAME: 'AktuellaBrottDB',
    DB_VERSION: 2,
    EVENTS_STORE: 'events',
    STATIONS_STORE: 'stations',
    SETTINGS_STORE: 'settings',
    CACHE_DURATION: {
      EVENTS: 2 * 60 * 60 * 1000,      // 2 hours
      STATIONS: 24 * 60 * 60 * 1000,   // 24 hours
      RSS: 30 * 60 * 1000              // 30 minutes
    }
  },
  MAP: {
    CENTER: [62.0, 15.0],
    ZOOM: 5,
    MIN_ZOOM: 4,
    MAX_ZOOM: 18,
    CLUSTER_RADIUS: 25,
    DISABLE_CLUSTERING_AT_ZOOM: 11
  },
  UI: {
    TOAST_DURATION: 3000,
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 300,
    THROTTLE_DELAY: 150
  }
};

// ===== UTILITY FUNCTIONS =====
class Utils {
  /**
   * Show toast notification with enhanced styling and animations
   */
  static showToast(message, duration = CONFIG.UI.TOAST_DURATION, type = 'info') {
    const toast = document.getElementById('toast');
    const existingTimer = toast._timer;

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Add emoji icons based on type
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.textContent = `${icons[type] || icons.info} ${message}`;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';

    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
      toast._timer = null;
    }, duration);

    // Accessibility: Announce to screen readers
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  }

  /**
   * Enhanced loading state management
   */
  static showLoading(text = 'Laddar...') {
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');

    loadingText.textContent = text;
    loading.style.display = 'block';

    // Prevent scrolling while loading
    document.body.style.overflow = 'hidden';

    // Accessibility
    loading.setAttribute('aria-busy', 'true');
    loading.setAttribute('aria-live', 'polite');
  }

  static hideLoading() {
    const loading = document.getElementById('loading');
    loading.style.display = 'none';

    // Restore scrolling
    document.body.style.overflow = '';

    // Accessibility
    loading.setAttribute('aria-busy', 'false');
  }

  /**
   * Performance-optimized debounce function
   */
  static debounce(func, delay = CONFIG.UI.DEBOUNCE_DELAY) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
  }

  /**
   * Performance-optimized throttle function
   */
  static throttle(func, delay = CONFIG.UI.THROTTLE_DELAY) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(null, args);
      }
    };
  }

  /**
   * Enhanced fetch with comprehensive retry logic and error handling
   */
  static async fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        lastError = error;

        if (i < maxRetries - 1) {
          // Exponential backoff with jitter
          const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Safe JSON parsing with detailed error information
   */
  static async safeJsonParse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('JSON Parse Error:', {
        error: error.message,
        text: text.substring(0, 200),
        url: response.url
      });
      throw new Error(`Invalid JSON response from ${response.url}: ${error.message}`);
    }
  }

  /**
   * Enhanced HTML sanitization for XSS protection
   */
  static sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/[<>]/g, '');
  }

  /**
   * Swedish locale date formatting
   */
  static formatDate(date, options = {}) {
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm'
    };

    return new Intl.DateTimeFormat('sv-SE', {
      ...defaultOptions,
      ...options
    }).format(new Date(date));
  }

  /**
   * Generate stable, unique ID from object content
   */
  static generateStableId(obj) {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `id_${Math.abs(hash).toString(36)}_${Date.now()}`;
  }

  /**
   * Check if coordinates are within Sweden's bounds
   */
  static isWithinSweden(lat, lng) {
    return lat >= 55.0 && lat <= 69.3 && lng >= 10.5 && lng <= 24.5;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

// ===== ENHANCED CRIME SEVERITY SYSTEM =====
class CrimeSeveritySystem {
  static SEVERITY_MAPPING = {
    // Level 1 - Minor offenses (Green tones)
    'Trafikbrott': { level: 1, color: '#059669', description: 'Trafikbrott', priority: 'low' },
    'Fortkörning': { level: 1, color: '#059669', description: 'Fortkörning', priority: 'low' },
    'Parkering': { level: 1, color: '#22c55e', description: 'Parkeringsbrott', priority: 'low' },
    'Ordningslagen': { level: 1, color: '#22c55e', description: 'Ordningslagen', priority: 'low' },

    // Level 2 - Property crimes (Yellow-Orange tones)
    'Skadegörelse': { level: 2, color: '#f59e0b', description: 'Skadegörelse', priority: 'medium' },
    'Stöld': { level: 2, color: '#f97316', description: 'Stöld', priority: 'medium' },
    'Snatteri': { level: 2, color: '#f97316', description: 'Snatteri', priority: 'medium' },
    'Bedrägeri': { level: 2, color: '#ea580c', description: 'Bedrägeri', priority: 'medium' },
    'Inbrott': { level: 3, color: '#dc2626', description: 'Inbrott', priority: 'high' },

    // Level 3 - Drug crimes and serious property crimes (Orange-Red tones)
    'Narkotikabrott': { level: 3, color: '#dc2626', description: 'Narkotikabrott', priority: 'high' },
    'Rattfylleri': { level: 3, color: '#dc2626', description: 'Rattfylleri', priority: 'high' },
    'Rattonykterhet': { level: 3, color: '#dc2626', description: 'Rattonykterhet', priority: 'high' },
    'Rån': { level: 4, color: '#991b1b', description: 'Rån', priority: 'critical' },

    // Level 4 - Violent crimes (Red tones)
    'Misshandel': { level: 4, color: '#991b1b', description: 'Misshandel', priority: 'critical' },
    'Våldtäkt': { level: 5, color: '#7f1d1d', description: 'Våldtäkt', priority: 'critical' },
    'Våld mot tjänsteman': { level: 4, color: '#991b1b', description: 'Våld mot tjänsteman', priority: 'critical' },
    'Olaga hot': { level: 3, color: '#dc2626', description: 'Olaga hot', priority: 'high' },

    // Level 5 - Most serious crimes (Dark Red tones)
    'Mord': { level: 5, color: '#7f1d1d', description: 'Mord', priority: 'critical' },
    'Dråp': { level: 5, color: '#7f1d1d', description: 'Dråp', priority: 'critical' },
    'Mordbrand': { level: 5, color: '#7f1d1d', description: 'Mordbrand', priority: 'critical' },
    'Brand': { level: 4, color: '#991b1b', description: 'Brand', priority: 'critical' },

    // Default fallback
    'Övrigt': { level: 2, color: '#6b7280', description: 'Övrigt', priority: 'medium' }
  };

  /**
   * Get severity information with fuzzy matching
   */
  static getSeverityInfo(crimeType) {
    if (!crimeType) return this.SEVERITY_MAPPING['Övrigt'];

    // Direct match
    if (this.SEVERITY_MAPPING[crimeType]) {
      return this.SEVERITY_MAPPING[crimeType];
    }

    // Fuzzy matching for similar crime types
    const lowerType = crimeType.toLowerCase();

    for (const [key, value] of Object.entries(this.SEVERITY_MAPPING)) {
      const lowerKey = key.toLowerCase();
      if (lowerType.includes(lowerKey) || lowerKey.includes(lowerType)) {
        return { ...value, matchType: 'fuzzy' };
      }
    }

    // Keyword-based matching
    const crimeKeywords = {
      'stöld': this.SEVERITY_MAPPING['Stöld'],
      'stol': this.SEVERITY_MAPPING['Stöld'],
      'inbrott': this.SEVERITY_MAPPING['Inbrott'],
      'rån': this.SEVERITY_MAPPING['Rån'],
      'misshandel': this.SEVERITY_MAPPING['Misshandel'],
      'våld': this.SEVERITY_MAPPING['Misshandel'],
      'narkotika': this.SEVERITY_MAPPING['Narkotikabrott'],
      'trafik': this.SEVERITY_MAPPING['Trafikbrott'],
      'brand': this.SEVERITY_MAPPING['Brand'],
      'fylleri': this.SEVERITY_MAPPING['Rattfylleri']
    };

    for (const [keyword, severity] of Object.entries(crimeKeywords)) {
      if (lowerType.includes(keyword)) {
        return { ...severity, matchType: 'keyword' };
      }
    }

    // Default fallback
    return { ...this.SEVERITY_MAPPING['Övrigt'], matchType: 'default' };
  }

  static getSeverityColor(crimeType) {
    return this.getSeverityInfo(crimeType).color;
  }

  static getSeverityLevel(crimeType) {
    return this.getSeverityInfo(crimeType).level;
  }

  static getPriorityLevel(crimeType) {
    return this.getSeverityInfo(crimeType).priority;
  }

  /**
   * Get all crime types grouped by severity level
   */
  static getSeverityLevels() {
    const levels = {};
    Object.entries(this.SEVERITY_MAPPING).forEach(([type, info]) => {
      if (!levels[info.level]) {
        levels[info.level] = [];
      }
      levels[info.level].push({ type, ...info });
    });
    return levels;
  }

  /**
   * Get severity distribution statistics
   */
  static getSeverityStats(events) {
    const stats = {
      total: events.length,
      byLevel: {},
      byPriority: { low: 0, medium: 0, high: 0, critical: 0 }
    };

    events.forEach(event => {
      const info = this.getSeverityInfo(event.type);

      stats.byLevel[info.level] = (stats.byLevel[info.level] || 0) + 1;
      stats.byPriority[info.priority] = (stats.byPriority[info.priority] || 0) + 1;
    });

    return stats;
  }
}

// ===== ENHANCED DATA STORAGE =====
class DataStorage {
  static db = null;

  /**
   * Initialize enhanced IndexedDB with multiple stores and indexes
   */
  static async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.STORAGE.DB_NAME, CONFIG.STORAGE.DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Events store with comprehensive indexing
        if (!db.objectStoreNames.contains(CONFIG.STORAGE.EVENTS_STORE)) {
          const eventsStore = db.createObjectStore(CONFIG.STORAGE.EVENTS_STORE, { keyPath: 'id' });
          eventsStore.createIndex('timestamp', 'timeMs');
          eventsStore.createIndex('type', 'type');
          eventsStore.createIndex('city', 'city');
          eventsStore.createIndex('severity', 'severityLevel');
          eventsStore.createIndex('coordinates', ['lat', 'lng']);
          eventsStore.createIndex('exactLocation', 'exactLocation');
        }

        // Stations store
        if (!db.objectStoreNames.contains(CONFIG.STORAGE.STATIONS_STORE)) {
          const stationsStore = db.createObjectStore(CONFIG.STORAGE.STATIONS_STORE, { keyPath: 'id' });
          stationsStore.createIndex('name', 'name');
          stationsStore.createIndex('coordinates', ['lat', 'lng']);
        }

        // Settings store for user preferences
        if (!db.objectStoreNames.contains(CONFIG.STORAGE.SETTINGS_STORE)) {
          const settingsStore = db.createObjectStore(CONFIG.STORAGE.SETTINGS_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Save events with enhanced metadata
   */
  static async saveEvents(events) {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CONFIG.STORAGE.EVENTS_STORE], 'readwrite');
      const store = transaction.objectStore(CONFIG.STORAGE.EVENTS_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      events.forEach(event => {
        const eventData = {
          id: event.id,
          timeMs: event.timeMs,
          timestamp: event.timestamp,
          type: event.type,
          title: event.title,
          description: event.description,
          city: event.city,
          address: event.address,
          lat: event.lat,
          lng: event.lng,
          exactLocation: event.exactLocation,
          severityInfo: event.severityInfo,
          severityLevel: event.severityInfo.level,
          url: event.url,
          cached: Date.now()
        };
        store.put(eventData);
      });
    });
  }

  /**
   * Get events with advanced filtering options
   */
  static async getEvents(options = {}) {
    if (!this.db) await this.initialize();

    const {
      maxAge = CONFIG.STORAGE.CACHE_DURATION.EVENTS,
      limit = 1000,
      severityLevel = null,
      city = null,
      exactLocation = null
    } = options;

    const cutoff = Date.now() - maxAge;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CONFIG.STORAGE.EVENTS_STORE], 'readonly');
      const store = transaction.objectStore(CONFIG.STORAGE.EVENTS_STORE);

      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        let events = request.result || [];

        // Apply filters
        events = events.filter(event => {
          if (event.cached < cutoff) return false;
          if (severityLevel && event.severityLevel !== severityLevel) return false;
          if (city && !event.city.toLowerCase().includes(city.toLowerCase())) return false;
          if (exactLocation !== null && event.exactLocation !== exactLocation) return false;
          return true;
        });

        // Sort by timestamp and limit
        events = events
          .sort((a, b) => b.timeMs - a.timeMs)
          .slice(0, limit);

        resolve(events);
      };
    });
  }

  /**
   * Save stations with metadata
   */
  static async saveStations(stations) {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CONFIG.STORAGE.STATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(CONFIG.STORAGE.STATIONS_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      stations.forEach(station => {
        const stationData = {
          ...station,
          cached: Date.now()
        };
        store.put(stationData);
      });
    });
  }

  /**
   * Get cached stations
   */
  static async getStations(maxAge = CONFIG.STORAGE.CACHE_DURATION.STATIONS) {
    if (!this.db) await this.initialize();

    const cutoff = Date.now() - maxAge;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CONFIG.STORAGE.STATIONS_STORE], 'readonly');
      const store = transaction.objectStore(CONFIG.STORAGE.STATIONS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const stations = (request.result || []).filter(station => station.cached >= cutoff);
        resolve(stations);
      };
    });
  }

  /**
   * Save user settings/preferences
   */
  static async saveSetting(key, value) {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CONFIG.STORAGE.SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(CONFIG.STORAGE.SETTINGS_STORE);

      const request = store.put({ key, value, updated: Date.now() });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get user setting
   */
  static async getSetting(key, defaultValue = null) {
    if (!this.db) await this.initialize();

    return new Promise((resolve) => {
      const transaction = this.db.transaction([CONFIG.STORAGE.SETTINGS_STORE], 'readonly');
      const store = transaction.objectStore(CONFIG.STORAGE.SETTINGS_STORE);
      const request = store.get(key);

      request.onerror = () => resolve(defaultValue);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultValue);
      };
    });
  }

  /**
   * Clean up old cached data
   */
  static async cleanup() {
    if (!this.db) await this.initialize();

    const stores = [CONFIG.STORAGE.EVENTS_STORE, CONFIG.STORAGE.STATIONS_STORE];
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

    return Promise.all(stores.map(storeName => {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor();

        let deletedCount = 0;

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const record = cursor.value;
            if (record.cached && record.cached < cutoffTime) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            console.log(`Cleaned ${deletedCount} old records from ${storeName}`);
            resolve(deletedCount);
          }
        };
      });
    }));
  }

  /**
   * Get storage usage statistics
   */
  static async getStorageStats() {
    if (!this.db) await this.initialize();

    const stats = {
      events: 0,
      stations: 0,
      settings: 0,
      totalSize: 0
    };

    const stores = [
      CONFIG.STORAGE.EVENTS_STORE,
      CONFIG.STORAGE.STATIONS_STORE,
      CONFIG.STORAGE.SETTINGS_STORE
    ];

    await Promise.all(stores.map(storeName => {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const key = storeName.replace('Store', '').toLowerCase();
          stats[key] = request.result;
          resolve();
        };
      });
    }));

    // Estimate storage size (rough calculation)
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        stats.totalSize = estimate.usage || 0;
        stats.availableSize = estimate.quota || 0;
      } catch (error) {
        console.warn('Could not estimate storage usage:', error);
      }
    }

    return stats;
  }
}

// ===== ENHANCED DATA MODELS =====
class PoliceEvent {
  constructor(rawData) {
    this.id = Utils.generateStableId(rawData);
    this.rawData = rawData;
    this.parseData();
    this.validateData();
  }

  parseData() {
    const raw = this.rawData;

    // Parse coordinates with enhanced validation
    this.parseCoordinates();

    // Parse date/time with timezone handling
    this.parseDateTime();

    // Extract and enhance location information
    this.parseLocation();

    // Parse event details with content analysis
    this.type = this.normalizeEventType(raw.type || 'Okänd händelse');
    this.title = Utils.sanitizeHTML(raw.name || raw.title || this.type);
    this.description = Utils.sanitizeHTML(raw.summary || raw.description || '');
    this.url = this.validateURL(raw.url || raw.externalSource);

    // Determine location accuracy with enhanced logic
    this.exactLocation = this.determineLocationAccuracy();

    // Get enhanced severity information
    this.severityInfo = CrimeSeveritySystem.getSeverityInfo(this.type);
    this.priority = this.severityInfo.priority;

    // Extract additional metadata
    this.parseMetadata();
  }

  parseCoordinates() {
    const raw = this.rawData;
    let lat = null, lng = null;

    // Handle various coordinate formats
    if (raw.location && raw.location.gps) {
      const gps = raw.location.gps;

      if (typeof gps === 'string') {
        const coords = gps.split(',').map(c => parseFloat(c.trim()));
        if (coords.length === 2 && coords.every(c => !isNaN(c))) {
          [lat, lng] = coords;
        }
      } else if (typeof gps === 'object') {
        lat = parseFloat(gps.lat || gps.latitude || gps.y);
        lng = parseFloat(gps.lng || gps.longitude || gps.lon || gps.x);
      }
    }

    // Validate coordinates are within reasonable bounds for Sweden
    if (lat && lng && Utils.isWithinSweden(lat, lng)) {
      this.lat = lat;
      this.lng = lng;
      this.coordinateSource = 'gps';
    } else {
      this.lat = null;
      this.lng = null;
      this.coordinateSource = 'none';
    }
  }

  parseDateTime() {
    const raw = this.rawData;
    const dateStr = raw.datetime || raw.pubDate || raw.date || raw.timestamp;

    if (dateStr) {
      // Handle various date formats
      const possibleFormats = [
        dateStr,
        dateStr.replace(/\+\d{2}:\d{2}$/, ''),
        dateStr.replace(/Z$/, ''),
        dateStr + 'T00:00:00'
      ];

      for (const format of possibleFormats) {
        const date = new Date(format);
        if (!isNaN(date.getTime())) {
          this.timestamp = date;
          break;
        }
      }
    }

    if (!this.timestamp || isNaN(this.timestamp.getTime())) {
      this.timestamp = new Date();
      this.timestampSource = 'fallback';
    } else {
      this.timestampSource = 'parsed';
    }

    this.timeMs = this.timestamp.getTime();

    // Add time-based metadata
    this.hour = this.timestamp.getHours();
    this.dayOfWeek = this.timestamp.getDay();
    this.isWeekend = this.dayOfWeek === 0 || this.dayOfWeek === 6;
  }

  parseLocation() {
    const raw = this.rawData;

    // Extract city/location with fallbacks
    this.city = raw.location?.name || this.extractCityFromDescription() || 'Okänd plats';

    // Extract detailed address information
    this.address = this.extractDetailedAddress() || this.city;

    // Apply privacy-conscious random offset for non-exact locations
    if (!this.exactLocation && this.lat && this.lng) {
      this.applyPrivacyOffset();
    }

    // Validate location consistency
    this.validateLocationConsistency();
  }

  parseMetadata() {
    // Extract additional useful metadata from description
    this.keywords = this.extractKeywords();
    this.persons = this.extractPersonCount();
    this.vehicles = this.extractVehicleInfo();
    this.timeOfDay = this.categorizeTimeOfDay();
  }

  normalizeEventType(type) {
    // Normalize and standardize event types
    const typeMap = {
      'Stöld/inbrott': 'Inbrott',
      'Trafikolycka': 'Trafikbrott',
      'Rån/stöld': 'Rån',
      'Våld': 'Misshandel'
    };

    return typeMap[type] || type;
  }

  validateURL(url) {
    if (!url) return null;

    try {
      const parsedURL = new URL(url);
      return parsedURL.protocol === 'http:' || parsedURL.protocol === 'https:' ? url : null;
    } catch {
      return null;
    }
  }

  extractCityFromDescription() {
    const text = (this.description + ' ' + this.title).toLowerCase();

    // Swedish city patterns
    const cityPatterns = [
      /(?:i|från|vid)\s+([A-ZÅÄÖ][a-zåäö]{2,})/g,
      /([A-ZÅÄÖ][a-zåäö]+)(?:\s+kommun)?/g
    ];

    for (const pattern of cityPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].length > 3) {
        return match[1];
      }
    }

    return null;
  }

  extractDetailedAddress() {
    const text = (this.description + ' ' + this.title);

    // Swedish address patterns
    const addressPatterns = [
      /(?:vid|på|i|från)\s+([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|torget|platsen|parken|stigen)(?:\s+\d+)?)/i,
      /(?:vid|på|i|från)\s+([A-ZÅÄÖ][a-zåäö]+\s+\d+[A-Za-z]?)/i,
      /(\w+(?:gatan|vägen|torget|platsen)\s+\d+)/i
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return Utils.sanitizeHTML(match[1]);
      }
    }

    return null;
  }

  extractKeywords() {
    const text = (this.description + ' ' + this.title).toLowerCase();
    const keywords = [];

    // Crime-related keywords
    const crimeKeywords = [
      'vapen', 'kniv', 'pistol', 'bil', 'cykel', 'mobil', 'plånbok',
      'butik', 'hem', 'skola', 'sjukhus', 'station', 'flykt', 'anhållen'
    ];

    crimeKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    return keywords;
  }

  extractPersonCount() {
    const text = (this.description + ' ' + this.title).toLowerCase();

    // Look for person count indicators
    const personPatterns = [
      /(\d+)\s*person/g,
      /(\d+)\s*individ/g,
      /flera\s+person/g
    ];

    for (const pattern of personPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].includes('flera') ? '3+' : match[1];
      }
    }

    return null;
  }

  extractVehicleInfo() {
    const text = (this.description + ' ' + this.title).toLowerCase();
    const vehicles = [];

    const vehicleTypes = ['bil', 'lastbil', 'motorcykel', 'cykel', 'moped', 'buss'];

    vehicleTypes.forEach(vehicle => {
      if (text.includes(vehicle)) {
        vehicles.push(vehicle);
      }
    });

    return vehicles.length > 0 ? vehicles : null;
  }

  categorizeTimeOfDay() {
    const hour = this.hour;

    if (hour >= 6 && hour < 12) return 'morgon';
    if (hour >= 12 && hour < 18) return 'dag';
    if (hour >= 18 && hour < 22) return 'kväll';
    return 'natt';
  }

  determineLocationAccuracy() {
    const text = (this.description + ' ' + this.title).toLowerCase();

    // Indicators of exact location
    const exactIndicators = [
      'gatan', 'vägen', 'torget', 'platsen', 'nummer', 'adress',
      /\d+[a-z]?\s*[,\.]/, // Street numbers
    ];

    // Indicators of approximate location
    const approximateIndicators = [
      'området', 'närheten', 'cirka', 'ungefär', 'runt', 'vid', 'nära'
    ];

    const hasExact = exactIndicators.some(indicator =>
      typeof indicator === 'string' ? text.includes(indicator) : indicator.test(text)
    );

    const hasApproximate = approximateIndicators.some(indicator => text.includes(indicator));

    return hasExact && !hasApproximate;
  }

  applyPrivacyOffset() {
    if (!this.lat || !this.lng) return;

    // Add random offset up to ~300 meters for privacy
    const offsetLat = (Math.random() - 0.5) * 0.006; // ~300m
    const offsetLng = (Math.random() - 0.5) * 0.009; // ~300m

    this.lat += offsetLat;
    this.lng += offsetLng;
    this.coordinateSource = 'offset';
  }

  validateLocationConsistency() {
    // Check if extracted city matches coordinates (basic validation)
    if (this.lat && this.lng && this.city) {
      // This could be enhanced with a city-coordinate database
      this.locationConsistency = 'unverified';
    }
  }

  validateData() {
    this.isValid = Boolean(
      this.lat &&
      this.lng &&
      this.timestamp &&
      this.type &&
      Utils.isWithinSweden(this.lat, this.lng)
    );

    if (!this.isValid) {
      console.warn('Invalid event data:', {
        id: this.id,
        hasCoordinates: Boolean(this.lat && this.lng),
        hasTimestamp: Boolean(this.timestamp),
        hasType: Boolean(this.type),
        withinSweden: this.lat && this.lng ? Utils.isWithinSweden(this.lat, this.lng) : false
      });
    }
  }

  getFormattedTime() {
    return Utils.formatDate(this.timestamp);
  }

  getRelativeTime() {
    const now = new Date();
    const diffMs = now.getTime() - this.timeMs;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 7) return Utils.formatDate(this.timestamp, { month: 'short', day: 'numeric' });
    if (diffDays > 0) return `${diffDays} dag${diffDays > 1 ? 'ar' : ''} sedan`;
    if (diffHours > 0) return `${diffHours} timm${diffHours > 1 ? 'ar' : 'e'} sedan`;
    return 'Nyligen';
  }

  /**
   * Generate enhanced popup content with better structure and information
   */
  getPopupContent() {
    const severityColor = this.severityInfo.color;
    const priorityEmojis = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };

    const locationAccuracy = this.exactLocation ?
      '<span style="color: #059669; font-size: 0.75rem; font-weight: 500;">📍 Exakt position</span>' :
      '<span style="color: #d97706; font-size: 0.75rem; font-weight: 500;">📍 Ungefärlig position</span>';

    const fullAddress = this.address !== this.city ? this.address : this.city;
    const relativeTime = this.getRelativeTime();

    return `
      <div style="min-width: 280px; font-family: inherit; line-height: 1.6;">
        <header style="margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid ${severityColor};">
          <h3 style="margin: 0 0 4px; color: var(--text-primary); font-size: 1rem; font-weight: 600;">
            ${Utils.sanitizeHTML(this.title)}
          </h3>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            ${relativeTime} • ${this.getFormattedTime()}
          </div>
        </header>

        <div style="margin: 12px 0; padding: 10px 12px; background: #f8fafc; border-left: 4px solid ${severityColor}; border-radius: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            ${priorityEmojis[this.priority]}
            <strong style="color: var(--text-primary); font-size: 0.9rem;">
              ${Utils.sanitizeHTML(this.severityInfo.description)}
            </strong>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Prioritet: ${this.priority} • Nivå ${this.severityInfo.level}/5
          </div>
        </div>

        <section style="margin: 12px 0;">
          <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
            📍 Plats:
          </strong>
          <div style="margin: 4px 0 8px;">
            <div style="color: var(--text-primary); font-size: 0.875rem; margin-bottom: 4px;">
              ${Utils.sanitizeHTML(fullAddress)}
            </div>
            ${locationAccuracy}
          </div>
        </section>

        ${this.description ? `
          <section style="margin: 12px 0; padding-top: 8px; border-top: 1px solid var(--border-light);">
            <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
              📄 Beskrivning:
            </strong>
            <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 4px; line-height: 1.5;">
              ${Utils.sanitizeHTML(this.description)}
            </div>
          </section>
        ` : ''}

        ${this.keywords && this.keywords.length > 0 ? `
          <section style="margin: 12px 0;">
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${this.keywords.map(keyword => `
                <span style="background: var(--bg-tertiary); color: var(--text-muted); padding: 2px 6px; border-radius: 12px; font-size: 0.7rem;">
                  ${Utils.sanitizeHTML(keyword)}
                </span>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${this.url ? `
          <footer style="margin: 12px 0 0; padding-top: 8px; border-top: 1px solid var(--border-light);">
            <a href="${this.url}" target="_blank" rel="noopener noreferrer"
               style="color: var(--color-primary); text-decoration: none; font-size: 0.875rem; font-weight: 500;">
              🔗 Mer information →
            </a>
          </footer>
        ` : ''}
      </div>
    `;
  }
}

class PoliceStation {
  constructor(rawData) {
    this.id = Utils.generateStableId(rawData);
    this.rawData = rawData;
    this.parseData();
    this.validateData();
  }

  parseData() {
    const raw = this.rawData;

    this.name = Utils.sanitizeHTML(raw.name || 'Polisstation');
    this.parseCoordinates();
    this.parseContactInfo();
    this.parseServices();
    this.parseOperatingHours();
  }

  parseCoordinates() {
    const raw = this.rawData;
    let lat = null, lng = null;

    const location = raw.location;
    if (location) {
      const gps = location.gps || location.position || location.coordinates;

      if (typeof gps === 'string') {
        const coords = gps.split(',').map(c => parseFloat(c.trim()));
        if (coords.length === 2 && coords.every(c => !isNaN(c))) {
          [lat, lng] = coords;
        }
      } else if (gps && typeof gps === 'object') {
        lat = parseFloat(gps.lat || gps.latitude || gps.y);
        lng = parseFloat(gps.lng || gps.longitude || gps.lon || gps.x);
      }
    }

    if (lat && lng && Utils.isWithinSweden(lat, lng)) {
      this.lat = lat;
      this.lng = lng;
    } else {
      this.lat = null;
      this.lng = null;
    }
  }

  parseContactInfo() {
    const raw = this.rawData;

    this.address = Utils.sanitizeHTML(
      raw.location?.name ||
      raw.location?.address ||
      raw.address ||
      'Adress ej tillgänglig'
    );

    this.phone = this.normalizePhoneNumber(
      raw.phone || raw.contact?.phone || raw.telephone || ''
    );

    this.email = this.validateEmail(
      raw.email || raw.contact?.email || ''
    );

    this.website = this.validateURL(
      raw.url || raw.Url || raw.website || raw.location?.url
    );
  }

  parseServices() {
    const raw = this.rawData;

    if (Array.isArray(raw.services)) {
      this.services = raw.services.map(s => Utils.sanitizeHTML(s));
    } else if (typeof raw.services === 'string') {
      this.services = raw.services.split(',').map(s => Utils.sanitizeHTML(s.trim()));
    } else {
      this.services = [];
    }

    this.servicesText = this.services.length > 0 ?
      this.services.join(', ') :
      'Allmänna polistjänster';

    // Categorize services
    this.serviceCategories = this.categorizeServices();
  }

  parseOperatingHours() {
    const raw = this.rawData;

    this.openingHours = Utils.sanitizeHTML(
      raw.openingHours ||
      raw.hours ||
      raw.operatingHours ||
      ''
    );

    this.isAlwaysOpen = this.openingHours.toLowerCase().includes('dygnet') ||
                      this.openingHours.toLowerCase().includes('24');
  }

  normalizePhoneNumber(phone) {
    if (!phone) return '';

    // Basic phone number normalization for Swedish numbers
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length >= 8) {
      // Format as Swedish phone number
      if (cleaned.startsWith('46')) {
        return `+${cleaned}`;
      } else if (cleaned.startsWith('0')) {
        return `+46${cleaned.substring(1)}`;
      } else {
        return `+46${cleaned}`;
      }
    }

    return phone; // Return original if can't normalize
  }

  validateEmail(email) {
    if (!email) return '';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? email : '';
  }

  validateURL(url) {
    if (!url) return null;

    try {
      const parsedURL = new URL(url);
      return parsedURL.protocol === 'http:' || parsedURL.protocol === 'https:' ? url : null;
    } catch {
      return null;
    }
  }

  categorizeServices() {
    const categories = {
      emergency: [],
      administrative: [],
      specialized: [],
      public: []
    };

    const serviceMapping = {
      emergency: ['akut', 'jourhavande', 'larmcentral', 'beredskap'],
      administrative: ['pass', 'tillstånd', 'anmälan', 'administration'],
      specialized: ['trafikpolis', 'kriminalpolis', 'narkotika', 'ekonomisk'],
      public: ['reception', 'allmän', 'besök', 'information']
    };

    this.services.forEach(service => {
      const lowerService = service.toLowerCase();
      let categorized = false;

      for (const [category, keywords] of Object.entries(serviceMapping)) {
        if (keywords.some(keyword => lowerService.includes(keyword))) {
          categories[category].push(service);
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        categories.public.push(service);
      }
    });

    return categories;
  }

  validateData() {
    this.isValid = Boolean(
      this.name &&
      this.lat &&
      this.lng &&
      Utils.isWithinSweden(this.lat, this.lng)
    );
  }

  createMarker() {
    if (!this.isValid) return null;

    const icon = L.divIcon({
      className: 'police-station-icon',
      html: `<div style="
        background: #6b7280;
        border: 2px solid white;
        border-radius: 50%;
        width: 12px;
        height: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        transition: all 0.15s ease;
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const marker = L.marker([this.lat, this.lng], {
      icon: icon,
      zIndexOffset: 100 // Below crime events
    });

    marker.bindPopup(this.getPopupContent(), {
      maxWidth: 350,
      className: 'police-station-popup'
    });

    // Add hover effects
    marker.on('mouseover', function() {
      this.getElement().style.transform = 'scale(1.2)';
    });

    marker.on('mouseout', function() {
      this.getElement().style.transform = 'scale(1)';
    });

    return marker;
  }

  getPopupContent() {
    const statusIndicator = this.isAlwaysOpen ?
      '<span style="color: #22c55e; font-size: 0.75rem; font-weight: 500;">🟢 Öppet dygnet runt</span>' :
      this.openingHours ?
        `<span style="color: #f59e0b; font-size: 0.75rem; font-weight: 500;">🟡 Begränsade öppettider</span>` :
        '<span style="color: #6b7280; font-size: 0.75rem; font-weight: 500;">⚪ Kontakta för öppettider</span>';

    return `
      <div style="min-width: 260px; font-family: inherit; line-height: 1.6;">
        <header style="margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--color-primary);">
          <h3 style="margin: 0 0 4px; color: var(--text-primary); font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
            🏢 ${Utils.sanitizeHTML(this.name)}
          </h3>
          ${statusIndicator}
        </header>

        <section style="margin: 12px 0;">
          <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
            📍 Adress:
          </strong>
          <div style="color: var(--text-primary); font-size: 0.875rem; margin-top: 4px;">
            ${Utils.sanitizeHTML(this.address)}
          </div>
        </section>

        <section style="margin: 12px 0;">
          <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
            🛡️ Tjänster:
          </strong>
          <div style="color: var(--text-primary); font-size: 0.875rem; margin-top: 4px;">
            ${Utils.sanitizeHTML(this.servicesText)}
          </div>
        </section>

        ${this.phone ? `
          <section style="margin: 12px 0;">
            <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
              📞 Telefon:
            </strong>
            <div style="margin-top: 4px;">
              <a href="tel:${this.phone}" style="color: var(--color-primary); text-decoration: none; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 4px;">
                📞 ${this.phone}
              </a>
            </div>
          </section>
        ` : ''}

        ${this.email ? `
          <section style="margin: 12px 0;">
            <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
              ✉️ E-post:
            </strong>
            <div style="margin-top: 4px;">
              <a href="mailto:${this.email}" style="color: var(--color-primary); text-decoration: none; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 4px;">
                ✉️ ${this.email}
              </a>
            </div>
          </section>
        ` : ''}

        ${this.openingHours ? `
          <section style="margin: 12px 0;">
            <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">
              🕒 Öppettider:
            </strong>
            <div style="color: var(--text-primary); font-size: 0.875rem; margin-top: 4px;">
              ${Utils.sanitizeHTML(this.openingHours)}
            </div>
          </section>
        ` : ''}

        ${this.website ? `
          <footer style="margin: 12px 0 0; padding-top: 8px; border-top: 1px solid var(--border-light);">
            <a href="${this.website}" target="_blank" rel="noopener noreferrer"
               style="color: var(--color-primary); text-decoration: none; font-size: 0.875rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
              🌐 Mer information →
            </a>
          </footer>
        ` : ''}
      </div>
    `;
  }
}

// ===== MAIN APPLICATION CLASS =====
class PoliceEventsApp {
  constructor() {
    this.map = null;
    this.eventCluster = null;
    this.stationCluster = null;
    this.allEvents = [];
    this.allStations = [];
    this.filteredEvents = [];
    this.currentFilters = {
      severity: 'all',
      timeRange: '7days',
      exactLocation: 'all',
      city: ''
    };
    this.isLoading = false;
    this.lastUpdateTime = null;
    this.userLocation = null;

    // Bind methods
    this.handleFilterChange = Utils.debounce(this.handleFilterChange.bind(this), 300);
    this.handleMapZoom = Utils.throttle(this.handleMapZoom.bind(this), 150);
  }

  /**
   * Initialize the complete application
   */
  async initialize() {
    try {
      Utils.showLoading('Initialiserar applikationen...');

      // Initialize data storage
      await DataStorage.initialize();

      // Initialize map
      this.initializeMap();

      // Set up UI event listeners
      this.setupEventListeners();

      // Initialize geolocation if available
      this.initializeGeolocation();

      // Load initial data
      await this.loadInitialData();

      // Set up automatic refresh
      this.setupAutoRefresh();

      // Clean up old cached data
      await DataStorage.cleanup();

      Utils.hideLoading();
      Utils.showToast('Applikationen startad', 2000, 'success');

    } catch (error) {
      console.error('Failed to initialize application:', error);
      Utils.hideLoading();
      Utils.showToast('Kunde inte starta applikationen', 5000, 'error');
    }
  }

  initializeMap() {
    // Create map with professional styling
    this.map = L.map('map', {
      center: CONFIG.MAP.CENTER,
      zoom: CONFIG.MAP.ZOOM,
      minZoom: CONFIG.MAP.MIN_ZOOM,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    });

    // Add zoom control in custom position
    L.control.zoom({
      position: 'topright'
    }).addTo(this.map);

    // Custom attribution
    this.map.attributionControl.setPrefix('');
    this.map.attributionControl.addAttribution('© Aktuella Brott | Data från Polisen.se');

    // Add tile layer with professional styling
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      className: 'map-tiles'
    }).addTo(this.map);

    // Create marker clusters
    this.eventCluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      disableClusteringAtZoom: CONFIG.MAP.DISABLE_CLUSTERING_AT_ZOOM,
      maxClusterRadius: CONFIG.MAP.CLUSTER_RADIUS,
      iconCreateFunction: this.createEventClusterIcon.bind(this)
    });

    this.stationCluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
      removeOutsideVisibleBounds: true,
      disableClusteringAtZoom: CONFIG.MAP.DISABLE_CLUSTERING_AT_ZOOM,
      maxClusterRadius: 35,
      iconCreateFunction: this.createStationClusterIcon.bind(this)
    });

    // Add clusters to map
    this.map.addLayer(this.eventCluster);
    this.map.addLayer(this.stationCluster);

    // Map event listeners
    this.map.on('zoomend', this.handleMapZoom);
    this.map.on('moveend', this.updateVisibleCounts.bind(this));
  }

  setupEventListeners() {
    // Filter controls
    const severityFilter = document.getElementById('severity-filter');
    const timeRangeFilter = document.getElementById('time-range-filter');
    const locationFilter = document.getElementById('location-filter');
    const citySearch = document.getElementById('city-search');
    const refreshBtn = document.getElementById('refresh-btn');

    if (severityFilter) {
      severityFilter.addEventListener('change', this.handleFilterChange);
    }
    if (timeRangeFilter) {
      timeRangeFilter.addEventListener('change', this.handleFilterChange);
    }
    if (locationFilter) {
      locationFilter.addEventListener('change', this.handleFilterChange);
    }
    if (citySearch) {
      citySearch.addEventListener('input', Utils.debounce(this.handleFilterChange.bind(this), 500));
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this.refreshData.bind(this));
    }

    // Settings and controls
    const settingsBtn = document.getElementById('settings-btn');
    const infoBtn = document.getElementById('info-btn');
    const locationBtn = document.getElementById('location-btn');

    if (settingsBtn) {
      settingsBtn.addEventListener('click', this.showSettings.bind(this));
    }
    if (infoBtn) {
      infoBtn.addEventListener('click', this.showInfo.bind(this));
    }
    if (locationBtn) {
      locationBtn.addEventListener('click', this.centerOnUserLocation.bind(this));
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.refreshData();
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (citySearch) citySearch.focus();
      }
    });
  }

  async loadInitialData() {
    try {
      Utils.showLoading('Laddar händelser och stationer...');

      // Try to load cached data first for faster startup
      const [cachedEvents, cachedStations] = await Promise.all([
        DataStorage.getEvents({ maxAge: CONFIG.STORAGE.CACHE_DURATION.EVENTS }),
        DataStorage.getStations()
      ]);

      if (cachedEvents.length > 0) {
        this.processEvents(cachedEvents);
        Utils.showToast(`${cachedEvents.length} cachade händelser laddade`, 2000, 'info');
      }

      if (cachedStations.length > 0) {
        this.processStations(cachedStations);
        Utils.showToast(`${cachedStations.length} polisstationer laddade`, 2000, 'info');
      }

      // Load fresh data in background
      await this.loadFreshData();

    } catch (error) {
      console.error('Failed to load initial data:', error);
      Utils.showToast('Kunde inte ladda initial data', 5000, 'error');
    }
  }

  async loadFreshData() {
    try {
      const [eventsData, stationsData] = await Promise.all([
        this.fetchPoliceEvents(),
        this.fetchPoliceStations()
      ]);

      if (eventsData && eventsData.length > 0) {
        await DataStorage.saveEvents(eventsData);
        this.processEvents(eventsData);
      }

      if (stationsData && stationsData.length > 0) {
        await DataStorage.saveStations(stationsData);
        this.processStations(stationsData);
      }

      this.lastUpdateTime = new Date();
      this.updateLastUpdateDisplay();

    } catch (error) {
      console.error('Failed to load fresh data:', error);
      Utils.showToast('Kunde inte ladda färsk data', 3000, 'warning');
    }
  }

  async fetchPoliceEvents() {
    try {
      Utils.showLoading('Hämtar polishändelser...');
      const response = await Utils.fetchWithRetry(CONFIG.API.EVENTS);
      const rawData = await Utils.safeJsonParse(response);

      if (!Array.isArray(rawData)) {
        throw new Error('Invalid events data format');
      }

      // Process events and take the 500 most recent
      const events = rawData
        .map(eventData => new PoliceEvent(eventData))
        .filter(event => event.isValid)
        .sort((a, b) => b.timeMs - a.timeMs)
        .slice(0, 500);

      console.log(`Processed ${events.length} valid events from ${rawData.length} raw events`);
      return events;

    } catch (error) {
      console.error('Failed to fetch police events:', error);
      throw error;
    }
  }

  async fetchPoliceStations() {
    try {
      Utils.showLoading('Hämtar polisstationer...');
      const response = await Utils.fetchWithRetry(CONFIG.API.STATIONS);
      const rawData = await Utils.safeJsonParse(response);

      if (!Array.isArray(rawData)) {
        throw new Error('Invalid stations data format');
      }

      const stations = rawData
        .map(stationData => new PoliceStation(stationData))
        .filter(station => station.isValid);

      console.log(`Processed ${stations.length} valid stations from ${rawData.length} raw stations`);
      return stations;

    } catch (error) {
      console.error('Failed to fetch police stations:', error);
      throw error;
    }
  }

  processEvents(events) {
    this.allEvents = events;
    this.applyFilters();
    this.updateEventClusters();
    this.updateStatistics();
  }

  processStations(stations) {
    this.allStations = stations;
    this.updateStationClusters();
  }

  applyFilters() {
    let filtered = [...this.allEvents];

    // Severity filter
    if (this.currentFilters.severity !== 'all') {
      const targetLevel = parseInt(this.currentFilters.severity);
      filtered = filtered.filter(event => event.severityInfo.level === targetLevel);
    }

    // Time range filter
    const now = Date.now();
    const timeRanges = {
      '1day': 24 * 60 * 60 * 1000,
      '3days': 3 * 24 * 60 * 60 * 1000,
      '7days': 7 * 24 * 60 * 60 * 1000,
      '30days': 30 * 24 * 60 * 60 * 1000,
      'all': Infinity
    };

    const maxAge = timeRanges[this.currentFilters.timeRange] || timeRanges['7days'];
    if (maxAge !== Infinity) {
      const cutoff = now - maxAge;
      filtered = filtered.filter(event => event.timeMs >= cutoff);
    }

    // Location accuracy filter
    if (this.currentFilters.exactLocation === 'exact') {
      filtered = filtered.filter(event => event.exactLocation === true);
    } else if (this.currentFilters.exactLocation === 'approximate') {
      filtered = filtered.filter(event => event.exactLocation === false);
    }

    // City search filter
    if (this.currentFilters.city.trim()) {
      const searchTerm = this.currentFilters.city.toLowerCase().trim();
      filtered = filtered.filter(event =>
        event.city.toLowerCase().includes(searchTerm) ||
        event.address.toLowerCase().includes(searchTerm)
      );
    }

    this.filteredEvents = filtered;
  }

  updateEventClusters() {
    // Clear existing markers
    this.eventCluster.clearLayers();

    // Add filtered events to cluster
    this.filteredEvents.forEach(event => {
      if (!event.isValid) return;

      const marker = this.createEventMarker(event);
      if (marker) {
        this.eventCluster.addLayer(marker);
      }
    });
  }

  updateStationClusters() {
    // Clear existing station markers
    this.stationCluster.clearLayers();

    // Add all stations to cluster
    this.allStations.forEach(station => {
      const marker = station.createMarker();
      if (marker) {
        this.stationCluster.addLayer(marker);
      }
    });
  }

  createEventMarker(event) {
    const severityInfo = event.severityInfo;
    const color = severityInfo.color;

    const iconHtml = `
      <div class="crime-marker" style="
        background: ${color};
        border: 2px solid rgba(255,255,255,0.9);
        border-radius: 50%;
        width: 16px;
        height: 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
        cursor: pointer;
      "></div>
    `;

    const icon = L.divIcon({
      className: 'crime-event-icon',
      html: iconHtml,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const marker = L.marker([event.lat, event.lng], {
      icon: icon,
      zIndexOffset: 1000 + severityInfo.level * 100
    });

    marker.bindPopup(event.getPopupContent(), {
      maxWidth: 400,
      className: 'crime-event-popup'
    });

    // Add hover effects
    marker.on('mouseover', function() {
      const element = this.getElement();
      if (element) {
        element.querySelector('.crime-marker').style.transform = 'scale(1.3)';
        element.querySelector('.crime-marker').style.zIndex = '2000';
      }
    });

    marker.on('mouseout', function() {
      const element = this.getElement();
      if (element) {
        element.querySelector('.crime-marker').style.transform = 'scale(1)';
        element.querySelector('.crime-marker').style.zIndex = '';
      }
    });

    return marker;
  }

  createEventClusterIcon(cluster) {
    const markers = cluster.getAllChildMarkers();
    const severityStats = CrimeSeveritySystem.getSeverityStats(
      markers.map(m => m.options.event || { type: 'Övrigt' })
    );

    const criticalCount = severityStats.byPriority.critical || 0;
    const highCount = severityStats.byPriority.high || 0;
    const count = markers.length;

    // Color based on highest severity in cluster
    let color = '#6b7280';
    if (criticalCount > 0) color = '#991b1b';
    else if (highCount > 0) color = '#dc2626';
    else if (count > 10) color = '#f97316';
    else color = '#059669';

    return L.divIcon({
      className: 'event-cluster-icon',
      html: `
        <div style="
          background: ${color};
          border: 3px solid rgba(255,255,255,0.9);
          border-radius: 50%;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          width: 35px;
          height: 35px;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          transition: all 0.2s ease;
        ">${count}</div>
      `,
      iconSize: [35, 35],
      iconAnchor: [17, 17]
    });
  }

  createStationClusterIcon(cluster) {
    const count = cluster.getChildCount();

    return L.divIcon({
      className: 'station-cluster-icon',
      html: `
        <div style="
          background: #6b7280;
          border: 2px solid rgba(255,255,255,0.9);
          border-radius: 50%;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          width: 25px;
          height: 25px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        ">${count}</div>
      `,
      iconSize: [25, 25],
      iconAnchor: [12, 12]
    });
  }

  handleFilterChange() {
    // Get current filter values
    const severityFilter = document.getElementById('severity-filter');
    const timeRangeFilter = document.getElementById('time-range-filter');
    const locationFilter = document.getElementById('location-filter');
    const citySearch = document.getElementById('city-search');

    this.currentFilters = {
      severity: severityFilter?.value || 'all',
      timeRange: timeRangeFilter?.value || '7days',
      exactLocation: locationFilter?.value || 'all',
      city: citySearch?.value || ''
    };

    // Apply filters and update display
    this.applyFilters();
    this.updateEventClusters();
    this.updateStatistics();
    this.updateVisibleCounts();
  }

  handleMapZoom() {
    const zoom = this.map.getZoom();

    // Adjust station visibility based on zoom level
    if (zoom > CONFIG.MAP.DISABLE_CLUSTERING_AT_ZOOM) {
      // High zoom - show individual stations with reduced opacity
      this.stationCluster.eachLayer(marker => {
        const element = marker.getElement();
        if (element) {
          element.style.opacity = '0.7';
        }
      });
    } else {
      // Lower zoom - normal opacity
      this.stationCluster.eachLayer(marker => {
        const element = marker.getElement();
        if (element) {
          element.style.opacity = '1';
        }
      });
    }
  }

  updateStatistics() {
    const stats = CrimeSeveritySystem.getSeverityStats(this.filteredEvents);

    // Update statistics display
    const statsElement = document.getElementById('statistics');
    if (statsElement) {
      statsElement.innerHTML = this.generateStatisticsHTML(stats);
    }

    // Update filter counts
    this.updateFilterCounts(stats);
  }

  generateStatisticsHTML(stats) {
    const priorityColors = {
      critical: '#991b1b',
      high: '#dc2626',
      medium: '#f97316',
      low: '#059669'
    };

    return `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Totala händelser</div>
        </div>
        ${Object.entries(stats.byPriority).map(([priority, count]) => `
          <div class="stat-item">
            <div class="stat-value" style="color: ${priorityColors[priority]}">${count}</div>
            <div class="stat-label">${this.getPriorityLabel(priority)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  getPriorityLabel(priority) {
    const labels = {
      critical: 'Kritiska',
      high: 'Allvarliga',
      medium: 'Måttliga',
      low: 'Lindriga'
    };
    return labels[priority] || priority;
  }

  updateFilterCounts(stats) {
    // Update severity filter options with counts
    const severityFilter = document.getElementById('severity-filter');
    if (severityFilter) {
      const options = severityFilter.querySelectorAll('option[value]');
      options.forEach(option => {
        const level = option.value;
        if (level !== 'all') {
          const count = stats.byLevel[level] || 0;
          const originalText = option.textContent.split(' (')[0];
          option.textContent = `${originalText} (${count})`;
        }
      });
    }
  }

  updateVisibleCounts() {
    // Update visible events counter
    const visibleCount = this.filteredEvents.length;
    const totalCount = this.allEvents.length;

    const countersElement = document.getElementById('event-counters');
    if (countersElement) {
      countersElement.textContent = `Visar ${visibleCount} av ${totalCount} händelser`;
    }
  }

  updateLastUpdateDisplay() {
    const updateElement = document.getElementById('last-update');
    if (updateElement && this.lastUpdateTime) {
      updateElement.textContent = `Uppdaterat: ${Utils.formatDate(this.lastUpdateTime)}`;
    }
  }

  async refreshData() {
    if (this.isLoading) return;

    try {
      this.isLoading = true;
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Uppdaterar...';
      }

      await this.loadFreshData();
      Utils.showToast('Data uppdaterad', 2000, 'success');

    } catch (error) {
      console.error('Failed to refresh data:', error);
      Utils.showToast('Kunde inte uppdatera data', 3000, 'error');
    } finally {
      this.isLoading = false;
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Uppdatera';
      }
    }
  }

  initializeGeolocation() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };

          // Add user location marker if within Sweden
          if (Utils.isWithinSweden(this.userLocation.lat, this.userLocation.lng)) {
            this.addUserLocationMarker();
          }
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
        },
        {
          timeout: 10000,
          enableHighAccuracy: false,
          maximumAge: 300000 // 5 minutes
        }
      );
    }
  }

  addUserLocationMarker() {
    if (!this.userLocation) return;

    const userIcon = L.divIcon({
      className: 'user-location-icon',
      html: `
        <div style="
          background: #3b82f6;
          border: 3px solid white;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
          position: relative;
        ">
          <div style="
            background: rgba(59, 130, 246, 0.2);
            border: 2px solid #3b82f6;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            position: absolute;
            top: -13px;
            left: -13px;
            animation: pulse 2s infinite;
          "></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const userMarker = L.marker([this.userLocation.lat, this.userLocation.lng], {
      icon: userIcon,
      zIndexOffset: 2000
    });

    userMarker.bindPopup(`
      <div style="text-align: center; font-family: inherit;">
        <h4 style="margin: 0 0 8px; color: var(--text-primary);">📍 Din position</h4>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
          Noggrannhet: ±${Math.round(this.userLocation.accuracy)}m
        </p>
      </div>
    `);

    userMarker.addTo(this.map);
  }

  centerOnUserLocation() {
    if (!this.userLocation) {
      Utils.showToast('Position ej tillgänglig', 2000, 'warning');
      return;
    }

    this.map.setView([this.userLocation.lat, this.userLocation.lng], 12);
    Utils.showToast('Centrerat på din position', 2000, 'info');
  }

  setupAutoRefresh() {
    // Refresh data every 15 minutes
    setInterval(() => {
      if (!document.hidden) {
        this.loadFreshData();
      }
    }, 15 * 60 * 1000);

    // Refresh when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.lastUpdateTime) {
        const timeSinceUpdate = Date.now() - this.lastUpdateTime.getTime();
        // Refresh if more than 10 minutes since last update
        if (timeSinceUpdate > 10 * 60 * 1000) {
          this.loadFreshData();
        }
      }
    });
  }

  async showSettings() {
    // Implementation for settings modal
    Utils.showToast('Inställningar kommer snart', 2000, 'info');
  }

  async showInfo() {
    // Implementation for info modal
    Utils.showToast('Information kommer snart', 2000, 'info');
  }

  /**
   * Get application statistics for debugging
   */
  getDebugInfo() {
    return {
      totalEvents: this.allEvents.length,
      filteredEvents: this.filteredEvents.length,
      totalStations: this.allStations.length,
      currentFilters: this.currentFilters,
      lastUpdate: this.lastUpdateTime,
      userLocation: this.userLocation,
      mapCenter: this.map?.getCenter(),
      mapZoom: this.map?.getZoom()
    };
  }
}

// ===== APPLICATION INITIALIZATION =====
let policeApp;

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

async function initializeApp() {
  try {
    console.log('🚓 Starting Aktuella Brott application...');

    // Create and initialize the main application
    policeApp = new PoliceEventsApp();
    await policeApp.initialize();

    // Make app globally accessible for debugging
    window.policeApp = policeApp;

    console.log('✅ Aktuella Brott application initialized successfully');

  } catch (error) {
    console.error('❌ Failed to initialize application:', error);

    // Show user-friendly error message
    const errorMessage = document.createElement('div');
    errorMessage.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        text-align: center;
        z-index: 10000;
        font-family: inherit;
      ">
        <h2 style="color: #dc2626; margin: 0 0 1rem;">Kunde inte starta applikationen</h2>
        <p style="color: #6b7280; margin: 0 0 1rem;">
          Ett fel inträffade vid start av Aktuella Brott.
          Försök ladda om sidan eller kontakta support om problemet kvarstår.
        </p>
        <button onclick="window.location.reload()" style="
          background: #1e40af;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1rem;
        ">
          Ladda om sidan
        </button>
      </div>
    `;
    document.body.appendChild(errorMessage);
  }
}

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('✅ Service Worker registered:', registration.scope);
      })
      .catch(error => {
        console.warn('⚠️ Service Worker registration failed:', error);
      });
  });
}

console.log('🚓 Aktuella Brott - Application modules loaded successfully');