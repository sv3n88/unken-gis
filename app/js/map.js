// ─────────────────────────────────────────────────────────────────────────────
// map.js
//
// Sets up the OpenLayers map and wires together the data layer,
// select interaction, popup overlay, and basemap switcher.
//
// Depends on: popup.js (PopupController class)
// ─────────────────────────────────────────────────────────────────────────────

function initMap(collectionName, styleFunction) {

  // ── Basemap layers ──────────────────────────────────────────────────────

  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
  });

  const googleLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      attributions: 'Map data © <a href="https://www.google.com/maps">Google</a>',
    }),
  });


  // ── Map ─────────────────────────────────────────────────────────────────

  ol.has.DEVICE_PIXEL_RATIO = 2;

  const map = new ol.Map({
    layers: [googleLayer],
    controls: ol.control.defaults.defaults({ attribution: false }).extend([
      new ol.control.Attribution({ collapsible: false }),
    ]),
    interactions: ol.interaction.defaults.defaults({ kinetic: null }),
    target: 'map',
    view: new ol.View({
      center: ol.proj.fromLonLat([11.145, 48.765]),
      zoom: 11,
    }),
  });


  // ── Home button ─────────────────────────────────────────────────────────

  const homeButton = document.createElement('div');
  homeButton.className = 'ol-control ol-unselectable home-button';
  homeButton.innerHTML = '🏠';
  homeButton.title     = 'Go to home page';
  homeButton.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
  map.addControl(new ol.control.Control({ element: homeButton }));


  // ── Data layer ──────────────────────────────────────────────────────────

  const dataLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
      url:          `/api/collections/${collectionName}/items`,
      format:       new ol.format.GeoJSON(),
      attributions: 'Unkenprojekt Data',
    }),
    style: styleFunction,
  });
  map.addLayer(dataLayer);


  // ── Select interaction ──────────────────────────────────────────────────

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const select = new ol.interaction.Select({
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 12.5,
        fill:   new ol.style.Fill({ color: 'yellow' }),
        stroke: new ol.style.Stroke({ color: 'red', width: 3 }),
      }),
    }),
    hitTolerance: isMobile ? 15 : 1,
  });
  map.addInteraction(select);


  // ── Popup ───────────────────────────────────────────────────────────────
  //
  // The only change from the factory function version:
  //   BEFORE: const popup = createPopupController(map, overlay);
  //   AFTER:  const popup = new PopupController(map, overlay);
  //
  // The public API (popup.handleFeatureClick, popup.clear, popup.isVisible)
  // is identical — map.js doesn't need to know whether PopupController is
  // implemented as a class or a factory function. That's the benefit of
  // having a clean public API: the internals can change without the caller
  // noticing.

  const overlay = new ol.Overlay({
    element:     document.getElementById('popup'),
    positioning: 'bottom-center',
    stopEvent:   false,
    offset:      [0, -15],
  });
  map.addOverlay(overlay);

  const popup = new PopupController(map, overlay);


  // ── Map event handlers ──────────────────────────────────────────────────

  map.on('singleclick', (evt) => {
    const feature = map.forEachFeatureAtPixel(
      evt.pixel,
      (f) => f,
      { hitTolerance: isMobile ? 15 : 1 }
    );

    if (feature) {
      select.getFeatures().clear();
      select.getFeatures().push(feature);
      popup.handleFeatureClick(feature);
    } else {
      select.getFeatures().clear();
      popup.clear();
    }
  });

  map.on('moveend', () => {
    if (!popup.isVisible()) popup.clear();
  });


  // ── Basemap switcher ────────────────────────────────────────────────────

  document.getElementById('osm').addEventListener('click', () => {
    map.getLayers().setAt(0, osmLayer);
  });
  document.getElementById('google').addEventListener('click', () => {
    map.getLayers().setAt(0, googleLayer);
  });

  return map;
}
