'use strict'

const pusher = exports
const helper = require('../helper')
const debug = require('debug')('pushserver:pusher:fcm')
const _ = require('lodash')

let lib
let stats = {}
pusher.setup = function (_config, _lib) {
  // config = _config
  lib = _lib
  stats = {}

  return pusher
}

pusher.stats = function () {
  return new Promise((resolve) => {
    resolve({ fcm: _.cloneDeep(stats) })
  })
}

pusher.send = function (appConfig, registrationTokens, payload, callback) {
  if (_.isString(registrationTokens)) {
    registrationTokens = [registrationTokens]
  }

  const done = helper.later(callback)

  if (!lib) {
    return done('lib missing')
  }

  if (!_.has(appConfig, 'projectId') || !appConfig.projectId) {
    return done('appConfig.projectId missing')
  }

  const app = lib.initializeApp(appConfig, appConfig.packageId)

  let sendToDeviceError
  const errors = {}
  const result = { sent: 0, failed: 0, retries: [], invalids: [] }

  app.messaging().sendToDevice(registrationTokens, payload)
    .then((response) => {
      // https://firebase.google.com/docs/reference/admin/node/admin.messaging.MessagingDevicesResponse

      result.sent = response.successCount
      result.failed = response.failureCount

      response.results.forEach((result, i) => {
        // https://firebase.google.com/docs/reference/admin/node/admin.messaging.MessagingDeviceResult
        const registrationToken = registrationTokens[i]

        if (!_.isUndefined(result.error)) {
          const resultError = result.error
          errors[registrationToken] = resultError

          // https://firebase.google.com/docs/reference/admin/node/admin.FirebaseError
          // https://firebase.google.com/docs/cloud-messaging/admin/errors
          switch (resultError.code) {
            case 'messaging/internal-error':
            case 'messaging/server-unavailable':
              result.retries.push(registrationToken)
              break
            case 'messaging/device-message-rate-exceeded':
            case 'messaging/message-rate-exceeded':
              // TODO: slow down
              debug('sendToDevice token error', registrationToken, resultError)
              break
            case 'messaging/authentication-error':
            case 'messaging/invalid-apns-credentials':
            case 'messaging/invalid-recipient':
            case 'messaging/invalid-registration-token':
            case 'messaging/mismatched-credential':
            case 'messaging/registration-token-not-registered':
              result.invalids.push(registrationToken)
              break
          }
        }
      })
    })
    .catch((error) => {
      // TODO: check error code?
      sendToDeviceError = error
      result.failed = registrationTokens.length
      debug('sendToDevice error', sendToDeviceError)
      result.retries = registrationTokens
    })
    .finally(() => {
      doStats(appConfig, result)

      if (sendToDeviceError === null && result.failed === 0) {
        done()
      } else {
        done(sendToDeviceError || errors, result)
      }
    })
}

const doStats = function (appConfig, result) {
  const projectId = appConfig.projectId

  if (!_.has(stats, projectId)) {
    stats[projectId] = {
      batch: 0,
      sent: 0,
      failed: 0,
      invalid: 0
    }
  }

  stats[projectId].batch++
  stats[projectId].sent += result.sent
  stats[projectId].failed += result.failed
  stats[projectId].invalid += result.invalids.length
}
