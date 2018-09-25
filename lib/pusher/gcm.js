'use strict'

const pusher = exports
const helper = require('../helper')
const _ = require('lodash')

let config
let lib
let stats = {}
pusher.setup = function (_config, _lib) {
  config = _config
  lib = _lib
  stats = {}

  return pusher
}

pusher.stats = function () {
  return new Promise((resolve) => {
    resolve({ gcm: _.cloneDeep(stats) })
  })
}

pusher.send = function (senderOptions, registrationTokens, data, callback) {
  if (_.isString(registrationTokens)) {
    registrationTokens = [registrationTokens]
  }

  const done = helper.later(callback)

  if (!lib) {
    return done('lib missing')
  }

  if (!_.has(senderOptions, 'apiKey') || !senderOptions.apiKey) {
    return done('apiKey missing')
  }

  const sender = new lib.Sender(senderOptions.apiKey)
  const message = new lib.Message(config.gcm.messageOptions)
  message.addData(data)
  const recipient = { registrationTokens }

  sender.sendNoRetry(message, recipient, function (err, libResult) {
    const errors = {}
    const result = { sent: 0, failed: 0, retries: [], invalids: [] }

    if (_.isNumber(err) && !_.inRange(err, 400, 500)) {
      result.retries = registrationTokens
    }

    if (_.has(libResult, 'success')) {
      result.sent = parseInt(libResult.success)
    }

    if (_.has(libResult, 'failure')) {
      result.failed = parseInt(libResult.failure)
    }

    if (_.has(libResult, 'results') &&
        libResult.results.length === registrationTokens.length
    ) {
      _.forEach(libResult.results, function (one, i) {
        const registrationToken = registrationTokens[i]

        if (!_.has(one, 'error')) {
          if (!libResult.success) {
            result.sent++
          }
          return
        }

        errors[registrationToken] = one
        if (!libResult.failure) {
          result.failed++
        }

        // https://developers.google.com/cloud-messaging/http-server-ref#error-codes
        switch (one.error) {
          case 'Unavailable':
          case 'InternalServerError':
            result.retries.push(registrationToken)
            break
            // case 'DeviceMessageRate Exceeded':
            // case 'TopicsMessageRate Exceeded':
            // TODO: slow down
            // break;
          case 'MissingRegistration':
          case 'InvalidRegistration':
          case 'NotRegistered':
          case 'InvalidPackageName':
          case 'MismatchSenderId':
            result.invalids.push(registrationToken)
            break
        }
      })
    }

    doStats(senderOptions, result)

    if (!err && result.failed === 0) {
      done()
    } else {
      return done(err || errors, result)
    }
  })
}

const doStats = function (senderOptions, result) {
  const packageId = _.has(senderOptions, 'packageId')
    ? senderOptions.packageId : senderOptions.apiKey

  if (!_.has(stats, packageId)) {
    stats[packageId] = {
      batch: 0,
      sent: 0,
      failed: 0,
      invalid: 0
    }
  }

  stats[packageId].batch++
  stats[packageId].sent += result.sent
  stats[packageId].failed += result.failed
  stats[packageId].invalid += result.invalids.length
}
