// ─────────────────────────────────────────────────────────────────────────────
// modal.js
//
// Responsible for exactly one thing: the photo modal overlay.
// This includes opening/closing it, zoom/pan/rotate, and gallery navigation.
//
// Nothing in here knows about maps, popups, or features.
// It only needs the DOM elements defined in the HTML (photo-modal, etc.)
// and receives photo data from outside via openPhotoModal().
// ─────────────────────────────────────────────────────────────────────────────


// ── State ─────────────────────────────────────────────────────────────────────
//
// This plain object holds all the runtime state the modal needs.
// It lives at the top of the file so it's easy to find and understand
// what data this module works with.
//
// We'll turn this into a class in Step 4 — for now a plain object is fine.

const photoModal = {
  // Zoom & pan
  scale:    1,
  minScale: 0.5,
  maxScale: 8,
  tx: 0,   // horizontal translation in px
  ty: 0,   // vertical translation in px
  rotation: 0,

  // Touch pinch state
  lastPinchDist: null,

  // Mouse/touch drag state
  dragging:    false,
  dragStartX:  0,
  dragStartY:  0,
  dragStartTx: 0,
  dragStartTy: 0,

  // Gallery: photos is an array of {src, datum} objects
  photos:       [],
  currentIndex: 0,
};


// ── Private helpers ───────────────────────────────────────────────────────────
//
// These functions are only used inside this file.
// In Step 4, when we use a class, these become private methods.
// For now, the naming convention _underscore signals "internal, don't call me
// from outside".

function _applyTransform() {
  const inner = document.getElementById('photo-modal-box-inner');
  if (!inner) return;
  inner.style.transform =
    `translate(calc(-50% + ${photoModal.tx}px), calc(-50% + ${photoModal.ty}px)) ` +
    `scale(${photoModal.scale}) rotate(${photoModal.rotation}deg)`;
}

function _clampTranslation() {
  const inner    = document.getElementById('photo-modal-box-inner');
  const viewport = document.getElementById('photo-modal-viewport');
  if (!inner || !viewport) return;
  const img = inner.querySelector('img');
  if (!img) return;
  const maxTx = Math.max(0, (img.offsetWidth  * photoModal.scale - viewport.clientWidth)  / 2);
  const maxTy = Math.max(0, (img.offsetHeight * photoModal.scale - viewport.clientHeight) / 2);
  photoModal.tx = Math.max(-maxTx, Math.min(maxTx, photoModal.tx));
  photoModal.ty = Math.max(-maxTy, Math.min(maxTy, photoModal.ty));
}

function _resetView() {
  photoModal.scale    = 1;
  photoModal.tx       = 0;
  photoModal.ty       = 0;
  photoModal.rotation = 0;
}

function _updateGalleryUI() {
  const counter = document.getElementById('photo-gallery-counter');
  const prev    = document.getElementById('photo-gallery-prev');
  const next    = document.getElementById('photo-gallery-next');
  const total   = photoModal.photos.length;

  if (counter) counter.textContent = total > 1 ? `${photoModal.currentIndex + 1} / ${total}` : '';

  const showNav = total > 1;
  if (prev) prev.style.display = showNav ? 'flex' : 'none';
  if (next) next.style.display = showNav ? 'flex' : 'none';
}

function _updatePhotoCaption() {
  const caption = document.getElementById('photo-modal-caption');
  if (!caption) return;
  const current = photoModal.photos[photoModal.currentIndex];
  const datum   = current && typeof current === 'object' ? current.datum : null;
  caption.textContent   = datum ? `📅 ${datum}` : '';
  caption.style.display = datum ? 'block' : 'none';
}

function _loadPhotoAtIndex(index) {
  const box = document.getElementById('photo-modal-box-inner');
  if (!box) return;

  _resetView();
  box.innerHTML = '<div class="photo-modal-loading">⏳ Wird geladen…</div>';
  _applyTransform();

  const photo = photoModal.photos[index];
  const src   = typeof photo === 'object' ? photo.src : photo;
  const url   = src.startsWith('/') ? src : '/' + src;

  const img     = new Image();
  img.alt       = 'Foto';
  img.draggable = false;

  img.onload  = function () { box.innerHTML = ''; box.appendChild(img); _applyTransform(); };
  img.onerror = function () { box.innerHTML = '<div class="photo-modal-error">⚠️ Foto konnte nicht geladen werden.</div>'; };

  img.src = url;
  _updateGalleryUI();
  _updatePhotoCaption();
}


// ── Public API ────────────────────────────────────────────────────────────────
//
// These are the only functions other files should call.
// popup.js calls openPhotoModal(). The HTML buttons call the others directly.
// Having a clear public API makes it easy to see what this module "exports".

function openPhotoModal(photos, startIndex = 0) {
  const modal = document.getElementById('photo-modal');
  if (!modal) return;
  photoModal.photos       = Array.isArray(photos) ? photos : [photos];
  photoModal.currentIndex = Math.max(0, Math.min(startIndex, photoModal.photos.length - 1));
  modal.classList.add('active');
  _loadPhotoAtIndex(photoModal.currentIndex);
}

function closePhotoModal() {
  const modal = document.getElementById('photo-modal');
  if (modal) modal.classList.remove('active');
  const box = document.getElementById('photo-modal-box-inner');
  if (box) box.innerHTML = '';
  photoModal.photos = [];
}

function galleryPrev() {
  if (photoModal.photos.length < 2) return;
  photoModal.currentIndex = (photoModal.currentIndex - 1 + photoModal.photos.length) % photoModal.photos.length;
  _loadPhotoAtIndex(photoModal.currentIndex);
}

