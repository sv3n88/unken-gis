// ─────────────────────────────────────────────────────────────────────────────
// popup.js
//
// Responsible for rendering the feature popup and managing which feature
// is currently shown when multiple features share a coordinate.
//
// Depends on: modal.js (calls openPhotoModal)
// Used by:    map.js   (calls createPopupController)
// ─────────────────────────────────────────────────────────────────────────────


// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ── Factory function ──────────────────────────────────────────────────────────

function createPopupController(map, overlay) {

  // ── Private state ───────────────────────────────────────────────────────

  const popupEl = document.getElementById('popup');

  let featuresAtLocation  = [];
  let currentFeatureIndex = 0;

  const propertyAliases = {
    id:           'ID',
    huepferlinge: 'Anzahl Hüpferlinge',
    region:       'Region',
    name:         'Name',
    anzahl:       'Anzahl',
  };


  // ── Private functions ───────────────────────────────────────────────────

  function updatePopup() {
    if (featuresAtLocation.length === 0) return;

    const feature    = featuresAtLocation[currentFeatureIndex];
    const properties = feature.getProperties();
    const coords     = feature.getGeometry().getCoordinates();

    let content = '<div class="popup-content">';
    content += renderProperties(properties);
    content += renderBemerkungen(properties.bemerkungen);
    content += renderPhotoThumbs(properties.photos);
    content += '</div>';

    if (featuresAtLocation.length > 1) {
      content += renderNavigation();
    }

    popupEl.innerHTML = content;
    overlay.setPosition(coords);

    // No attachTouchListeners() call here anymore —
    // touch events are handled by the delegated listeners below.
  }

  function renderProperties(properties) {
    let html = '';
    for (const key in properties) {
      if (Object.hasOwn(propertyAliases, key)) {
        html += `<div class="prop-row"><span class="bold">${propertyAliases[key]}:</span> ${properties[key] ?? '-'}</div>`;
      }
    }
    return html;
  }

  function renderBemerkungen(bemerkungen) {
    if (!Array.isArray(bemerkungen) || bemerkungen.length === 0) return '';

    const rows = bemerkungen.map(function (b) {
      const date = b.datum ? `<span class="bem-date">${b.datum}</span>` : '';
      return `<div class="bem-entry">${date}<span class="bem-text">${escapeHtml(b.text)}</span></div>`;
    }).join('');

    return `
      <div class="bemerkungen-section">
        <div class="bemerkungen-header">
          <span>📋 Beobachtungen</span>
          <span class="bemerkungen-count">${bemerkungen.length}</span>
        </div>
        <div class="bemerkungen-list">${rows}</div>
      </div>`;
  }

  function renderPhotoThumbs(photos) {
    if (!Array.isArray(photos) || photos.length === 0) return '';

    const MAX_THUMBS   = 3;
    const photosAttr   = JSON.stringify(photos).replace(/"/g, '&quot;');
    const visibleCount = Math.min(photos.length, MAX_THUMBS);
    const overflow     = photos.length - visibleCount;

    let html = '<div class="photo-thumbs">';

    for (let i = 0; i < visibleCount; i++) {
      const photo  = photos[i];
      const src    = typeof photo === 'object' ? photo.src : photo;
      const datum  = typeof photo === 'object' && photo.datum ? photo.datum : null;
      const url    = src.startsWith('/') ? src : '/' + src;
      const isLast = i === visibleCount - 1;

      if (isLast && overflow > 0) {
        html += `
          <div class="photo-trigger photo-thumb photo-thumb-overflow"
               data-photos="${photosAttr}" data-index="${i}"
               title="Alle ${photos.length} Fotos anzeigen">
            <img src="${url}" alt="Foto ${i + 1}" loading="lazy" />
            <div class="photo-overflow-badge">+${overflow}</div>
          </div>`;
      } else {
        html += `
          <div class="photo-trigger photo-thumb"
               data-photos="${photosAttr}" data-index="${i}"
               title="${datum ?? `Foto ${i + 1}`}">
            <img src="${url}" alt="Foto ${i + 1}" loading="lazy" />
            ${datum ? `<div class="thumb-date-badge">${datum}</div>` : ''}
          </div>`;
      }
    }

    return html + '</div>';
  }

  function renderNavigation() {
    return `
      <div class="popup-navigation">
        <button class="nav-button" data-direction="prev">&lt;</button>
        <span>${currentFeatureIndex + 1} von ${featuresAtLocation.length}</span>
        <button class="nav-button" data-direction="next">&gt;</button>
      </div>`;
  }

  function showPreviousFeature() {
    currentFeatureIndex = (currentFeatureIndex - 1 + featuresAtLocation.length) % featuresAtLocation.length;
    updatePopup();
  }

  function showNextFeature() {
    currentFeatureIndex = (currentFeatureIndex + 1) % featuresAtLocation.length;
    updatePopup();
  }


  // ── Event listeners ─────────────────────────────────────────────────────
  //
  // All listeners are attached exactly once here, when createPopupController()
  // runs. They never need to be re-attached when the popup content changes,
  // because they listen on popupEl (the permanent container) rather than
  // on the buttons/thumbnails inside it (which get recreated on every update).
  //
  // This is event delegation: let events bubble up from their target
  // to a stable ancestor, then inspect e.target to decide what to do.

  // Stop map interactions firing through the popup
  ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(function (ev) {
    popupEl.addEventListener(ev, function (e) { e.stopPropagation(); });
  });

  // Stop map zoom when scrolling the bemerkungen list
  popupEl.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });

  // ── Click delegation ──────────────────────────────────────────────────
  //
  // One listener handles all clicks inside the popup, for all time.
  // When a nav button or photo trigger is clicked, the event bubbles up
  // from that element to popupEl, where we catch it.

  popupEl.addEventListener('click', function (e) {
    e.stopPropagation();

    if (e.target.classList.contains('nav-button')) {
      if (e.target.dataset.direction === 'prev') showPreviousFeature();
      else showNextFeature();
      return;
    }

    const trigger = e.target.closest('.photo-trigger');
    if (trigger) {
      openPhotoModal(
        JSON.parse(trigger.dataset.photos || '[]'),
        parseInt(trigger.dataset.index || '0', 10)
      );
    }
  });

  // ── Touch delegation ──────────────────────────────────────────────────
  //
  // Same pattern as click delegation above, but for touchend.
  // We need both because on mobile, click fires ~300ms after touchend
  // (a legacy browser delay), so touch-heavy UIs handle touchend directly
  // for instant response.
  //
  // e.preventDefault() here stops the browser from also firing a click
  // event after the touch, which would trigger the handler twice.

  popupEl.addEventListener('touchend', function (e) {

    if (e.target.classList.contains('nav-button')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.dataset.direction === 'prev') showPreviousFeature();
      else showNextFeature();
      return;
    }

    // e.target might be the <img> inside .photo-trigger, not the div itself.
    // closest() walks up the DOM tree until it finds a matching ancestor.
    const trigger = e.target.closest('.photo-trigger');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      openPhotoModal(
        JSON.parse(trigger.dataset.photos || '[]'),
        parseInt(trigger.dataset.index || '0', 10)
      );
    }

  });


  // ── Public API ───────────────────────────────────────────────────────────

  return {

    handleFeatureClick: function (clickedFeature) {
      const coord = clickedFeature.getGeometry().getCoordinates();

      featuresAtLocation = [];
      map.getLayers().getArray().forEach(function (layer) {
        if (layer instanceof ol.layer.Vector) {
          featuresAtLocation = featuresAtLocation.concat(
            layer.getSource().getFeaturesAtCoordinate(coord)
          );
        }
      });

      currentFeatureIndex = 0;
      updatePopup();
    },

    clear: function () {
      popupEl.innerHTML = '';
      overlay.setPosition(undefined);
    },

    isVisible: function () {
      const pos = overlay.getPosition();
      if (!pos) return false;
      const px = map.getPixelFromCoordinate(pos);
      const sz = map.getSize();
      return px[0] >= 0 && px[0] < sz[0] && px[1] >= 0 && px[1] < sz[1];
    },

  };
}