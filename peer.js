const http = require('http'),
      sha1 = require('sha-1'),
      url = require('url'),
      request = require('request'),
      bodyParser = require('body-parser')

// Require express and create an instance of it
var express = require('express');
var app = express();

const alpha = 3; // niveauet på parallelisme
const b = 8; //størelsen af ID space
const k = 2; // max antal nodes i bucket
const tExpire = 86400;

const hostname = 'localhost';
var port = 3000;

var shaID = sha1(160*13*Math.random()+"");
var ID = parseInt(shaID.substring(shaID.length-2,shaID.length),16); //to sidste bit tages og konverteres til integer

var DHT = [];

var valueStored = {};

var nodesVisited = []; //findnode

var nodesVisitedForValue = []

var RCPIDSendOut = [];

// Will be given through command prompt
var BoostrapIP = ''; // The IP of the first node we are gonna connect to
var BoostrapPort = 0; // The port of the first node we are gonna connect to

// Get the command prompt arguments
// So the stuff you write after 'node peer.js'
// index = 0 is the word 'node'
// index = 1 is the word 'peer.js'
// So indext 2 and thereafter is the arguments passed
process.argv.forEach(function (val, index, array) {
  if(index == 2){
    port = val; // Get our own port
  }
  if(index == 3){
    BoostrapIP = val; // First node ip
  }
  if(index == 4){
    BoostrapPort = val; // First node port
  }
});

// Makes the initial empty DHT
// Since bouvin mentioned it would be okay not to do the splitting thing
// we are just gonna make a list from the start for every potential bucket
function InitializeDHT(){
  var RoutingTable = [];
  for(var i = 0; i < b; i++){
    RoutingTable[i] = [];
  }
  DHT = RoutingTable;
}

/// Function to attempt to add a new node to our bucket
function AddNeighbourNode(NodeID, NodeIP, NodePort){
  if(NodeIP == hostname && NodePort == port && NodeID == ID){
    // this is ourselves
    return;
  }
  // Get the distance to the node
  var dist = Distance(ID, NodeID);
  // Create a node object
  var node = {ID : NodeID, IP : NodeIP, Port : NodePort};

  // Try and add the node to the DHT
  AddNodeToDHT(node, GetBucketIndexFromDistance(dist));
}

// Function to figure out which bucket the node should go in
// It should go in bucket i where the distance is between 2^i and 2^i+1
function GetBucketIndexFromDistance(dist){
  var index = 0;
  var res = -1;
  while(res == -1){
    // Checks if we are at our i
    if(dist >= Math.pow(2,index) && dist < Math.pow(2, index+1)){
      // We have found the right bucket.
      res = index;
    }
    // Try an i value that is 1 larger
    index ++;
  }
  return res;
}

function AddNodeToDHT(node, index){
  var bucket = DHT [index];

  // Is there actually a bucket there
  // Basically checks that the index parameter is not bonkers
  if(bucket != null){
    if(ListHasNodeWithID(node.ID, bucket)){
      console.log('trying to add a node we already have');
      return;
    }

    if(bucket.length < k){ // Is there room in this bucket?
      // There is room. Add the node
      bucket.push(node);
      console.log('Adding node', node);

    }else{
      // No room. Check if we are closer to the node than any of the ones in the list
      var indexOfNodeWithLongerDistance = -1;
      for(var i = k-1; i >= 0; i--){ // Looping backwards because we are removing from the list
        if(Distance(bucket[i].ID, ID) > Distance(node.ID, ID)){
          // We are closer than someone!
          // Remove that node from the list
          indexOfNodeWithLongerDistance = i;
          break;
        }
      }

      if(indexOfNodeWithLongerDistance != -1){
        // We were closer than another node and removed it.
        bucket.splice(1, indexOfNodeWithLongerDistance);
        bucket.push(node);
        console.log('Adding node', node);

      }else{
        // No room in bucket and we weren't closer than any of the ones there
        // Let's see if they are all still alive
        console.log('Ping stuff in list');

      }

    }
  }

  while(bucket.length > k){
    bucket.splice(1, bucket.length-1);
  }
}

function HasNodeWithID(nodeID){
	var bucket = DHT[ GetBucketIndexFromDistance( Distance(ID, nodeID) ) ];

	for (var i = bucket.length - 1; i >= 0; i--) {
		if(bucket[i].ID == nodeID){
			return true;
		}
	}
	return false;
}

