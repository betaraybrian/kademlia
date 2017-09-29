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

var shaID = sha1(port*Math.random()+"");
var ID = parseInt(shaID.substring(shaID.length-2,shaID.length),16); //to sidste bit tages og konverteres til integer

var DHT = [];

var valueStored = {};

var nodesVisited = [];

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
  var node = {ID : NodeID, IP : NodeIP, Port : NodePort, Dist : dist};

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
    for (var i = bucket.length - 1; i >= 0; i--) {
    	if(bucket[i].ID == node.ID){
    		console.log('trying to add a node we already have');
    		return;
    	}
    }

    if(bucket.length < k){ // Is there room in this bucket?
      // There is room. Add the node
      bucket.push(node);
      console.log('Adding node', node);
    }else{
      // No room. Check if we are closer to the node than any of the ones in the list
      var isCloserThanAnotherNode = false;
      for(var i = k-1; i >= 0; i--){ // Looping backwards because we are removing from the list
        if(bucket[i].Dist > node.Dist){
          // We are closer than someone!
          // Remove that node from the list
          bucket.splice(1,i);
          isCloserThanAnotherNode = true;
          break;
        }
      }

      if(isCloserThanAnotherNode){
        // We were closer than another node and removed it.
        bucket.push(node);
        console.log('Adding node', node);
      }else{
        // No room in bucket and we weren't closer than any of the ones there
        // Let's see if they are all still alive
        console.log('Ping stuff in list');
        /*PingList(bucket, function(wasAllAlive, badIndexes){
          // There was a dead node
          if(wasAllAlive == false){
          	for (var i = badIndexes.length - 1; i >= 0; i--) {
          		bucket.splice(1,badIndexes[i]);
          	}
            var toRemove = badIndexes[badIndexes.length-1];
            console.log('We found a dead node. Removing it', '====================@@@@@@@@@@@@@@@@@=============', badIndexes);
            console.log(bucket[toRemove]);
            console.log(bucket, toRemove);
            bucket.splice(1, toRemove);
            console.log(bucket);
            //bucket.push(node);
            //console.log('Adding node', node);
          }else{

          }
        });*/
      }

    }
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
      html += '<a href=\"http://'+bucket[i].IP+':'+bucket[i].Port+'\">'+bucket[i].ID+'('+bucket[i].Dist+')'+'</a> &nbsp;';
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

function Store(value, valueID){
  var fullKey = sha1(valueID);
  var key = parseInt(fullKey.substring(fullKey.length-2,fullKey.length),16); //to sidste bit tages og konverteres til integer
  valueStored[fullKey] = value;
  var nodes = GetKClosestNodesToID(key);

  for(var i = 0; i < nodes.length; i++){
    SendStoreValue(nodes[i], fullKey, value, function(){});
  }
  console.log(valueStored);
}

function SendStoreValue(node, fullKey, value, callbackFunction) {
   var RCPID = sha1((Math.random()*160*7)+"");
  RCPIDSendOut.push(RCPID);

  var options = {
    uri: 'http://'+node.IP+':'+node.Port+'/api/kademlia/store',
    headers: {
      'rcpid': RCPID,
      'senderid': ID,
      'senderip': hostname,
      'senderport': port,
      'fullkey': fullKey,
      'value': value
    }
  };
  request.post(options, callbackFunction);
}

function GetValue(fullKey){
	var value = valueStored[fullKey];
	if(value == null || value === undefined){
		return undefined;
	}else{
		return value;
	}
}


function FindValue(fullKey){
	var value = GetValue(fullKey);
	if(value === undefined){
		//find other nodes, we don't have the value
		var key = parseInt(fullKey.substring(fullKey.length-2,fullKey.length),16);
		var nodes = GetKClosestNodesToID(key);
		return {'nodes' : nodes};

	}else{
		return {'value': value};
	}
}

