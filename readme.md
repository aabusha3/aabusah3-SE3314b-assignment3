* what happens if there are no peers in the dht to forward to (tested)
* what happens if the image doesnt exist in the network (tested)
* how do I make sure I dont keep searching in a loop (tested)
* formatting?
* pad 4 vs pad 8
* why does peer 2 connect twice to peer 1 in the demo pics
* why does peer 1 store peer 2's dht before sending the welcome packet, but doesnt do the same for other peers

Inorder for this to run properly, 1 peer must be declaired a host peer by running node KADpeer without any arguments
Wait for client to announce itself to be a server before running the command to join new peers, announcement looks like: '127.0.0.1:XXXX is now a server'
singleton.js has been change to enforece m=160 instead of m=320
Create as many host folders as m=160