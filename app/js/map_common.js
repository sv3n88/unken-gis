// ── Photo modal with zoom + pan ───────────────────────────────────────────────

const photoModal = {
  scale:    1,
  minScale: 0.5,
  maxScale: 8,
  tx: 0,       // translateX offset in px
  ty: 0,       // translateY offset in px
  rotation: 0, // degrees, multiples of 90

  // pinch state
  lastPinchDist: null,

  // drag state
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartTx: 0,
  dragStartTy: 0,
};

function _applyTransform() {
  const inner = document.getElementById('photo-modal-box-inner');
  if (!inner) return;
  inner.style.transform =
    `translate(calc(-50% + ${photoModal.tx}px), calc(-50% + ${photoModal.ty}px)) scale(${photoModal.scale}) rotate(${photoModal.rotation}deg)`;
}

function _clampTranslation() {
  // Allow panning only as far as the image edge reaches the viewport edge
  const inner = document.getElementById('photo-modal-box-inner');
  const viewport = document.getElementById('photo-modal-viewport');
  if (!inner || !viewport) return;

  const img = inner.querySelector('img');
  if (!img) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = img.offsetWidth  * photoModal.scale;
  const ih = img.offsetHeight * photoModal.scale;

  const maxTx = Math.max(0, (iw - vw) / 2);
  const maxTy = Math.max(0, (ih - vh) / 2);

  photoModal.tx = Math.max(-maxTx, Math.min(maxTx, photoModal.tx));
  photoModal.ty = Math.max(-maxTy, Math.min(maxTy, photoModal.ty));
}

function zoomPhoto(direction) {
  // direction: 1 = zoom in, -1 = zoom out, 0 = reset
  if (direction === 0) {
    photoModal.scale    = 1;
    photoModal.tx       = 0;
    photoModal.ty       = 0;
    photoModal.rotation = 0;
  } else {
    const step = 0.4;
    photoModal.scale = Math.min(
      photoModal.maxScale,
      Math.max(photoModal.minScale, photoModal.scale + direction * step)
    );
    _clampTranslation();
  }
  _applyTransform();
}

function rotatePhoto() {
  photoModal.rotation = (photoModal.rotation + 90) % 360;
  // Reset pan when rotating so the image stays centred
  photoModal.tx = 0;
  photoModal.ty = 0;
  _applyTransform();
}

function openPhotoModal(src) {
  const modal = document.getElementById('photo-modal');
  const box   = document.getElementById('photo-modal-box-inner');

  // Reset zoom/pan/rotation
  photoModal.scale    = 1;
  photoModal.tx       = 0;
  photoModal.ty       = 0;
  photoModal.rotation = 0;

  box.innerHTML = '<div class="photo-modal-loading">⏳ Wird geladen…</div>';
  modal.classList.add('active');

  const img = new Image();
  img.alt = 'Foto';
  img.draggable = false;
  img.onload = function () {
    box.innerHTML = '';
    box.appendChild(img);
    _applyTransform();
  };
  img.onerror = function () {
    box.innerHTML = '<div class="photo-modal-error">⚠️ Foto konnte nicht geladen werden.</div>';
  };
  img.src = src;
}

