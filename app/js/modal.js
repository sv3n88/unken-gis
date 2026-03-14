// ─────────────────────────────────────────────────────────────────────────────
// modal.js
//
// The PhotoModal class manages the photo overlay: opening, closing,
// gallery navigation, zoom, pan, and rotation.
//
// Usage (at the bottom of this file):
//   const photoModal = new PhotoModal();
//
// Public API used by popup.js and the HTML buttons:
//   photoModal.open(photos, startIndex)
//   photoModal.close()
//   photoModal.next()
//   photoModal.prev()
//   photoModal.zoom(direction)   direction: 1=in, -1=out, 0=reset
//   photoModal.rotate()
// ─────────────────────────────────────────────────────────────────────────────

class PhotoModal {

  // ── Private fields ──────────────────────────────────────────────────────
  //
  // The # prefix makes these truly private — readable and writable only
  // from inside this class. Trying to access photoModal.#scale from
  // outside this file throws a SyntaxError.
  //
  // This is stricter than the old plain object (photoModal.scale = 99
  // from anywhere was perfectly legal before) and stricter than the
  // factory function closure (which was private by convention, not enforced).

  // Zoom & pan
  #scale    = 1;
  #minScale = 0.5;
  #maxScale = 8;
  #tx       = 0;   // horizontal translation in px
  #ty       = 0;   // vertical translation in px
  #rotation = 0;

  // Touch pinch
  #lastPinchDist = null;

  // Mouse / touch drag
  #dragging    = false;
  #dragStartX  = 0;
  #dragStartY  = 0;
  #dragStartTx = 0;
  #dragStartTy = 0;

  // Gallery — photos is [{src, datum}, …]
  #photos       = [];
  #currentIndex = 0;

  // DOM element references — set in constructor
  #modal    = null;
  #viewport = null;
  #box      = null;
  #caption  = null;
  #counter  = null;
  #prevBtn  = null;
  #nextBtn  = null;


  // ── Constructor ─────────────────────────────────────────────────────────
  //
  // Runs once when you write: const photoModal = new PhotoModal()
  // We grab DOM references here so every method can use them via this.#modal
  // without calling getElementById every time.

  constructor() {
    this.#modal    = document.getElementById('photo-modal');
    this.#viewport = document.getElementById('photo-modal-viewport');
    this.#box      = document.getElementById('photo-modal-box-inner');
    this.#caption  = document.getElementById('photo-modal-caption');
    this.#counter  = document.getElementById('photo-gallery-counter');
    this.#prevBtn  = document.getElementById('photo-gallery-prev');
    this.#nextBtn  = document.getElementById('photo-gallery-next');

    this.#attachListeners();
  }


  // ── Public methods ───────────────────────────────────────────────────────
  //
  // These are the only methods popup.js and the HTML buttons should call.
  // No # prefix = public.

  open(photos, startIndex = 0) {
    this.#photos       = Array.isArray(photos) ? photos : [photos];
    this.#currentIndex = Math.max(0, Math.min(startIndex, this.#photos.length - 1));
    this.#modal.classList.add('active');
    this.#loadPhoto(this.#currentIndex);
  }

  close() {
    this.#modal.classList.remove('active');
    this.#box.innerHTML = '';
    this.#photos = [];
  }

  next() {
    if (this.#photos.length < 2) return;
    this.#currentIndex = (this.#currentIndex + 1) % this.#photos.length;
    this.#loadPhoto(this.#currentIndex);
  }

  prev() {
    if (this.#photos.length < 2) return;
    this.#currentIndex = (this.#currentIndex - 1 + this.#photos.length) % this.#photos.length;
    this.#loadPhoto(this.#currentIndex);
  }

  // direction: 1 = zoom in, -1 = zoom out, 0 = reset
  zoom(direction) {
    if (direction === 0) {
      this.#resetView();
    } else {
      this.#scale = Math.min(this.#maxScale, Math.max(this.#minScale, this.#scale + direction * 0.4));
      this.#clampTranslation();
    }
    this.#applyTransform();
  }

  rotate() {
    this.#rotation = (this.#rotation + 90) % 360;
    this.#tx = 0;
    this.#ty = 0;
    this.#applyTransform();
  }


  // ── Private methods ──────────────────────────────────────────────────────
  //
  // Implementation details. Callers outside this class don't need to
  // know these exist.

  #resetView() {
    this.#scale    = 1;
    this.#tx       = 0;
    this.#ty       = 0;
    this.#rotation = 0;
  }

  #applyTransform() {
    this.#box.style.transform =
      `translate(calc(-50% + ${this.#tx}px), calc(-50% + ${this.#ty}px)) ` +
      `scale(${this.#scale}) rotate(${this.#rotation}deg)`;
  }

