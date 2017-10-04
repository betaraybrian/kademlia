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
    uri: 'http://'+nodeIP+':'+nodePort+'/storeValueManually?value='+ value + '&valueID=' + valueID
    
  };
  request(options, callbackFunction);
}



//root page
app.get('/', function (req, res) {
  res.send()
  res.end();
})

app.get('/connect', function (req, res) {
  
  var url = req.header('url');
  var deviceID = req.header('deviceID');
  var refreshrate = req.header('refreshrate');
  var valueID = req.header('valueID');
  var value = req.header('value');

  var fullKey = sha1(valueID);
  var key = parseInt(fullKey.substring(fullKey.length-2,fullKey.length),16); //to sidste bit tages og konverteres til integer

  SendFindNodeManually(mainPeerHostname, mainPeerPort, key, function(error, response, body){
  	var result = JSON.parse(body).nodes;
      SendStore(result[0].IP, result[0].Port, value, valueID, function(error, response, body){
        console.log('Value succesfully stored at ' + result[0].ID, result[0].IP, result[0].Port);
      });
  });

  res.send()
  res.end();
})

//log
app.listen(port, function () {
  console.log('Example app listening on port:' + port);
})