function closePhotoModal() {
  const modal = document.getElementById('photo-modal');
  modal.classList.remove('active');
  document.getElementById('photo-modal-box-inner').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', function () {
  const modal    = document.getElementById('photo-modal');
  const viewport = document.getElementById('photo-modal-viewport');
  if (!modal || !viewport) return;

  // ── Close on backdrop click (outside viewport) ──────────────────────────
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closePhotoModal();
  });

  // ── Escape key ──────────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePhotoModal();
    if (!modal.classList.contains('active')) return;
    if (e.key === '+' || e.key === '=') zoomPhoto(1);
    if (e.key === '-')                   zoomPhoto(-1);
    if (e.key === '0')                   zoomPhoto(0);
    if (e.key === 'r' || e.key === 'R')  rotatePhoto();
  });

  // ── Mouse wheel zoom ────────────────────────────────────────────────────
  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    // Zoom toward the cursor position
    const rect   = viewport.getBoundingClientRect();
    const cx      = e.clientX - rect.left - rect.width  / 2;
    const cy      = e.clientY - rect.top  - rect.height / 2;
    const oldScale = photoModal.scale;
    const step     = 0.15;
    photoModal.scale = Math.min(
      photoModal.maxScale,
      Math.max(photoModal.minScale, photoModal.scale + direction * step)
    );
    // Shift translation so zoom centres on cursor
    const scaleDelta = photoModal.scale / oldScale;
    photoModal.tx = cx + (photoModal.tx - cx) * scaleDelta;
    photoModal.ty = cy + (photoModal.ty - cy) * scaleDelta;
    _clampTranslation();
    _applyTransform();
  }, { passive: false });

  // ── Mouse drag to pan ───────────────────────────────────────────────────
  viewport.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    photoModal.dragging   = true;
    photoModal.dragStartX = e.clientX;
    photoModal.dragStartY = e.clientY;
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

  // ── Touch: pinch-to-zoom + drag to pan ─────────────────────────────────
  let isPinching = false;

  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      // Entering pinch — cancel any active drag
      isPinching = true;
      photoModal.dragging = false;
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
        const ratio = dist / photoModal.lastPinchDist;
        photoModal.scale = Math.min(
          photoModal.maxScale,
          Math.max(photoModal.minScale, photoModal.scale * ratio)
        );
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
      // Pinch released — lock in the current scale, don't let drag reset it
      photoModal.lastPinchDist = null;
      if (e.touches.length === 0) {
        isPinching = false;
        photoModal.dragging = false;
      } else if (e.touches.length === 1 && isPinching) {
        // One finger still down after pinch — re-anchor drag from current position
        // so releasing the second finger doesn't start an accidental pan
        photoModal.dragging    = false;
        isPinching             = true; // stay in pinch-guard until all fingers lift
      }
    }
  }, { passive: true });

  // ── Double-tap to reset zoom ────────────────────────────────────────────
  let lastTap = 0;
  viewport.addEventListener('touchend', function (e) {
    if (isPinching) return; // don't trigger double-tap during pinch
    const now = Date.now();
    if (now - lastTap < 300) zoomPhoto(0);
    lastTap = now;
  }, { passive: true });

  viewport.addEventListener('dblclick', function () {
    zoomPhoto(0);
  });
});

// ── Main map initialiser ──────────────────────────────────────────────────────