function IsOriginOfRCPID(rcpid){
  for(var i = 0; i < RCPIDSendOut.length; i++){
    if(RCPIDSendOut[i] == rcpid){
      return true;
    }
  }
  return false;
}

// Function that returns the BITWISE XOR between the 2 numbers
function Distance(x,y){
  return x ^ y;
}

// Returns an formatted HTML tr (table row) element for
function GetHTMlTableRowFromBucket(bucket, index){
  var html = '<tr><td>'+index+'</td><td>';

  // Is there a bucket here?
  if(bucket != null ){

    // Yes!
    for(var i = 0; i < bucket.length; i++){
      html += '<a href=\"http://'+bucket[i].IP+':'+bucket[i].Port+'\">'+bucket[i].ID+'('+Distance(bucket[i].ID, ID)+')'+'</a> &nbsp;';
    }
  }



  html += '</td></tr>';
  return html;
}

// Returns a formatted html table element with all of our known nodes
function GetHTMLListOfPeers(){
  var html = '<table border=\"1\">';

  for(var i = 0; i < b; i++){
    html += GetHTMlTableRowFromBucket(DHT[i], i);
  }

  html += '</table><br>';
  return html;
}

// Returns a list of the (up to) k closets nodes to the targetID
function GetKClosestNodesToID(targetNodeID){
  var closetsNodes = [];
  var checkedIndexes = [];
  var nextToCheck = [];
  var distToTarget = Distance(ID, targetNodeID);

  nextToCheck.push(GetBucketIndexFromDistance(distToTarget));
  while(closetsNodes.length < k && nextToCheck.length > 0){
    // Take the first element from the list
    // This is the bucket we are going to be looking at
    var index = nextToCheck.shift();
    checkedIndexes.push(index); // Make sure we don't check the same bucket twice
    // Get the bucket we are gonna be looking through
    var bucketToCheck = DHT[index];
    // Loop through it's children
    for(var i = 0; i < bucketToCheck.length; i++){
      if(closetsNodes.length < k){ // Make sure we are not overfilling the list of nodes
        closetsNodes.push(bucketToCheck[i]); // Add this new node to the list
      }
    }
    var downIndex = index-1;
    // is index-1 a valid bucket? Have we checket it before?
    if(downIndex >= 0 && checkedIndexes.includes(downIndex) == false){
      nextToCheck.push(downIndex);
    }
    var upIndex = index+1;
    // is index-1 a valid bucket? Have we checket it before?
    if(upIndex < b && checkedIndexes.includes(upIndex) == false){
      nextToCheck.push(upIndex);
    }
  }


  return closetsNodes;
}

// Function to call Ping on ANOTHER node
// Will call the function callbackFunction when done
function SendPing(nodeIP, nodePort, callbackFunction, rcpid){

if(nodeIP == hostname && nodePort == port){
  // this is ourselves
  callbackFunction({'error' : 'Called on own peer'}, null, null);
  return;
}

  // check if we have been given an rcpid to use
  // this is used when pinging back after we ourselves was pinged
  if(rcpid === undefined){
    // Generate a random RCPID for the request as per the Kademlia specs
    rcpid = sha1((Math.random()*160*7)+"");
    RCPIDSendOut.push(rcpid);
  }else{
  	if(IsOriginOfRCPID(rcpid)){
      callbackFunction({'error' : 'Already made request with this RCPID'}, null, null);
  		return;
  	}
    console.log('Sending ping with already known rcpid');
    RCPIDSendOut.push(rcpid);
  }

  console.log('http://'+nodeIP+':'+nodePort+'/api/kademlia/ping');

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/api/kademlia/ping',
    headers: {
      'rcpid': rcpid,
      'senderid': ID,
      'senderip': hostname,
      'senderport': port
    }
  };

  request(options, callbackFunction);
}

// Function to call Find_Node on ANOTHER node
// Will look for the node with the id targetID
// Will call the function callbackFunction when done
function SendFindNode(nodeIP, nodePort, targetID, callbackFunction){

  if(nodeIP == hostname && nodePort == port){
    // this is ourselves
    callbackFunction({'error' : 'Called on own peer'}, null, null);
    return;
  }
  var RCPID = sha1((Math.random()*160*7)+"");
  RCPIDSendOut.push(RCPID);

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/api/kademlia/find_node',
    headers: {
      'rcpid': RCPID,
      'senderid': ID,
      'senderip': hostname,
      'senderport': port,
      'targetnodeid': targetID
    }
  };
  request(options, callbackFunction);
}

