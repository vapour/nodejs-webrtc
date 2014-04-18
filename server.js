var express = require('express');
var socket = require('socket.io');

var app = express();
app.configure(function() {
    app.use(express.static(__dirname));
    app.use(express.favicon());
});

var io = socket.listen(app.listen(8080));
var clients = [];
io.sockets.on('connection', function (socket) {
    var roomId, room;
    socket.on('send', function (data) {
        switch (data.type) {
            case 'enterroom':
                console.log('enterroom');
                roomId = data.roomId;
                room = clients[roomId] = clients[roomId] || [];
                if (room.length < 2) {
                    room.push(socket);
                    room.forEach(function(client) {
                        if(client != socket) {
                            client.emit('message', data);
                            socket.emit('message', {
                                type: 'enterroom',
                                guest: true
                            });
                        }
                    });
                } else {
                    socket.emit('message', {
                        type: 'error',
                        msg: '房间人数已经满了，请进入其它房间'
                    });
                }
                break;
            /**
             * When a user send a SDP message
             * broadcast to all users in the room
             */
            case "candidate" : 
            case "offer" : 
            case "answer" :
                clients[roomId].forEach(function(client) {
                    if(client != socket) {
                        client.emit('message', data);
                    }
                });
            break;
        }
    });

    socket.on('disconnect', function (data) {
        var arr = clients[roomId], delIndex;
        if (arr) {
            arr.forEach(function (obj, index) {
                if (obj== socket) {
                    delIndex = index;
                }
            });
            arr.splice(delIndex, 1);
            if (arr.length == 0) {
                clients[roomId] = null;
            } else {
                arr[0].emit('message', {
                    type: 'leaveroom'
                });
            }
        }

    });
});
