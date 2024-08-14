function initMap(geojsonUrl, styleFunction) {
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
      target: "map",
      view: new ol.View({
        center: ol.proj.fromLonLat([11.145, 48.765]),
        zoom: 11,
      }),
    });
  
    const dataLayer = new ol.layer.Vector({
      source: new ol.source.Vector({
        url: geojsonUrl,
        format: new ol.format.GeoJSON(),
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
  
    let pointerDownInsidePopup = false;
  
    popup.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      pointerDownInsidePopup = true;
    });
  
    popup.addEventListener("pointerup", function (e) {
      e.stopPropagation();
      pointerDownInsidePopup = false;
    });
  
    popup.addEventListener("touchstart", function (e) {
      e.stopPropagation();
    });
  
    popup.addEventListener("touchmove", function (e) {
      e.stopPropagation();
    });
  
    popup.addEventListener("touchend", function (e) {
      e.stopPropagation();
    });
  
    popup.addEventListener("click", function (e) {
      e.stopPropagation();
      if (e.target.classList.contains("nav-button")) {
        if (e.target.dataset.direction === "prev") {
          showPreviousFeature();
        } else if (e.target.dataset.direction === "next") {
          showNextFeature();
        }
      }
    });
  
    const propertyAliases = {
      huepferlinge: "Anzahl Hüpferlinge",
      datum: "Datum",
      bemerkung: "Bemerkung",
      region: "Region",
      name: "Name",
      anzahl: "Anzahl"
    };
  
    let featuresAtLocation = [];
    let currentFeatureIndex = 0;
  
    function updateFeaturesAtLocation(clickedFeature) {
      const clickedCoordinate = clickedFeature.getGeometry().getCoordinates();
      featuresAtLocation = [];
  
      map.getLayers().getArray().forEach(function (layer) {
        if (layer instanceof ol.layer.Vector) {
          const source = layer.getSource();
          const featuresAtCoord = source.getFeaturesAtCoordinate(clickedCoordinate);
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
  
      const feature = featuresAtLocation[currentFeatureIndex];
      const properties = feature.getProperties();
      const coordinates = feature.getGeometry().getCoordinates();
  
      let content = '<div class="popup-content">';
      for (const key in properties) {
        if (properties.hasOwnProperty(key) && key !== "geometry") {
          const alias = propertyAliases[key] || key;
          content += `<span class="bold">${alias}:</span> ${properties[key] || "-"}<br>`;
        }
      }
      content += "</div>";
  
      if (featuresAtLocation.length > 1) {
        content += `
          <div class="popup-navigation">
            <button class="nav-button" data-direction="prev">&lt;</button>
            <span>${currentFeatureIndex + 1} of ${featuresAtLocation.length}</span>
            <button class="nav-button" data-direction="next">&gt;</button>
          </div>`;
      }
  
      popup.innerHTML = content;
      overlay.setPosition(coordinates);
  
      const buttons = popup.querySelectorAll(".nav-button");
      buttons.forEach((button) => {
        button.addEventListener("touchend", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (this.dataset.direction === "prev") {
            showPreviousFeature();
          } else if (this.dataset.direction === "next") {
            showNextFeature();
          }
        });
      });
    }
  
    function clearPopup() {
      popup.innerHTML = "";
      overlay.setPosition(undefined);
      selectedFeatures.clear();
    }
  
    function isPopupVisible() {
      const mapSize = map.getSize();
      const popupPosition = overlay.getPosition();
      if (!popupPosition) return false;
  
      const pixel = map.getPixelFromCoordinate(popupPosition);
      return pixel[0] >= 0 && pixel[0] < mapSize[0] && pixel[1] >= 0 && pixel[1] < mapSize[1];
    }
  
    map.on("moveend", function () {
      if (!isPopupVisible()) {
        clearPopup();
      }
    });
  
    let startPoint = null;
    let isClick = true;
    const movementTolerance = isMobile ? 10 : 3;
  
    map.on("pointerdown", function (evt) {
      startPoint = evt.pixel;
      isClick = true;
    });
  
    map.on("pointermove", function (evt) {
      if (startPoint) {
        const currentPoint = evt.pixel;
        const dx = currentPoint[0] - startPoint[0];
        const dy = currentPoint[1] - startPoint[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > movementTolerance) {
          isClick = false;
        }
      }
    });
  
    map.on("pointerup", function (evt) {
      if (isClick) {
        const feature = map.forEachFeatureAtPixel(
          evt.pixel,
          function (feature) {
            return feature;
          },
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
  
    document.getElementById("osm").addEventListener("click", function () {
      map.getLayers().setAt(0, osmLayer);
    });
  
    document.getElementById("google").addEventListener("click", function () {
      map.getLayers().setAt(0, googleLayer);
    });
  
    return map;
  }