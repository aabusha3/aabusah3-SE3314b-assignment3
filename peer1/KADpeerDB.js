let singleton = require('./singleton.js');//misc randomizer functions and timer
let cPTP = require('./kadPTP.js');//packet formater
let ITPpacket = require("./ITPResponse");
let net = require('net');//to allow packet sending
const path = require( "path" );//to get the folder name
const fs = require('fs')

net.bytesWritten = 300000;//size of packets alloted to be written
net.bufferSize = 300000;//size of buffer

const folderName = path.relative('..', '.');//the folder name
const joinOp = process.argv[2];//join flag or null
const peerInfo = process.argv[3];//host peer info or null
const ip = '127.0.0.1';//the set ip
let myPort;
switch(folderName){//hard set port for peers
    case 'peer1':
        myPort = 2001;
        break;
    case 'peer2':
        myPort = 2055;
        break;
    case 'peer3':
        myPort = 2077;
        break;
    case 'peer4':
        myPort = 2044;
        break;
    case 'peer5':
        myPort = 2005;
        break;
    default:
        myPort = singleton.getPort();
        break;
}


let dhtTable = [];//the proper dht table with 160 k-buckets
let dhtCopy = [];//a copy of the dht table to exahust
let client = new net.Socket();//the client socket
let server = new net.Server();//the kad server

if (singleton.getTimestamp() == null) singleton.init();//start timer

let imageTable = [];//to store local images
fs.readdir(__dirname, (err, files) =>{//read local files
    files.forEach(file => {
        switch(path.extname(file)){
            case '.bmp': case '.jpeg': case '.gif': case '.png': case '.tiff': case '.raw': 
                imageTable.push(`${file}, ${singleton.getKeyID(file)}`);
            break;
        }
    });
}) 

//image server detail
let imagePort ;
let imageServer = singleton.getPort();
let imageDB = net.createServer();
imageDB.listen(imageServer, ip);

console.log('ImageDB server is started at timestamp: '+singleton.getTimestamp()+' and is listening on ' + ip + ':' + imageServer+'\n');

imageDB.on('connection', function(sock) {
    imagePort = sock.remotePort;
    handleClientJoining(sock); //called for each image client joining
});

if(joinOp != '-p') myCreateServer(myPort);//create jad server
if(joinOp == '-p') myCreateSocket(peerInfo.split(':')[1]);//create kad client

//--------------------------
//myCreateServer: takes a port and creates a server to listen on that port and carry out server operations
//--------------------------
async function myCreateServer(myPort){
    server = net.createServer((sock)=>{
        if(sock.remotePort >= 3000 ) ;//ignore if image server connects 
        else{
            if(joinOp != '-p') sendWelcome(sock);//sent welcome packets to new clients
            pushBucket(dhtTable, ip+':'+sock.remotePort);//add the client to server's dht
        }
        sock.on('data',(data)=>{
            readData(data, sock);//interpret welcome + hello + image search + image response packets
        })
    })
    server.listen(myPort, ip, ()=>{//start listening on this port
        if(joinOp != '-p') console.log(`This peer address is ${ip}:${myPort} located at ${folderName} [${singleton.getPeerID(ip, myPort)}]\n`);
        if(joinOp == '-p') console.log(`${ip}:${myPort} is now a server\n`);
    })
}


//--------------------------
//myCreateSocket: takes a port and creates a client to listen on that port and carry out client operations
//--------------------------
async function myCreateSocket(peerPort){
    client = net.createConnection({port:peerPort,host:ip,localAddress:ip,localPort:myPort},()=>{
        pushBucket(dhtTable, ip+':'+peerPort)//add the host server to the client's dht
    })
    client.on('data', (data)=>{
        readData(data, client);//interpret welcome packets
        dhtCopy = noEmptyDHT();
        const index = dhtCopy.indexOf(`${ip}:${peerPort}, ${singleton.getPeerID(ip, peerPort)}`);
        if (index > -1) {//send hello packet to host server
            dhtCopy.splice(index, 1); 
            let pkt = cPTP;
            let fullDHT = noEmptyDHT();
            pkt.init(7, 2, folderName, fullDHT);
            client.write(pkt.getBytePacket(), (err)=>{
                client.end();
                client.destroy();
            });
        }
        else {
            client.end();
            client.destroy();
        }
    })
    client.on('close', function(){
        sendHello(dhtCopy);//send hello packets to all remaining non-host servers listed on the client's dht
    })
}

