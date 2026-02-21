// ── Photo modal with zoom + pan + gallery ─────────────────────────────────────

const photoModal = {
  scale: 1, minScale: 0.5, maxScale: 8,
  tx: 0, ty: 0, rotation: 0,
  lastPinchDist: null,
  dragging: false, dragStartX: 0, dragStartY: 0, dragStartTx: 0, dragStartTy: 0,
  // photos is now [{src, datum}, …] or legacy plain strings
  photos: [], currentIndex: 0,
};

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
  photoModal.scale = 1; photoModal.tx = 0; photoModal.ty = 0; photoModal.rotation = 0;
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
  const datum   = current && typeof current === 'object' && current.datum ? current.datum : null;
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

  const img = new Image();
  img.alt = 'Foto'; img.draggable = false;
  img.onload  = function () { box.innerHTML = ''; box.appendChild(img); _applyTransform(); };
  img.onerror = function () { box.innerHTML = '<div class="photo-modal-error">⚠️ Foto konnte nicht geladen werden.</div>'; };
  img.src = url;

  _updateGalleryUI();
  _updatePhotoCaption();
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
  if (direction === 0) { _resetView(); }
  else {
    photoModal.scale = Math.min(photoModal.maxScale, Math.max(photoModal.minScale, photoModal.scale + direction * 0.4));
    _clampTranslation();
  }
  _applyTransform();
}

function rotatePhoto() {
  photoModal.rotation = (photoModal.rotation + 90) % 360;
  photoModal.tx = 0; photoModal.ty = 0;
  _applyTransform();
}

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

document.addEventListener('DOMContentLoaded', function () {
  const modal    = document.getElementById('photo-modal');
  const viewport = document.getElementById('photo-modal-viewport');
  if (!modal || !viewport) return;

  modal.addEventListener('click', function (e) { if (e.target === modal) closePhotoModal(); });

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

  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    const dir      = e.deltaY < 0 ? 1 : -1;
    const rect     = viewport.getBoundingClientRect();
    const cx       = e.clientX - rect.left - rect.width  / 2;
    const cy       = e.clientY - rect.top  - rect.height / 2;
    const oldScale = photoModal.scale;
    photoModal.scale = Math.min(photoModal.maxScale, Math.max(photoModal.minScale, photoModal.scale + dir * 0.15));
    const delta  = photoModal.scale / oldScale;
    photoModal.tx = cx + (photoModal.tx - cx) * delta;
    photoModal.ty = cy + (photoModal.ty - cy) * delta;
    _clampTranslation(); _applyTransform();
  }, { passive: false });

  viewport.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    photoModal.dragging = true;
    photoModal.dragStartX = e.clientX; photoModal.dragStartY = e.clientY;
    photoModal.dragStartTx = photoModal.tx; photoModal.dragStartTy = photoModal.ty;
    viewport.classList.add('dragging'); e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!photoModal.dragging) return;
    photoModal.tx = photoModal.dragStartTx + (e.clientX - photoModal.dragStartX);
    photoModal.ty = photoModal.dragStartTy + (e.clientY - photoModal.dragStartY);
    _clampTranslation(); _applyTransform();
  });

  window.addEventListener('mouseup', function () {
    if (!photoModal.dragging) return;
    photoModal.dragging = false; viewport.classList.remove('dragging');
  });

  let isPinching = false;

  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      isPinching = true; photoModal.dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      photoModal.lastPinchDist = Math.sqrt(dx*dx + dy*dy);
    } else if (e.touches.length === 1 && !isPinching) {
      photoModal.dragging = true;
      photoModal.dragStartX = e.touches[0].clientX; photoModal.dragStartY = e.touches[0].clientY;
      photoModal.dragStartTx = photoModal.tx; photoModal.dragStartTy = photoModal.ty;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (photoModal.lastPinchDist !== null) {
        photoModal.scale = Math.min(photoModal.maxScale, Math.max(photoModal.minScale, photoModal.scale * (dist / photoModal.lastPinchDist)));
        _clampTranslation(); _applyTransform();
      }
      photoModal.lastPinchDist = dist;
    } else if (e.touches.length === 1 && photoModal.dragging) {
      photoModal.tx = photoModal.dragStartTx + (e.touches[0].clientX - photoModal.dragStartX);
      photoModal.ty = photoModal.dragStartTy + (e.touches[0].clientY - photoModal.dragStartY);
      _clampTranslation(); _applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) {
      photoModal.lastPinchDist = null;
      if (e.touches.length === 0) { isPinching = false; photoModal.dragging = false; }
      else if (e.touches.length === 1 && isPinching) { photoModal.dragging = false; isPinching = true; }
    }
  }, { passive: true });

  let lastTap = 0;
  viewport.addEventListener('touchend', function (e) {
    if (isPinching) return;
    const now = Date.now();
    if (now - lastTap < 300) zoomPhoto(0);
    lastTap = now;
  }, { passive: true });

  viewport.addEventListener('dblclick', function () { zoomPhoto(0); });

  modal.addEventListener('click', function (e) {
    if (e.target.closest('#photo-gallery-prev')) galleryPrev();
    if (e.target.closest('#photo-gallery-next')) galleryNext();
  });

  const prevBtn = document.getElementById('photo-gallery-prev');
  const nextBtn = document.getElementById('photo-gallery-next');
  if (prevBtn) prevBtn.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); galleryPrev(); });
  if (nextBtn) nextBtn.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); galleryNext(); });
});

