function styleFunction() {
    let fillColor = "purple";
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 12.5,
        fill: new ol.style.Fill({ color: fillColor }),
        stroke: new ol.style.Stroke({ color: "red", width: 3 }),
      }),
    });
  }

  // Use collection name instead of JSON file path
  const map = initMap("species", styleFunction);