  #clampTranslation() {
    const img = this.#box.querySelector('img');
    if (!img) return;
    const maxTx = Math.max(0, (img.offsetWidth  * this.#scale - this.#viewport.clientWidth)  / 2);
    const maxTy = Math.max(0, (img.offsetHeight * this.#scale - this.#viewport.clientHeight) / 2);
    this.#tx = Math.max(-maxTx, Math.min(maxTx, this.#tx));
    this.#ty = Math.max(-maxTy, Math.min(maxTy, this.#ty));
  }

  #updateGalleryUI() {
    const total = this.#photos.length;
    if (this.#counter) {
      this.#counter.textContent = total > 1 ? `${this.#currentIndex + 1} / ${total}` : '';
    }
    const showNav = total > 1;
    if (this.#prevBtn) this.#prevBtn.style.display = showNav ? 'flex' : 'none';
    if (this.#nextBtn) this.#nextBtn.style.display = showNav ? 'flex' : 'none';
  }

  #updateCaption() {
    if (!this.#caption) return;
    const current = this.#photos[this.#currentIndex];
    const datum   = current && typeof current === 'object' ? current.datum : null;
    this.#caption.textContent   = datum ? `📅 ${datum}` : '';
    this.#caption.style.display = datum ? 'block' : 'none';
  }

  #loadPhoto(index) {
    this.#resetView();
    this.#box.innerHTML = '<div class="photo-modal-loading">⏳ Wird geladen…</div>';
    this.#applyTransform();

    const photo = this.#photos[index];
    const src   = typeof photo === 'object' ? photo.src : photo;
    const url   = src.startsWith('/') ? src : '/' + src;

    const img     = new Image();
    img.alt       = 'Foto';
    img.draggable = false;

    // Arrow functions here so "this" stays bound to the PhotoModal instance.
    // If we used function() { ... } instead, "this" inside would be the img
    // element (the thing that fired the event), not the PhotoModal.
    img.onload  = () => { this.#box.innerHTML = ''; this.#box.appendChild(img); this.#applyTransform(); };
    img.onerror = () => { this.#box.innerHTML = '<div class="photo-modal-error">⚠️ Foto konnte nicht geladen werden.</div>'; };

    img.src = url;
    this.#updateGalleryUI();
    this.#updateCaption();
  }


  // ── Event listeners ──────────────────────────────────────────────────────
  //
  // Called once from the constructor. All arrow functions so "this" always
  // refers to the PhotoModal instance, never the element that fired the event.

  #attachListeners() {
    // Close on backdrop click
    this.#modal.addEventListener('click', (e) => {
      if (e.target === this.#modal) this.close();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.#modal.classList.contains('active')) return;
      if (e.key === 'Escape')             this.close();
      if (e.key === '+' || e.key === '=') this.zoom(1);
      if (e.key === '-')                  this.zoom(-1);
      if (e.key === '0')                  this.zoom(0);
      if (e.key === 'r' || e.key === 'R') this.rotate();
      if (e.key === 'ArrowLeft')          this.prev();
      if (e.key === 'ArrowRight')         this.next();
    });

    // Mouse wheel zoom toward cursor
    this.#viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir      = e.deltaY < 0 ? 1 : -1;
      const rect     = this.#viewport.getBoundingClientRect();
      const cx       = e.clientX - rect.left - rect.width  / 2;
      const cy       = e.clientY - rect.top  - rect.height / 2;
      const oldScale = this.#scale;
      this.#scale = Math.min(this.#maxScale, Math.max(this.#minScale, this.#scale + dir * 0.15));
      const delta  = this.#scale / oldScale;
      this.#tx     = cx + (this.#tx - cx) * delta;
      this.#ty     = cy + (this.#ty - cy) * delta;
      this.#clampTranslation();
      this.#applyTransform();
    }, { passive: false });

    // Mouse drag to pan
    this.#viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.#dragging    = true;
      this.#dragStartX  = e.clientX;
      this.#dragStartY  = e.clientY;
      this.#dragStartTx = this.#tx;
      this.#dragStartTy = this.#ty;
      this.#viewport.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.#dragging) return;
      this.#tx = this.#dragStartTx + (e.clientX - this.#dragStartX);
      this.#ty = this.#dragStartTy + (e.clientY - this.#dragStartY);
      this.#clampTranslation();
      this.#applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (!this.#dragging) return;
      this.#dragging = false;
      this.#viewport.classList.remove('dragging');
    });

