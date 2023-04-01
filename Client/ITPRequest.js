let packet;//the request packet to be sent
let timeStamp = Math.ceil(Math.random()*999);//initialize time with random number between 1 and 999

module.exports = {
  init: function (query, version) {
    let name = query.split('.')[0];//get name of the image
    let ext = query.split('.')[1].toLowerCase();//get extension of the image

    packet = new Buffer.alloc(12 + name.split('').length);//need packet to be dynamic size, needs to fit all the bytes

    let extNum ='';//store extension number
    switch(ext){  //get extension number corresponding to the extension type regardless of case
      case'bmp':
        extNum = 1;
        break;
      case'jpeg':
        extNum = 2;
        break;
      case'gif':
        extNum =3;
        break;
      case'png':
        extNum = 4;
        break;
      case'tiff':
        extNum = 5;
        break;
      default:
        extNum = 15;
    }

    storeBitPacket(packet, version, 0, 4)//store version
    storeBitPacket(packet, 0, 4, 28); //store 0s for the resreved bits and the Request Type fields
    storeBitPacket(packet, timeStamp, 32, 32);//store time
    storeBitPacket(packet, extNum, 64, 4);//store extension number
    storeBitPacket(packet, name.split('').length, 68, 28);//store payload size

    for (let i = 0; i < name.split('').length; i++)//store image name in a dynamic fashion
      storeBitPacket(packet, name.charCodeAt(i), 96+(8*i), 8);
  },

  //--------------------------
  //getBytePacket: returns the entire packet in bytes
  //--------------------------
  getBytePacket: function () {
    return packet;
    ;
  },
};

setInterval(tick, 10);  //call tick every 10s

function tick(){    //tick the timer
    if ((timeStamp >= (Math.pow(2, 32) - 1)) || (timeStamp < 0))//reset time when reach 2^32
        timeStamp = Math.ceil(Math.random()*999);
    timeStamp++;//increase time
}

//// Some usefull methods ////
// Feel free to use them, but DON NOT change or add any code in these methods.

// Convert a given string to byte array
function stringToBytes(str) {
  var ch,
    st,
    re = [];
  for (var i = 0; i < str.length; i++) {
    ch = str.charCodeAt(i); // get char
    st = []; // set up "stack"
    do {
      st.push(ch & 0xff); // push byte to stack
      ch = ch >> 8; // shift value down by 1 byte
    } while (ch);
    // add stack contents to result
    // done because chars have "wrong" endianness
    re = re.concat(st.reverse());
  }
  // return an array of bytes
  return re;
}

// Store integer value into specific bit poistion the packet
function storeBitPacket(packet, value, offset, length) {
  // let us get the actual byte position of the offset
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