function initMap(collectionName, styleFunction) {
  const pixelRatio = 2;
  ol.has.DEVICE_PIXEL_RATIO = pixelRatio;

  const attribution = new ol.control.Attribution({
    collapsible: false,
  });

  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
  });

  const googleLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      attributions: 'Map data © <a href="https://www.google.com/maps">Google</a>',
    }),
  });

  const map = new ol.Map({
    layers: [googleLayer],
    controls: ol.control.defaults.defaults({ attribution: false }).extend([attribution]),
    interactions: ol.interaction.defaults.defaults({ kinetic: new ol.Kinetic(-10, 0, 100) }),
    target: "map",
    view: new ol.View({
      center: ol.proj.fromLonLat([11.145, 48.765]),
      zoom: 11,
    }),
  });

  // Home button
  const homeButton = document.createElement('div');
  homeButton.className = 'ol-control ol-unselectable home-button';
  homeButton.innerHTML = '🏠';
  homeButton.title = 'Go to home page';
  homeButton.addEventListener('click', function () {
    window.location.href = '../index.html';
  });
  map.addControl(new ol.control.Control({ element: homeButton }));

  // Data layer via OGC API Features
  const apiBaseUrl = '/api';
  const collectionUrl = `${apiBaseUrl}/collections/${collectionName}/items`;

  const dataLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
      url: collectionUrl,
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
        fill: new ol.style.Fill({ color: "yellow" }),
        stroke: new ol.style.Stroke({ color: "red", width: 3 }),
      }),
    }),
    hitTolerance: isMobile ? 15 : 1,
  });
  map.addInteraction(select);

  const selectedFeatures = select.getFeatures();
  const popup = document.getElementById("popup");
  let overlay = new ol.Overlay({
    element: popup,
    positioning: "bottom-center",
    stopEvent: false,
    offset: [0, -15],
  });
  map.addOverlay(overlay);

  // ── Stop map interactions from firing through the popup ───────────────────
  let pointerDownInsidePopup = false;

  popup.addEventListener("pointerdown",  function (e) { e.stopPropagation(); pointerDownInsidePopup = true;  });
  popup.addEventListener("pointerup",    function (e) { e.stopPropagation(); pointerDownInsidePopup = false; });
  popup.addEventListener("touchstart",   function (e) { e.stopPropagation(); });
  popup.addEventListener("touchmove",    function (e) { e.stopPropagation(); });
  popup.addEventListener("touchend",     function (e) { e.stopPropagation(); });

  popup.addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target.classList.contains("nav-button")) {
      if (e.target.dataset.direction === "prev") {
        showPreviousFeature();
      } else if (e.target.dataset.direction === "next") {
        showNextFeature();
      }
    }
    // Photo trigger
    if (e.target.classList.contains("photo-trigger") || e.target.closest(".photo-trigger")) {
      const trigger = e.target.classList.contains("photo-trigger")
        ? e.target
        : e.target.closest(".photo-trigger");
      openPhotoModal('/' + trigger.dataset.photo);
    }
  });

  // ── Property display aliases ──────────────────────────────────────────────
  const propertyAliases = {
    huepferlinge: "Anzahl Hüpferlinge",
    datum:        "Datum",
    bemerkung:    "Bemerkung",
    region:       "Region",
    name:         "Name",
    anzahl:       "Anzahl",
  };

  let featuresAtLocation  = [];
  let currentFeatureIndex = 0;

  function updateFeaturesAtLocation(clickedFeature) {
    const clickedCoordinate = clickedFeature.getGeometry().getCoordinates();
    featuresAtLocation = [];

    map.getLayers().getArray().forEach(function (layer) {
      if (layer instanceof ol.layer.Vector) {
        const featuresAtCoord = layer.getSource().getFeaturesAtCoordinate(clickedCoordinate);
        featuresAtLocation = featuresAtLocation.concat(featuresAtCoord);
      }
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
    const coordinates = feature.getGeometry().getCoordinates();

    // Attribute rows
    let content = '<div class="popup-content">';
    for (const key in properties) {
      if (Object.hasOwn(propertyAliases, key)) {
        const alias = propertyAliases[key];
        content += `<span class="bold">${alias}:</span> ${properties[key] ?? "-"}<br>`;
      }
    }

    // Photo button — only shown when the feature has a photo path
    if (properties.photo) {
      content += `
        <div class="photo-trigger" data-photo="${properties.photo}" title="Foto anzeigen">
          📷 Foto anzeigen
        </div>`;
    }

    content += '</div>';

    // Multi-feature navigation
    if (featuresAtLocation.length > 1) {
      content += `
        <div class="popup-navigation">
          <button class="nav-button" data-direction="prev">&lt;</button>
          <span>${currentFeatureIndex + 1} von ${featuresAtLocation.length}</span>
          <button class="nav-button" data-direction="next">&gt;</button>
        </div>`;
    }

    popup.innerHTML = content;
    overlay.setPosition(coordinates);

    // Touch handlers for nav buttons
    popup.querySelectorAll(".nav-button").forEach(function (button) {
      button.addEventListener("touchend", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.dataset.direction === "prev") showPreviousFeature();
        else showNextFeature();
      });
    });

    // Touch handler for photo trigger
    const photoTrigger = popup.querySelector(".photo-trigger");
    if (photoTrigger) {
      photoTrigger.addEventListener("touchend", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPhotoModal('/' + this.dataset.photo);
      });
    }
  }

  function clearPopup() {
    popup.innerHTML = "";
    overlay.setPosition(undefined);
    selectedFeatures.clear();
  }

  function isPopupVisible() {
    const mapSize       = map.getSize();
    const popupPosition = overlay.getPosition();
    if (!popupPosition) return false;
    const pixel = map.getPixelFromCoordinate(popupPosition);
    return pixel[0] >= 0 && pixel[0] < mapSize[0] && pixel[1] >= 0 && pixel[1] < mapSize[1];
  }

  map.on("moveend", function () {
    if (!isPopupVisible()) clearPopup();
  });

  // ── Click / drag detection ────────────────────────────────────────────────
  let startPoint = null;
  let isClick    = true;
  const movementTolerance = isMobile ? 10 : 3;

  map.on("pointerdown", function (evt) {
    startPoint = evt.pixel;
    isClick    = true;
  });

  map.on("pointermove", function (evt) {
    if (startPoint) {
      const dx = evt.pixel[0] - startPoint[0];
      const dy = evt.pixel[1] - startPoint[1];
      if (Math.sqrt(dx * dx + dy * dy) > movementTolerance) isClick = false;
    }
  });

  map.on("pointerup", function (evt) {
    if (isClick) {
      const feature = map.forEachFeatureAtPixel(
        evt.pixel,
        function (f) { return f; },
        { hitTolerance: isMobile ? 15 : 1 }
      );

      if (feature) {
        selectedFeatures.clear();
        selectedFeatures.push(feature);
        updateFeaturesAtLocation(feature);
      } else {
        clearPopup();
      }
    }
    startPoint = null;
  });

  // ── Basemap switcher ──────────────────────────────────────────────────────
  document.getElementById("osm").addEventListener("click", function () {
    map.getLayers().setAt(0, osmLayer);
  });
  document.getElementById("google").addEventListener("click", function () {
    map.getLayers().setAt(0, googleLayer);
  });

  return map;
}