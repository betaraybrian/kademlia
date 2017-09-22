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

const hostname = '127.0.0.1';
var port = 3000;

var shaID = sha1(port*Math.random()+"");
var ID = parseInt(shaID.substring(shaID.length-2,shaID.length),16); //to sidste bit tages og konverteres til integer

var DHT = {canSplit : true, i : b-1, children : [], level : 1, parent: null};
var numberOfNodes = 0;
var numberOfServersInTotal = 0;

process.argv.forEach(function (val, index, array) {
  if(index == 2){
    port = val;
  }
  if(index == 3){
    numberOfServersInTotal = val;
  }
  //console.log(index + ': ' + val);
});


function AddNeighbourNode(NodeID, NodeIP, NodePort){
  var node = {ID : NodeID, IP : NodeIP, Port : NodePort};
  var dist = Distance(ID, NodeID);

  AddNodeToDHT(node, dist);
}

function AddNodeToDHT(node, dist){
  var currentBucket = DHT;
  var hasFoundBucket = false;

  while (hasFoundBucket == false){

    if(currentBucket.hasOwnProperty('canSplit')){
      // This is a bucket
      if(currentBucket.children.length > 0){

        if(currentBucket.children[0].hasOwnProperty('canSplit')){
          // We know that there are more buckets beneath us.
          // We need to find which one
          if(dist >= Math.pow(2, currentBucket.i)){
            currentBucket = currentBucket.children[1];
          }else{
            currentBucket = currentBucket.children[0];
          }
        }else{
          // There are nodes in it. Just return it
          hasFoundBucket = true;
        }
      }else{
        // This is an empty bucket. So this will be fine to add to.
        hasFoundBucket = true;
      }

    }else{
      // This is the list of nodes inside a bucket
      hasFoundBucket = true;
    }
  }

  // now currentBucket is the bucket we should be placing our node in

  if(currentBucket.children.length < k){
    currentBucket.children.push(node);
    numberOfNodes++;
  }else{
    if(currentBucket.level < b && currentBucket.canSplit){ //ikke i leaf og far-bucket
      // This full bucket can be split into sub buckets
      SplitBucket(currentBucket);
      AddNodeToDHT(node, dist); //den nye node skal indsættes i bucket
    }else{
      // ping the stuff in the list to see if we can add to it.
      console.log("We need to ping all the nodes in a bucket");
    }
  }

  console.log(DHT);
}

function SplitBucket(bucket){
  var newLevel = bucket.level +1;
  var newI = bucket.i -1;

  var b1 = {canSplit : true, i : newI, children : [], level : newLevel, parent : bucket};
  var b2 = {canSplit : false, i : newI, children : [], level : newLevel, parent : bucket}; // far bucket kan aldrig deles

  for(var b = 0; b < k; b++){
    var child = bucket.children[b];
    var dist = Distance(ID, child.NodeID);
    if(dist >= Math.pow(2, newI)){
      b2.children.push(child);
    }else{
      b1.children.push(child);
    }
  }

  bucket.children = [b1, b2];
}

function Distance(x,y){
  return x ^ y;
}

function GetHTMlFormattedListOfPeers(bucket){
  var html = '';

  if(bucket.hasOwnProperty('canSplit')){
    for(var i = 0; i < bucket.children.length; i++){
      html += GetHTMlFormattedListOfPeers(bucket.children[i]);
    }
  }else{
      html += '<li><a href=\"http://'+bucket.IP+':'+bucket.Port+'\" >'+bucket.ID+'</a></li>';
  }

  return html;
}

function GetHTMLListOfPeers(){
  return '<ul>'+GetHTMlFormattedListOfPeers(DHT)+'</ul> <br>'
}