    // Touch: pinch-to-zoom + drag
    let isPinching = false;

    this.#viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        isPinching        = true;
        this.#dragging    = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.#lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1 && !isPinching) {
        this.#dragging    = true;
        this.#dragStartX  = e.touches[0].clientX;
        this.#dragStartY  = e.touches[0].clientY;
        this.#dragStartTx = this.#tx;
        this.#dragStartTy = this.#ty;
      }
    }, { passive: true });

    this.#viewport.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (this.#lastPinchDist !== null) {
          this.#scale = Math.min(this.#maxScale, Math.max(this.#minScale, this.#scale * (dist / this.#lastPinchDist)));
          this.#clampTranslation();
          this.#applyTransform();
        }
        this.#lastPinchDist = dist;
      } else if (e.touches.length === 1 && this.#dragging) {
        this.#tx = this.#dragStartTx + (e.touches[0].clientX - this.#dragStartX);
        this.#ty = this.#dragStartTy + (e.touches[0].clientY - this.#dragStartY);
        this.#clampTranslation();
        this.#applyTransform();
      }
    }, { passive: false });

    this.#viewport.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        this.#lastPinchDist = null;
        if (e.touches.length === 0) { isPinching = false; this.#dragging = false; }
        else if (isPinching)        { this.#dragging = false; }
      }
    }, { passive: true });

    // Double-tap / double-click to reset zoom
    let lastTap = 0;
    this.#viewport.addEventListener('touchend', (e) => {
      if (isPinching) return;
      const now = Date.now();
      if (now - lastTap < 300) this.zoom(0);
      lastTap = now;
    }, { passive: true });

    this.#viewport.addEventListener('dblclick', () => this.zoom(0));

    // Gallery arrow buttons
    this.#modal.addEventListener('click', (e) => {
      if (e.target.closest('#photo-gallery-prev')) this.prev();
      if (e.target.closest('#photo-gallery-next')) this.next();
    });

    if (this.#prevBtn) {
      this.#prevBtn.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation(); this.prev();
      });
    }
    if (this.#nextBtn) {
      this.#nextBtn.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation(); this.next();
      });
    }
  }
}


// ── Single instance ───────────────────────────────────────────────────────────
//
// We only ever need one modal on the page, so we create one instance here.
// popup.js and the HTML buttons call methods on this object.
//
// The HTML buttons still call e.g. zoomPhoto(1) — we add small wrapper
// functions below so the HTML doesn't need to change.

const photoModal = new PhotoModal();

// Wrappers so the HTML onclick attributes keep working unchanged:
//   onclick="closePhotoModal()"
//   onclick="zoomPhoto(-1)"
//   onclick="rotatePhoto()"
//   openPhotoModal(photos, index) called from popup.js
function openPhotoModal(photos, startIndex = 0) { photoModal.open(photos, startIndex); }
function closePhotoModal()                        { photoModal.close(); }
function zoomPhoto(direction)                     { photoModal.zoom(direction); }
function rotatePhoto()                            { photoModal.rotate(); }