function SearchNetworkForValue(fullKey){
	var result = FindValue(fullKey);
	while(result.hasOwnProperty('nodes')){
		//search for other nodes
		for(var i=0; i<alpha; i++){

		}
	}
	return result;
}

var nodes;
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
    if (result.length == 0){
      onFinishedCallback( {'error' : 'Node does not exist'} );
    }else{
      onFinishedCallback( GetElementWithIDFromList(targetID, result) );
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
  if (ListHasNodeWithID(targetID, nodeList) || nodeList.length == 0){
    onFinishedCallback(nodeList); // Notify our caller that we are finished
    return nodeList;
  }
  var currentNode = nodeList.shift();
  if (nodesVisited.includes(currentNode.ID)){
    return IterativeFindNode(nodeList, targetID, onFinishedCallback);
  }else{
    nodesVisited.push(currentNode.ID);
    SendFindNode(currentNode.IP, currentNode.Port, targetID, function(error, response, body){
      if (error == null){
        if(response.statusCode == 200){
          var kNodes = JSON.parse(body).nodes;
          for (var i = kNodes.length - 1; i >= 0; i--) {
            if (nodesVisited.includes(kNodes[i].ID) == false){
              nodeList.push(kNodes[i]);
            }
          }
        }
      }
      return IterativeFindNode(nodeList, targetID, onFinishedCallback);
    });
  }
}

/*
function StartIterativeFindNode(initialListofNodes, targetID){
	nodes = initialListofNodes;
	nodesVisited = [];
	var limit = Math.min(nodes.length,alpha);
	for(var i=0; i<limit; i++){ //start parallellism
		nodesVisited.push(nodes[i]);
		var currentNode = nodes[i];
		nodes.splice(1,i); //remove the node we are just about to visit  from the visit list
		if(currentNode.IP == hostname && currentNode.Port == port && currentNode.ID == ID){
			continue; //if this node is us then skip to next node in the forloop
		}
		console.log('sending findnode to', currentNode);
		SendFindNode(currentNode.IP, currentNode.Port, targetID, function(error, response, body){
			console.log(error);
			if(response.statusCode == 200){
				SendPing(currentNode.IP, currentNode.Port, function(error, response, body){
					console.log('Got Ping fakjdlhdjaksdh');
					if(response.statusCode == 200){
						var senderID = response.headers['senderid'];
        				var senderIP = response.headers['senderip'];
       					var senderPort = response.headers['senderport'];

        				AddNeighbourNode(senderID, senderIP, senderPort);
					}
				});
				var kNodes = JSON.parse(body).nodes;
				for (var i = kNodes.length - 1; i >= 0; i--) { // running thorugh the list backwards
					if(nodesVisited.includes(kNodes[i]) == false){ //not visited this node before, then push
						nodes.push(kNodes[i]);
					}
				}
			}
			if(nodes.length > 0){
				IterativeFindNode(nodes.shift(), targetID); // shift = take first node in array and return it
			}
		});
	}
}


function IterativeFindNode(node, targetID){
	nodesVisited.push(node);
	if((node.IP == hostname && node.Port == port && node.ID == ID) || nodesVisited.includes(node)){
		if(nodes.length > 0){
			IterativeFindNode(nodes.shift(), targetID); // remove first element in list and return it
		}
		return; // stop running the rest of the code if this is the case
	}
	SendFindNode(node.IP, node.Port, targetID, function(error, response, body){
		if(response.statusCode == 200){
			SendPing(node.IP, node.Port, function(error, response, body){
				console.log('Got Ping oiahdjksahakjdlhdjaksdh');
					if(response.statusCode == 200){
						var senderID = response.headers['senderid'];
        				var senderIP = response.headers['senderip'];
       					var senderPort = response.headers['senderport'];

        				AddNeighbourNode(senderID, senderIP, senderPort);
					}
			});
			var kNodes = JSON.parse(body).nodes;
			for (var i = kNodes.length - 1; i >= 0; i--) { // running thorugh the list backwards
				if(nodesVisited.includes(kNodes[i]) == false){ //not visited this node before, then push
					nodes.push(kNodes[i]);
				}
			}
		}
		IterativeFindNode(nodes.shift(), targetID); // shift = take first node in array and return it

	});
}
*/

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
    var fullKey = req.header('fullkey');
    var value = req.header('value');
    valueStored[fullKey] = value;
    res.sendStatus(200);
});


