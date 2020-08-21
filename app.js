var   SpeechToTextV1       = require('watson-developer-cloud/speech-to-text/v1');
const TextToSpeechV1       = require('ibm-watson/text-to-speech/v1');
const AssistantV1          = require('ibm-watson/assistant/v1');
const AssistantV2          = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');
var   fs                   = require('fs');
const upload               = require("express-fileupload")
const express              = require('express');
const path = require('path')
const socketio = require('socket.io')
const WavEncoder = require('wav-encoder');
const e = require('express');
const { response } = require('express');
var ss = require('socket.io-stream');

require('dotenv').config();

var tab = ["Jeux", "Wc", "Lavabo"];

const app = express();
app.use(upload())

var http = require('http').Server(app);
var io = require('socket.io')(http);

io.on('connection', (socket) => {
  let sampleRate = 48000
  let buffer = []
  let buffer2 = []
  let sessionId = null;
  console.log("connexion");

  socket.on('start', (data) => {
      buffer = []
      sampleRate = data.sampleRate
      sessionId = data.sessionId
      console.log(`Sample Rate: ${sampleRate}`)
      console.log(`Session Id: ${sessionId}`)
  })

  socket.on('Create sessionId',(data) => {
    const assistant = new AssistantV2({
      version      : '2020-04-01',
      authenticator: new IamAuthenticator({
        apikey: process.env.ASSISTANT_IAM_APIKEY,
      }),
      url: process.env.URL,
    });
  
    assistant.createSession({
      assistantId: process.env.ASSISTANT_ID
    })
      .then(response => {
        console.log(JSON.stringify(response.result, null, 2));
        socket.emit('result', response.result);
      })
      .catch(err => {
        console.log(err);
        socket.emit('result', err);
      });
  })

  socket.on('Delete sessionId', (data) => {
    const assistant = new AssistantV2({
      version      : '2020-04-01',
      authenticator: new IamAuthenticator({
        apikey: process.env.ASSISTANT_IAM_APIKEY,
      }),
      url: process.env.URL,
    });
  
    console.log(data.sessionId)
  
    assistant.deleteSession({
      assistantId: process.env.ASSISTANT_ID,
      sessionId  : data.sessionId,
    })
    .then(response => {
      console.log(JSON.stringify(response.result, null, 2));
      socket.emit('result', "Session Id supprimé avec succes");
    })
    .catch(err => {
      console.log(err);
      socket.emit('result', err);
    });
  })

  socket.on('send_pcm', (data) => {
      // data: { "1": 11, "2": 29, "3": 33, ... }
      const itr = data.values()
      const buf = new Array(data.length)
      for (var i = 0; i < buf.length; i++) {
          buf[i] = itr.next().value
          //console.log("ok");
      }
      buffer = buffer.concat(buf)
  })

  socket.on('STT', async (data, ack) => {
      const f32array = toF32Array(buffer)
     // const f32array = toF32Array(buffer2)
      const filename = `public/wav/${String(Date.now())}.wav`

   await exportWAV(f32array, sampleRate, filename, socket)
   await fSTT(filename, socket);
  })

  socket.on('message', async (data, ack) => {
    const f32array = toF32Array(buffer)
   // const f32array = toF32Array(buffer2)
    const filename = `public/wav/${String(Date.now())}.wav`

    await exportWAV(f32array, sampleRate, filename, socket)
    await fMessage(filename, socket, sessionId);
})
})

// Convert byte array to Float32Array
const toF32Array = (buf) => {
  const buffer = new ArrayBuffer(buf.length)
  const view = new Uint8Array(buffer)
  for (var i = 0; i < buf.length; i++) {
      view[i] = buf[i]
  }
  return new Float32Array(buffer)
}

// data: Float32Array
// sampleRate: number
// filename: string

