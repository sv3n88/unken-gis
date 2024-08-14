function styleFunction(feature) {
    const huepferlinge = feature.get("huepferlinge");
    let fillColor = huepferlinge === 0 ? "orange" : "green";
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 12.5,
        fill: new ol.style.Fill({ color: fillColor }),
        stroke: new ol.style.Stroke({ color: "red", width: 3 }),
      }),
    });
  }
  
  const map = initMap("../data/biotope.json", styleFunction);

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
        totalHuepferlinge += feature.get('huepferlinge') || 0;
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