//--------------------------
//sendWelcome: takes a socket and creates a welcome packet containing all the host server's dht peers
//--------------------------
async function sendWelcome(sock){
    const sockAddr = `${sock.remoteAddress}:${sock.remotePort}`;
    console.log(`Connected from peer ${sockAddr}`);
    const pkt = cPTP;
    const dht = noEmptyDHT();
    pkt.init(7, 1, folderName, dht);
    sock.write(pkt.getBytePacket());
}

//--------------------------
//sendHello: takes a dht table and sends hello packets to all the client's dht peers who are non-host
//--------------------------
async function sendHello(T){
    if(T.length <= 0) {//all peers have been notified; become server
        console.log('Hello packet has been sent');
        return myCreateServer(myPort);
    }

    let port = parseInt(T[0].split(",")[0].split(':')[1]);//the port we are trying to send to

    let cli = new net.Socket();
    cli.connect({port:port,host:ip,localAddress:ip,localPort:myPort}, ()=>{
        let pkt = cPTP;
        let fullDHT = noEmptyDHT();
        pkt.init(7, 2, folderName, fullDHT);
        cli.write(pkt.getBytePacket(), (err)=>{
            cli.destroy();
            T.splice(0,1);
            if(T.length <= 0) {//all peers have been notified; become server
                console.log('Hello packet has been sent');
                return myCreateServer(myPort);
            }
            else sendHello(T);//loop til all peers on the dht table have been sent hello packets 
        });
    });
    cli.on('error', (err) => {//error handling
        if(err.code == 'ECONNREFUSED') console.log(`Client is no longer listening on ${err.address}:${err.port}`)
        else console.log(`handled error:\n${err}`);
        console.log(`error has been detected please restart all peer nodes`)
    });
}

//--------------------------
//readData: takes socket and data from that socket to interpret the custom TCP packet
//--------------------------
async function readData(data, sock){
    const loc = sock.localPort;//our port
    const rem = sock.remotePort;//the packet sender's port
    let version = parseBitPacket(data, 0, 4);//the version num; must be 7
    let msgType = parseBitPacket(data, 4, 8);//the message type num; must be either 1 or 2
    if (version != 7) return console.log(`version number provided '${version}' !== 7`);

    if(msgType === 4){//for image found response
        let sequenceNum = parseBitPacket(data, 12, 20);
        let timeStp = parseBitPacket(data, 32, 32);
        let imgSize = parseBitPacket(data, 64, 32);
        let imgData = new Buffer.alloc(imgSize);
        data.copy(imgData,0,12,imgSize*8);
        let res =1;
        if(imgSize==0) res = 2;//if not found
        ITPpacket.init(
            version,
            res, // response type
            sequenceNum, // sequence number
            timeStp, // timestamp
            imgData, // image data
          ); 
        clientSockets[`${ip}:${imagePort}`].write(ITPpacket.getBytePacket(),()=>{//send to image client
            console.log(`ITP packet response received to forward the image to the client`)
            clientSockets[`${ip}:${imagePort}`].end();
            delete clientSockets[`${ip}:${imagePort}`];//get rid of the stored image socket

        })
        
    }
    else{//for welcome + hello + image search request
        let numberOfPeers = parseBitPacket(data, 12, 8);//number of peers on sender's dht table
        let senderNameLength = parseBitPacket(data, 20, 12);//length of sender's name
        let senderName = new Buffer.alloc(senderNameLength)//the name translated from n bytes
        data.copy(senderName, 0, 4, senderNameLength*8)
        senderName = bytesToString(senderName)
        

        if(msgType === 3){//for image search
            const r = senderNameLength % 4;//add padding to read the packet correctly based on the sender's name length
            const payloadOffset = ((4+senderNameLength) + (r===0?r:(4-r)))*8;
            let ip0 = parseBitPacket(data, payloadOffset, 8);
            let ip8 = parseBitPacket(data, payloadOffset + 8, 8);
            let ip16 = parseBitPacket(data, payloadOffset + 16, 8);
            let ip24 = parseBitPacket(data, payloadOffset + 24, 8);
            let portNumber = parseBitPacket(data, payloadOffset + 32, 16);
            let recOrgPeerInfo = `${ip0}.${ip8}.${ip16}.${ip24}:${portNumber}`;//original peer ip:port
            let imgType = parseBitPacket(data, payloadOffset + 64, 4);
            let imgNameSize = parseBitPacket(data, payloadOffset + 68, 28);
            let imgName = new Buffer.alloc(imgNameSize)//the image name translated from n bytes
            data.copy(imgName, 0, (payloadOffset+64+32)/8, imgNameSize*8)
            imgName = bytesToString(imgName)

            handleKADImageRequests(senderName,recOrgPeerInfo,imgType,imgNameSize,imgName)
        }

        else if(msgType===1 || msgType===2){//for kad welcome and hello packets
            let dataArr = [];
            const r = senderNameLength % 4;//add padding to read the packet correctly based on the sender's name length
            const payloadOffset = ((4+senderNameLength) + (r===0?r:(4-r)))*8;
            if (numberOfPeers > 0){ //payload
                for (let i = 0; i < numberOfPeers; i++){
                    let ip0 = parseBitPacket(data, payloadOffset + 64*i, 8);
                    let ip8 = parseBitPacket(data, payloadOffset + 8 + 64*i, 8);
                    let ip16 = parseBitPacket(data, payloadOffset + 16 + 64*i, 8);
                    let ip24 = parseBitPacket(data, payloadOffset + 24 + 64*i, 8);
                    let portNumber = parseBitPacket(data, payloadOffset + 64*i + 32, 16);
                    dataArr[i] = `${ip0}.${ip8}.${ip16}.${ip24}:${portNumber}`;
                }
            }

            let dTable = [];//correctly format and display the received dht peers 
            let index = dataArr.indexOf(`${ip}:${rem}`);
            if (index > -1) dTable = formatTableOutput(dataArr.slice(0,index).concat(dataArr.slice(index+1,dataArr.length)));
            else dTable = formatTableOutput(dataArr); 
            
            if (msgType == 1){//for welcome packets
                console.log(`Connected to ${senderName}:${rem} at timestamp: ${singleton.getTimestamp()}\n`);
                console.log(`This peer address is ${ip}:${loc} located at ${folderName} [${singleton.getPeerID(ip, loc)}]\n`);
                console.log(`Received a Welcome message from ${senderName}\n   along with DHT: ${dTable.length===0?'[]':dTable}`);
            }
            else if (msgType == 2)//for hello packets
                console.log(`Received a Hello Message from ${senderName}\n   along with DHT: ${dTable.length===0?'[]':dTable}`);
            
            
            index = dataArr.indexOf(`${ip}:${loc}`);
            if(index > -1) dataArr.splice(index,1);
            refreshBuckets(dhtTable, dataArr);//refresh the all k-buckets; ignore our port entry
        }
    }
}


