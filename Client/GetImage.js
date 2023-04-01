let net = require("net");
let fs = require("fs");
let open = require("open");
let ITPpacket = require("./ITPRequest");

//get input parameters from cmd line
let sF = process.argv.indexOf('-s') + 1,//get server index
    qF = process.argv.indexOf('-q') + 1,//get query index
    vF = process.argv.indexOf('-v') + 1,//get version index
    ip = process.argv[sF].split(':')[0],//get ip
    port = process.argv[sF].split(':')[1],//get port
    payload = '';//response paylaod


const socket = net.Socket();//create socket
const imgname = process.argv[qF];//get name
socket.connect(port, ip, function(){//connect to server
  let requestPacket = ITPpacket;
  requestPacket.init(imgname, parseInt(process.argv[vF]));//fill request packet
  console.log('Connected to ImageDB server on: ' + ip +':'+ port);//confirm connection

  socket.write(requestPacket.getBytePacket());//write request to server
  socket.on('data', function(data) {//on response recieved
    let ver = parseBitPacket(data, 0, 4);//get version
    let resNum = parseBitPacket(data, 4, 8);//get response number
    let resType='';//store reponse type

    switch(resNum){//get response type corresponding to the response number
      case 0: 
        resType = "Query";
        break;
      case 1:
        resType = "Found";
        break;
      case 2:
        resType = "Not found";
        break;
      default:
        resType = "Busy";
        break;
    }

    let header = Buffer.alloc(12);//create 12 byte space for header
    data.copy(header, 0, 0, 12);//copy first 12 bytes into header

    payload = Buffer.alloc(data.length - 12);//create space for payload that matches the image file size
    data.copy(payload, 0, 12, data.length);//copy image data into payload
      
    let seqNum = parseBitPacket(data, 12, 20);//get sequence number
    let timeStamp = twosToNormal(data, 32, 32);//get time
    let imgSize = parseBitPacket(data, 64, 32);//get image size
    imgData = parseBitPacket(data, 96, imgSize*8);//get image data

    //print response info in correct format
    console.log('\nITP packet header received:');
    printPacketBit(header);
    console.log(`\nServer sent:\n    --ITP Version = ${ver}\n    --Response Type = ${resType}\n    --Sequence Number = ${seqNum}\n    --Timestamp = ${timeStamp}\n`); 
  })

  socket.on('end', function(){//on data stream end
    if(typeof payload === 'string')//if initial parameters are wrong
      console.log('Request Was Ignored By Server');
    else if(payload.length > 0) {//if image was found
      fs.writeFileSync(imgname, payload);//create new file with response image data
      (async () => { //open file
          await open(imgname, { wait: true });
          process.exit(1);//exit encapsulation
      })();//encapsulation need to use async function in a synchornous manner
    }
    else //if not found
      console.log(`${imgname} was not found`);

    socket.end();//close connection
  })

  socket.on("close", function () {//on socket close
    console.log("Disconnected from the server\nConnection closed");
    if(payload.length <= 0) process.exit(0);//force close client if image was not found
  });
})

//--------------------------
//twosToNormal: convert signed 2's complement to unsigned binary
//used only for time stamp as provided method 'parseBitPacket' uses signed bit shift
//--------------------------
function twosToNormal(packet, offset, length){
  var num = parseBitPacket(packet, offset, length);
  if(num < 0){
    num = num.toString(2)
    var n = num.length;
    var i;
    for (i = n - 1; i >= 0; i--)
        if (num.charAt(i) == '1')
            break;

    if (i == -1)
        return "1" + num;

    for (k = i - 1; k >= 0; k--) {
        if (num.charAt(k) == '1')
            num = num.substring(0,k)+"0"+num.substring(k+1, num.length);
        else
            num = num.substring(0,k)+"1"+num.substring(k+1, num.length);
    }
  }
  return num;
}
//// Some usefull methods ////
// Feel free to use them, but DON NOT change or add any code in these methods.

// Returns the integer value of the extracted bits fragment for a given packet
function parseBitPacket(packet, offset, length) {
    let number = "";
    for (var i = 0; i < length; i++) {
      // let us get the actual byte position of the offset
      let bytePosition = Math.floor((offset + i) / 8);
      let bitPosition = 7 - ((offset + i) % 8);
      let bit = (packet[bytePosition] >> bitPosition) % 2;
      number = (number << 1) | bit;
    }
    return number;
  }
  
  // Prints the entire packet in bits format
  function printPacketBit(packet) {
    var bitString = "";
  
    for (var i = 0; i < packet.length; i++) {
      // To add leading zeros
      var b = "00000000" + packet[i].toString(2);
      // To print 4 bytes per line
      if (i > 0 && i % 4 == 0) bitString += "\n";
      bitString += " " + b.substr(b.length - 8);
    }
    console.log(bitString);
  }


  