function SendFindValue(nodeIP, nodePort, key, callbackFunction){

  if(nodeIP == hostname && nodePort == port){
    // this is ourselves
    callbackFunction({'error' : 'Called on own peer'}, null, null);
    return;
  }
  var RCPID = sha1((Math.random()*160*7)+"");
  RCPIDSendOut.push(RCPID);

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/api/kademlia/find_value',
    headers: {
      'rcpid': RCPID,
      'senderid': ID,
      'senderip': hostname,
      'senderport': port,
      'key': key
    }
  };
  request(options, callbackFunction);
}

function Store(value, valueID){
  var fullKey = sha1(valueID);
  var key = parseInt(fullKey.substring(fullKey.length-2,fullKey.length),16); //to sidste bit tages og konverteres til integer
  var nodes = GetKClosestNodesToID(key);
  IterativeFindNode(nodes, key, function(result){
    console.log(result);
    var limit = Math.min(k, result.length);
  	for(var i = 0; i < limit; i++){
    	SendStoreValue(result[i], key, value, function(error, response, body){});
  	}
  });
  
}

function SendStoreValue(node, key, value, callbackFunction) {
    console.log((new Date()).toDateString(), "-SendStoreValue-" );

   var RCPID = sha1((Math.random()*160*7)+"");
  RCPIDSendOut.push(RCPID);

  var options = {
    uri: 'http://'+node.IP+':'+node.Port+'/api/kademlia/store',
    headers: {
      'rcpid': RCPID,
      'senderid': ID,
      'senderip': hostname,
      'senderport': port,
      'key': key,
      'value': value
    }
  };
  request.post(options, callbackFunction);
}

function GetValue(key){
	var value = valueStored[key];
	if(value == null || value === undefined){
		return undefined;
	}else{
		return value;
	}
}


function FindValue(key, onFinishedCallback){
	var value = GetValue(key);
	if(value === undefined){// we don't have the value
		//find other nodes
		var nodes = GetKClosestNodesToID(key);

        IterativeFindValue(nodes, null, key, function(result){
            if(result == null){
                onFinishedCallback({'error': 'value does not exist in network'});
            }
            else{
                onFinishedCallback(result);
            }
        });
	}
}

function IterativeFindValue(nodeList, JSONResult, key, onFinishedCallback){
  console.log('IterativeFindValue called');
  if ((JSONResult != null && JSONResult.hasOwnProperty("value")) || (JSONResult == null  && nodeList.length == 0)){
    console.log('Done looking for value');
    onFinishedCallback(JSONResult); // Notify our caller that we are finished
  }else{
     if(JSONResult != null){
        for(var i = 0; i < JSONResult.nodes.length; i++){
            if(ListHasNodeWithID(JSONResult.nodes[i].ID, nodesVisitedForValue)==false){
                nodeList.push(JSONResult.nodes[i])
            }
        }
      }
      var currentNode = nodeList.shift();


      if (ListHasNodeWithID(currentNode.ID, nodesVisitedForValue) || currentNode.ID == ID){
        console.log('We have already looked at : ', currentNode);
        IterativeFindValue(nodeList, null,  key, onFinishedCallback);
      }else{
        console.log('Sending IterativeFindNode to : ', currentNode);
        nodesVisitedForValue.push(currentNode);
        SendFindValue(currentNode.IP, currentNode.Port, key, function(error, response, body){
            var result = null;
            if (error == null){
                if(response.statusCode == 200){
                    result = JSON.parse(body);
                    console.log('We got nodes back : ', currentNode);
                }
              }
          IterativeFindValue(nodeList, result, key, onFinishedCallback);
        });
      }
  }
}


function SearchNetworkForValue(key){
	var result = FindValue(key);
	while(result.hasOwnProperty('nodes')){
		//search for other nodes
		for(var i=0; i<alpha; i++){

		}
	}
	return result;
}

var nodesVisited;

