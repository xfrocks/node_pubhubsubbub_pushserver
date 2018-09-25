'use strict'

const gcm = exports
const _ = require('lodash')

let latestPush = null
let pushes = []
gcm._reset = function () {
  latestPush = null
  pushes = []
}

gcm._getLatestPush = function () {
  return latestPush
}

gcm._getPushes = function () {
  return pushes
}

gcm.Sender = function (apiKey) {
  const sender = this

  this.sendNoRetry = function (message, recipient, callback) {
    const response = {
      success: 0,
      failure: 0,
      results: []
    }

    const messageData = message._getData()
    if (_.has(messageData, 'error')) {
      return callback(messageData.error)
    }

    _.forEach(recipient.registrationTokens, function (registrationToken, i) {
      latestPush = {
        sender,
        message,
        registrationToken
      }

      let responseError = null
      let responseResult = {
        message_id: 'm' + i
      }
      const errorMatch = registrationToken.match(/^error-(.+)$/)
      if (errorMatch) {
        responseError = errorMatch[1]
      }
      if (responseError !== null) {
        responseResult = { error: responseError }
      }

      if (apiKey !== 'ak-no-counter') {
        response.success += responseError !== null ? 0 : 1
        response.failure += responseError !== null ? 1 : 0
      }
      response.results.push(responseResult)
      pushes.push(latestPush)
    })

    return callback(null, response)
  }

  this._getApiKey = function () {
    return apiKey
  }
}

gcm.Message = function (options) {
  this.options = options
  const data = {}

  this.addData = function (newData) {
    _.merge(data, newData)
  }

  this._getData = function () {
    return data
  }
}
