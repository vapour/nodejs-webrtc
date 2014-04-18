define(function (require, exports, module) {
    var $ = require('$');
    require('./adapter');

    var webRTCUtil = {
        mergeConstraints: function (cons1, cons2) {
            var merged = cons1;
            for (var name in cons2.mandatory) {
                merged.mandatory[name] = cons2.mandatory[name];
            }
            merged.optional.concat(cons2.optional);
            return merged;
        },
        preferOpus: function (sdp) {
            var sdpLines = sdp.split('\r\n');
            var mLineIndex = null;

            // Search for m line.
            // m=audio 1 RTP/SAVPF 111 103 104 0 8 106 105 13 126
            for (var i = 0; i < sdpLines.length; i++) {
                if (sdpLines[i].search('m=audio') !== -1) {
                    mLineIndex = i;
                    break;
                }
            }
            if (mLineIndex === null) return sdp;

            // If Opus is available, set it as the default in m line.
            for (var i = 0; i < sdpLines.length; i++) {
                //a=rtpmap:111 opus/48000/2
                if (sdpLines[i].search('opus/48000') !== -1) {
                    //111
                    var opusPayload = this.extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);

                    if (opusPayload)
                        sdpLines[mLineIndex] = this.setDefaultCodec(sdpLines[mLineIndex], opusPayload);
                    break;
                }
            }

            // Remove CN in m line and sdp.
            sdpLines = this.removeCN(sdpLines, mLineIndex);

            sdp = sdpLines.join('\r\n');
            return sdp;

        },
        extractSdp: function (sdpLine, pattern) {
            /*
             * sdpLine a=rtpmap:111 opus/48000/2
             */
            var result = sdpLine.match(pattern);
            //result [":111 opus/48000", "111"]
            return (result && result.length == 2)? result[1]: null;
        },
        // Set the selected codec to the first in m line.
        setDefaultCodec: function (mLine, payload) {
            /*
             * mLine    m=audio 1 RTP/SAVPE 111 103 104 0 8 126
             * payload  111
             *
             */
            var elements = mLine.split(' ');
            var newLine = [];
            var index = 0;
            for (var i = 0; i < elements.length; i++) {
                if (index === 3) // Format of media starts from the fourth.
                    newLine[index++] = payload; // Put target payload to the first.
                if (elements[i] !== payload)
                    newLine[index++] = elements[i];
            }
            return newLine.join(' ');
        },
        // Strip CN from sdp before CN constraints is ready.
        removeCN: function (sdpLines, mLineIndex) {
            // m=audio 1 RTP/SAVPF 111 103 104 0 8 106 105 13 126
            var mLineElements = sdpLines[mLineIndex].split(' ');
            // Scan from end for the convenience of removing an item.
            /*
                a=rtpmap:103 ISAC/16000
                a=rtpmap:104 ISAC/32000
                a=rtpmap:0 PCMU/8000
                a=rtpmap:8 PCMA/8000
                a=rtpmap:106 CN/32000
                a=rtpmap:105 CN/16000
                a=rtpmap:13 CN/8000
                a=rtpmap:126 telephone-event/8000
             */
            for (var i = sdpLines.length-1; i >= 0; i--) {
                var payload = this.extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
                if (payload) {
                    var cnPos = mLineElements.indexOf(payload);
                    if (cnPos !== -1) {
                        // Remove CN payload from m line.
                        mLineElements.splice(cnPos, 1);
                    }
                    // Remove CN line in sdp
                    sdpLines.splice(i, 1);
                }
            }

            sdpLines[mLineIndex] = mLineElements.join(' ');
            return sdpLines;
        }
    };

    var fnErr = function (ev) { console.log('err', ev);};
    var parseURL = function (url) {
        var a =  document.createElement('a');
        a.href = url;
        return {
            source: url,
            protocol: a.protocol.replace(':',''),
            host: a.hostname,
            port: a.port,
            query: a.search,
            params: (function(){
                var ret = {},
                seg = a.search.replace(/^\?/,'').split('&'),
                len = seg.length, i = 0, s;
                for (;i<len;i++) {
                    if (!seg[i]) { continue; }
                    s = seg[i].split('=');
                    ret[s[0]] = s[1];
                }
                return ret;
            })(),
            file: (a.pathname.match(/\/([^\/?#]+)$/i) || [,''])[1],
            hash: a.hash.replace('#',''),
            path: a.pathname.replace(/^([^\/])/,'/$1')
        };
    }

    var config = {
        pc_config: {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]},
        pc_constraints: {"optional": [{"DtlsSrtpKeyAgreement": true}]},
        sdpConstraints: {
            mandatory: {
                OfferToReceiveAudio: true,
                OfferToReceiveVideo: true
            }
        }
    };
    var socket = io.connect('http://' + location.host),
        guest = false, localStream,
        vidLocal, vidRemote,
        roomId, started;

    var webRTC = {
        init: function () {
            vidLocal = $('#vidLocal');
            vidRemote = $('#vidRemote');

            socket.on('message', function (data) {
                webRTC.handleMessages(data);
            });
            
            this.getUserMedia();
        },
        handleMessages: function (data) {
            switch(data.type) {
                case 'enterroom': //进入房间
                    if (data.guest === true) {
                        guest = true;
                        localStream && webRTC.call();
                    }
                    break;
                case 'leaveroom': //离开房间
                    started = false; 
                    guest = false;
                    break;
                case "candidate" :
                    console.log('receive candidate');
                    var candidate = new RTCIceCandidate({
                        sdpMLineIndex:data.label,
                        candidate:data.candidate
                    });
                    console.log(candidate);
                    pc1.addIceCandidate(candidate);
                    break;
                case "offer" :
                    console.log('receive offer');
                    // Callee creates PeerConnection
                    if (!config.guest && !started) webRTC.call();

                    pc1.setRemoteDescription(new RTCSessionDescription(data));
                    webRTC.createAnswer();
                    break;
                case "answer" :
                    console.log('receive answer');
                    pc1.setRemoteDescription(new RTCSessionDescription(data));
                    break;
                case 'error':
                    alert(data.msg);
                    break;
                
            }
        },
        getUserMedia: function () {
            getUserMedia({
                audio: true,
                video: true
            }, function (stream) {
                attachMediaStream(vidLocal[0], stream);
                localStream = stream;

                if (guest) {
                    webRTC.call();
                }
            }, function () {});
        },
        call: function () {
            if (started) return;

            started = true;

            pc1 = new RTCPeerConnection(config.pc_config, config.pc_constraints);

            pc1.onicecandidate = function (ev) {
                if (ev.candidate) {
                    console.log('send candidate');
                    socket.emit('send', {
                        type: 'candidate',
                        label: event.candidate.sdpMLineIndex,
                        id: event.candidate.sdpMid,
                        candidate: event.candidate.candidate
                    });
                }
            };

            pc1.onaddstream = function (ev) {
                attachMediaStream(vidRemote[0], ev.stream);
            }
            pc1.addStream(localStream);

            if (guest) {
                webRTC.createOffer();
            }
        },
        createAnswer: function () {
            pc1.createAnswer(function (sd) {
                console.log('create answer');
                webRTC.setLocalAndSendMessage(sd);
            }, fnErr, config.sdpConstraints);
        },
        //客人发起视频请求
        createOffer: function () {
            pc1.createOffer(function (sd) {
                console.log('create offer');
                webRTC.setLocalAndSendMessage(sd);
            }, fnErr, config.sdpConstraints);
        },
        setLocalAndSendMessage: function (sessionDescription) {
            // Set Opus as the preferred codec in SDP if Opus is present.
            sessionDescription.sdp = webRTCUtil.preferOpus(sessionDescription.sdp);
            pc1.setLocalDescription(sessionDescription);
            socket.emit('send', sessionDescription);
        }
    };

    
    module.exports = {
        enterRoom: function () {
            var params = parseURL(window.location.href).params;
            roomId = params.id;

            webRTC.init();
            socket.emit('send', {"type" : "enterroom", "roomId" : roomId});
        }
    };
});
