var Shapefile = (function() {

  //pad strings on the left
  if (!''.lpad) {
    String.prototype.lpad = function(padString, length) {
      var str = this;
      while (str.length < length)
        str = padString + str;
      return str;
    };
  }
  //pad strings on the right
  if (!''.rpad) {
    String.prototype.rpad = function(padString, length) {
      var str = this;
      while (str.length < length)
        str = str + padString;
      return str;
    };
  }
  var ShapeMaker = function() {
    this._pointgraphics = [];
    this._polylinegraphics = [];
    this._polygongraphics = [];
  };

  ShapeMaker.prototype = (function() {

    var ShapeTypes = {
      'POINT': 1,
      'POLYLINE': 3,
      'POLYGON': 5
    };

    /**
     * Push OpanLayers3 data to graphics prepared for shapefile format
     * (Point, LineString and Polygon)
     * @param {ol.source.Vector} openlayers3data OpenLayers data you want to push
     */
    function getOpenLayers3Geometry(openlayers3data) {
      var features = openlayers3data.getFeatures();
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        var OpenLayers3Geometry = {
          attributes: feature.getProperties(),
          geometry: {}
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

    var getShapefile = function(shapetype) {
      // Main function to generate shapefile, after adding graphics
      // Returns an object with three
      // members named shp,shx, and dbf, values are the associated Blobs
      if (typeof(shapetype) === 'undefined' &&
          !(shapetype === 'POINT' || shapetype === 'POLYLINE' || shapetype === 'POLYGON')) {
        return {
          successful: false,
          message: 'Unknown or unspecified shapefile type requested'
        };
      }
      var arrayToUse;
      if (shapetype === 'POINT') {
        arrayToUse = this._pointgraphics;
      } else if (shapetype === 'POLYLINE') {
        arrayToUse = this._polylinegraphics;
      } else if (shapetype === 'POLYGON') {
        arrayToUse = this._polygongraphics;
      } else {
        return {
          successful: false,
          message: 'No graphics of type ' + shapetype + ' have been added!'
        };
      }

      var resultObject = _createShapeShxFile(shapetype, arrayToUse);
      var attributeMap = _createAttributeMap.apply(this, [arrayToUse]);
      resultObject.dbf = _createDbf.apply(this, [attributeMap, arrayToUse]);
      return {
        successful: true,
        shapefile: {
          shp: resultObject.shape,
          shx: resultObject.shx,
          dbf: resultObject.dbf
        }
      };
    };
// DECLARE FUCNTIONS THAT WILL BE PRIVATE (NOT EXPOSED THROUGH PROTOTYPE)
    // this is where the shapefile goodness happens
    var _createShapeShxFile = function(shapetype, graphics) {
      var i, pointIdx, partNum, graphic, byteLengthOfRecordInclHeader;
      var shpHeaderBuf = new ArrayBuffer(100);
      var shxHeaderBuf = new ArrayBuffer(100);
      for (i = 0; i < 100; i++) {
        shpHeaderBuf[i] = 0;
        shxHeaderBuf[i] = 0;
      }
      var shpHeaderView = new DataView(shpHeaderBuf);
      var shxHeaderView = new DataView(shxHeaderBuf);
      // start writing the headers
      // Big-endian 32 bit int of 9994 at byte 0 in both files
      shpHeaderView.setInt32(0, 9994);
      shxHeaderView.setInt32(0, 9994);
      // Little endian 32 bit int of 1000 at byte 28 in both files
      shpHeaderView.setInt32(28, 1000, true);
      shxHeaderView.setInt32(28, 1000, true);
      // Little endian 32 bit int at byte 32 in both files gives shapetype
      shpHeaderView.setInt32(32, ShapeTypes[shapetype], true);
      shxHeaderView.setInt32(32, ShapeTypes[shapetype], true);
      // That's the fixed info, rest of header depends on contents. Start building contents now.
      // will get extent by naive method of increasing or decreasing the min / max for each feature
      // outside those currently set
      var extentMinX = Number.MAX_VALUE;
      var extentMinY = Number.MAX_VALUE;
      var extentMaxX = -Number.MAX_VALUE;
      var extentMaxY = -Number.MAX_VALUE;
      var numRecords = graphics.length;
      // track overall length of files in bytes
      var byteFileLength = 100; // value is fixed 100 bytes from the header, plus the contents
      var byteShxLength = 100;
      var byteLengthOfRecordHeader = 8; // 2 integers, same for all shape types
      switch (shapetype) {
        case 'POINT':
          // length of record is fixed at 20 for points, being 1 int and 2 doubles in a point record
          var byteLengthOfRecord = 20;
          byteLengthOfRecordInclHeader = byteLengthOfRecord + byteLengthOfRecordHeader;
          for (i = 1; i < numRecords + 1; i++) { // record numbers begin at 1 not 0
            graphic = graphics[i - 1];
            var x = graphic.geometry.x;
            var y = graphic.geometry.y;
            if (x < extentMinX)
              extentMinX = x;
            if (x > extentMaxX)
              extentMaxX = x;
            if (y < extentMinY)
              extentMinY = y;
            if (y > extentMaxY)
              extentMaxY = y;
            // we'll write the shapefile record header and content into a single arraybuffer
            var recordBuffer = new ArrayBuffer(byteLengthOfRecordInclHeader);
            var recordDataView = new DataView(recordBuffer);
            recordDataView.setInt32(0, i); // big-endian value at byte 0 of header is record number
            // Byte 4 is length of record content only, in 16 bit words (divide by 2)
            recordDataView.setInt32(4, byteLengthOfRecord / 2); // always 20 / 2 = 10 for points
            //now the record content
            recordDataView.setInt32(8, ShapeTypes[shapetype], true); // 1=Point. LITTLE endian!
            recordDataView.setFloat64(12, x, true); //little-endian
            recordDataView.setFloat64(20, y, true); //little-endian
            // now do the shx record. NB no record header in shx, just fixed 8 byte records.
            var shxRecordBuffer = new ArrayBuffer(8);
            var shxRecordView = new DataView(shxRecordBuffer);
            // byte 0 of shx record gives offset in the shapefile of record start
            // byte 4 of shx record gives length of the record in the shapefile
            shxRecordView.setInt32(0, byteFileLength / 2);
            shxRecordView.setInt32(4, (byteLengthOfRecord / 2));
            // append the data to the content blobs, use the getBuffer convenience method rather
            // than the buffer object itself as if it's a mock (normal array) buffer
            // it needs converting to a string first
      //      var shapeContentBlobObject = new Blob(shpHeaderBuf, recordBuffer);
            //shapeContentBlobObject.append(recordDataView.getBuffer());
      //      var shxContentBlobObject = new Blob(shxHeaderBuf,shxRecordBuffer);
            byteFileLength += byteLengthOfRecordInclHeader;
          }
          break;
        case 'POLYLINE':
        case 'POLYGON':
          // file structure is identical for lines and polygons,
          // we just use a different shapetype and refer to
          // a different property of the input graphic
          for (i = 1; i < numRecords + 1; i++) {
            graphic = graphics[i - 1];
            var featureMinX = Number.MAX_VALUE;
            var featureMinY = Number.MAX_VALUE;
            var featureMaxX = -Number.MAX_VALUE;
            var featureMaxY = -Number.MAX_VALUE;
            var numParts;
            if (shapetype === 'POLYLINE') {
              numParts = graphic.geometry.paths.length;
            }
            else if (shapetype === 'POLYGON') {
              numParts = graphic.geometry.rings.length;
            }
            var partsIndex = [];
            var pointsArray = [];
            for (partNum = 0; partNum < numParts; partNum++) {
              var thisPart;
              if (shapetype === 'POLYLINE'){
                thisPart = graphic.geometry.paths[partNum];
              } else if (shapetype === 'POLYGON'){
                thisPart = graphic.geometry.rings[partNum];
              }
              var numPointsInPart = thisPart.length;
              // record the index of where this part starts in the overall record's point array
              partsIndex.push(pointsArray.length);
              // add all the part's points to a single array for the record;
              for (pointIdx = 0; pointIdx < numPointsInPart; pointIdx++) {
                pointsArray.push(thisPart[pointIdx]);
              }
            }
            var numPointsOverall = pointsArray.length;
            // now we know all we need in order to create the binary stuff.
            // pointsarray contains the points in JS array
            // format and partsIndex is a JS array of the start indices in pointsarray
            // NB: each "point" or rather vertex in shapefile is just 2 doubles, 16 bytes
            // (not a full "point" record! not clear in shapefile docs!)
            var pointsArrayBuf = new ArrayBuffer(16 * numPointsOverall);
            var pointsArrayView = new DataView(pointsArrayBuf);
            for (pointIdx = 0; pointIdx < numPointsOverall; pointIdx += 1) {
              // each item in pointsArray should be an array of two numbers, being x and y coords
              var thisPoint = pointsArray[pointIdx];
              pointsArrayView.setFloat64(pointIdx * 16, thisPoint[0], true); //little-endian
              pointsArrayView.setFloat64(pointIdx * 16 + 8, thisPoint[1], true); //little-endian
              // check and update feature box / extent if necessary
              if (thisPoint[0] < featureMinX) {
                featureMinX = thisPoint[0];
              }
              if (thisPoint[0] > featureMaxX) {
                featureMaxX = thisPoint[0];
              }
              if (thisPoint[1] < featureMinY) {
                featureMinY = thisPoint[1];
              }
              if (thisPoint[1] > featureMaxY) {
                featureMaxY = thisPoint[1];
              }
            }
            // length of record contents excluding the vertices themselves is 44 + 4*numparts
            // we add another 8 for the record header which we
            // haven't done separately, hence offsets
            // below are 8 higher than in shapefile specification (table 6)
            var recordInfoLength = 8 + 44 + 4 * numParts;
            // amount that file length is increased by
            byteLengthOfRecordInclHeader = recordInfoLength + 16 * numPointsOverall;
            // value to use in shp record header and in shx record
            var byteLengthOfRecordContent = byteLengthOfRecordInclHeader - 8;
            // buffer to contain the record header plus the descriptive parts of the record content,
            // effectively these are header too i reckon
            var shpRecordInfo = new ArrayBuffer(recordInfoLength);
            var shpRecordInfoView = new DataView(shpRecordInfo);
            shpRecordInfoView.setInt32(0, i);
            shpRecordInfoView.setInt32(4, (byteLengthOfRecordContent / 2));//value is in 16 bit word
            // that's the 8 bytes of record header done, now add the shapetype, box,
            // numparts, and numpoints add 8 to all offsets given in shapefile doc to account
            // for header all numbers in the record itself are little-endian
            shpRecordInfoView.setInt32(8, ShapeTypes[shapetype], true);
            shpRecordInfoView.setFloat64(12, featureMinX, true);
            shpRecordInfoView.setFloat64(20, featureMinY, true);
            shpRecordInfoView.setFloat64(28, featureMaxX, true);
            shpRecordInfoView.setFloat64(36, featureMaxY, true);
            shpRecordInfoView.setInt32(44, numParts, true);
            shpRecordInfoView.setInt32(48, numPointsOverall, true);
            // now write in the indices of the part starts
            for (partNum = 0; partNum < partsIndex.length; partNum++) {
              shpRecordInfoView.setInt32(52 + partNum * 4, partsIndex[partNum], true);
            }
            //now featureRecordInfo and pointsArrayBuf together contain the complete feature
            // now do the shx record
            var shxBuffer = new ArrayBuffer(8);
            var shxDataView = new DataView(shxBuffer);
            shxDataView.setInt32(0, byteFileLength / 2);
            shxDataView.setInt32(4, byteLengthOfRecordContent / 2);
            if (featureMaxX > extentMaxX)
              extentMaxX = featureMaxX;
            if (featureMinX < extentMinX)
              extentMinX = featureMinX;
            if (featureMaxY > extentMaxY)
              extentMaxY = featureMaxY;
            if (featureMinY < extentMinY)
              extentMinY = featureMinY;
            // finally augment the overall file length tracker
            byteFileLength += byteLengthOfRecordInclHeader;
          }
          break;
        default:
          return ({

            successful: false,
            message: 'unknown shape type specified'
          });
      }
      // end of switch statement. build the rest of the file headers as we now know the file extent and length
      // set extent in shp and shx headers, little endian
      shpHeaderView.setFloat64(36, extentMinX, true);
      shpHeaderView.setFloat64(44, extentMinY, true);
      shpHeaderView.setFloat64(52, extentMaxX, true);
      shpHeaderView.setFloat64(60, extentMaxY, true);
      shxHeaderView.setFloat64(36, extentMinX, true);
      shxHeaderView.setFloat64(44, extentMinY, true);
      shxHeaderView.setFloat64(52, extentMaxX, true);
      shxHeaderView.setFloat64(60, extentMaxY, true);
      // overall shp file length in 16 bit words at byte 24 of shp header
      shpHeaderView.setInt32(24, byteFileLength / 2);
      // overall shx file length in 16 bit words at byte 24 of shx header, easily worked out
      shxHeaderView.setInt32(24, (50 + numRecords * 4));

      // all done. make and return the final blob objects
      var shapeFileBlobObject = new Blob();
      shapeFileBlobObject.append(shpHeaderView.getBuffer());
      shapeFileBlobObject.append(shapeContentBlobObject.getBlob()); //// DUŻO ZMIAN TODO asdasd
      var shxFileBlobObject = new BlobBuilder();
      shxFileBlobObject.append(shxHeaderView.getBuffer());
      shxFileBlobObject.append(shxContentBlobObject.getBlob());
      return {
        successful: true,
        shape: shapeFileBlobObject.getBlob(),
        shx: shxFileBlobObject.getBlob()
      };
    }
    // DBF created by two separate functions for header and content. This function combines them
    var _createDbf = function(attributeMap, graphics) {
      if (attributeMap.length == 0) {
        attributeMap.push({
          name: 'ID_AUTO',
          type: 'N',
          length: '8'
        });
      }
      var dbfInfo = _createDbfHeader(attributeMap, graphics.length);
      var dbfRecordLength = dbfInfo['recordLength'];
      var dbfHeaderBlob = dbfInfo['dbfHeader'];
      var dbfData = _createDbfRecords(attributeMap, graphics, dbfRecordLength);
      var dbfBlob = new BlobBuilder();
      dbfBlob.append(dbfHeaderBlob.getBlob());
      dbfBlob.append(dbfData.getBlob());
      return dbfBlob.getBlob();
    }
    var _createDbfHeader = function(attributeMap, numRecords) {
      // DBF File format references: see
      // (XBase) http://www.clicketyclick.dk/databases/xbase/format/dbf.html#DBF_STRUCT
      // http://www.quantdec.com/SYSEN597/GTKAV/section4/chapter_15a.htm
      // http://ulisse.elettra.trieste.it/services/doc/dbase/DBFstruct.htm
      /* attributes parameter will be in the format
       [
       {
       name: 	string,
       type: 	string, // (1 character),
       length: number, // only req if type is C or N, will be used if less than datatype maximum
       value: 	string,
       scale:  number  // only req if type is N, will be used for "decimal count" property
       }
       ]
       */
      var numFields = attributeMap.length; // GET NUMBER OF FIELDS FROM PARAMETER
      var fieldDescLength = 32 * numFields + 1;
      // use convenience method to create compatible buffer format
      var dbfFieldDescBuf = jDataView_write.createEmptyBuffer(fieldDescLength);
      var dbfFieldDescView = new jDataView_write(dbfFieldDescBuf);
      var namesUsed = [];
      var numBytesPerRecord = 1; // total is the length of all fields plus 1 for deletion flag
      for (var i = 0; i < numFields; i++) {
        // each field has 32 bytes in the header. These describe name, type, and length of the attribute
        var name = attributeMap[i].name.slice(0, 10);
        // need to check if the name has already been used and generate a altered one
        // if so. not doing the check yet, better make sure we don't try duplicate names!
        // NB older browsers don't have indexOf but given the other stuff we're doing with binary
        // i think that's the least of their worries
        if (namesUsed.indexOf(name) == -1) {
          namesUsed.push(name);
        }
        // write the name into bytes 0-9 of the field description
        for (var x = 0; x < name.length; x++) {
          dbfFieldDescView.setInt8(i * 32 + x, name.charCodeAt(x));
        }
        // nb byte 10 is left at zero
        /* Now data type. Data types are
         C = Character. Max 254 characters.
         N = Number, but stored as ascii text. Max 18 characters.
         L = Logical, boolean. 1 byte, ascii. Values "Y", "N", "T", "F" or "?" are valid
         D = Date, format YYYYMMDD, numbers
         */
        var datatype = attributeMap[i].type || 'C'
        var fieldLength;
        if (datatype == 'L') {
          fieldLength = 1; // not convinced this datatype is right, doesn't show as boolean in GIS
        }
        else if (datatype == 'D') {
          fieldLength = 8;
        }
        else if (datatype == 'N') {
          // maximum length is 18
          fieldLength = attributeMap[i].length && attributeMap[i].length < 19 ? attributeMap[i].length : 18;
        }
        else if (datatype == 'C') {
          fieldLength = attributeMap[i].length && attributeMap[i].length < 254 ? attributeMap[i].length : 254;
        }
        //else {
        //	datatype == "C";
        //	fieldLength = 254;
        //}
        // write the type into byte 11
        dbfFieldDescView.setInt8(i * 32 + 11, datatype.charCodeAt(0)); // FIELD TYPE
        // write the length into byte 16
        dbfFieldDescView.setInt8(i * 32 + 16, fieldLength); //FIELD LENGTH
        if (datatype = 'N') {
          var fieldDecCount = attributeMap[i].scale || 0;
          // write the decimal count into byte 17
          dbfFieldDescView.setInt8(i * 32 + 17, fieldDecCount); // FIELD DECIMAL COUNT
        }
        // modify what's recorded so the attribute map doesn't have more than 18 chars even if there are more
        // than 18 present
        attributeMap[i].length = parseInt(fieldLength);
        numBytesPerRecord += parseInt(fieldLength);
      }
      // last byte of the array is set to 0Dh (13, newline character) to mark end of overall header
      dbfFieldDescView.setInt8(fieldDescLength - 1, 13)
      // field map section is complete, now do the main header
      var dbfHeaderBuf = jDataView_write.createEmptyBuffer(32);
      var dbfHeaderView = new jDataView_write(dbfHeaderBuf);
      dbfHeaderView.setUint8(0, 3) // File Signature: DBF - UNSIGNED
      var rightnow = new Date();
      dbfHeaderView.setUint8(1, rightnow.getFullYear() - 1900); // UNSIGNED
      dbfHeaderView.setUint8(2, rightnow.getMonth()); // UNSIGNED
      dbfHeaderView.setUint8(3, rightnow.getDate()); // UNSIGNED
      dbfHeaderView.setUint32(4, numRecords, true); // LITTLE ENDIAN, UNSIGNED
      var totalHeaderLength = fieldDescLength + 31 + 1;
      // the 31 bytes of this section, plus the length of the fields description, plus 1 at the end
      dbfHeaderView.setUint16(8, totalHeaderLength, true); // LITTLE ENDIAN , UNSIGNED
      // the byte length of each record, which includes 1 initial byte as a deletion flag
      dbfHeaderView.setUint16(10, numBytesPerRecord, true); // LITTLE ENDIAN, UNSIGNED
      //dbfHeaderView.setUint8(29,03) // language driver, 03 = windows ansi
      // except for 29, bytes 12 - 31 are reserved or for things we don't need in this implementation
      // header section is complete, now build the overall header as a blob
      var dbfHeaderBlob = new BlobBuilder();
      dbfHeaderBlob.append(dbfHeaderView.getBuffer());
      dbfHeaderBlob.append(dbfFieldDescView.getBuffer());
      return {
        recordLength: numBytesPerRecord,
        dbfHeader: dbfHeaderBlob
      }
    }
    var _createDbfRecords = function(attributeMap, graphics, dbfRecordLength) {
      /* PARAMETERS:
       * graphics is an array of objects of structure
       * [{
       * 	something: xxx,
       *  somethingelse: xyz,
       *  attributes: {
       * 		attribname: value,
       * 		anotherattribname: value
       * 	}
       * }]
       * i.e. each object in the array must have an property called "attributes" which in turn contains
       * the actual attributes of that object to be written as DBF fields, and these must match those
       * in the attributeMap.
       * Any other properties of the object are ignored as are attributes not mentioned in attributeMap.
       * IN OTHER WORDS - attributeData is an array of esri.graphics, or something that looks like one!
       *
       * Each object is one record so the array MUST be in the same order as the array used to build
       * the shapefile
       *
       * attributeMap is the same object that was passed to the header-building function
       * this is used to confirm that they are the same, to get the order they appear in within a record,
       * and to be able to ignore any attributes that we don't want to carry forward into the DBF.
       *
       * Recordlength gives the byte length of a record as defined in the header
       *
       * All record data is stored as ASCII, i.e. numbers as their ASCII representation rather than binary int etc
       * It appears that number fields are left padded with spaces to their defined length (data on right),
       * and string fields are right padded.
       *
       * There are almost certainly more ways to break this than there are ways to make it work!
       */
      // overall datalength is number of records * (length of record including 1 for deletion flag) +1 for EOF
      var dataLength = (dbfRecordLength) * graphics.length + 1;
      //var dbfDataBuf = new ArrayBuffer(dataLength);
      var dbfDataBuf = jDataView_write.createEmptyBuffer(dataLength);
      var dbfDataView = new jDataView_write(dbfDataBuf);
      var currentOffset = 0;
      for (var rownum = 0; rownum < graphics.length; rownum++) {
        var rowData = graphics[rownum].attributes || {};
        //console.log ("Writing DBF record for searchId "+rowData['SEARCHID'] +
        //	" and type " + rowData['TYPE'] + "to row "+rownum);
        var recordStartOffset = rownum * (dbfRecordLength); // recordLength includes the byte for deletion flag
        //var currentOffset = rownum*(recordLength);
        dbfDataView.setUint8(currentOffset, 32); // Deletion flag: not deleted. 20h = 32, space
        currentOffset += 1;
        for (var attribNum = 0; attribNum < attributeMap.length; attribNum++) {
          // loop once for each attribute
          var attribInfo = attributeMap[attribNum];
          var attName = attribInfo['name'];
          var dataType = attribInfo['type'] || 'C';
          var fieldLength = parseInt(attribInfo['length']) || 0; // it isn't alterable for L or D type fields
          var attValue = rowData[attName] || rownum.toString(); // use incrementing number if attribute is missing,
          // this will come into play if there were no attributes in the original graphics, hence the attributeMap contains "ID_AUTO"
          //var fieldLength;
          if (dataType == 'L') {
            fieldLength = 1;
            if (attValue) {
              dbfDataView.setUint8(currentOffset, 84); // 84 is ASCII for T
            }
            else {
              dbfDataView.setUint8(currentOffset, 70); // 70 is ASCII for F
            }
            currentOffset += 1;
          }
          else if (dataType == 'D') {
            fieldLength = 8;
            var numAsString = attValue.toString();
            if (numAsString.length != fieldLength) {
              // if the length isn't what it should be then ignore and write a blank string
              numAsString = ''.lpad(' ', 8);
            }
            for (var writeByte = 0; writeByte < fieldLength; writeByte++) {
              dbfDataView.setUint8(currentOffset, numAsString.charCodeAt(writeByte));
              currentOffset += 1;
            }
          }
          else if (dataType == 'N') {
            // maximum length is 18. Numbers are stored as ascii text so convert to a string.
            // fieldLength = attribinfo.length && attribinfo.length<19 ? attribinfo.length : 18;
            var numAsString = attValue.toString();
            if (fieldLength == 0) {
              continue;
            }
            // bug fix: was calling lpad on != fieldLength i.e. for too-long strings too
            if (numAsString.length < fieldLength) {
              // if the length is too short then pad to the left
              numAsString = numAsString.lpad(' ', fieldLength);
            }
            else if (numAsString.length > fieldLength) {
              numAsString = numAsString.substr(0, 18);
            }
            for (var writeByte = 0; writeByte < fieldLength; writeByte++) {
              dbfDataView.setUint8(currentOffset, numAsString.charCodeAt(writeByte));
              currentOffset += 1;
            }
          }
          else if (dataType == 'C' || dataType == '') {
            if (fieldLength == 0) {
              continue;
            }
            if (typeof(attValue) !== 'string') {
              // just in case a rogue number has got in...
              attValue = attValue.toString();
            }
            if (attValue.length < fieldLength) {
              attValue = attValue.rpad(' ', fieldLength);
            }
            // doesn't matter if it's too long as we will only write fieldLength bytes
            for (var writeByte = 0; writeByte < fieldLength; writeByte++) {
              dbfDataView.setUint8(currentOffset, attValue.charCodeAt(writeByte));
              currentOffset += 1;
            }
          }
        }
        // row done, rinse and repeat
      }
      // all rows written, write EOF
      dbfDataView.setUint8(dataLength - 1, 26);
      //var dbfDataBlobObject = new WebKitBlobBuilder();
      var dbfDataBlobObject = new BlobBuilder();
      //dbfDataBlobObject.append(dbfDataBuf);
      dbfDataBlobObject.append(dbfDataView.getBuffer());
      return dbfDataBlobObject;
    }
    var _createAttributeMap = function(graphicsArray) {
      // creates a summary of the attributes in the input graphics
      // will be a union of all attributes present so it is sensible but not required that
      // all input graphics have same attributes anyway
      var allAttributes = {};
      for (var i = 0; i < graphicsArray.length; i++) {
        var graphic = graphicsArray[i];
        if (graphic.attributes) {
          for (var attribute in graphic.attributes) {
            if (graphic.attributes.hasOwnProperty(attribute)) {
              var attvalue = graphic.attributes[attribute];
              if (allAttributes.hasOwnProperty(attribute)) {
                // Call toString on all attributes to get the length in characters
                if (allAttributes[attribute].length < attvalue.toString().length) {
                  allAttributes[attribute].length = attvalue.toString().length;
                }
              }
              else {
                switch (typeof(attvalue)) {
                  case 'number':
                    if (parseInt(attvalue) === attvalue) {
                      // it's an int
                      allAttributes[attribute] = {
                        type: 'N',
                        length: attvalue.toString().length
                      }
                    }
                    else if (parseFloat(attvalue) === attvalue) {
                      // it's a float
                      var scale = attvalue.toString().length -
                          (attvalue.toString().split('.')[0].length + 1);
                      allAttributes[attribute] = {
                        type: 'N',
                        length: attvalue.toString().length,
                        scale: scale
                      }
                    }
                    break;
                  case 'boolean':
                    allAttributes[attribute] = {
                      type: 'L'
                    }
                    break;
                  case 'string':
                    allAttributes[attribute] = {
                      type: 'C',
                      length: attvalue.length
                    }
                    break;
                }
              }
            }
          }
        }
      }
      var attributeMap = [];
      for (attributeName in allAttributes) {
        if (allAttributes.hasOwnProperty(attributeName)) {
          var thisAttribute = {
            name: attributeName,
            type: allAttributes[attributeName]['type'],
            length: allAttributes[attributeName]['length']
          };
          if (allAttributes[attributeName].hasOwnProperty('length')) {
            thisAttribute['length'] = allAttributes[attributeName]['length'];
          }
          if (allAttributes[attributeName].hasOwnProperty('scale')) {
            thisAttribute['scale'] = allAttributes[attributeName]['scale'];
          }
          attributeMap.push(thisAttribute);
        }
      }
      return attributeMap;
    }
// DEFINE THE OBJECT THAT WILL REPRESENT THE PROTOTYPE
    // all functions defined, now return as the prototype an object giving access to the ones we want
    // to be public
    return {
      constructor: ShapeMaker,
      addESRIGraphics: function() {
        return addESRIGraphics.call(this, arguments[0])
      },
      addGoogleGraphics: function() {
        return addGoogleGraphics.call(this, arguments[0]);
      },
      addOLGraphics: function() {
        return addOLGraphics.call(this, arguments[0]);
      },
      getShapefile: function() {
        return getShapefile.call(this, arguments[0]);
      }
    }
    // execute the prototype definition immediately
  })();
// return the ShapeMaker object
  return ShapeMaker;
// execute the whole lot so that ShapeFile is available in the global space
})();