//check if we have the node - else startiterativefindnode
// Starts an IterativeFindNode search for the node with targetID
// Once done it calls onFinishedCallback with either the requested node or an error message
function FindNode(targetID, onFinishedCallback){
  if (targetID == ID){
    // tell the caller that we have found what they are looking for
    onFinishedCallback( {'ID': ID, 'IP': hostname, 'Port': port} );
  }

  var currentList = GetKClosestNodesToID(targetID);
  if (ListHasNodeWithID(targetID, currentList)){
    // tell the caller that we have found what they are looking for
    onFinishedCallback( GetElementWithIDFromList(targetID, currentList) );
  }
  nodesVisited = [];

  // the function (result) will be called once the iterative search is done
  IterativeFindNode(currentList, targetID, function(result){
    // This will be called after the iterative search is done
    if (ListHasNodeWithID(targetID, result) == false){
      onFinishedCallback( {'error' : 'Node does not exist'} );
    }else{
      var resultNode = GetElementWithIDFromList(targetID, result) ;
      AddNeighbourNode(resultNode.ID, resultNode.IP, resultNode.Port);
      onFinishedCallback(resultNode);
    }
  });


}

// Returns the element in the list with the specific id of targetID
function GetElementWithIDFromList(targetID, list){
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].ID == targetID){
      return list[i];
    }
  }
  return null;
}


// Checks if a specific node with the id of targetID is present in the list
function ListHasNodeWithID(targetID, list){
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].ID == targetID){
      return true;
    }
  }
  return false;
}

// Starts looking for the node with targetID in the network
// Will keep looking until it has found the node or we have no more nodes to look at in the network
// Calls the onFinishedCallback with the list of nodes we know
function IterativeFindNode(nodeList, targetID, onFinishedCallback){
  console.log('IterativeFindNode called');
  if (ListHasNodeWithID(targetID, nodeList) || nodeList.length == 0){
    console.log('Done looking for node');
    if(nodeList.length == 0){
    	nodesVisited.sort(function(a, b){return Distance(a.ID, targetID) - Distance(b.ID, targetID)});
    	nodeList = nodesVisited;
    }
    else{
        nodesVisited.sort(function(a, b){return Distance(a.ID, targetID) - Distance(b.ID, targetID)});
        while(nodeList.length < k && nodesVisited.length > 0){
            nodeList.push(nodesVisited.shift());// make sure there's k nodes in the list
        }
    }
    onFinishedCallback(nodeList); // Notify our caller that we are finished
  }else{
      var currentNode = nodeList.shift();

      if (ListHasNodeWithID(currentNode.ID, nodesVisited) || currentNode.ID == ID){
        console.log('We have already looked at : ', currentNode);
        IterativeFindNode(nodeList, targetID, onFinishedCallback);
      }else{
        console.log('Sending IterativeFindNode to : ', currentNode);
        nodesVisited.push(currentNode);
        SendFindNode(currentNode.IP, currentNode.Port, targetID, function(error, response, body){
          if (error == null){
            if(response.statusCode == 200){
              var kNodes = JSON.parse(body).nodes;
              console.log('We got nodes back : ', currentNode);
              for (var i = kNodes.length - 1; i >= 0; i--) {
                if (nodesVisited.includes(kNodes[i].ID) == false){
                  nodeList.push(kNodes[i]);
                }
              }
            }
          }
          IterativeFindNode(nodeList, targetID, onFinishedCallback);
        });
      }
  }
}

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));


function GetValueStoredAsHTML(){
  var html = '<table border=\"1\">';
  var valueKeys = Object.getOwnPropertyNames(valueStored);
  html += '<tr> <th> key </th> <th> value </th> </tr>';
  for(var i = 0; i<valueKeys.length; i++){
    var key = valueKeys[i];
    var value = valueStored[key];
    html += '<tr>' + '<td>' + key + '</td> <td>' + value + '</td> </tr>';
  }
  html += '</table>';

  return html;
}

