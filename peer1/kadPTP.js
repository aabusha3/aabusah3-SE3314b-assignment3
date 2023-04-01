module.exports = {
    header: "", //bytestream of the custom packet header
    payload: "", //bytestream of the custom packet payload
  
    //--------------------------
    //init: create custom packet based on passed parameters 
    //--------------------------
    init: function (ver, msgType, sName, data, orgPeerInfo=null, imageInfo=null) {//imageInfo={IT:'', imageNameSize:0, imageName:''}
      // if(msgType === 4){
      //   this.header = new Buffer.alloc();//actual header size

      //   storeBitPacket(this.header, ver, 0, 4);//add response type
      //   storeBitPacket(this.header, msgType, 4, 8);// add message type
      //   storeBitPacket(this.header, 0, 12, 8);// number of peers
      //   storeBitPacket(this.header, sName.length, 20, 12);//sender name length

      //   for (let i = 0; i < sName.length; i++)//store image name in a dynamic fashion
      //     storeBitPacket(this.header, sName.charCodeAt(i), 32+(8*i), 8);


      //   this.payload = new Buffer.alloc(12 + imageInfo.imageNameSize); //size of payload; accounts for 6 byte irregularity

      //   //get peer info
      //   let peerIP = orgPeerInfo.split(':')[0].split('.');

      //   //get the individual numbers of the ipv4 and port
      //   let ip0 = parseInt(peerIP[0]);
      //   let ip8 = parseInt(peerIP[1]);
      //   let ip16 = parseInt(peerIP[2]);
      //   let ip24 = parseInt(peerIP[3]);
      //   let peerPort = orgPeerInfo.split(':')[1];
        
      //   //reserve 2 bytes for every new peer
      //   storeBitPacket(this.payload, ip0, 0, 8);
      //   storeBitPacket(this.payload, ip8, 8, 8);
      //   storeBitPacket(this.payload, ip16, 16, 8);
      //   storeBitPacket(this.payload, ip24, 24, 8);
      //   storeBitPacket(this.payload, parseInt(peerPort), 32, 16);
      // }
      //else 
      if(msgType === 3){
        const headerSize = 4+sName.length;//4 bytes + account for name length
        const r = headerSize % 4;//add padding to header to start payload on new 4 byte line
        this.header = new Buffer.alloc(headerSize + (r===0?r:(4-r)));//actual header size

        storeBitPacket(this.header, ver, 0, 4);//add response type
        storeBitPacket(this.header, msgType, 4, 8);// add message type
        storeBitPacket(this.header, 0, 12, 8);// number of peers
        storeBitPacket(this.header, sName.length, 20, 12);//sender name length

        for (let i = 0; i < sName.length; i++)//store image name in a dynamic fashion
          storeBitPacket(this.header, sName.charCodeAt(i), 32+(8*i), 8);


        this.payload = new Buffer.alloc(12 + imageInfo.imageNameSize); //size of payload; accounts for 6 byte irregularity

        //get peer info
        let peerIP = orgPeerInfo.split(':')[0].split('.');

        //get the individual numbers of the ipv4 and port
        let ip0 = parseInt(peerIP[0]);
        let ip8 = parseInt(peerIP[1]);
        let ip16 = parseInt(peerIP[2]);
        let ip24 = parseInt(peerIP[3]);
        let peerPort = orgPeerInfo.split(':')[1];
        
        //reserve 2 bytes for every new peer
        storeBitPacket(this.payload, ip0, 0, 8);
        storeBitPacket(this.payload, ip8, 8, 8);
        storeBitPacket(this.payload, ip16, 16, 8);
        storeBitPacket(this.payload, ip24, 24, 8);
        storeBitPacket(this.payload, parseInt(peerPort), 32, 16);

        storeBitPacket(this.payload, parseInt(imageInfo.IT), 64, 4);
        storeBitPacket(this.payload, parseInt(imageInfo.imageNameSize), 68, 28);
        for (let i = 0; i < imageInfo.imageNameSize; i++)//store image imageInfo.imageName in a dynamic fashion
          storeBitPacket(this.payload, imageInfo.imageName.charCodeAt(i), 96+(8*i), 8);         
      }   
      else if(msgType===1 || msgType===2){
        const headerSize = 4+sName.length;//4 bytes + account for name length
        const r = headerSize % 4;//add padding to header to start payload on new 4 byte line
        this.header = new Buffer.alloc(headerSize + (r===0?r:(4-r)));//actual header size
        
        storeBitPacket(this.header, ver, 0, 4);//add response type
        storeBitPacket(this.header, msgType, 4, 8);// add message type
        storeBitPacket(this.header, data.length, 12, 8);// number of peers
        storeBitPacket(this.header, sName.length, 20, 12);//sender name length

        for (let i = 0; i < sName.length; i++)//store image name in a dynamic fashion
          storeBitPacket(this.header, sName.charCodeAt(i), 32+(8*i), 8);
        
        
        this.payload = new Buffer.alloc(data.length*8); //size of payload; accounts for 6 byte irregularity

        if(data.length > 0){
          for (let i = 0; i < data.length; i++){
            //get peer info
            let peerAddressAndPort = data[i].split(',')[0];
            let peerIP = peerAddressAndPort.split(':')[0].split('.');

            //get the individual numbers of the ipv4 and port
            let ip0 = parseInt(peerIP[0]);
            let ip8 = parseInt(peerIP[1]);
            let ip16 = parseInt(peerIP[2]);
            let ip24 = parseInt(peerIP[3]);
            let peerPort = peerAddressAndPort.split(':')[1];
            
            //reserve 2 bytes for every new peer
            storeBitPacket(this.payload, ip0, i*64, 8);
            storeBitPacket(this.payload, ip8, i*64 + 8, 8);
            storeBitPacket(this.payload, ip16, i*64 + 16, 8);
            storeBitPacket(this.payload, ip24, i*64 + 24, 8);
            storeBitPacket(this.payload, parseInt(peerPort), i*64 + 32, 16);
          }
        }
      }
    },
  
    //--------------------------
    //getBytePacket: returns the entire packet in bytes
    //--------------------------
    getBytePacket: function () {
      let packet = new Buffer.alloc(this.header.length + this.payload.length);

      for (var h = 0; h < this.header.length; h++) packet[h] = this.header[h];//add header bytes

      for (var p = 0; p < this.payload.length; p++) packet[p + this.header.length] = this.payload[p];//add payload bytes
  
      return packet;//the full packet
    },
  };

//--------------------------
//storeBitPacket: stores a value into a byte packet in a specified spot
//--------------------------
function storeBitPacket(packet, value, offset, length) {
  let lastBitPosition = offset + length - 1;
  let number = value.toString(2);
  let j = number.length - 1;
  for (var i = 0; i < number.length; i++) {
    let bytePosition = Math.floor(lastBitPosition / 8);
    let bitPosition = 7 - (lastBitPosition % 8);
    if (number.charAt(j--) == "0") {
      packet[bytePosition] &= ~(1 << bitPosition);
    } else {
      packet[bytePosition] |= 1 << bitPosition;
    }
    lastBitPosition--;
  }
}