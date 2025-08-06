import Style from 'ol/style/Style';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Point from 'ol/geom/Point';

// Generalized style function for polygons and linestrings with custom colors
function shapeWithVerticesStyle(options) {
  // options: { strokeColor, fillColor, vertexColor, strokeWidth, lineDash }
  return function (feature) {
    const styles = [];
    const geom = feature.getGeometry();
    const type = geom.getType();
    // Main geometry style
    styles.push(
      new Style({
        stroke: new Stroke({
          color: options.strokeColor,
          width: options.strokeWidth || 3,
          lineDash: options.lineDash || undefined,
        }),
        fill: type === 'Polygon'
          ? new Fill({ color: options.fillColor })
          : undefined,
      })
    );
    // Vertex dots
    let coords = [];
    if (type === 'Polygon') {
      coords = geom.getCoordinates()[0];
    } else if (type === 'LineString') {
      coords = geom.getCoordinates();
    }
    coords.forEach(coord => {
      styles.push(
        new Style({
          geometry: new Point(coord),
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: options.vertexColor }),
            stroke: new Stroke({ color: 'white', width: 2 }),
          }),
        })
      );
    });
    return styles;
  };
}

// Blue for normal polygons/lines
export const polygonStyle = shapeWithVerticesStyle({
  strokeColor: 'blue',
  fillColor: 'rgba(30, 144, 255, 0.1)',
  vertexColor: 'blue',
  strokeWidth: 3,
});

// Orange for active polygons/lines
export const activePolygonStyle = shapeWithVerticesStyle({
  strokeColor: 'orange',
  fillColor: 'rgba(255, 165, 0, 0.1)',
  vertexColor: 'orange',
  strokeWidth: 3,
});

// Limegreen for selected polygons/lines
export const selectedPolygonStyle = shapeWithVerticesStyle({
  strokeColor: 'limegreen',
  fillColor: 'rgba(50, 205, 50, 0.15)',
  vertexColor: 'limegreen',
  strokeWidth: 3,
  // lineDash: [8, 4],
});

export const ghostMarkerStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: 'rgba(0,0,255,0.2)' }),
    stroke: new Stroke({ color: 'blue', width: 2 }),
  }),
});

export const highlightSegmentStyle = new Style({
  stroke: new Stroke({
    color: 'red',
    width: 4,
  }),
});

export const highlightVertexStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: 'red' }),
    stroke: new Stroke({ color: '#fff', width: 2 }),
  }),
});

export const closingSegmentStyle = new Style({
  stroke: new Stroke({
    color: 'rgb(26, 26, 26, .6)',
    width: 4,
    lineDash: [4, 8]
  }),
});