// on the request to root (localhost:3000/)
app.get('/', function (req, res) {
    res.send('<b>Welcome!</b><br>'
    +'Peer:'+ID+'<br>'+'@'+hostname+':'+port+' <br>'
    +'My k-bucket:<br>'+ GetHTMLListOfPeers()+'<br>'
    +'<form action=\"/onbootstrap\" method=\"post\">IP:<br>'
    +'<input type=\"text\" name=\"ip\"><br>Port:<br>'
    +'<input type=\"text\" name=\"port\">'
    +'<input type=\"submit\" value="Ping Node\"></form>'
    +'<br> <form action=\"/findNodeManually\" method=\"get\">Find Node:<br>'
    +'<input type=\"text\" name=\"nodeID\">'
    +'<input type=\"submit\" value="Find Node\"></form>'
    +'<br> My Values: <br>' + GetValueStoredAsHTML()
    +'<br> <form action=\"/storeValueManually\" method=\"post\">ValueID:<br>'
    +'<input type=\"text\" name=\"valueID\"><br>Value:<br>'
    +'<input type=\"text\" name=\"value\">'
    +'<input type=\"submit\" value="Store Value\"></form>'
    +'<br> <form action=\"/findValueManually\" method=\"get\">ValueID:<br>'
    +'<input type=\"text\" name=\"valueID\"><br>Value:<br>'
    +'<input type=\"submit\" value="Find Value\"></form>'



    );

    res.end();
});

// On localhost:port/api/kadem/ping
app.get('/api/kademlia/ping', function (req, res) {
    console.log((new Date()).toDateString(), "-Ping-" );
    var senderID = req.header('senderid');
    var senderIP = req.header('senderip');
    var senderPort = req.header('senderport');
    var rcpid = req.header('rcpid');


    var shouldPingBack = false;

    // Just making sure we didn't ping ourselves
    if(senderID != ID || senderIP != hostname || senderPort != port){
      // Send the ping
      res.set({
        'Content-Type': 'text/plain',
        'rcpid': rcpid,
        'senderid': ID,
        'senderip': hostname,
        'senderport': port
      });

      shouldPingBack = !IsOriginOfRCPID(rcpid); // check if we send the first ping in the chain. if not, then ping

      res.status(200);

    }else{
      res.sendStatus(403);
    }
    res.end();

    // Send the ping back if need be
    if(shouldPingBack && HasNodeWithID(senderID) == false){
      console.log('Was pinged and is now pinging back');
        SendPing(senderIP, senderPort, function(error, response, body) {
          console.log('I was ponged back');
          if(response.statusCode == 200){
            console.log('Code 200. Yay');
            var senderIDback = response.headers['senderid'];
            var senderIPback = response.headers['senderip'];
            var senderPortback = response.headers['senderport'];
            console.log(senderIDback, senderIPback, senderPortback);
            AddNeighbourNode(senderIDback, senderIPback, senderPortback);
          }
        }, rcpid); // use the same rcpid to make the chain stop quickly
    }


});

// On localhost:port/find_node
app.get('/api/kademlia/find_node', function (req, res) {
    console.log((new Date()).toDateString(), "-Find Node-" );
    var senderID = req.header('senderid');
    var senderIP = req.header('senderip');
    var senderPort = req.header('senderport');
    var rcpid = req.header('rcpid');
    var targetNodeID = req.header('targetnodeid');

    if(senderID != ID || senderIP != hostname || senderPort != port){
      console.log("Looking for nodes close to: "+targetNodeID);

      res.set({
        'Content-Type': 'application/json',
        'rcpid': rcpid,
        'senderid': ID,
        'senderip': hostname,
        'senderport': port
      });


       res.type('json');
      res.status(200);
      var nodes = GetKClosestNodesToID(targetNodeID);
      console.log('Nodes:', nodes, nodes.length);
      res.send( JSON.stringify( { nodes:  nodes} ) );
    }else{
      res.sendStatus(403);
    }
    res.end();
});

// when a value is stored
app.post('/api/kademlia/store', function(req, res){
   console.log((new Date()).toDateString(), "-Store-" );
    var senderID = req.header('senderid');
    var senderIP = req.header('senderip');
    var senderPort = req.header('senderport');
    var rcpid = req.header('rcpid');
    var key = req.header('key');
    var value = req.header('value');
    valueStored[key] = value;
    res.sendStatus(200);
});


app.get('/api/kademlia/find_value', function(req, res){
	console.log((new Date()).toDateString(), "-FindValue-" );
    var senderID = req.header('senderid');
    var senderIP = req.header('senderip');
    var senderPort = req.header('senderport');
    var rcpid = req.header('rcpid');
    var key = req.header('key');

    var result = GetValue(key);
    if(result === undefined){
        result = {'nodes': GetKClosestNodesToID(key)};
    }
    else{
        result = {'value': result};
    }
    res.type('json');
    res.status(200);

    res.send( JSON.stringify( result ) );


});


