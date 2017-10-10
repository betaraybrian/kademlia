const http = require('http'),
      sha1 = require('sha-1'),
      url = require('url'),
      request = require('request'),
      bodyParser = require('body-parser')


// Require express and create an instance of it
var express = require('express');
var app = express();

var mainPeerHostname = "localhost";
var mainPeerPort = 3000;

var port = 2000;

var historicalData = {};

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

function SendFindNodeManually(nodeIP, nodePort, nodeID, callbackFunction){

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/getNodesClosetoID?nodeID='+ nodeID

  };
  request(options, callbackFunction);
}

function SendStore(nodeIP, nodePort, value, valueID, callbackFunction){

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/storeValueManually',
    qs:{
    	value:value,
    	valueID:valueID
    }

  };
  request.post(options, callbackFunction);
}

function SendStoreMetaData(nodeIP, nodePort, url, deviceID, refreshrate, callbackFunction){
	var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/storeMetaData',
   headers: {'url':url,
   'deviceID':deviceID,
   'refreshrate':refreshrate}

  };
  request.post(options, callbackFunction);
}


//root page
app.get('/', function (req, res) {
  res.send()
  res.end();
})

app.get('/connect', function (req, res) {

  var url = req.header('url');
  var refreshrate = req.header('refreshrate');


  Connect(url, refreshrate, function(node){
  	res.type('json');
    res.status(200);
    res.send( JSON.stringify( node ) );

  });
})

app.post('/saveData', function(req, res){
 var deviceID = req.header('deviceID');
 var value = req.header('value');
 var data = historicalData[deviceID];
 if(data == null ||data === undefined){
 	historicalData[deviceID] = [];
 	data = historicalData[deviceID];
 }
 data.push(value);
})

app.get('/historicalData', function(req, res){
	res.send(JSON.stringify(historicalData));
	res.end();
})

//log
app.listen(port, function () {
  console.log('Example app listening on port:' + port);
})

function Connect(url, refreshrate, callbackFunction){
  var fullKey = sha1(url);
  var deviceID = parseInt(fullKey.substring(fullKey.length-2,fullKey.length),16); //to sidste bit tages og konverteres til integer

  SendFindNodeManually(mainPeerHostname, mainPeerPort, deviceID, function(error, response, body){
  	var result = JSON.parse(body).nodes;
  	console.log(result[0]);
  	SendStoreMetaData(result[0].IP, result[0].Port, url, deviceID, refreshrate, function(error, response, body){
  		if(error == null){
      	SendStore(result[0].IP, result[0].Port, "n/a", url, function(error, response, body){
        console.log('Value succesfully stored at ' + result[0].ID, result[0].IP, result[0].Port, response.statusCode);
      	callbackFunction(result[0]);
      });
  		}
  	});

  });
}


function StartUp(){
Connect("www.troels.com/sensor/temperatur", 10, function(){});
}

StartUp();
