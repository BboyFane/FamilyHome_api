var SpeechToTextV1 = require('watson-developer-cloud/speech-to-text/v1');
const TextToSpeechV1 = require('ibm-watson/text-to-speech/v1');
const AssistantV1 = require('ibm-watson/assistant/v1');
const { IamAuthenticator } = require('ibm-watson/auth');
var fs = require('fs');
const upload = require("express-fileupload")
const express = require('express');
require('dotenv').config();

const app = express();
app.use(upload())

app.listen(8000);

app.post('/test', function (req, res) {
    const assistant = new AssistantV1({
    authenticator: new IamAuthenticator({ apikey: process.env.ASSISTANT_IAM_APIKEY }),
     url : process.env.URL,
      version: '2018-02-16'
    });

    let audio = req.files.audioFile.name;

    console.log(audio);

    var speechToText = new SpeechToTextV1({
    });

    var params = {
      audio: fs.createReadStream(audio),
      content_type: 'audio/mp3',
      'model': 'fr-FR_BroadbandModel',
    };

    function test(){
  return speechToText.recognize(params)
  }

  test().then(result => {
    assistant.message(
            {input: { text: result.results[0].alternatives[0].transcript },workspaceId: '8bf6678c-f2dc-462c-ab4b-0dcfb802c550'})
            .then(response => {

              const textToSpeech = new TextToSpeechV1({
              });
              
              const params = {
                text: response.result.output.text[0],
                voice: 'fr-FR_ReneeVoice',
                accept: 'audio/wav'
              };

              textToSpeech
              .synthesize(params)
              .then(response => {
                const audio = response.result;
                return textToSpeech.repairWavHeaderStream(audio);
              })
              .then(repairedFile => {
                fs.writeFileSync('audio.wav', repairedFile);
                console.log('audio.wav est écrit avec un wav header correct');
              })
              .catch(err => {
                console.log(err);
              });

              console.log(response.result.output.text[0]);
              res.status(200).json(response.result.output.text[0])
              return JSON.stringify(response.result, null, 2)
            })
            .catch(err => {
              console.log(err);
              return err
            });
  })
})

app.post('/uploadAudio', function (req, res) {

  let audio = req.files.audioFile.name;

  console.log(audio);

  var speechToText = new SpeechToTextV1({
  });

  var params = {
    audio: fs.createReadStream(audio),
    content_type: 'audio/mp3',
    'model': 'fr-FR_BroadbandModel',
  };

  function test(){
  return speechToText.recognize(params)
  }

  
  test().then(result => {
    console.log(JSON.stringify(result.results[0].alternatives[0].transcript))
    res.status(200).json(result.results[0].alternatives[0].transcript)
    return (JSON.stringify(result.results[0].alternatives[0].transcript));
  })
});

app.post('/uploadText', function(req, res){
  let text = req.body.text

  console.log(text);
    const textToSpeech = new TextToSpeechV1({
  });
  
  const params = {
    text: text,
    voice: 'fr-FR_ReneeVoice',
    accept: 'audio/wav'
  };

  textToSpeech
    .synthesize(params)
    .then(response => {
      const audio = response.result;
      return textToSpeech.repairWavHeaderStream(audio);
    })
    .then(repairedFile => {
      fs.writeFileSync('audio.wav', repairedFile);
      console.log('audio.wav est écrit avec un wav header correct');
      res.status(200).json('audio.wav est écrit avec un wav header correct')
    })
    .catch(err => {
      console.log(err);
    });
})

module.exports = app;