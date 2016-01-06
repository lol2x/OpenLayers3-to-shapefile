/*! openlayers2shp - v0.0.1 - 2016-01-06
* Copyright (c) 2016; Licensed   */
var ol2shp = {
  /**
   * Version number of the openlayers2shp library
   * @type Number
   */
  version: '0.0.1',
};

/**
 * Push OpanLayers3 data to graphics prepared for shapefile format (Point, LineString and Polygon)
 * @param {ol.source.Vector} openlayers3data OpenLayers data you want to push
 */
function getOpenLayers3Geometry(openlayers3data) {
  var features = openlayers3data.getFeatures();
  for (var i = 0; i < features.length; i++) {
    var feature = features[i];
    var OpenLayers3Geometry = {
      attributes: feature.getProperties(),
      geometry: {},
    };
    if (feature.getGeometry().getType() === 'Point') {
      OpenLayers3Geometry.geometry.type = 'POINT';
      var geometryCoordinates = feature.getGeometry().getCoordinates();
      OpenLayers3Geometry.geometry.x = geometryCoordinates[0];
      OpenLayers3Geometry.geometry.y = geometryCoordinates[1];
      this._pointgraphics.push(OpenLayers3Geometry);
    } else if (feature.getGeometry().getType() === 'LineString') {
      OpenLayers3Geometry.geometry.type = 'POLYLINE';
      OpenLayers3Geometry.geometry.paths = feature.getGeometry().getCoordinates();
      this._polylinegraphics.push(OpenLayers3Geometry);
    } else if (feature.getGeometry().getType() === 'Polygon') {
      OpenLayers3Geometry.geometry.type = 'POLYGON';
      OpenLayers3Geometry.geometry.rings = feature.getGeometry().getCoordinates(false);
      this._polygongraphics.push(OpenLayers3Geometry);
    }
  }
}
