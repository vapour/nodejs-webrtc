nodejs-webrtc
=============

nodejs+websocket实现的webrtc视频demo，支持房间功能和刷新重新连接

经测试在pc版Chrome/Firefox/Opera, Android系统的Chrome/Firefox正常，IOS还不支持，其它浏览器未测试。

运行环境：

1 需要在电脑上安装nodejs

2 然后在npm上安装express和socket.io

  npm install -g express
  
  npm install -g socket.io
  
3 在命令行中到下载的webrtc目录运行

  node server.js

4 在chrome浏览器中打开http://localhost:8080/index.htm?id=2

  id表示房间号，手机chrome进入同一个房间，这样就可以实现电脑和手机的实时视频了

