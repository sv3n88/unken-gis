// ─────────────────────────────────────────────────────────────────────────────
// map.js
//
// Responsible for setting up the OpenLayers map and wiring together
// the data layer, select interaction, popup overlay, and basemap switcher.
//
// Depends on: popup.js (calls createPopupController)
//
// initMap() is still a global function because unken_map.js and
// species_map.js call it. In Step 4, when we add modules with
// import/export, this will be a proper export instead.
// ─────────────────────────────────────────────────────────────────────────────


function initMap(collectionName, styleFunction) {

  // ── Basemap layers ──────────────────────────────────────────────────────
  //
  // Defined up here so the basemap switcher buttons below can reference them.
  // They are local variables — nothing outside initMap can access them,
  // which is fine because nothing outside needs to.

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
  homeButton.addEventListener('click', function () {
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
  //
  // OL's Select interaction highlights a clicked feature and keeps track
  // of which features are "selected". We use it only for the yellow
  // highlight style — the actual popup logic lives in popup.js.

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


  // ── Popup overlay ───────────────────────────────────────────────────────
  //
  // ol.Overlay positions a DOM element at a map coordinate.
  // We create it here and pass both map and overlay into createPopupController
  // so popup.js can position itself without knowing about map internals.

  const overlay = new ol.Overlay({
    element:     document.getElementById('popup'),
    positioning: 'bottom-center',
    stopEvent:   false,
    offset:      [0, -15],
  });
  map.addOverlay(overlay);

  // Create the popup controller — this is where popup.js comes in.
  // We pass map and overlay as dependencies ("dependency injection"):
  // popup.js doesn't reach out and grab them itself, we hand them in.
  // This makes popup.js easier to test and reuse.
  const popup = createPopupController(map, overlay);


  // ── Map event handlers ──────────────────────────────────────────────────

  map.on('singleclick', function (evt) {
    const feature = map.forEachFeatureAtPixel(
      evt.pixel,
      function (f) { return f; },
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

  // Hide popup when it scrolls off screen
  map.on('moveend', function () {
    if (!popup.isVisible()) popup.clear();
  });


  // ── Basemap switcher ────────────────────────────────────────────────────

  document.getElementById('osm').addEventListener('click', function () {
    map.getLayers().setAt(0, osmLayer);
  });
  document.getElementById('google').addEventListener('click', function () {
    map.getLayers().setAt(0, googleLayer);
  });


  // Return the map so the calling script (unken_map.js etc.) can use it,
  // for example to add the Hüpferlinge counter control.
  return map;
}