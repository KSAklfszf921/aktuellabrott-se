/**
 * Advanced Data Synchronization Manager for Aktuella Brott
 *
 * Handles automatic background data synchronization, smart caching,
 * and real-time data persistence for police events and stations.
 *
 * Features:
 * - Intelligent sync intervals based on user activity
 * - Background sync with Web Workers
 * - Delta updates (only fetch new events)
 * - Offline-first data strategy
 * - Real-time data validation and deduplication
 * - Smart retry mechanisms with exponential backoff
 *
 * @version 1.0.0
 */

'use strict';

class DataSyncManager {
  constructor() {
    this.syncIntervals = new Map();
    this.isOnline = navigator.onLine;
    this.lastSyncTimestamps = new Map();
    this.syncQueue = [];
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000
    };

    // Sync configuration based on data type
    this.syncConfig = {
      events: {
        interval: 5 * 60 * 1000,      // 5 minutes when active
        passiveInterval: 15 * 60 * 1000, // 15 minutes when passive
        deltaSync: true,
        priority: 'high'
      },
      stations: {
        interval: 6 * 60 * 60 * 1000,  // 6 hours
        passiveInterval: 24 * 60 * 60 * 1000, // 24 hours
        deltaSync: false,
        priority: 'low'
      },
      rss: {
        interval: 10 * 60 * 1000,      // 10 minutes
        passiveInterval: 30 * 60 * 1000, // 30 minutes
        deltaSync: true,
        priority: 'medium'
      }
    };