function galleryNext() {
  if (photoModal.photos.length < 2) return;
  photoModal.currentIndex = (photoModal.currentIndex + 1) % photoModal.photos.length;
  _loadPhotoAtIndex(photoModal.currentIndex);
}

function zoomPhoto(direction) {
  if (direction === 0) {
    _resetView();
  } else {
    photoModal.scale = Math.min(photoModal.maxScale, Math.max(photoModal.minScale, photoModal.scale + direction * 0.4));
    _clampTranslation();
  }
  _applyTransform();
}

function rotatePhoto() {
  photoModal.rotation = (photoModal.rotation + 90) % 360;
  photoModal.tx = 0;
  photoModal.ty = 0;
  _applyTransform();
}


// ── Event listeners ───────────────────────────────────────────────────────────
//
// All listeners that belong to the modal are set up here, once, on page load.
// DOMContentLoaded fires when the HTML is fully parsed, so getElementById
// calls are safe to make here.

document.addEventListener('DOMContentLoaded', function () {
  const modal    = document.getElementById('photo-modal');
  const viewport = document.getElementById('photo-modal-viewport');
  if (!modal || !viewport) return;

  // Close on backdrop click
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closePhotoModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    if (!modal.classList.contains('active')) return;
    if (e.key === 'Escape')             closePhotoModal();
    if (e.key === '+' || e.key === '=') zoomPhoto(1);
    if (e.key === '-')                  zoomPhoto(-1);
    if (e.key === '0')                  zoomPhoto(0);
    if (e.key === 'r' || e.key === 'R') rotatePhoto();
    if (e.key === 'ArrowLeft')          galleryPrev();
    if (e.key === 'ArrowRight')         galleryNext();
  });

  // Mouse wheel zoom (toward cursor)
  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    const dir      = e.deltaY < 0 ? 1 : -1;
    const rect     = viewport.getBoundingClientRect();
    const cx       = e.clientX - rect.left - rect.width  / 2;
    const cy       = e.clientY - rect.top  - rect.height / 2;
    const oldScale = photoModal.scale;
    photoModal.scale = Math.min(photoModal.maxScale, Math.max(photoModal.minScale, photoModal.scale + dir * 0.15));
    const delta   = photoModal.scale / oldScale;
    photoModal.tx = cx + (photoModal.tx - cx) * delta;
    photoModal.ty = cy + (photoModal.ty - cy) * delta;
    _clampTranslation();
    _applyTransform();
  }, { passive: false });

  // Mouse drag to pan
  viewport.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    photoModal.dragging    = true;
    photoModal.dragStartX  = e.clientX;
    photoModal.dragStartY  = e.clientY;
    photoModal.dragStartTx = photoModal.tx;
    photoModal.dragStartTy = photoModal.ty;
    viewport.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!photoModal.dragging) return;
    photoModal.tx = photoModal.dragStartTx + (e.clientX - photoModal.dragStartX);
    photoModal.ty = photoModal.dragStartTy + (e.clientY - photoModal.dragStartY);
    _clampTranslation();
    _applyTransform();
  });

  window.addEventListener('mouseup', function () {
    if (!photoModal.dragging) return;
    photoModal.dragging = false;
    viewport.classList.remove('dragging');
  });

  // Touch: pinch-to-zoom + drag
  let isPinching = false;

  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      isPinching = true; photoModal.dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      photoModal.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1 && !isPinching) {
      photoModal.dragging    = true;
      photoModal.dragStartX  = e.touches[0].clientX;
      photoModal.dragStartY  = e.touches[0].clientY;
      photoModal.dragStartTx = photoModal.tx;
      photoModal.dragStartTy = photoModal.ty;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (photoModal.lastPinchDist !== null) {
        photoModal.scale = Math.min(photoModal.maxScale, Math.max(photoModal.minScale, photoModal.scale * (dist / photoModal.lastPinchDist)));
        _clampTranslation();
        _applyTransform();
      }
      photoModal.lastPinchDist = dist;
    } else if (e.touches.length === 1 && photoModal.dragging) {
      photoModal.tx = photoModal.dragStartTx + (e.touches[0].clientX - photoModal.dragStartX);
      photoModal.ty = photoModal.dragStartTy + (e.touches[0].clientY - photoModal.dragStartY);
      _clampTranslation();
      _applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) {
      photoModal.lastPinchDist = null;
      if (e.touches.length === 0) { isPinching = false; photoModal.dragging = false; }
      else if (isPinching)        { photoModal.dragging = false; }
    }
  }, { passive: true });

  // Double-tap / double-click to reset zoom
  let lastTap = 0;
  viewport.addEventListener('touchend', function (e) {
    if (isPinching) return;
    const now = Date.now();
    if (now - lastTap < 300) zoomPhoto(0);
    lastTap = now;
  }, { passive: true });

  viewport.addEventListener('dblclick', function () { zoomPhoto(0); });

  // Gallery arrow buttons
  modal.addEventListener('click', function (e) {
    if (e.target.closest('#photo-gallery-prev')) galleryPrev();
    if (e.target.closest('#photo-gallery-next')) galleryNext();
  });

  const prevBtn = document.getElementById('photo-gallery-prev');
  const nextBtn = document.getElementById('photo-gallery-next');
  if (prevBtn) prevBtn.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); galleryPrev(); });
  if (nextBtn) nextBtn.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); galleryNext(); });
});
