// ─────────────────────────────────────────────────────────────────────────────
// popup.js
//
// The PopupController class manages the feature popup: rendering properties,
// the bemerkungen timeline, photo thumbnails, and multi-feature navigation.
//
// Usage in map.js:
//   const popup = new PopupController(map, overlay);
//
// Public API used by map.js:
//   popup.handleFeatureClick(feature)
//   popup.clear()
//   popup.isVisible()
//
// Depends on: modal.js (calls openPhotoModal which delegates to PhotoModal)
// ─────────────────────────────────────────────────────────────────────────────


// ── DOM helper ────────────────────────────────────────────────────────────────
//
// Same helper as before — lives outside the class because it's a pure
// utility with no connection to popup state. It doesn't need "this".
// Pure functions that don't depend on any object state should stay
// outside classes, not be forced in as static methods.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}


// ── PopupController class ─────────────────────────────────────────────────────
//
// Compare this to the old factory function:
//
//   BEFORE (factory function)        AFTER (class)
//   ─────────────────────────────    ──────────────────────────────
//   function createPopupController   class PopupController
//   let featuresAtLocation = []      #featuresAtLocation = []
//   function updatePopup() {}        #updatePopup() {}
//   return { handleFeatureClick }    handleFeatureClick() {}
//
// The behaviour is identical. The class syntax is just more explicit
// about what is state (#fields), what is private (#methods), and
// what is public (methods without #).

class PopupController {

  // ── Private fields ────────────────────────────────────────────────────
  //
  // Declared at the top of the class so you can see all the state
  // this object manages in one place — before reading any methods.
  //
  // In the factory function these were "let" variables closed over
  // by the inner functions. Here they are # fields closed over by
  // the class. The privacy guarantee is the same, but # is enforced
  // by the language rather than by convention.

  // DOM reference — grabbed once in constructor, reused everywhere
  #popupEl = null;

  // The OL map and overlay are passed in from map.js.
  // We store them as fields so every method can use them via this.#map
  // without needing them passed as parameters each time.
  #map     = null;
  #overlay = null;

  // Which features exist at the clicked coordinate (can be >1 if overlapping)
  #featuresAtLocation  = [];
  #currentFeatureIndex = 0;

