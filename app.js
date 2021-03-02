// docs: https://www.npmjs.com/package/ws#usage-examples
const WebSocket = require('ws');

// 明确需求
// 1.处理业务逻辑   包括端和控制码的映射关系，通过控制码找到用户
// 2.转发SDP和iceCandidate    包括处理客户端请求，主动推送消息给客户端

// 建立服务器
const wss = new WebSocket.Server({ port: 8080 });

// 通过map保存控制码和端的映射关系
const code2ws = new Map();
// 当websocket连接的时候，回调中的ws就相当于项目中的端
wss.on('connection', function connection(ws,req) {
    // 获取remote IP
    // const ip = req.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
    // console.log({ip});
    // 生成6位随机码
    const code = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
    code2ws.set(code, ws);
    // 封装向端发送数据的方法
    ws.sendData = function (event, data) {
        ws.send(JSON.stringify({ event, data }));
    }
    // 封装向端抛出错误的方法
    ws.sendError = function (msg) {
        ws.sendData('error', { msg });
    }
    // An event listener to be called when a message is received from the server.
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        // 约定message格式为{event,data}
        let parsedMessage = {};
        // 调用JSON.parse方法时需要try...catch，因为传来的可能不是标准的JSON对象
        try {
            parsedMessage = JSON.parse(message);
        } catch (error) {
            // 错误处理
            ws.sendError('message invalid');
            console.log('error', error);
            return;
        }
        let { event, data } = parsedMessage;
        if (event === 'login') {
            ws.sendData('login', { code });
        } else if (event === 'control') {
            let remoteCode = +data.remoteCode;
            if (code2ws.has(remoteCode)) {
                ws.sendData('controlled', { remoteCode });
                // 添加端的sendRemote方法用来做转发
                // 这里code2ws.get(remoteCode)返回的ws就相当于傀儡端
                // 调用该方法就会给傀儡端发消息
                ws.sendRemote = code2ws.get(remoteCode).sendData;
                code2ws.get(remoteCode).sendRemote = ws.sendData;
                ws.sendRemote('be-controlled', { remoteCode: code });
            } else {
                ws.sendError('user not found');
            }
        } else if (event === 'forward') {
            // 做转发
            ws.sendRemote(data.event, data.data);
        } else {
            ws.sendError('message not handle', message);
        }
    });
    // An event listener to be called when connection is closed.
    ws.on('close',function close() {
        code2ws.delete(code);
        // 这里需要删除ws.sendRemote，避免循环引用
        ws.sendRemote = null;
        clearTimeout(ws._closeTimeout);
    });
    // 封装定时器，避免长时间连接
    ws._closeTimeout = setTimeout(() => {
        ws.terminate();
    },10 * 1000);
    ws.send('hello');
});
