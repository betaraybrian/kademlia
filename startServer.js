var exec = require('child_process').exec,
child;

var NumberOfServers = 1;

process.argv.forEach(function (val, index, array) {
  if(array.length < 3){
    console.log('Specify the number of peers you want as a parameter');
    console.log('so: \"node startServer.js 10\" will start 10 peers');
    console.log('and bootstrap them all to the first one');
    console.log('A second parameter can be used to set the start port');
  }
  if(index == 2){
    NumberOfServers = val;
  }
  if(index == 3){
    StartPort = val;
  }
  //console.log(index + ': ' + val);
});

var StartPort = 3000;

var EndString = ' localhost '+StartPort;


var Port = StartPort;
for(var i = 0; i < NumberOfServers; i++){
  console.log('Starting a server on port: '+Port);
  child = exec('node peer.js '+Port+((i == 0)? '': EndString),
    function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
  });

  Port++;
}
