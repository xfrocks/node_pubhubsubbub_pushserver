'use strict'

const pusher = exports
const helper = require('../helper')
const _ = require('lodash')

let lib
let accessTokens = {}
let stats = {}
pusher.setup = function (_lib) {
  lib = _lib
  accessTokens = {}
  stats = {}

  return pusher
}

pusher.stats = function () {
  return new Promise((resolve) => {
    resolve({ wns: _.cloneDeep(stats) })
  })
}

pusher.send = function (clientId, clientSecret, channelUri, dataRaw, callback) {
  const done = helper.later(callback)

  if (!lib) {
    return done('lib missing')
  }

  if (!clientId) {
    return done('clientId missing')
  }

  if (!clientSecret) {
    return done('clientSecret missing')
  }

  const options = {
    client_id: clientId,
    client_secret: clientSecret
  }
  if (_.isString(accessTokens[clientId])) {
    options.accessToken = accessTokens[clientId]
  }

  lib.sendRaw(channelUri, dataRaw, options, function (err, result) {
    if (!result) {
      result = {}
    }

    if (err) {
      if (err.newAccessToken) {
        accessTokens[clientId] = err.newAccessToken
      }
      if (err.statusCode) {
        // https://msdn.microsoft.com/en-us/library/windows/apps/hh465435.aspx#send_notification_response
        const statusCode = parseInt(err.statusCode)
        if (_.inRange(statusCode, 400, 500)) {
          result.retry = false
        }
        switch (statusCode) {
          case 404:
          case 410:
            result.deleteDevice = true
            break
          case 406:
            // TODO: slow down
            break
        }
      }
    }

    if (result.newAccessToken) {
      accessTokens[clientId] = result.newAccessToken
    }

    doStats(clientId, err, result)

    return done(err, result)
  })
}

const doStats = function (clientId, err, result) {
  if (!_.has(stats, clientId)) {
    stats[clientId] = {
      sent: 0,
      failed: 0,
      invalid: 0
    }
  }

  if (err) {
    stats[clientId].failed++
  } else {
    stats[clientId].sent++
  }

  if (_.has(result, 'deleteDevice') && result.deleteDevice) {
    stats[clientId].invalid++
  }
}
