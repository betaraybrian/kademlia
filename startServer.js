const forever= require('forever-monitor');


var numberOfServers = 3;

process.argv.forEach(function (val, index, array) {
  if(index == 2){
    numberOfServers = val;
  }
  //console.log(index + ': ' + val);
});
var port = 3000;
for(var i = 0; i < numberOfServers; i++){
  var child = new (forever.Monitor)('peer.js', {
    max: numberOfServers,
    silent: true,
    args: [port, numberOfServers]
  });
  child.start();
  console.log('Starting server on port: '+port);
  port++;
}
