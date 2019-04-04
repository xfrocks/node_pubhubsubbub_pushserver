'use strict'

const pusher = exports

let latestPush = null
let pushes = []
pusher._reset = function () {
  pushes = []
}

pusher._getLatestPush = function () {
  return latestPush
}

pusher._getPushes = function () {
  return pushes
}

const mock = function (push, hint, callback) {
  latestPush = push
  pushes.push(push)

  let err = null
  const result = { retries: push.deviceIds, invalids: [] }

  switch (hint) {
    case 'error':
      err = 'Error'
      break
    case 'Error':
      err = new Error('Message')
      break
    case 'Array':
      err = ['error']
      break
    case 'Exception':
      throw new Error('Message')
    case 'retry1':
      err = 'retry1-Error'
      if (pushes.length > 1) {
        result.retries = []
      }
      break
    case 'invalid':
    case 'invalid2':
      err = 'invalid'
      result.retries = []
      result.invalids = push.deviceIds
      break
  }

  callback(err, result)
}

pusher.apn = function (connectionOptions, tokens, payload, callback) {
  mock({
    type: 'apn',
    deviceIds: tokens,
    connectionOptions,
    tokens,
    payload
  }, tokens[0], callback)
}

pusher.fcm = (projectId, projectConfig, registrationTokens, payload, callback) =>
  mock({
    type: 'fcm',
    deviceIds: registrationTokens,
    projectId,
    projectConfig,
    registrationTokens,
    payload
  }, registrationTokens[0], callback)

pusher.gcm = function (senderOptions, registrationIds, data, callback) {
  mock({
    type: 'gcm',
    deviceIds: registrationIds,
    senderOptions,
    registrationIds,
    data
  }, registrationIds[0], callback)
}

pusher.wns = function (clientId, clientSecret, channelUri, dataRaw, callback) {
  mock({
    type: 'wns',
    deviceIds: [],
    clientId: clientId,
    clientSecret: clientSecret,
    channelUri: channelUri,
    dataRaw: dataRaw
  }, channelUri, callback)
}
