# OpenLayers2shp
Simple library which will allow you to generate shapefiles (**.shp**, **.shx**, **.dbf**) using *OpenLayers 3 Geometry - ol.source.Vector*
Library based on great work of @harry-gibson modified by [Adam Kaput](https://github.com/lol2x)
# Usage:

    var shapefile = new Shapefile();
    shapefile.getOpenLayers3Geometry(ol.source.Vector)

    var pointfile = shapefile.getShapefile('POINT');  // output shapefile will use point graphics only
    var linefile = shapefile.getShapefile('POLYLINE'); // output shapefile will use the polyline graphics only
    var polygonfile = shapefile.getShapefile('POLYGON'); //output shapefile will use the polygons graphics only