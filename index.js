var jsonfile = require('jsonfile');
var {readFileSync} = require('fs');
var {dsvFormat} = require('d3-dsv');
var calculateConvexHull = require('geo-convex-hull');
var NodeGeocoder = require('node-geocoder');
var ProgressBar = require('progress');

//Initialize the geocoder
var geocoder_options = {
  provider: 'openstreetmap'
};
var geocoder2_options = {
  provider: "google"
};
var geocoder = NodeGeocoder(geocoder_options);
var geocoder2 = NodeGeocoder(geocoder2_options);

//Initialize the pipe delimited file parser
var psv = dsvFormat("|");

//A wrapper to get the polygon for a set of lat-long points
const getPolygon = (points) => {
  return calculateConvexHull(points);
};

//Use google's geocoder to get the lat-long from an address
const getLatLong = async (address) => {
  address['country'] = 'US';
  address['state'] = 'RI';
  var lat_long = await geocoder.geocode(address);
  if (lat_long.length==0){
    address['address'] = address['street'];
    address['zipcode'] = address['postalcode'];
    lat_long = await geocoder2.geocode(address);
  }
  return lat_long;
};

//Given the name of a file, output the polygons
const processAddresses = async (file) => {
  //Read in the file with the address ranges
  try {
    var data = readFileSync(file, "utf8");
    //Parse the data as a pipe delimited file
    var ranges = psv.parse(data);
    var precincts = [];
    var precinct_points = {};
    //Loop through our address ranges, and create a list of precincts, as well as a list of address ranges corresponding to each precinct
    for (i=0; i<ranges.length; i++) {
      var row = ranges[i];
      var start_address = {"street": row["START"] + " " + row["STREET"], "postalcode": row["ZIP"]};
      var end_address = {"street": row["END"] + " " + row["STREET"], "postalcode": row["ZIP"]};
      if (precincts.includes(row["PRECINCT"])) {
        precinct_points[row["PRECINCT"]].push(start_address);
        precinct_points[row["PRECINCT"]].push(end_address);
      }
      else {
        precincts.push(row["PRECINCT"]);
        precinct_points[row["PRECINCT"]] = [];
        precinct_points[row["PRECINCT"]].push(start_address);
        precinct_points[row["PRECINCT"]].push(end_address);
      }
    }
  }
  catch(e) {
    console.error(e);
  }
    //Loop through the precincts and get the polygons
    var features = [];
    for (i=0; i<precincts.length; i++){
      var prec = precincts[i];
      var address_points = precinct_points[prec];
      var latlong_points = [];
      var bar = new ProgressBar(prec + ': [:bar] :percent (:current/:total)', {total: address_points.length, width: 30});
      for (j=0; j<address_points.length; j++){
        try {
          var res = await getLatLong(address_points[j]);
          var point = {"latitude": res[0]['latitude'], "longitude": res[0]['longitude']};
          latlong_points.push(point);
        }
        catch(e) {
          console.error(e)
          console.log(res)
          console.log(address_points[j])
        }
        bar.tick();
      }
      var poly = getPolygon(latlong_points);
      var feat = {"type": "Feature",
                  "geometry": {
                    "type": "Polygon",
                    "coordinates": poly
                  },
                  "properties":{
                    "precinct": prec
                  }
                };
      features.push(feat);
    }
    /*var address1 = precinct_points[row["PRECINCT"]][0];
    try {
    var value = await getLatLong(address1);
    console.log(value)
    }
    catch(e) {
      console.error(e)
    }*/
    var geoJSON = {"type": "FeatureCollection", "features": features};
    jsonfile.writeFile("precincts.json", geoJSON, {spaces: 2}, function(err){
      console.error(err);
    });
};


try {
  processAddresses("StreetList.txt");
}
catch(e) {
  console.error(e);
}
