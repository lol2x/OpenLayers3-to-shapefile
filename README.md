# OpenLayers2shp
# NOT READY FOR ACTUALL USE

Simple library which will allow you to generate shapefiles (**.shp**, **.shx**, **.dbf**) using *OpenLayers 3 Geometry - ol.source.Vector*
Library based on great work of @harry-gibson modified by [Adam Kaput](https://github.com/lol2x)
# Usage:

    var shapefile = new Shapefile();
    shapefile.getOpenLayers3Geometry(ol.source.Vector)

    var pointfile = shapefile.getShapefile('POINT');  // output shapefile will use point graphics only
    var linefile = shapefile.getShapefile('POLYLINE'); // output shapefile will use the polyline graphics only
    var polygonfile = shapefile.getShapefile('POLYGON'); //output shapefile will use the polygons graphics only
    
    var pointShp = pointfile.shapefile.shp; //Blob
    var pointShx = pointfile.shapefile.shx; //Blob
    var pointDbf = pointfile.shapefile.dbf; //Blob
    
    var lineShp = linefile.shapefile.shp; //Blob
    var lineShx = linefile.shapefile.shx; //Blob
    var lineDbf = linefile.shapefile.dbf; //Blob
    
    var polygonShp = polygonfile.shapefile.shp; //Blob
    var polygonShx = polygonfile.shapefile.shx; //Blob
    var polygonDbf = polygonfile.shapefile.dbf; //Blob

So you have 9 Blob files containing all geometry types in shapefiles, now you can for example zip it using https://github.com/gildas-lormeau/zip.js and download
