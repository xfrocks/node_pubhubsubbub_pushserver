'use strict'

const apn = exports
const _ = require('lodash')

let providers = []
let latestPush = null
let pushes = []
apn._reset = function () {
  providers = []
  latestPush = null
  pushes = []
}

apn._getLatestPush = function () {
  return latestPush
}

apn._getPushes = function () {
  return pushes
}

apn._getProviderCount = function () {
  return providers.length
}

apn.Provider = function (options) {
  const provider = this
  this.options = options
  this._hasBeenShutdown = false

  this.send = function (notification, recipients) {
    return new global.Promise(function (fulfill) {
      const result = {sent: [], failed: []}

      _.forEach(recipients, function (recipient) {
        latestPush = {
          provider,
          recipient,
          notification
        }
        pushes.push(latestPush)

        switch (recipient) {
          case 'fail-string':
            result.failed.push({
              device: recipient,
              status: _.has(notification.payload, 'failed_status')
                ? notification.payload.failed_status : 500,
              response: {
                reason: _.has(notification.payload, 'failed_reason')
                  ? notification.payload.failed_reason : 'Reason'
              }
            })
            break
          case 'fail-Error':
            result.failed.push({
              device: recipient,
              error: new Error('Error')
            })
            break
          case 'fail-unknown':
            result.failed.push({device: recipient})
            break
          default:
            result.sent.push(recipient)
        }
      })

      fulfill(result)
    })
  }

  this.shutdown = function () {
    this._hasBeenShutdown = true
  }

  providers.push(this)
}

apn.Notification = function () {
  this.payload = {}
  this.alert = ''
  this.badge = ''
  this.sound = ''

  this.topic = ''
  this.expiry = null
}