  // Maps GeoJSON property keys → human-readable labels.
  // Declared as a field rather than a local variable inside a method
  // because it's configuration that belongs to the object, not to
  // a single method call.
  #propertyAliases = {
    id:           'ID',
    huepferlinge: 'Anzahl Hüpferlinge',
    region:       'Region',
    name:         'Name',
    anzahl:       'Anzahl',
  };


  // ── Constructor ───────────────────────────────────────────────────────
  //
  // Receives the two dependencies from map.js and stores them as fields.
  // Then grabs the popup DOM element and attaches all event listeners.
  //
  // "Dependency injection" — map.js hands in what PopupController needs
  // rather than PopupController reaching out and grabbing globals itself.
  // This makes the class easier to understand in isolation: you can see
  // exactly what it needs just by reading the constructor signature.

  constructor(map, overlay) {
    this.#map     = map;
    this.#overlay = overlay;
    this.#popupEl = document.getElementById('popup');

    this.#attachListeners();
  }


  // ── Public methods ────────────────────────────────────────────────────
  //
  // These three are the entire public API — the only things map.js calls.
  // Everything else in this class is private.

  // Called by map.js when the user clicks a feature on the map.
  handleFeatureClick(clickedFeature) {
    const coord = clickedFeature.getGeometry().getCoordinates();

    // Find all features at this coordinate across all vector layers.
    // Usually just one, but features can overlap at the same point.
    this.#featuresAtLocation = [];
    this.#map.getLayers().getArray().forEach((layer) => {
      if (layer instanceof ol.layer.Vector) {
        this.#featuresAtLocation = this.#featuresAtLocation.concat(
          layer.getSource().getFeaturesAtCoordinate(coord)
        );
      }
    });

    this.#currentFeatureIndex = 0;
    this.#updatePopup();
  }

  // Called by map.js when clicking empty space or panning away.
  clear() {
    this.#popupEl.innerHTML = '';
    this.#overlay.setPosition(undefined);
  }

  // Called by map.js after panning to check if popup scrolled off screen.
  isVisible() {
    const pos = this.#overlay.getPosition();
    if (!pos) return false;
    const px = this.#map.getPixelFromCoordinate(pos);
    const sz = this.#map.getSize();
    return px[0] >= 0 && px[0] < sz[0] && px[1] >= 0 && px[1] < sz[1];
  }


  // ── Private methods ───────────────────────────────────────────────────
  //
  // Implementation details. Nothing outside this class calls these.
  //
  // Notice that all of these use "this.#field" where the factory function
  // version used the bare variable name (e.g. "featuresAtLocation").
  // That's the only mechanical difference — the logic is identical.

  #updatePopup() {
    if (this.#featuresAtLocation.length === 0) return;

    const feature    = this.#featuresAtLocation[this.#currentFeatureIndex];
    const properties = feature.getProperties();
    const coords     = feature.getGeometry().getCoordinates();

    this.#popupEl.innerHTML = '';

    const content = el('div', 'popup-content');
    content.appendChild(this.#renderProperties(properties));

    const bemerkungen = this.#renderBemerkungen(properties.bemerkungen);
    if (bemerkungen) content.appendChild(bemerkungen);

    const thumbs = this.#renderPhotoThumbs(properties.photos);
    if (thumbs) content.appendChild(thumbs);

    this.#popupEl.appendChild(content);

    if (this.#featuresAtLocation.length > 1) {
      this.#popupEl.appendChild(this.#renderNavigation());
    }

    this.#overlay.setPosition(coords);
  }

  #renderProperties(properties) {
    const fragment = document.createDocumentFragment();

    for (const key in properties) {
      if (!Object.hasOwn(this.#propertyAliases, key)) continue;

      const row   = el('div', 'prop-row');
      const label = el('span', 'bold', this.#propertyAliases[key] + ': ');
      const value = document.createTextNode(properties[key] ?? '-');

      row.appendChild(label);
      row.appendChild(value);
      fragment.appendChild(row);
    }

    return fragment;
  }

  #renderBemerkungen(bemerkungen) {
    if (!Array.isArray(bemerkungen) || bemerkungen.length === 0) return null;

    const section = el('div', 'bemerkungen-section');

    const header = el('div', 'bemerkungen-header');
    header.appendChild(el('span', null, '📋 Beobachtungen'));
    header.appendChild(el('span', 'bemerkungen-count', String(bemerkungen.length)));
    section.appendChild(header);

    const list = el('div', 'bemerkungen-list');
    bemerkungen.forEach((b) => {
      const entry = el('div', 'bem-entry');
      if (b.datum) entry.appendChild(el('span', 'bem-date', b.datum));
      entry.appendChild(el('span', 'bem-text', b.text));
      list.appendChild(entry);
    });

    section.appendChild(list);
    return section;
  }

  #renderPhotoThumbs(photos) {
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
      thumb.dataset.photos = JSON.stringify(photos);
      thumb.dataset.index  = String(i);
      thumb.title          = datum ?? `Foto ${i + 1}`;

      const img   = document.createElement('img');
      img.src     = url;
      img.alt     = `Foto ${i + 1}`;
      img.loading = 'lazy';
      thumb.appendChild(img);

      if (isLast && overflow > 0) {
        thumb.classList.add('photo-thumb-overflow');
        thumb.title = `Alle ${photos.length} Fotos anzeigen`;
        thumb.appendChild(el('div', 'photo-overflow-badge', `+${overflow}`));
      }

      if (datum) {
        thumb.appendChild(el('div', 'thumb-date-badge', datum));
      }

      strip.appendChild(thumb);
    }

    return strip;
  }

  // #renderNavigation uses a template literal with this.#currentFeatureIndex
  // and this.#featuresAtLocation.length — this is the "subtle this trap"
  // mentioned before the rewrite. In the factory function these were bare
  // variable names. In a class method they must be this.#field, otherwise
  // JS looks for a local variable called "currentFeatureIndex" which doesn't
  // exist and throws a ReferenceError.
  #renderNavigation() {
    const nav = el('div', 'popup-navigation');
    nav.innerHTML = `
      <button class="nav-button" data-direction="prev">&lt;</button>
      <span>${this.#currentFeatureIndex + 1} von ${this.#featuresAtLocation.length}</span>
      <button class="nav-button" data-direction="next">&gt;</button>`;
    return nav;
  }

  #showPreviousFeature() {
    this.#currentFeatureIndex =
      (this.#currentFeatureIndex - 1 + this.#featuresAtLocation.length) % this.#featuresAtLocation.length;
    this.#updatePopup();
  }

  #showNextFeature() {
    this.#currentFeatureIndex =
      (this.#currentFeatureIndex + 1) % this.#featuresAtLocation.length;
    this.#updatePopup();
  }


  // ── Event listeners ───────────────────────────────────────────────────
  //
  // Called once from the constructor. All arrow functions so "this"
  // always refers to the PopupController instance.
  //
  // Compare to the factory function version: the logic is identical,
  // but "showPreviousFeature()" becomes "this.#showPreviousFeature()"
  // and "openPhotoModal(...)" stays the same because that is a global
  // wrapper function defined at the bottom of modal.js.

  #attachListeners() {
    // Stop map interactions firing through the popup
    ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach((ev) => {
      this.#popupEl.addEventListener(ev, (e) => e.stopPropagation());
    });

    // Stop map zoom when scrolling the bemerkungen list
    this.#popupEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Click delegation — one listener handles all clicks inside the popup
    this.#popupEl.addEventListener('click', (e) => {
      e.stopPropagation();

      if (e.target.classList.contains('nav-button')) {
        if (e.target.dataset.direction === 'prev') this.#showPreviousFeature();
        else this.#showNextFeature();
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

    // Touch delegation — same pattern, instant response on mobile
    this.#popupEl.addEventListener('touchend', (e) => {
      if (e.target.classList.contains('nav-button')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target.dataset.direction === 'prev') this.#showPreviousFeature();
        else this.#showNextFeature();
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
  }
}