//--------------------------
//refreshBuckets: takes dht table and array of peers to push them into the k-bucket and display updated bucket
//--------------------------
function refreshBuckets(T, Pn){
    for (let i = 0; i < Pn.length; i++) pushBucket(dhtTable, Pn[i]); 

    console.log('Refresh k-Bucket operation is performed.\n');
    let str = 'My DHT: ';
    let tempT = noEmptyDHT();
    for (let i = 0; i < tempT.length; i++) str+= `[${tempT[i]}]\n        `;

    console.log(str);
}

//--------------------------
//noEmptyDHT: returns a table without empty entries from the dht table
//--------------------------
function noEmptyDHT(){
    let dhtEntries = [];
      let e = 0;

      for (let t = 0; t < dhtTable.length; t++)
        if (dhtTable[t]!= null){
          dhtEntries[e] = dhtTable[t];
          e++;
        }
      
    return dhtEntries;
}

//--------------------------
//pushBucket: takes a dht table and a peer to push a peer in the appropriate k-bucket based on xor distance
//--------------------------
function pushBucket(T, P){
    //peer info
    let pIP = P.split(':')[0];
    let pPORT = P.split(':')[1];

    //id of peer and us
    let pID = singleton.getPeerID(pIP, pPORT);
    let myID = singleton.getPeerID(ip, myPort);

    //binary representation of the above ids
    let pBITS = singleton.Hex2Bin(pID);
    let myBITS = singleton.Hex2Bin(myID);

    //the distance between the peer and us
    let xor = singleton.XORing(pBITS, myBITS);
    let index = xor.split('1')[0].length;

    if (T[index] != null){//if the k-bucket at index i is full
        if(T[index] == `${ip}:${pPORT}, ${pID}`)return;//ignore if its a dupelicate

        //get stored peers info
        let dhtID = T[index].split(',')[1].replace(' ', '');
        let dhtBITS = singleton.Hex2Bin(dhtID);

        //get the distances between me and both peers
        let dif1 = singleton.XORing(myBITS, dhtBITS);   
        let dif2 = singleton.XORing(myBITS, pBITS);
        
        //find the xor distance between the above distances
        xor = singleton.XORing(dif1, dif2);
        let difIndex = xor.split('1')[0].length;

        if (dif2.charAt(difIndex) == 0){//if new peer is closer
            console.log(`${pIP}:${pPORT}, [${pID}] has replaced\n${T[index]} since its closer\n`)
            T[index] = `${pIP}:${pPORT}, ${pID}`;
        }
        else if (dif1.charAt(difIndex) == 0)//if old peer is closer       
            console.log(`${T[index]} has replaced\n${pIP}:${pPORT}, [${pID}] since its closer\n`);

        else console.log(`something went wrong`);//for error handling purposes; should not be possible to reach this state
    }
    else//else push the peer in the empty appropirate k-bucket
        T[index] = `${pIP}:${pPORT}, ${pID}`;   
}