app.get('/api/kademlia/find_value', function(req, res){
	console.log((new Date()).toDateString(), "-FindValue-" );
    var senderID = req.header('senderid');
    var senderIP = req.header('senderip');
    var senderPort = req.header('senderport');
    var rcpid = req.header('rcpid');
    var fullKey = req.header('fullkey');

    var result = FindValue(fullKey);
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

  // Start looking for the specific nodeID
  // function(result) will be run once the search is complete
  FindNode(nodeID, function(result){
    // We are done search. Send our result and end the response
    res.type('json');
    res.status(200);

    res.send( JSON.stringify( result ) );
  });

});


// Variables for pinging a list of nodes
// Because pinging is asynchronous we need to keep track of how far we have gone

var nodesToPing = [];
var index = 0;

// Sets up the variables and pings the first node
function PingList(nodes, callbackFunction){
  console.log('Pinging List');
  nodesToPing = nodes;
  index = 0;
  PingNext(callbackFunction, true, []);
}

// Checks if the index is a valid node in the nodesToPing list
// If it is, then it pings it and only when it gets a response does it check the next one
function PingNext(callbackFunction, isAllAlive, badIndexes){
  // Is there more nodes to ping?
  console.log(index);
  if(index >= nodesToPing.length){
    console.log('End of ping list');
    callbackFunction(isAllAlive, badIndexes);
    return;
  }

  if(nodesToPing[index].IP == hostname && nodesToPing[index].Port == port && nodesToPing[index].ID == ID){
    // Don't ping ourselves
    index++;
    PingNext(callbackFunction, isAllAlive, badIndexes);
  }else{
    // More nodes! Send the ping
    SendPing(nodesToPing[index].IP, nodesToPing[index].Port, function(error, response, body){
      console.log('--test--');
      if(error != null){
        if(response.statusCode == 200){
          // The node is alive
          console.log('Code 200b');
          index++;
          PingNext(callbackFunction, isAllAlive, badIndexes);
        }else{
          // The node is not alive
          console.log('bad index here');
          badIndexes.push(index);
          index++;
          PingNext(callbackFunction, false, badIndexes);
        }
      }else{
        // The node is not alive
        console.log('bad index here');
        badIndexes.push(index);
        index++;
        PingNext(callbackFunction, false, badIndexes);
      }

    });
  }



}

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
function Bootstrap(nIP, nPort){

  // Check that the ip and ports are not null or something
  if(nIP != null && nPort != null){
    console.log('Sending Ping');
    // Send the ping
    SendPing(nIP, nPort, function(error, response, body) { //function er respons på ping
      console.log('I was ponged back');
      if(response.statusCode == 200){
        console.log('Code 200');
        var senderID = response.headers['senderid'];
        var senderIP = response.headers['senderip'];
        var senderPort = response.headers['senderport'];

        AddNeighbourNode(senderID, senderIP, senderPort);
        console.log('Sending Find Node to:', senderID, senderIP, senderPort);
        SendFindNode(senderIP, senderPort, ID, function (error, reponse, body) {
         	var kNodes = JSON.parse(body).nodes;
          	console.log('Nodes returned', kNodes);
         	//StartIterativeFindNode(kNodes, ID);
        });
      }
    });
  }
}

// STARTUP STUFF BELOW THIS LINE

InitializeDHT(); // Initialize the routing table
StartupMethod(); // Run the startup method and ping someone