function GetKNodesClosestToNodeId(targetNodeID){
  var closetsNodes = [];
  var checkedIndexes = [];
  var nextToCheck = [];
  var distToTarget = Distance(ID, targetNodeID);

  var nodes = GetAllPeersAsList();

  var indexToCheck = 0;
  var lastDif = 9001;
  for(var i = 0; i < nodes.length; i++){
    var dif = Math.abs(distToTarget - Distance(ID, nodes[i].ID));
    if(dif < lastDif){
      indexToCheck = i;
      lastDif = dif;
    }
  }

  nextToCheck.push(indexToCheck);

  while( nextToCheck.length > 0 && closetsNodes.length < k ){
    var index = nextToCheck.shift();
    checkedIndexes.push(index);
    if(index+1 < nodes.length){
      if(checkedIndexes.includes(index+1) == false){
        nextToCheck.push(index+1);
      }

    }
    if(index-1 > -1){
      if(checkedIndexes.includes(index-1) == false){
        nextToCheck.push(index-1);
      }
    }
    console.log(index);
    // sort the list
    if(nodes[index].ID != targetNodeID){
      closetsNodes.push(nodes[index]);
    }


  }

  /*while (closetsNodes.length < k && closetsNodes.length < numberOfNodes){
    if(currentBucket.children[0].hasOwnProperty('canSplit') == false){
      for (var i=0; i < currentBucket.children.length; i++){
        closetsNodes.push(currentBucket.children[i]);
      }
      checkedBuckets.push(currentBucket);
    }
    var hasFoundBucket = false;
    var bucketLookingAt = currentBucket;
    if (bucketLookingAt.parent != null){
      while (hasFoundBucket == false){
        for (var i=0; i < k ; i++){
          if (checkedBuckets.includes(bucketLookingAt.parent.children[i]) == false){ //hvis ikke søskende er tjekket
            currentBucket = bucketLookingAt.parent.children[i];
          }else{
            checkedBuckets.push(bucketLookingAt.parent);
            bucketLookingAt = bucketLookingAt.parent;
          }
        }
      }
    }
  }*/

  console.log('The closest nodes:',closetsNodes);

  return closetsNodes;
}

function GetAllPeersAsList(){
  return GetNodesFromBucket(DHT);
}

function GetNodesFromBucket(bucket){
  var nodes = [];

  if(bucket.hasOwnProperty('canSplit')){
    for(var i = 0; i < bucket.children.length; i++){
      var nodeList = GetNodesFromBucket(bucket.children[i]);
      for(var j = 0; j < nodeList.length; j++){
        nodes.push(nodeList[j]);
      }

    }
  }else{
      nodes.push(bucket); ;
  }

  return nodes;
}

function GetBucketClosestsToDist(dist){
  var currentBucket = DHT;
  var hasFoundBucket = false;
  while(hasFoundBucket == false){
    if(currentBucket.hasOwnProperty('canSplit')){
      if(currentBucket.children > 0){
        if(currentBucket.children[0].hasOwnProperty('canSplit')){
          // We have sub buckets
          if(dist >= Math.pow(2, currentBucket.i)){
            currentBucket = currentBucket.children[1];
          }else{
            currentBucket = currentBucket.children[0];
          }
        }else{
          hasFoundBucket = true;
        }
      }else{
        hasFoundBucket = true;
      }
    }else{
      hasFoundBucket = true;
    }
  }

  return currentBucket;
}

function SendPing(nodeIP, nodePort, callbackFunction){

  var RCPID = sha1((Math.random()*160*7)+"");
  console.log('http://'+nodeIP+':'+nodePort+'/api/kademlia/ping');

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/api/kademlia/ping',
    headers: {
      'RCPID': RCPID,
      'senderID': ID,
      'senderIP': hostname,
      'senderPort': port
    }
  };

  request(options, callbackFunction);
}


function SendFindNode(nodeIP, nodePort, targetID, callbackFunction){
  var RCPID = sha1((Math.random()*160*7)+"");

  var options = {
    uri: 'http://'+nodeIP+':'+nodePort+'/api/kademlia/find_node',
    headers: {
      'RCPID': RCPID,
      'senderID': ID,
      'senderIP': hostname,
      'senderPort': port,
      'targetNodeID': targetID
    }
  };
  request(options, callbackFunction);
}


function KnowsNode(node){
  return GetAllPeersAsList().includes(node);
}

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));