//--------------------------
//formatTableOutput: takes a dht table and formats it to match the output required
//--------------------------
function formatTableOutput(table){
    let str = '';

    for (let i = 0; i < table.length; i++){
        let ip = table[i].split(':')[0];
        let port = table[i].split(':')[1];
        str += `[${table[i]}, ${singleton.getPeerID(ip, port)}]\n                   `;
    }

    return str;
}



var nickNames = {},
  clientIP = {},
  startTimestamp = {},
  clientSockets={};

function handleClientJoining (sock) {
    assignClientName(sock, nickNames);
    console.log(
      "\n" +
        nickNames[sock.id] +
        " is connected at timestamp: " +
        startTimestamp[sock.id]
    );
    sock.on("data", function (requestPacket) {
      handleClientRequests(requestPacket, sock); //read client requests and respond
    });
    sock.on("close", function () {
      handleClientLeaving(sock);
    });
}

function handleClientRequests(data, sock) {
    console.log(`\nITP packet received from: ${sock.remoteAddress}:${myPort}`);
    printPacketBit(data);
  
    let version = parseBitPacket(data, 0, 4);
    let requestType = parseBitPacket(data, 24, 8);
    let requestName = {
      0: "Query",
      1: "Found",
      2: "Not found",
      3: "Busy",
    };
    let imageExtension = {
      1: "BMP",
      2: "JPEG",
      3: "GIF",
      4: "PNG",
      5: "TIFF",
      15: "RAW",
    };
    let timeStamp = parseBitPacket(data, 32, 32);
    let imageType = parseBitPacket(data, 64, 4);
    let imageTypeName = imageExtension[imageType];
    let imageNameSize = parseBitPacket(data, 68, 28);
    let imageName = bytesToString(data.slice(12, 13 + imageNameSize));
   
    console.log(
      "\n" +
        nickNames[sock.id] +
        " requests:" +
        "\n    --ITP version: " +
        version +
        "\n    --Timestamp: " +
        timeStamp +
        "\n    --Request type: " +
        requestName[requestType] +
        "\n    --Image file extension(s): " +
        imageTypeName +
        "\n    --Image file name: " +
        imageName +
        ""
    );
    if (version == 7) {  
      let imageFullName = imageName + "." + imageTypeName.toLowerCase();
      
      if(imageTable.indexOf(`${imageFullName}, ${singleton.getKeyID(imageFullName)}`) > -1) {
      let imageData = fs.readFileSync(imageFullName);   
  
        ITPpacket.init(
          version,
          1, // response type
          singleton.getSequenceNumber(), // sequence number
          singleton.getTimestamp(), // timestamp
          imageData, // image data
        );
  
        sock.write(ITPpacket.getBytePacket(),()=>{
            sock.end();
        });
            
      }
      else{
        if(dhtTable.length===0){
            ITPpacket.init(
                version,
                2, // response type
                singleton.getSequenceNumber(), // sequence number
                singleton.getTimestamp(), // timestamp
                [], // image data
              );
        
              sock.write(ITPpacket.getBytePacket(),()=>{
                console.log(`image was not found in this network`)
                sock.end();
              });
        }
        else searchClosestPeer(imageFullName, imageType, myPort)
      }
    } else {
      console.log("The protocol version is not supported");
      sock.end();
    }
}
  
