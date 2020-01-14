'use strict'

const pusher = exports
const config = require('./config')
const _ = require('lodash')

pusher.setup = function (_apn, _firebaseAdmin, _gcm, _wns) {
  pusher._apnPusher = null
  if (_apn) {
    pusher._apnPusher = require('./pusher/apn').setup(config, _apn)
  }

  pusher._fcmPusher = null
  if (_firebaseAdmin) {
    pusher._fcmPusher = require('./pusher/fcm').setup(config, _firebaseAdmin)
  }

  pusher._gcmPusher = null
  if (_gcm) {
    pusher._gcmPusher = require('./pusher/gcm').setup(config, _gcm)
  }

  pusher._wnsPusher = null
  if (_wns) {
    pusher._wnsPusher = require('./pusher/wns').setup(_wns)
  }

  return pusher
}

pusher.setupDefault = function () {
  return pusher.setup(
    require('apn'),
    require('firebase-admin'),
    require('node-gcm'),
    require('wns')
  )
}

pusher.stats = function () {
  const promises = []
  if (pusher._apnPusher) {
    promises.push(pusher._apnPusher.stats())
  }
  if (pusher._fcmPusher) {
    promises.push(pusher._fcmPusher.stats())
  }
  if (pusher._gcmPusher) {
    promises.push(pusher._gcmPusher.stats())
  }
  if (pusher._wnsPusher) {
    promises.push(pusher._wnsPusher.stats())
  }

  return Promise.all(promises).then((all) => {
    const pusher = {}

    _.forEach(all, (one) => {
      _.merge(pusher, one)
    })

    return { pusher }
  })
}

pusher.apn = function (connectionOptions, token, payload, callback) {
  return pusher._apnPusher.send(connectionOptions, token, payload, callback)
}

pusher.fcm = function (projectId, projectConfig, registrationTokens, payload, callback) {
  return pusher._fcmPusher.send(projectId, projectConfig, registrationTokens, payload, callback)
}

pusher.gcm = function (senderOptions, registrationTokens, payload, callback) {
  return pusher._gcmPusher.send(senderOptions, registrationTokens, payload, callback)
}

pusher.wns = function (clientId, clientSecret, channelUri, dataRaw, callback) {
  return pusher._wnsPusher.send(clientId, clientSecret,
    channelUri, dataRaw, callback)
}
