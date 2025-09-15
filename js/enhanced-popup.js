/**
 * Enhanced Event Popup System for Aktuella Brott
 * Creates beautiful, interactive information panels for police events
 */

class EnhancedEventPopup {
  /**
   * Generate enhanced popup content with all available information
   */
  static generatePopupContent(event) {
    // Extract all available data from the event
    const eventData = {
      id: event.id || event.rawData?.id || 'N/A',
      datetime: event.rawData?.datetime || event.timestamp,
      name: event.rawData?.name || event.title,
      summary: event.rawData?.summary || event.description,
      url: event.rawData?.url || event.url,
      type: event.rawData?.type || event.type,
      locationName: event.rawData?.location?.name || event.city,
      gps: event.rawData?.location?.gps || `${event.lat},${event.lng}`
    };

    // Format the datetime
    const formatDateTime = (dateStr) => {
      if (!dateStr) return 'Okänd tid';
      try {
        const date = new Date(dateStr);
        return {
          full: date.toLocaleString('sv-SE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          date: date.toLocaleDateString('sv-SE'),
          time: date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
          relative: this.getRelativeTime(date)
        };
      } catch (e) {
        return { full: dateStr, date: dateStr, time: '', relative: '' };
      }
    };

    const dateInfo = formatDateTime(eventData.datetime);
    const severityInfo = event.severityInfo || { color: '#6b7280', priority: 'medium', level: 2 };
    const priorityEmojis = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };

    // Create the enhanced popup HTML
    return `
      <div class="enhanced-event-popup" style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        min-width: 320px;
        max-width: 400px;
      ">
        ${this.createHeader(eventData, dateInfo, severityInfo, priorityEmojis)}
        ${this.createMainContent(eventData, severityInfo)}
        ${this.createLocationSection(eventData)}
        ${this.createMetadataSection(eventData, dateInfo)}
        ${this.createActionButtons(eventData)}
      </div>
    `;
  }

  /**
   * Create popup header with event type and timing
   */
  static createHeader(eventData, dateInfo, severityInfo, priorityEmojis) {
    return `
      <header class="popup-header" style="
        margin: 0 0 16px;
        padding: 0 0 12px;
        border-bottom: 3px solid ${severityInfo.color};
        position: relative;
      ">
        <div class="event-type-badge" style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: ${severityInfo.color}15;
          color: ${severityInfo.color};
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          border: 1px solid ${severityInfo.color}30;
        ">
          ${priorityEmojis[severityInfo.priority] || '⚪'}
          ${this.sanitizeHTML(eventData.type)}
        </div>
        
        <h3 class="event-title" style="
          margin: 0 0 8px;
          color: #111827;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.3;
        ">
          ${this.sanitizeHTML(eventData.name)}
        </h3>
        
        <div class="event-timing" style="
          display: flex;
          align-items: center;
          gap: 12px;
          color: #6b7280;
          font-size: 13px;
        ">
          <span style="font-weight: 500;">🕒 ${dateInfo.relative}</span>
          <span>•</span>
          <span>${dateInfo.time}</span>
        </div>
      </header>
    `;
  }

