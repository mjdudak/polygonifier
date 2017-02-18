var jsonfile = require('jsonfile');
var {readFileSync} = require('fs');
var {dsvFormat} = require('d3-dsv');
var calculateConvexHull = require('geo-convex-hull');
var ProgressBar = require('progress');
var request = require('request');
var rp = require('request-promise');
var trim = require('trim');

//Get authentication key
var auth_key = readFileSync('auth_key', "utf8");
auth_key = trim(auth_key)

//Initialize the pipe delimited file parser
var psv = dsvFormat(",");

//Build a sleep function so we don't throw too many requests at mapzen
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
}

//A wrapper to get the polygon for a set of lat-long points
const getPolygon = (points) => {
  return calculateConvexHull(points);
};

//Use google's geocoder to get the lat-long from an address
const getLatLong = async (address) => {
  address['country'] = 'US';
  var url = `https://search.mapzen.com/v1/search/structured?address=${address['address']}&postalcode=${address['postalcode']}&region=${address['state']}&country=${address['country']}&api_key=${auth_key}`
  try {
    var search_result = await rp(url);
    var result = JSON.parse(search_result)
    return {"latitude": result['features'][0]['geometry']['coordinates'][1], "longitude": result['features'][0]['geometry']['coordinates'][0]}
  }
  catch(e) {
    console.log(e)
    return e
  }
};

//Given the name of a file, output the polygons
const processAddresses = async (file) => {
  //Read in the file with the address ranges
  try {
    var data = readFileSync(file, "utf8");
    //Parse the data as a pipe delimited file
    var addresses = psv.parse(data);
    var precincts = [];
    var precinct_points = {};
    //Loop through our address ranges, and create a list of precincts, as well as a list of address ranges corresponding to each precinct
    for (i=0; i<addresses.length; i++) {
      var row = addresses[i];
      if (precincts.includes(row["precinct"])) {
        precinct_points[row["precinct"]].push(row);
      }
      else {
        precincts.push(row["precinct"]);
        precinct_points[row["precinct"]] = [];
        precinct_points[row["precinct"]].push(row);
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
          var point = await getLatLong(address_points[j]);
          latlong_points.push(point);
        }
        catch(e) {
          console.error(e)
          console.log(address_points[j])
        }
        bar.tick();
        await sleep(160);
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
  processAddresses("Addresses1.csv");
}
catch(e) {
  console.error(e);
}
