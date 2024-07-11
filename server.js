const {driver} = require('@rocket.chat/sdk');
const axios = require('axios');

// Environment Setup
const ROCKETCHAT_HOST = process.env.ROCKETCHAT_HOST;
const ROCKETCHAT_USER = process.env.ROCKETCHAT_USER;
const ROCKETCHAT_PWD = process.env.ROCKETCHAT_PWD;
const ROCKETCHAT_BOTNAME = process.env.ROCKETCHAT_BOTNAME;
const ROCKETCHAT_SSL = process.env.ROCKETCHAT_SSL === 'true';
const ROCKETCHAT_ROOMS = process.env.ROCKETCHAT_ROOMS.split(',');
const ROCKETCHAT_BOT_MODE_RESPONDING = process.env.ROCKETCHAT_BOT_MODE_RESPONDING;
const JAN_HOST = process.env.JAN_HOST;
const JAN_MODEL = process.env.JAN_MODEL;
let myUserId;
const messages = [];
const waitingMessages = [
    'Je vais vous répondre dans un instant 😎',
    'Je suis en train de chercher une réponse 🔎',
    'Je réfléchis... 🧠',
    'J\'active mes neurones 🤯',
];

// Bot configuration
const runbot = async () => {
    const conn = await driver.connect({host: ROCKETCHAT_HOST, useSsl: ROCKETCHAT_SSL})
    myUserId = await driver.login({username: ROCKETCHAT_USER, password: ROCKETCHAT_PWD});

    const roomsJoined = await driver.joinRooms(ROCKETCHAT_ROOMS);
    console.log('joined rooms');

    const subscribed = await driver.subscribeToMessages();
    console.log('subscribed');

    const msgloop = await driver.reactToMessages(processMessages);
    console.log('connected and waiting for messages');

    const sent = await driver.sendToRoom(ROCKETCHAT_BOTNAME + ' is listening ...', ROCKETCHAT_ROOMS[0]);
    console.log('Greeting message sent');
}

// Process messages
const processMessages = async (err, message, messageOptions) => {
    const singleMessage = [];
    let msg = "";
    let sendResponse = true;
    if (!err) {

        // if not a message or the bot's own message, ignore it
        if (message.u._id === myUserId) sendResponse = false;

        // if in canal mode or direct message mode
        if (ROCKETCHAT_ROOMS.includes(messageOptions.roomName)) {
            // if in only_mentions responding mode
            if (ROCKETCHAT_BOT_MODE_RESPONDING === 'only_mentions') {
                sendResponse = message.mentions?.some(mention => mention.username === ROCKETCHAT_BOTNAME) || false;

                if (sendResponse)
                    singleMessage.push({
                        "content": message.msg.replace('@' + ROCKETCHAT_BOTNAME, ''),
                        "role": "user"
                    });
            } else {
                if (sendResponse)
                    singleMessage.push({
                        "content": message.msg,
                        "role": "user"
                    });
            }
        } else {
            if(sendResponse) {
                if (messages[message.u._id] === undefined) {
                    messages[message.u._id] = [];
                }
                messages[message.u._id].push({
                    "content": message.msg,
                    "role": "user"
                },)
            }
        }

        if(!sendResponse) return;

        // get room name
        const roomname = await driver.getRoomName(message.rid);

        // send waiting message
        await driver.sendToRoomId(waitingMessages[(Math.floor(Math.random() * waitingMessages.length))], message.rid);

        // send message to jan model
        await axios.post(JAN_HOST + '/v1/chat/completions', {
            "messages": singleMessage.length > 0 ? singleMessage : messages[message.u._id ],
            "model": JAN_MODEL,
            "stream": true,
            "max_tokens": 2048,
            "stop": [
                "hello"
            ],
            "frequency_penalty": 0,
            "presence_penalty": 0,
            "temperature": 0.7,
            "top_p": 0.95
        })
            .then(function (response) {
                // handle success
                response.data.split("data: ").forEach(item => {
                    try {
                        msg += JSON.parse(item).choices[0].delta.content;
                    } catch (error) {}
                });
            })

        // remove <s> and </s> tags
        msg = msg.replace("</s>", '');

        if(singleMessage.length === 0) {
            messages[message.u._id ].push({
                "content": msg,
                "role": "assistant"
            },);
        }

        // send response message
        await driver.sendToRoomId(msg, message.rid);

        console.log(messages);

    }
}

runbot()
    .then(r => console.log('bot is running'))
    .catch(e => console.error(e));