const fMessage = (filename, socket, sessionId) =>{
  return new Promise(() => {
    const assistant = new AssistantV2({
      authenticator: new IamAuthenticator({ apikey: process.env.ASSISTANT_IAM_APIKEY }),
      url          : process.env.URL,
      version      : '2018-09-19'
    });
    var speechToText = new SpeechToTextV1({
    });
  
    var params = {
      audio       : fs.createReadStream(filename),
      content_type: 'audio/wav',
      'model'     : 'fr-FR_BroadbandModel',
    };
  
  speechToText.recognize(params).then(result => {
      console.log(result.results[0].alternatives[0].transcript);
      assistant.message(
        {input: { text: result.results[0].alternatives[0].transcript },
        workspaceId: process.env.ASSISTANT_WORKSPACE_ID,
        assistantId: process.env.ASSISTANT_ID,
        sessionId  : sessionId})
        .then(response => {
          const textToSpeech = new TextToSpeechV1({
          });

          var str = "";
        response.result.output.generic.forEach(element => {

        if (element.response_type === 'text'){
        //  console.log(element.text);
          str +=  /*'\n' +*/ element.text;
        }
        else if (element.response_type === 'option'){
        //  console.log(element.title)
          str += '\n' + element.title;
          element.options.forEach(element =>{
            str += '\n' + element.label;
         //   console.log(element.label);
          })
        }
      });
      console.log(str);
      if (str === "True"){
      //  console.log(result.results[0].alternatives[0].transcript);
        str = findLightName(result.results[0].alternatives[0].transcript);
      }
          
          const params = {
            // text: response.result.output.text[0],
            text  : str,
            voice : 'fr-FR_ReneeVoice',
            accept: 'audio/wav'
          };

          textToSpeech
          .synthesize(params)
          .then(response => {
            const audio = response.result;
            return textToSpeech.repairWavHeaderStream(audio);
          })
          .then(repairedFile => {
            var stream = ss.createStream();

            fs.writeFileSync('audio.wav', repairedFile);
            console.log('audio.wav est écrit avec un wav header correct');
            ss(socket).emit('resultatAudio', stream); 
            fs.createReadStream('audio.wav').pipe(stream);
          })
          .catch(err => {
            console.log(err);
            socket.emit('resultat', err)
          });

      console.log(response.result.output);
      socket.emit('resultat', str);
        //  res.status(200).json(str)
       //   return JSON.stringify(response.result, null, 2)
        })
        .catch(err => {
         // res.status(400).json("La session a expiré");
          console.log(err);
          socket.emit('resultat', err)
          return err
        });
  }).catch(e => {
    console.log(e);
    socket.emit('resultat', e)
    return e;
  })
})
}

const fSTT = (filename, socket) => {
  return new Promise(() => {
    var speechToText = new SpeechToTextV1({
    });
  
    var params = {
      audio       : fs.createReadStream(filename),
      content_type: 'audio/wav',
      'model'     : 'fr-FR_BroadbandModel',
    };
  
  speechToText.recognize(params).then(result => {
      console.log(result.results[0].alternatives[0].transcript);
      socket.emit('resultat', result.results[0].alternatives[0].transcript)
    return result.results[0].alternatives[0].transcript;
  }).catch(e => {
    socket.emit('resultat', e)
    return e;
  })
})
}

const exportWAV = async (data, sampleRate, filename, socket) => {
  const audioData = {
      sampleRate: sampleRate,
      channelData: [data]
  }
  await WavEncoder.encode(audioData).then((buffer) => {
      fs.writeFile(filename, Buffer.from(buffer), (e) => {
          if (e) {
              console.log(e)
          } else {
              console.log(`Successfully saved ${filename}`)
          }
      })
  })
}

// app.listen(8000, function (){
//   console.log("Listening port 8000");
// });

http.listen(3000, function(){
  console.log("Server running on 3000")
})

// app.get("/", function(req, res){
//   res.sendFile(__dirname + '/index.html');
// })

// io.on('connection', function(socket){
//   console.log('a user is connected');
//   socket.on('disconnect', function (){
//       console.log('a user is disconnected');
//   })
//   socket.on('chat message', function (msg){
//       console.log('message recu : ' + msg);
//       io.emit('chat message', msg);
//   })

//   socket.on('TTS2', function (audio){
//    // let audio = req.files.audioFile.name;

//     let read = fs.createReadStream(audio);
//     let size = audio.size;
  
//     read.on('data', (chunk) => {
//       let progress;
  
//       progress += chunk.length;
//       console.log("Jai lu " + Math.round(100 + progress / size) + "%")
//     })
  
//     read.on('end', () => {
//       console.log("fini !!");
//     })
//   })
// })

// app.post('/deleteSessionId', function (req, res){

//   const assistant = new AssistantV2({
//     version      : '2020-04-01',
//     authenticator: new IamAuthenticator({
//       apikey: process.env.ASSISTANT_IAM_APIKEY,
//     }),
//     url: process.env.URL,
//   });

//   console.log(req.body.session_id)

//   assistant.deleteSession({
//     assistantId: process.env.ASSISTANT_ID,
//     sessionId  : req.body.session_id,
//   })
//     .then(response => {
//       console.log(JSON.stringify(response.result, null, 2));
//       res.status(200).json(response.result);
//     })
//     .catch(err => {
//       console.log(err);
//       res.status(400).json(err);
//     });
// })

// app.post('/createSessionId', function (req, res){

//   const assistant = new AssistantV2({
//     version      : '2020-04-01',
//     authenticator: new IamAuthenticator({
//       apikey: process.env.ASSISTANT_IAM_APIKEY,
//     }),
//     url: process.env.URL,
//   });

//   assistant.createSession({
//     assistantId: process.env.ASSISTANT_ID
//   })
//     .then(response => {
//       console.log(JSON.stringify(response.result, null, 2));
//       res.status(200).json(response.result);
//     })
//     .catch(err => {
//       console.log(err);
//       res.status(400).json();
//     });
// })

