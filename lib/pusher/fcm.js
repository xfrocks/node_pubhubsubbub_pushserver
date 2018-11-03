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

pusher.send = function (projectId, projectConfig, registrationTokens, payload, callback) {
  if (_.isString(registrationTokens)) {
    registrationTokens = [registrationTokens]
  }

  const done = helper.later(callback)

  if (!lib) {
    return done('lib missing')
  }

  if (!_.has(projectConfig, 'client_email')) {
    return done('client_email missing')
  }

  if (!_.has(projectConfig, 'private_key')) {
    return done('private_key missing')
  }

  const app = initializeAppOnce(
    {
      credential: lib.credential.cert({
        projectId,
        clientEmail: projectConfig.client_email,
        privateKey: projectConfig.private_key
      })
    },
    projectId
  )

  // https://firebase.google.com/docs/reference/admin/node/admin.messaging.NotificationMessagePayload
  if (_.has(payload, 'notification') && _.has(projectConfig, 'click_action')) {
    payload.notification.clickAction = projectConfig.click_action
  }

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
      doStats(projectId, result)

      if (result.failed === 0) {
        done(null, result)
      } else {
        done(sendToDeviceError || errors, result)
      }
    })
}

const doStats = function (projectId, result) {
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

const apps = {}
const initializeAppOnce = (options, name) => {
  if (!_.has(apps, name)) {
    apps[name] = lib.initializeApp(options, name)
  }

  return apps[name]
}