  /**
   * Create main content section with description and severity
   */
  static createMainContent(eventData, severityInfo) {
    return `
      <section class="main-content" style="margin: 16px 0;">
        ${eventData.summary ? `
          <div class="event-description" style="
            background: #f8fafc;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 12px;
            border-left: 4px solid ${severityInfo.color};
          ">
            <div style="
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              font-weight: 600;
              margin-bottom: 6px;
            ">
              📄 BESKRIVNING
            </div>
            <p style="
              margin: 0;
              color: #374151;
              font-size: 14px;
              line-height: 1.5;
            ">
              ${this.sanitizeHTML(eventData.summary)}
            </p>
          </div>
        ` : ''}
        
        <div class="severity-info" style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
        ">
          <div style="
            background: #f1f5f9;
            padding: 8px 12px;
            border-radius: 6px;
            text-align: center;
          ">
            <div style="color: #64748b; font-weight: 600; margin-bottom: 2px;">PRIORITET</div>
            <div style="color: ${severityInfo.color}; font-weight: 700; text-transform: uppercase;">
              ${severityInfo.priority}
            </div>
          </div>
          <div style="
            background: #f1f5f9;
            padding: 8px 12px;
            border-radius: 6px;
            text-align: center;
          ">
            <div style="color: #64748b; font-weight: 600; margin-bottom: 2px;">NIVÅ</div>
            <div style="color: ${severityInfo.color}; font-weight: 700;">
              ${severityInfo.level}/5
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Create location section with detailed information
   */
  static createLocationSection(eventData) {
    return `
      <section class="location-section" style="
        margin: 16px 0;
        background: #fefefe;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px 16px;
      ">
        <div class="section-header" style="
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
          margin-bottom: 8px;
        ">
          📍 PLATSINFORMATION
        </div>
        
        <div class="location-details">
          <div style="margin-bottom: 6px;">
            <span style="font-size: 14px; font-weight: 600; color: #111827;">
              ${this.sanitizeHTML(eventData.locationName)}
            </span>
          </div>
          
          ${eventData.gps ? `
            <div style="
              font-size: 12px;
              color: #6b7280;
              font-family: monospace;
              margin-bottom: 8px;
            ">
              🧭 GPS: ${eventData.gps}
            </div>
          ` : ''}
          
          <div class="location-actions" style="
            display: flex;
            gap: 8px;
            margin-top: 8px;
          ">
            <button onclick="window.copyCoordinates('${eventData.gps}')" style="
              background: #e0e7ff;
              border: 1px solid #c7d2fe;
              color: #3730a3;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
            ">
              📋 Kopiera GPS
            </button>
            <button onclick="window.openInMaps('${eventData.gps}')" style="
              background: #dcfce7;
              border: 1px solid #bbf7d0;
              color: #14532d;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
            ">
              🗺️ Öppna i kartor
            </button>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Create metadata section with all technical details
   */
  static createMetadataSection(eventData, dateInfo) {
    return `
      <section class="metadata-section" style="
        margin: 16px 0;
        background: #f8fafc;
        border-radius: 8px;
        overflow: hidden;
      ">
        <div class="section-header" style="
          background: #e2e8f0;
          padding: 8px 16px;
          font-size: 12px;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        ">
          ℹ️ HÄNDELSEDETALJER
        </div>
        
        <div class="metadata-grid" style="padding: 12px 16px;">
          <div class="metadata-row" style="
            display: grid;
            grid-template-columns: 90px 1fr;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
          ">
            <span style="font-weight: 600; color: #64748b;">ID:</span>
            <span style="font-family: monospace; color: #374151; background: #f1f5f9; padding: 2px 6px; border-radius: 3px;">
              ${eventData.id}
            </span>
          </div>
          
          <div class="metadata-row" style="
            display: grid;
            grid-template-columns: 90px 1fr;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
          ">
            <span style="font-weight: 600; color: #64748b;">Datum:</span>
            <span style="color: #374151;">${dateInfo.date}</span>
          </div>
          
          <div class="metadata-row" style="
            display: grid;
            grid-template-columns: 90px 1fr;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
          ">
            <span style="font-weight: 600; color: #64748b;">Tid:</span>
            <span style="color: #374151;">${dateInfo.time}</span>
          </div>
          
          <div class="metadata-row" style="
            display: grid;
            grid-template-columns: 90px 1fr;
            gap: 8px;
            font-size: 12px;
          ">
            <span style="font-weight: 600; color: #64748b;">Typ:</span>
            <span style="color: #374151;">${this.sanitizeHTML(eventData.type)}</span>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Create action buttons section
   */
  static createActionButtons(eventData) {
    return `
      <footer class="action-buttons" style="
        margin: 16px 0 0;
        padding: 12px 0 0;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
        justify-content: space-between;
      ">
        <div style="display: flex; gap: 8px; flex: 1;">
          <button onclick="window.shareEvent('${eventData.id}')" style="
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            color: #374151;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            📤 Dela
          </button>
          
          <button onclick="window.saveEvent('${eventData.id}')" style="
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            color: #374151;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            ⭐ Spara
          </button>
        </div>
        
        ${eventData.url ? `
          <a href="https://polisen.se${eventData.url}" target="_blank" rel="noopener noreferrer" style="
            background: #1d4ed8;
            border: 1px solid #1d4ed8;
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.2s;
          ">
            📄 Fullständig rapport →
          </a>
        ` : ''}
      </footer>
    `;
  }

  /**
   * Get relative time description
   */
  static getRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Nyligen';
    if (diffMinutes < 60) return `${diffMinutes} min sedan`;
    if (diffHours < 1) return `${diffMinutes} min sedan`;
    if (diffHours < 24) return `${diffHours} timme${diffHours !== 1 ? 'r' : ''} sedan`;
    if (diffDays < 7) return `${diffDays} dag${diffDays !== 1 ? 'ar' : ''} sedan`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} vecka${Math.floor(diffDays / 7) !== 1 ? 'r' : ''} sedan`;
    return date.toLocaleDateString('sv-SE');
  }

  /**
   * Sanitize HTML content
   */
  static sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Global helper functions for popup interactions
window.copyCoordinates = function(gps) {
  if (!gps) return;
  navigator.clipboard.writeText(gps).then(() => {
    alert('GPS-koordinater kopierade!');
  }).catch(() => {
    prompt('Kopiera dessa koordinater:', gps);
  });
};

window.openInMaps = function(gps) {
  if (!gps) return;
  const [lat, lng] = gps.split(',').map(c => c.trim());
  const url = `https://maps.google.com/maps?q=${lat},${lng}`;
  window.open(url, '_blank');
};

window.shareEvent = function(eventId) {
  const url = `${window.location.origin}/?event=${eventId}`;
  if (navigator.share) {
    navigator.share({
      title: 'Polishändelse - Aktuella Brott',
      url: url
    });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('Länk kopierad till urklipp!');
    });
  }
};

window.saveEvent = function(eventId) {
  // Implementation for saving events
  alert('Funktionen för att spara händelser kommer snart!');
};

console.log('📄 Enhanced Event Popup system loaded');