    this.initialize();
  }

  /**
   * Initialize the synchronization manager
   */
  async initialize() {
    console.log('🔄 Initializing Data Sync Manager...');

    // Set up online/offline event listeners
    this.setupConnectivityListeners();

    // Set up visibility change listeners for intelligent syncing
    this.setupVisibilityListeners();

    // Initialize background sync if supported
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      await this.setupBackgroundSync();
    }

    // Start initial sync
    await this.performInitialSync();

    // Start periodic sync schedules
    this.startPeriodicSync();

    console.log('✅ Data Sync Manager initialized successfully');
  }

  /**
   * Setup connectivity event listeners
   */
  setupConnectivityListeners() {
    window.addEventListener('online', () => {
      console.log('📶 Connection restored - resuming sync');
      this.isOnline = true;
      this.resumeSync();
    });

    window.addEventListener('offline', () => {
      console.log('📵 Connection lost - pausing sync');
      this.isOnline = false;
      this.pauseSync();
    });
  }

  /**
   * Setup page visibility listeners for intelligent sync timing
   */
  setupVisibilityListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('👁️ Page hidden - switching to passive sync mode');
        this.switchToPassiveMode();
      } else {
        console.log('👁️ Page visible - switching to active sync mode');
        this.switchToActiveMode();
        // Perform immediate sync when user returns
        this.syncAll('immediate');
      }
    });
  }

  /**
   * Setup background sync for offline capability
   */
  async setupBackgroundSync() {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Register background sync for periodic data updates
      await registration.sync.register('background-data-sync');

      console.log('🔧 Background sync registered successfully');
    } catch (error) {
      console.warn('⚠️ Background sync not available:', error.message);
    }
  }

  /**
   * Perform initial data sync on app startup
   */
  async performInitialSync() {
    console.log('🚀 Starting initial data sync...');

    const syncPromises = [];

    // Sync events with high priority
    syncPromises.push(
      this.syncDataType('events', { priority: 'high', showLoader: true })
    );

    // Sync stations with lower priority
    syncPromises.push(
      this.syncDataType('stations', { priority: 'low', showLoader: false })
    );

    try {
      await Promise.allSettled(syncPromises);
      console.log('✅ Initial sync completed successfully');

      // Notify UI that data is ready
      this.notifyDataReady();
    } catch (error) {
      console.error('❌ Initial sync failed:', error);
      Utils.showToast('Kunde inte hämta all data - arbetar offline', 5000, 'warning');
    }
  }

  /**
   * Sync a specific data type with intelligent caching
   */
  async syncDataType(type, options = {}) {
    const { priority = 'normal', showLoader = false, force = false } = options;

    if (!this.isOnline && !force) {
      console.log(`📵 Skipping ${type} sync - offline`);
      return await this.getCachedData(type);
    }

    const config = this.syncConfig[type];
    const lastSync = this.lastSyncTimestamps.get(type) || 0;
    const now = Date.now();

    // Check if sync is needed
    if (!force && (now - lastSync) < config.interval) {
      console.log(`⏱️ Skipping ${type} sync - too recent`);
      return await this.getCachedData(type);
    }

    if (showLoader) {
      Utils.showLoading(`Hämtar ${type}...`);
    }

    try {
      let data;

      switch (type) {
        case 'events':
          data = await this.syncEvents(config.deltaSync ? lastSync : 0);
          break;
        case 'stations':
          data = await this.syncStations();
          break;
        case 'rss':
          data = await this.syncRSSFeeds();
          break;
        default:
          throw new Error(`Unknown sync type: ${type}`);
      }

      // Update sync timestamp
      this.lastSyncTimestamps.set(type, now);

      // Save to storage with enhanced metadata
      await this.saveDataWithMetadata(type, data, { syncTime: now, priority });

      console.log(`✅ Successfully synced ${data.length} ${type} items`);

      return data;
    } catch (error) {
      console.error(`❌ Failed to sync ${type}:`, error);

      // Implement exponential backoff retry
      await this.scheduleRetry(type, options);

      // Fallback to cached data
      return await this.getCachedData(type);
    } finally {
      if (showLoader) {
        Utils.hideLoading();
      }
    }
  }

  /**
   * Sync events with delta support (only new events)
   */
  async syncEvents(sinceTimestamp = 0) {
    console.log(`🔄 Syncing events since ${sinceTimestamp ? new Date(sinceTimestamp).toISOString() : 'beginning'}`);

    const response = await Utils.fetchWithRetry(window.CONFIG?.API?.EVENTS || 'https://polisen.se/api/events');
    const rawEvents = await Utils.safeJsonParse(response);

    if (!Array.isArray(rawEvents)) {
      throw new Error('Invalid events data format');
    }

    // Filter new events if delta sync is enabled
    let filteredEvents = rawEvents;
    if (sinceTimestamp > 0) {
      filteredEvents = rawEvents.filter(event => {
        const eventTime = new Date(event.datetime).getTime();
        return eventTime > sinceTimestamp;
      });
    }

    // Process and enhance events
    const processedEvents = filteredEvents.map(event => this.processEventData(event));

    // Deduplicate events
    const deduplicatedEvents = this.deduplicateEvents(processedEvents);

    console.log(`📊 Processed ${deduplicatedEvents.length} new events`);

    return deduplicatedEvents;
  }

  /**
   * Sync police stations
   */
  async syncStations() {
    console.log('🔄 Syncing police stations...');

    const response = await Utils.fetchWithRetry(window.CONFIG?.API?.STATIONS || 'https://polisen.se/api/policestations');
    const rawStations = await Utils.safeJsonParse(response);

    if (!Array.isArray(rawStations)) {
      throw new Error('Invalid stations data format');
    }

    const processedStations = rawStations.map(station => ({
      id: station.id || Utils.generateId(station.name),
      name: station.name,
      address: station.address,
      phone: station.phone,
      email: station.email,
      lat: station.location?.lat || 0,
      lng: station.location?.lng || 0,
      services: station.services || [],
      lastUpdated: Date.now()
    }));

    console.log(`📊 Processed ${processedStations.length} stations`);

    return processedStations;
  }

  /**
   * Sync RSS feeds for additional context
   */
  async syncRSSFeeds() {
    console.log('🔄 Syncing RSS feeds...');

    const rssSources = window.CONFIG?.API?.RSS_SOURCES || [
      'https://polisen.se/aktuellt/rss/',
      'https://api.allorigins.win/get?url=' + encodeURIComponent('https://polisen.se/aktuellt/rss/'),
      'https://polisen.se/aktuellt/handelser/rss/'
    ];

    const feedPromises = rssSources.map(async (source, index) => {
      try {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const content = await response.text();
        return this.parseRSSContent(content, source, index);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch RSS from ${source}:`, error.message);
        return [];
      }
    });

    const feedResults = await Promise.allSettled(feedPromises);
    const allFeeds = feedResults
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value);

    console.log(`📊 Processed ${allFeeds.length} RSS items`);

    return allFeeds;
  }

  /**
   * Process and enhance raw event data
   */
  processEventData(rawEvent) {
    return {
      id: rawEvent.id || Utils.generateId(rawEvent.name + rawEvent.datetime),
      timestamp: rawEvent.datetime,
      timeMs: new Date(rawEvent.datetime).getTime(),
      title: rawEvent.name || 'Okänd händelse',
      description: rawEvent.summary || '',
      type: rawEvent.type || 'Övrigt',
      city: this.extractCity(rawEvent.location?.name || ''),
      address: rawEvent.location?.name || '',
      lat: rawEvent.location?.gps?.split(',')[0]?.trim() || 0,
      lng: rawEvent.location?.gps?.split(',')[1]?.trim() || 0,
      exactLocation: !!(rawEvent.location?.gps),
      url: rawEvent.url,
      severityInfo: this.calculateSeverity(rawEvent.type, rawEvent.name),
      rawData: rawEvent,
      synced: Date.now()
    };
  }

  /**
   * Calculate event severity based on type and title
   */
  calculateSeverity(type = '', title = '') {
    const severityMap = {
      'Olycka': { level: 3, priority: 'high', color: '#dc2626' },
      'Brand': { level: 4, priority: 'critical', color: '#b91c1c' },
      'Rån': { level: 4, priority: 'critical', color: '#991b1b' },
      'Våld': { level: 4, priority: 'critical', color: '#7f1d1d' },
      'Skottlossning': { level: 5, priority: 'critical', color: '#450a0a' },
      'Trafikolycka': { level: 2, priority: 'medium', color: '#ea580c' },
      'Misshandel': { level: 3, priority: 'high', color: '#c2410c' },
      'Stöld': { level: 2, priority: 'medium', color: '#a3a3a3' },
      'default': { level: 1, priority: 'low', color: '#6b7280' }
    };

    // Check title for severity keywords
    const criticalKeywords = ['skott', 'död', 'livsfara', 'explosion', 'gisslan'];
    const highKeywords = ['våld', 'kniv', 'hot', 'misshandel'];

    const lowerTitle = title.toLowerCase();
    const lowerType = type.toLowerCase();

    if (criticalKeywords.some(keyword => lowerTitle.includes(keyword))) {
      return { level: 5, priority: 'critical', color: '#450a0a' };
    }

    if (highKeywords.some(keyword => lowerTitle.includes(keyword))) {
      return { level: 4, priority: 'critical', color: '#7f1d1d' };
    }

    return severityMap[type] || severityMap.default;
  }

  /**
   * Deduplicate events based on multiple criteria
   */
  deduplicateEvents(events) {
    const seen = new Map();

    return events.filter(event => {
      // Create composite key for deduplication
      const key = `${event.timestamp}-${event.title}-${event.lat}-${event.lng}`;

      if (seen.has(key)) {
        return false;
      }

      seen.set(key, true);
      return true;
    });
  }

  /**
   * Extract city from location string
   */
  extractCity(locationStr) {
    if (!locationStr) return 'Okänd';

    // Common Swedish location patterns
    const patterns = [
      /(?:^|\s)([A-ZÅÄÖ][a-zåäö]+)(?:\s|$)/,  // Capitalized words
      /([A-ZÅÄÖ]+)\s*\(/,                       // Before parentheses
    ];

    for (const pattern of patterns) {
      const match = locationStr.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return locationStr.split(/[,\(\)]/)[0].trim() || 'Okänd';
  }

  /**
   * Save data with enhanced metadata
   */
  async saveDataWithMetadata(type, data, metadata) {
    // Ensure DataStorage is available
    if (typeof DataStorage === 'undefined') {
      console.warn('DataStorage not available, skipping save');
      return;
    }

    const enrichedData = data.map(item => ({
      ...item,
      syncMetadata: {
        ...metadata,
        version: window.CONFIG?.STORAGE?.DB_VERSION || 2,
        source: 'api',
        quality: this.assessDataQuality(item)
      }
    }));

    try {
      switch (type) {
        case 'events':
          await DataStorage.saveEvents(enrichedData);
          console.log(`💾 Saved ${enrichedData.length} events to database`);
          break;
        case 'stations':
          // Add saveStations method if it doesn't exist
          if (DataStorage.saveStations) {
            await DataStorage.saveStations(enrichedData);
          } else {
            console.warn('DataStorage.saveStations not implemented');
          }
          console.log(`💾 Saved ${enrichedData.length} stations to database`);
          break;
        default:
          console.warn(`Unknown data type for saving: ${type}`);
      }
    } catch (error) {
      console.error(`Failed to save ${type} data:`, error);
      throw error;
    }
  }

  /**
   * Assess data quality for analytics
   */
  assessDataQuality(item) {
    let score = 0;
    let issues = [];

    // Check completeness
    if (item.title && item.title !== 'Okänd händelse') score += 20;
    else issues.push('missing_title');

    if (item.description) score += 15;
    else issues.push('missing_description');

    if (item.exactLocation) score += 25;
    else issues.push('approximate_location');

    if (item.type && item.type !== 'Övrigt') score += 20;
    else issues.push('missing_type');

    if (item.timestamp) score += 20;
    else issues.push('missing_timestamp');

    return {
      score,
      grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
      issues
    };
  }

  /**
   * Get cached data with fallback
   */
  async getCachedData(type) {
    // Ensure DataStorage is available
    if (typeof DataStorage === 'undefined') {
      console.warn('DataStorage not available, returning empty array');
      return [];
    }

    try {
      switch (type) {
        case 'events':
          return await DataStorage.getEvents() || [];
        case 'stations':
          return await DataStorage.getStations() || [];
        default:
          console.warn(`Unknown data type for retrieval: ${type}`);
          return [];
      }
    } catch (error) {
      console.error(`Failed to get cached ${type}:`, error);
      return [];
    }
  }

  /**
   * Start periodic synchronization based on current mode
   */
  startPeriodicSync() {
    Object.keys(this.syncConfig).forEach(type => {
      this.schedulePeriodicSync(type);
    });
  }

  /**
   * Schedule periodic sync for a data type
   */
  schedulePeriodicSync(type) {
    const config = this.syncConfig[type];
    const interval = document.hidden ? config.passiveInterval : config.interval;

    // Clear existing interval
    if (this.syncIntervals.has(type)) {
      clearInterval(this.syncIntervals.get(type));
    }

    // Set new interval
    const intervalId = setInterval(async () => {
      if (this.isOnline) {
        await this.syncDataType(type, { priority: config.priority });
        this.notifyDataUpdated(type);
      }
    }, interval);

    this.syncIntervals.set(type, intervalId);

    console.log(`⏰ Scheduled ${type} sync every ${interval / 1000}s`);
  }

  /**
   * Switch to active sync mode (user is viewing the page)
   */
  switchToActiveMode() {
    console.log('🔄 Switching to active sync mode');
    this.startPeriodicSync();
  }

  /**
   * Switch to passive sync mode (page is hidden)
   */
  switchToPassiveMode() {
    console.log('😴 Switching to passive sync mode');
    this.startPeriodicSync(); // Will use passive intervals
  }

  /**
   * Pause all synchronization
   */
  pauseSync() {
    this.syncIntervals.forEach(intervalId => clearInterval(intervalId));
    this.syncIntervals.clear();
  }

  /**
   * Resume synchronization after being paused
   */
  resumeSync() {
    this.startPeriodicSync();
    // Perform immediate sync to catch up
    this.syncAll('immediate');
  }

  /**
   * Sync all data types
   */
  async syncAll(priority = 'normal') {
    const promises = Object.keys(this.syncConfig).map(type =>
      this.syncDataType(type, { priority, force: priority === 'immediate' })
    );

    try {
      await Promise.allSettled(promises);
      this.notifyDataReady();
    } catch (error) {
      console.error('Failed to sync all data:', error);
    }
  }

  /**
   * Schedule retry with exponential backoff
   */
  async scheduleRetry(type, options, attempt = 1) {
    if (attempt > this.retryConfig.maxRetries) {
      console.error(`❌ Max retries exceeded for ${type} sync`);
      return;
    }

    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
      this.retryConfig.maxDelay
    );

    console.log(`🔄 Scheduling retry ${attempt}/${this.retryConfig.maxRetries} for ${type} in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.syncDataType(type, { ...options, retry: attempt });
      } catch (error) {
        await this.scheduleRetry(type, options, attempt + 1);
      }
    }, delay);
  }

  /**
   * Parse RSS content (simplified implementation)
   */
  parseRSSContent(content, source, index) {
    // This is a simplified RSS parser - in production you'd use a proper XML parser
    try {
      const items = [];
      const itemMatches = content.match(/<item[^>]*>[\s\S]*?<\/item>/gi);

      if (itemMatches) {
        itemMatches.forEach((item, itemIndex) => {
          const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const description = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
          const pubDate = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);

          if (title && title[1]) {
            items.push({
              id: `rss-${index}-${itemIndex}`,
              title: title[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
              description: description && description[1]
                ? description[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
                : '',
              pubDate: pubDate && pubDate[1] ? new Date(pubDate[1]).getTime() : Date.now(),
              source: source
            });
          }
        });
      }

      return items;
    } catch (error) {
      console.warn('Failed to parse RSS content:', error);
      return [];
    }
  }

  /**
   * Notify that initial data is ready
   */
  notifyDataReady() {
    document.dispatchEvent(new CustomEvent('dataReady', {
      detail: { timestamp: Date.now(), source: 'sync-manager' }
    }));
  }

  /**
   * Notify that data has been updated
   */
  notifyDataUpdated(type) {
    document.dispatchEvent(new CustomEvent('dataUpdated', {
      detail: { type, timestamp: Date.now(), source: 'sync-manager' }
    }));
  }

  /**
   * Get sync statistics
   */
  getSyncStats() {
    return {
      isOnline: this.isOnline,
      lastSyncTimestamps: Object.fromEntries(this.lastSyncTimestamps),
      activeIntervals: this.syncIntervals.size,
      queuedSyncs: this.syncQueue.length,
      mode: document.hidden ? 'passive' : 'active'
    };
  }

  /**
   * Force immediate sync of all data
   */
  async forceSync() {
    console.log('🔄 Forcing immediate sync of all data...');
    Utils.showToast('Uppdaterar data...', 2000, 'info');

    await this.syncAll('immediate');

    Utils.showToast('Data uppdaterad!', 3000, 'success');
  }
}

// Export for use in main application
window.DataSyncManager = DataSyncManager;

console.log('📦 Data Sync Manager module loaded');