// on the request to root (localhost:3000/)
app.get('/', function (req, res) {
    res.send('<b>Welcome</b><br>'
    +'Peer:'+ID+'<br>'+'@'+hostname+':'+port+' <br>'
    +'My k-bucket:<br>'+ GetHTMLListOfPeers()+'<br>'
    +'<form action=\"/onbootstrap\" method=\"post\">IP:<br>'
    +'<input type=\"text\" name=\"ip\"><br>Port:<br>'
    +'<input type=\"text\" name=\"port\">'
    +'<input type=\"submit\" value="Submit\"></form></body>');
    res.end();
});

// On localhost:port/api/kadem/ping
app.get('/api/kademlia/ping', function (req, res) {
  console.log("was pinged");
    var senderID = req.header('senderID');
    var senderIP = req.header('senderIP');
    var senderPort = req.header('senderPort');
    var rcpid = req.header('RCPID');

    console.log(senderID);
    if(senderID != ID || senderIP != hostname || senderPort != port){
      console.log('not us. Adding node');
      AddNeighbourNode(senderID, senderIP, senderPort);

      res.set({
        'Content-Type': 'text/plain',
        'RCPID': rcpid,
        'senderID': ID,
        'senderIP': hostname,
        'senderPort': port
      });

      res.status(200);

    }else{
      res.sendStatus(403);
    }
    res.end();
});

// On localhost:port/find_node
app.get('/api/kademlia/find_node', function (req, res) {
    var senderID = req.header('senderID');
    var senderIP = req.header('senderIP');
    var senderPort = req.header('senderPort');
    var rcpid = req.header('RCPID');
    var targetNodeID = req.header('targetNodeID');

    if(senderID != ID || senderIP != hostname || senderPort != port){
      console.log("Looking for nodes close to: "+targetNodeID);

      res.set({
        'Content-Type': 'application/json',
        'RCPID': rcpid,
        'senderID': ID,
        'senderIP': hostname,
        'senderPort': port
      });


       res.type('json');
      res.status(200);
      res.send( JSON.stringify( { nodes: GetKNodesClosestToNodeId(targetNodeID) } ) );
    }else{
      res.sendStatus(403);
    }
    res.end();
});


app.post('/onbootstrap', function (req, res) {
    var ip = req.param('ip', null);
    var nport = req.param('port', null);

    Bootstrap(ip, nport);

    res.end();
});

var nodesToPing = [];
var index = 0;
function PingList(nodes){
  nodesToPing = nodes;
  index = 0;
  PingNext();
}

function PingNext(){
  if(index >= nodesToPing.length){
    return;
  }
  SendPing(nodesToPing[index].IP, nodesToPing[index].Port, function(error, response, body){
    if(response.statusCode == 200){
      console.log('Code 200. Yay');
      var senderID = response.headers['senderid'];
      var senderIP = response.headers['senderip'];
      var senderPort = response.headers['senderport'];
      console.log(senderID, senderIP, senderPort);
      AddNeighbourNode(senderID, senderIP, senderPort);
      index++;
      PingNext();
    }
  });

}

// start the server in the port 3000 !
app.listen(port, function () {
    console.log('Example app listening on port '+port+'.');

});

//setTimeout(StartupMethod, 3000);

function StartupMethod(){
  var PingPort = port;

  while(PingPort == port){
    PingPort = getRandomInt(3000, 3000+numberOfServersInTotal);
  }

  Bootstrap('127.0.0.1', PingPort);
}

function Bootstrap(nIP, nPort){
  if(nIP != null && nPort != null){

    SendPing(nIP, nPort, function(error, response, body) { //function er respons på ping
      console.log('I was ponged back');
      if(response.statusCode == 200){
        console.log('Code 200. Yay');
        var senderID = response.headers['senderid'];
        var senderIP = response.headers['senderip'];
        var senderPort = response.headers['senderport'];
        console.log(senderID, senderIP, senderPort);
        AddNeighbourNode(senderID, senderIP, senderPort);

        SendFindNode(senderIP, senderPort, ID, function (error, reponse, body) {
          //console.log(response);
          console.log('==== BREAK =====');
          var kNodes = JSON.parse(body).nodes;
          console.log(kNodes);
          PingList(kNodes);
          //console.log(body);
        });
      }
    });
  }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
