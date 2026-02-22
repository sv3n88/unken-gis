function styleFunction(feature) {
    const huepferlinge = parseInt(feature.get("huepferlinge")) || 0;
    const bemerkungen = feature.get("bemerkungen");
    const hasBemerkung = Array.isArray(bemerkungen) && bemerkungen.length > 0;
    let fillColor;
    if (huepferlinge === 0 && !hasBemerkung) {
       fillColor = "rgba(0,0,0,0)";
       stroke = "green";    // transparent
    } else if (huepferlinge === 0) {
       fillColor = "orange";
       stroke = "green";    // huepferlinge=0 but has bemerkung
    } else {
        fillColor = "green";
        stroke = "black";     // huepferlinge > 0
    }
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 12.5,
        fill: new ol.style.Fill({ color: fillColor }),
        stroke: new ol.style.Stroke({ color: stroke, width: 3 }),
      }),
    });
  }
  
  // Use collection name instead of JSON file path
  const map = initMap("biotope", styleFunction);

  // Add Unken-counter
const unkenCounter = document.createElement('div');
unkenCounter.className = 'ol-control ol-unselectable unken-counter';
unkenCounter.innerHTML = 'Loading...';

map.addControl(new ol.control.Control({
  element: unkenCounter
}));

function updateUnkenCounter() {
  let totalHuepferlinge = 0;
  map.getLayers().getArray().forEach(function(layer) {
    if (layer instanceof ol.layer.Vector) {
      layer.getSource().getFeatures().forEach(function(feature) {
        // Convert to integer before adding
        const huepferlinge = parseInt(feature.get('huepferlinge')) || 0;
        totalHuepferlinge += huepferlinge;
      });
    }
  });
  unkenCounter.innerHTML = `Gesamtzahl Hüpferlinge: ${totalHuepferlinge}`;
}

// Update counter when source finishes loading
map.getLayers().getArray().forEach(function(layer) {
  if (layer instanceof ol.layer.Vector) {
    layer.getSource().on('change', function(e) {
      if (this.getState() === 'ready') {
        updateUnkenCounter();
      }
    });
  }
});