function handleClientLeaving(sock) {
    console.log('\n'+nickNames[sock.id] + " closed the connection");
}

function handleKADImageRequests(sName,recPeerInfo,imageType,imageNameSize,imageName) {
    console.log(`\nReceived kadPTP search request from: ${sName}`);
  
    let imageExtension = {
      1: "BMP",
      2: "JPEG",
      3: "GIF",
      4: "PNG",
      5: "TIFF",
      15: "RAW",
    };
    let imageTypeName = imageExtension[imageType];
   
    console.log(
      "\n" +
        recPeerInfo +
        " requests:" +
        "\n    --ITP version: " +
        7 +
        "\n    --Timestamp: " +
        singleton.getTimestamp() +
        "\n    --Request type: " +
        'Query' +
        "\n    --Image file extension(s): " +
        imageTypeName +
        "\n    --Image file name: " +
        imageName +
        "\n"
    );
    let orgPeerPort = recPeerInfo.split(':')[1];

    let imageFullName = imageName + "." + imageTypeName.toLowerCase();
    if(imageTable.indexOf(`${imageFullName}, ${singleton.getKeyID(imageFullName)}`) > -1) {
        let imageData = fs.readFileSync(imageFullName);   

        ITPpacket.init(
        7,
        4, // response type
        singleton.getSequenceNumber(), // sequence number
        singleton.getTimestamp(), // timestamp
        imageData, // image data
        );

        let imageFound = new net.Socket();
        imageFound.connect({port:orgPeerPort,host:ip,localAddress:ip}, ()=>{
            imageFound.write(ITPpacket.getBytePacket(),()=>{
                console.log(`Sending kadPTP response message to ${recPeerInfo}`)
                
                imageFound.destroy();
            })
        })
    
    }
    else {
        searchClosestPeer(imageFullName, imageType, orgPeerPort)
    }
}
  
//--------------------------
//searchClosestPeer: searches the closest peer to the image in the dht
//--------------------------
function searchClosestPeer(imageFullName, it, orgPeerPort){
    let keyId = singleton.Hex2Bin(singleton.getKeyID(imageFullName));
    let dht = noEmptyDHT();
    let peerTable = [];
    for(let s of dht)
        peerTable.push(singleton.Hex2Bin(singleton.getPeerID(s.split(',')[0].split(':')[0], s.split(',')[0].split(':')[1])));
    let disTable = [];
    for(let pId of peerTable)
        disTable.push(parseInt(singleton.XORing(pId, keyId) ,2));
    let closest = disTable.indexOf(Math.min(...disTable))

    let closestPort = dht[closest].split(',')[0].split(':')[1];
    let imageSearchSocket = new net.Socket();
    imageSearchSocket.connect({port:closestPort,host:ip,localAddress:ip/*,localPort:singleton.getPort()*/}, ()=>{
        let pkt = cPTP;
        pkt.init(7,3, folderName, noEmptyDHT(), `${ip}:${orgPeerPort}`, {IT:it, imageNameSize:imageFullName.split('.')[0].length, imageName:imageFullName.split('.')[0]})
        imageSearchSocket.write(pkt.getBytePacket(),()=>{
            console.log(`\nSending kadPTP request message to ${ip}:${closestPort}`)
            imageSearchSocket.destroy();
        })
    })
}

function assignClientName(sock, nickNames) {
    sock.id = sock.remoteAddress + ":" + sock.remotePort;
    startTimestamp[sock.id] = singleton.getTimestamp();
    var name = "Client-" + startTimestamp[sock.id];
    nickNames[sock.id] = name;
    clientIP[sock.id] = sock.remoteAddress;
    clientSockets[sock.id] = sock;
}
    
function bytes2number(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) {
      result ^= array[array.length - i - 1] << (8 * i);
    }
    return result;
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
  
//--------------------------
//parseBitPacket: takes a packet, offest and length to interpret a selcet section of a custom network packet
//--------------------------
function parseBitPacket(packet, offset, length) {
    let number = "";

    for (var i = 0; i < length; i++) {
      let bytePosition = Math.floor((offset + i) / 8);
      let bitPosition = 7 - ((offset + i) % 8);
      let bit = (packet[bytePosition] >> bitPosition) % 2;
      number = (number << 1) | bit;
    }

    return number;
  }

//--------------------------
//bytesToString: takes a buffer array and returns the word value stored in bytes
//--------------------------
function bytesToString(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) result += String.fromCharCode(array[i]);
    return result;
}