// Called whenever we manually ping a node through the form on the website
app.post('/onbootstrap', function (req, res) {
    var ip = req.param('ip', null);
    var nport = req.param('port', null);

    Bootstrap(ip, nport);
    res.redirect('/');
    res.end();
});

// Called whenever we store a value manually
app.post('/storeValueManually', function (req, res) {
    var valueID = req.param('valueID', null);
    var value = req.param('value', null);
    console.log(value, valueID);
    Store(value, valueID);
    res.redirect('/');
    res.end();
});

//called when finding a node manually
app.get('/findNodeManually', function(req,res){
    var nodeID = req.param('nodeID', null);
  console.log((new Date()).toDateString(), "-Looking for node with id : "+nodeID+"-" );


  // Start looking for the specific nodeID
  // function(result) will be run once the search is complete
  FindNode(nodeID, function(result){
    // We are done search. Send our result and end the response
    res.type('json');
    res.status(200);

    res.send( JSON.stringify( result ) );
  });

});

app.get('/findValueManually', function(req, res){
    var valueID = req.param('valueID', null);
    console.log((new Date()).toDateString(), "-Looking for value with id : "+valueID+"-" );
    var fullKey = sha1(valueID);
    var key = parseInt(fullKey.substring(fullKey.length-2,fullKey.length),16); //to sidste bit tages og konverteres til integer
    FindValue(key, function(result){
        res.type('json');
        res.status(200);
        res.send( JSON.stringify( result ) );
    });

});

// start the server in the port 3000 !
app.listen(port, function () {
    console.log('Example app listening on port '+port+'.');

});

function StartupMethod(){
  // We will only ping a node on startup if we
  // are given that through the command line
  if(BoostrapIP != '' && BoostrapPort != 0){
    Bootstrap(BoostrapIP, BoostrapPort);
  }

}

// Boostrap onto the network
function Bootstrap(boostrapIP, boostrapPort){
  // Check that the ip and ports are not null or something
  if(boostrapIP != null && boostrapPort != null){
    console.log('Boostrapping');
    // Send the ping
    SendPing(boostrapIP, boostrapPort, function(error, response, body) { //function er respons på ping
      if(error == null){
        if(response.statusCode == 200){
          var senderID = response.headers['senderid'];
          var senderIP = response.headers['senderip'];
          var senderPort = response.headers['senderport'];

          StartBoostrapOnNode(senderID, senderIP, senderPort);
        }
      }

    });
  }
}

function StartBoostrapOnNode(nodeID, nodeIP, nodePort){

  AddNeighbourNode(nodeID, nodeIP, nodePort);
  SendFindNode(nodeIP, nodePort, ID, function (error, reponse, body) {

    var kNodes = JSON.parse(body).nodes;
    console.log('Nodes returned', kNodes);

    for (var i = 0; i < kNodes.length; i++) {

      SendPing(kNodes[i].IP, kNodes[i].Port, function (error, response, body){
        console.log('Got a ping back during bootstrapping');
        if(error == null){
          if(response.statusCode == 200){
            var senderID = response.headers['senderid'];
            var senderIP = response.headers['senderip'];
            var senderPort = response.headers['senderport'];
            AddNeighbourNode(senderID, senderIP, senderPort);
            SendFindNode(senderIP, senderPort, ID, function(error, response, body){
              var newkNodes = JSON.parse(body).nodes;
              console.log('new Nodes returned', newkNodes);
              for (var i = 0; i < newkNodes.length; i++) {
                SendPing(newkNodes[i].IP, newkNodes[i].Port, function (error, response, body){
                  if(error == null){
                    if(response.statusCode == 200){
                      var senderID = response.headers['senderid'];
                      var senderIP = response.headers['senderip'];
                      var senderPort = response.headers['senderport'];
                      AddNeighbourNode(senderID, senderIP, senderPort);
                    }
                  }
                });
              }
            });
          }
        }

      });

    }

  });

}


// STARTUP STUFF BELOW THIS LINE

InitializeDHT(); // Initialize the routing table
StartupMethod(); // Run the startup method and ping someone
