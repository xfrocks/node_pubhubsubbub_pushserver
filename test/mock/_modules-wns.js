'use strict'

const wns = exports
const helper = require('../../lib/helper')
const _ = require('lodash')

let latestPush = null

wns._getLatestPush = function () {
  return latestPush
}

wns.sendRaw = function (channelUri, dataRaw, options, callback) {
  latestPush = { channelUri, dataRaw, options }

  const done = helper.later(callback)
  let error = null
  let result = {
    newAccessToken: 'token-' + Math.random(),
    statusCode: 200
  }

  if (_.has(dataRaw, 'error.message')) {
    const dataError = dataRaw.error
    error = new Error(dataError.message)
    error.newAccessToken = result.newAccessToken
    result = null

    if (_.has(dataError, 'statusCode')) {
      error.statusCode = dataError.statusCode
    }
  }

  done(error, result)
}