// app.post('/sendMessage', function (req, res) {
//   const assistant = new AssistantV2({
//     authenticator: new IamAuthenticator({ apikey: process.env.ASSISTANT_IAM_APIKEY }),
//     url          : process.env.URL,
//     version      : '2018-09-19'
//   });

//     let audio = req.files.audioFile.name;

//     console.log(audio);

//     var speechToText = new SpeechToTextV1({
//     });

//     var params = {
//       audio       : fs.createReadStream(audio),
//       content_type: 'audio/wav',
//       'model'     : 'fr-FR_BroadbandModel',
//     };

//     function test(){
//   return speechToText.recognize(params)
//   }

//   test().then(result => {
//     assistant.message(
//             {input: { text: result.results[0].alternatives[0].transcript },
//             workspaceId: process.env.ASSISTANT_WORKSPACE_ID,
//             assistantId: process.env.ASSISTANT_ID,
//             sessionId  : req.body.session_id})
//             .then(response => {

//               const textToSpeech = new TextToSpeechV1({
//               });

//               var str = "";
//             response.result.output.generic.forEach(element => {

//             if (element.response_type === 'text'){
//             //  console.log(element.text);
//               str +=  /*'\n' +*/ element.text;
//             }
//             else if (element.response_type === 'option'){
//             //  console.log(element.title)
//               str += '\n' + element.title;
//               element.options.forEach(element =>{
//                 str += '\n' + element.label;
//              //   console.log(element.label);
//               })
//             }
//           });
//           console.log(str);
//           if (str === "True"){
//           //  console.log(result.results[0].alternatives[0].transcript);
//             str = findLightName(result.results[0].alternatives[0].transcript);
//           }
              
//               const params = {
//                 // text: response.result.output.text[0],
//                 text  : str,
//                 voice : 'fr-FR_ReneeVoice',
//                 accept: 'audio/wav'
//               };

//               textToSpeech
//               .synthesize(params)
//               .then(response => {
//                 const audio = response.result;
//                 return textToSpeech.repairWavHeaderStream(audio);
//               })
//               .then(repairedFile => {
//                 fs.writeFileSync('audio.wav', repairedFile);
//                 console.log('audio.wav est écrit avec un wav header correct');
//               })
//               .catch(err => {
//                 console.log(err);
//               });

//           console.log(response.result.output);
//               res.status(200).json(str)
//               return JSON.stringify(response.result, null, 2)
//             })
//             .catch(err => {
//               res.status(400).json("La session a expiré");
//               console.log(err);
//               return err
//             });
//   })
// })


// app.post('/STT2', function(req, res){

//   let audio = req.files.audioFile.name;

//   let read = fs.createReadStream(audio);
//   let size = audio.size;

//   read.on('data', (chunk) => {
//     let progress;

//     progress += chunk.length;
//     console.log("Jai lu " + Math.round(100 + progress / size) + "%")
//   })

//   read.on('end', () => {
//     console.log("fini !!");
//   })
// })

// app.post('/STT', function (req, res) {

//   let audio = req.files.audioFile.name;

//   console.log(audio);

//   var speechToText = new SpeechToTextV1({
//   });

//   var params = {
//     audio       : fs.createReadStream(audio),
//     content_type: 'audio/wav',
//     'model'     : 'fr-FR_BroadbandModel',
//   };

//   function test(){
//   return speechToText.recognize(params)
//   }

  
//   test().then(result => {
//     console.log(JSON.stringify(result.results[0].alternatives[0].transcript))
//     res.status(200).json(result.results[0].alternatives[0].transcript)
//     return (JSON.stringify(result.results[0].alternatives[0].transcript));
//   }).catch(err => {
//     console.log(err);
//     res.status(400).json(err)
//   });
// });

// app.post('/TTS', function(req, res){
//   let text = req.body.text

//   console.log(text);
//     const textToSpeech = new TextToSpeechV1({
//   });
  
//   const params = {
//     text  : text,
//     voice : 'fr-FR_ReneeVoice',
//     accept: 'audio/wav'
//   };

//   textToSpeech
//     .synthesize(params)
//     .then(response => {
//       const audio = response.result;
//       return textToSpeech.repairWavHeaderStream(audio);
//     })
//     .then(repairedFile => {
//       fs.writeFileSync('audio_TTS.wav', repairedFile);
//       console.log('audio_TTS.wav est écrit avec un wav header correct');
//       res.status(200).json('audio.wav est écrit avec un wav header correct')
//     })
//     .catch(err => {
//       console.log(err);
//       res.status(400).json(err);
//     });
// })

function findLightName(name){
  tab.forEach(element => {
      if (element.trim().toLowerCase() === name.trim().toLowerCase()) {
        console.log("allume la lumière");
        return
       }
  });
  return "Aucune lumière de ce nom n'est disponible"
}

module.exports = app;