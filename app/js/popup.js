// ─────────────────────────────────────────────────────────────────────────────
// popup.js
//
// Responsible for rendering the feature popup and managing which feature
// is currently shown when multiple features share a coordinate.
//
// Depends on: modal.js (calls openPhotoModal)
// Used by:    map.js   (calls createPopupController)
// ─────────────────────────────────────────────────────────────────────────────


// ── DOM helper ────────────────────────────────────────────────────────────────
//
// createElement + className + textContent is so common that a small helper
// reduces noise. This is not a framework — just a convenience for the
// two-line pattern we'd otherwise repeat everywhere.
//
// Usage:
//   el('span', 'bem-date', '12.05.2024')
//   → <span class="bem-date">12.05.2024</span>
//
// The text argument is optional — omit it when you'll appendChild into the
// element yourself instead of setting text directly.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // textContent is XSS-safe: the browser treats it as plain text,
  // never as HTML. No escapeHtml() needed here.
  if (text !== undefined) node.textContent = text;
  return node;
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

    // Clear previous content
    popupEl.innerHTML = '';

    // Build the popup using DOM nodes instead of an HTML string.
    // Each render function returns a DOM element (or null if there's
    // nothing to show), and we append only what exists.
    const content = el('div', 'popup-content');
    content.appendChild(renderProperties(properties));

    const bemerkungen = renderBemerkungen(properties.bemerkungen);
    if (bemerkungen) content.appendChild(bemerkungen);

    const thumbs = renderPhotoThumbs(properties.photos);
    if (thumbs) content.appendChild(thumbs);

    popupEl.appendChild(content);

    if (featuresAtLocation.length > 1) {
      popupEl.appendChild(renderNavigation());
    }

    overlay.setPosition(coords);
  }


  // Returns a <div class="popup-content"> fragment with one row per property.
  //
  // DocumentFragment is an invisible container — appending children to it
  // doesn't touch the live DOM. We fill it, then return it to be appended
  // once. Fewer DOM operations = better performance.
  function renderProperties(properties) {
    const fragment = document.createDocumentFragment();

    for (const key in properties) {
      if (!Object.hasOwn(propertyAliases, key)) continue;

      const row   = el('div', 'prop-row');
      const label = el('span', 'bold', propertyAliases[key] + ': ');
      // Using textContent for the value means database content
      // can never be interpreted as HTML — no injection risk.
      const value = document.createTextNode(properties[key] ?? '-');

      row.appendChild(label);
      row.appendChild(value);
      fragment.appendChild(row);
    }

    return fragment;
  }


  // Returns a <div class="bemerkungen-section"> element, or null if empty.
  //
  // Returning null instead of an empty element lets the caller do a simple
  // if (bemerkungen) check and skip appending entirely.
  function renderBemerkungen(bemerkungen) {
    if (!Array.isArray(bemerkungen) || bemerkungen.length === 0) return null;

    const section = el('div', 'bemerkungen-section');

    // Header row
    const header = el('div', 'bemerkungen-header');
    header.appendChild(el('span', null, '📋 Beobachtungen'));
    header.appendChild(el('span', 'bemerkungen-count', String(bemerkungen.length)));
    section.appendChild(header);

    // Scrollable list
    const list = el('div', 'bemerkungen-list');

    bemerkungen.forEach(function (b) {
      const entry = el('div', 'bem-entry');

      if (b.datum) {
        entry.appendChild(el('span', 'bem-date', b.datum));
      }

      // textContent here means even if b.text somehow contained '<script>',
      // the browser would display it as literal text, not execute it.
      entry.appendChild(el('span', 'bem-text', b.text));
      list.appendChild(entry);
    });

    section.appendChild(list);
    return section;
  }


  // Returns a <div class="photo-thumbs"> element, or null if empty.
  function renderPhotoThumbs(photos) {
    if (!Array.isArray(photos) || photos.length === 0) return null;

    const MAX_THUMBS   = 3;
    const visibleCount = Math.min(photos.length, MAX_THUMBS);
    const overflow     = photos.length - visibleCount;

    const strip = el('div', 'photo-thumbs');

    for (let i = 0; i < visibleCount; i++) {
      const photo  = photos[i];
      const src    = typeof photo === 'object' ? photo.src : photo;
      const datum  = typeof photo === 'object' && photo.datum ? photo.datum : null;
      const url    = src.startsWith('/') ? src : '/' + src;
      const isLast = i === visibleCount - 1;

      const thumb = el('div', 'photo-trigger photo-thumb');

      // data attributes are how we pass data to event handlers without
      // globals. We set them with setAttribute or the dataset API.
      // JSON.stringify turns the photos array back into a string so we
      // can store it and parse it back in the click handler.
      thumb.dataset.photos = JSON.stringify(photos);
      thumb.dataset.index  = String(i);
      thumb.title          = datum ?? `Foto ${i + 1}`;

      const img    = document.createElement('img');
      img.src      = url;
      img.alt      = `Foto ${i + 1}`;
      img.loading  = 'lazy';
      thumb.appendChild(img);

      // Overflow badge on the last visible thumbnail
      if (isLast && overflow > 0) {
        thumb.classList.add('photo-thumb-overflow');
        thumb.title = `Alle ${photos.length} Fotos anzeigen`;

        const badge = el('div', 'photo-overflow-badge', `+${overflow}`);
        thumb.appendChild(badge);
      }

      // Date badge at the bottom of the thumbnail
      if (datum) {
        thumb.appendChild(el('div', 'thumb-date-badge', datum));
      }

      strip.appendChild(thumb);
    }

    return strip;
  }


  // Returns the prev/next navigation bar element.
  // This is the one place we still use innerHTML — the arrow characters
  // are static trusted strings, not user data, so it's safe.
  function renderNavigation() {
    const nav = el('div', 'popup-navigation');
    nav.innerHTML = `
      <button class="nav-button" data-direction="prev">&lt;</button>
      <span>${currentFeatureIndex + 1} von ${featuresAtLocation.length}</span>
      <button class="nav-button" data-direction="next">&gt;</button>`;
    return nav;
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
  // Attached once. Use event delegation so they work regardless of
  // what's currently inside popupEl. See Step 2 for the full explanation.

  ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(function (ev) {
    popupEl.addEventListener(ev, function (e) { e.stopPropagation(); });
  });

  popupEl.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });

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

  popupEl.addEventListener('touchend', function (e) {
    if (e.target.classList.contains('nav-button')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.dataset.direction === 'prev') showPreviousFeature();
      else showNextFeature();
      return;
    }

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