// ── Main map initialiser ──────────────────────────────────────────────────────

function initMap(collectionName, styleFunction) {
  ol.has.DEVICE_PIXEL_RATIO = 2;

  const osmLayer = new ol.layer.Tile({ source: new ol.source.OSM() });
  const googleLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      attributions: 'Map data © <a href="https://www.google.com/maps">Google</a>',
    }),
  });

  const map = new ol.Map({
    layers: [googleLayer],
    controls: ol.control.defaults.defaults({ attribution: false }).extend([
      new ol.control.Attribution({ collapsible: false }),
    ]),
    interactions: ol.interaction.defaults.defaults({ kinetic: null }),
    target: "map",
    view: new ol.View({ center: ol.proj.fromLonLat([11.145, 48.765]), zoom: 11 }),
  });

  const homeButton = document.createElement('div');
  homeButton.className = 'ol-control ol-unselectable home-button';
  homeButton.innerHTML = '🏠';
  homeButton.title = 'Go to home page';
  homeButton.addEventListener('click', function () { window.location.href = '../index.html'; });
  map.addControl(new ol.control.Control({ element: homeButton }));

  const dataLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
      url:    `/api/collections/${collectionName}/items`,
      format: new ol.format.GeoJSON(),
      attributions: 'Unkenprojekt Data',
    }),
    style: styleFunction,
  });
  map.addLayer(dataLayer);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const select = new ol.interaction.Select({
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 12.5,
        fill:   new ol.style.Fill({ color: "yellow" }),
        stroke: new ol.style.Stroke({ color: "red", width: 3 }),
      }),
    }),
    hitTolerance: isMobile ? 15 : 1,
  });
  map.addInteraction(select);
  const selectedFeatures = select.getFeatures();

  const popup  = document.getElementById("popup");
  const overlay = new ol.Overlay({
    element: popup, positioning: "bottom-center", stopEvent: false, offset: [0, -15],
  });
  map.addOverlay(overlay);

  ['pointerdown','pointerup','touchstart','touchmove','touchend'].forEach(function (ev) {
    popup.addEventListener(ev, function (e) { e.stopPropagation(); });
  });

  popup.addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target.classList.contains("nav-button")) {
      if (e.target.dataset.direction === "prev") showPreviousFeature();
      else showNextFeature();
      return;
    }
    const trigger = e.target.classList.contains("photo-trigger") ? e.target : e.target.closest(".photo-trigger");
    if (trigger) {
      openPhotoModal(JSON.parse(trigger.dataset.photos || '[]'), parseInt(trigger.dataset.index || '0', 10));
    }
  });

  const propertyAliases = {
    huepferlinge: "Anzahl Hüpferlinge",
    region:       "Region",
    name:         "Name",
    anzahl:       "Anzahl",
    id:           "ID",
  };

  let featuresAtLocation  = [];
  let currentFeatureIndex = 0;

  function updateFeaturesAtLocation(clickedFeature) {
    const coord = clickedFeature.getGeometry().getCoordinates();
    featuresAtLocation = [];
    map.getLayers().getArray().forEach(function (layer) {
      if (layer instanceof ol.layer.Vector)
        featuresAtLocation = featuresAtLocation.concat(layer.getSource().getFeaturesAtCoordinate(coord));
    });
    currentFeatureIndex = 0;
    updatePopup();
  }

  function showPreviousFeature() {
    currentFeatureIndex = (currentFeatureIndex - 1 + featuresAtLocation.length) % featuresAtLocation.length;
    updatePopup();
  }

  function showNextFeature() {
    currentFeatureIndex = (currentFeatureIndex + 1) % featuresAtLocation.length;
    updatePopup();
  }

  function updatePopup() {
    if (featuresAtLocation.length === 0) return;

    const feature    = featuresAtLocation[currentFeatureIndex];
    const properties = feature.getProperties();
    const coords     = feature.getGeometry().getCoordinates();

    let content = '<div class="popup-content">';

    // Static property rows
    for (const key in properties) {
      if (Object.hasOwn(propertyAliases, key)) {
        content += `<div class="prop-row"><span class="bold">${propertyAliases[key]}:</span> ${properties[key] ?? '-'}</div>`;
      }
    }

    // ── Bemerkungen timeline ───────────────────────────────────────────────
    const bemerkungen = properties.bemerkungen;
    if (Array.isArray(bemerkungen) && bemerkungen.length > 0) {
      content += `
        <div class="bemerkungen-section">
          <div class="bemerkungen-header">
            <span>📋 Beobachtungen</span>
            <span class="bemerkungen-count">${bemerkungen.length}</span>
          </div>
          <div class="bemerkungen-list">`;

      for (const b of bemerkungen) {
        content += `<div class="bem-entry">`;
        if (b.datum) content += `<span class="bem-date">${b.datum}</span>`;
        content += `<span class="bem-text">${escapeHtml(b.text)}</span></div>`;
      }

      content += `</div></div>`;
    }

    // ── Photo thumbnail strip ──────────────────────────────────────────────
    const photos = properties.photos;
    if (Array.isArray(photos) && photos.length > 0) {
      const MAX_THUMBS   = 3;
      const photosAttr   = JSON.stringify(photos).replace(/"/g, '&quot;');
      const visibleCount = Math.min(photos.length, MAX_THUMBS);
      const overflow     = photos.length - visibleCount;

      content += '<div class="photo-thumbs">';
      for (let i = 0; i < visibleCount; i++) {
        const photo  = photos[i];
        const src    = typeof photo === 'object' ? photo.src : photo;
        const datum  = typeof photo === 'object' && photo.datum ? photo.datum : null;
        const url    = src.startsWith('/') ? src : '/' + src;
        const isLast = i === visibleCount - 1;

        if (isLast && overflow > 0) {
          content += `
            <div class="photo-trigger photo-thumb photo-thumb-overflow"
                 data-photos="${photosAttr}" data-index="${i}"
                 title="Alle ${photos.length} Fotos anzeigen">
              <img src="${url}" alt="Foto ${i+1}" loading="lazy" />
              <div class="photo-overflow-badge">+${overflow}</div>
            </div>`;
        } else {
          content += `
            <div class="photo-trigger photo-thumb"
                 data-photos="${photosAttr}" data-index="${i}"
                 title="${datum ? datum : `Foto ${i+1}`}">
              <img src="${url}" alt="Foto ${i+1}" loading="lazy" />
              ${datum ? `<div class="thumb-date-badge">${datum}</div>` : ''}
            </div>`;
        }
      }
      content += '</div>';
    }

    content += '</div>';

    if (featuresAtLocation.length > 1) {
      content += `
        <div class="popup-navigation">
          <button class="nav-button" data-direction="prev">&lt;</button>
          <span>${currentFeatureIndex + 1} von ${featuresAtLocation.length}</span>
          <button class="nav-button" data-direction="next">&gt;</button>
        </div>`;
    }

    popup.innerHTML = content;
    overlay.setPosition(coords);

    popup.querySelectorAll(".nav-button").forEach(function (btn) {
      btn.addEventListener("touchend", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (this.dataset.direction === "prev") showPreviousFeature(); else showNextFeature();
      });
    });

    popup.querySelectorAll(".photo-trigger").forEach(function (trigger) {
      trigger.addEventListener("touchend", function (e) {
        e.preventDefault(); e.stopPropagation();
        openPhotoModal(JSON.parse(this.dataset.photos || '[]'), parseInt(this.dataset.index || '0', 10));
      });
    });
  }

  function clearPopup() {
    popup.innerHTML = ''; overlay.setPosition(undefined); selectedFeatures.clear();
  }

  function isPopupVisible() {
    const pos = overlay.getPosition(); if (!pos) return false;
    const px = map.getPixelFromCoordinate(pos); const sz = map.getSize();
    return px[0] >= 0 && px[0] < sz[0] && px[1] >= 0 && px[1] < sz[1];
  }

  map.on("moveend",     function () { if (!isPopupVisible()) clearPopup(); });
  map.on("singleclick", function (evt) {
    const f = map.forEachFeatureAtPixel(evt.pixel, function (f) { return f; }, { hitTolerance: isMobile ? 15 : 1 });
    if (f) { selectedFeatures.clear(); selectedFeatures.push(f); updateFeaturesAtLocation(f); }
    else clearPopup();
  });

  document.getElementById("osm").addEventListener("click",    function () { map.getLayers().setAt(0, osmLayer);    });
  document.getElementById("google").addEventListener("click", function () { map.getLayers().setAt(0, googleLayer); });

  return map;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}