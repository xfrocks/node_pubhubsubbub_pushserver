'use strict'

const pusher = exports
const helper = require('../helper')
const _ = require('lodash')

let stats = {}
pusher.setup = function () {
  stats = {}

  return pusher
}

pusher.stats = function () {
  return new Promise((resolve) => {
    resolve({ hms: _.cloneDeep(stats) })
  })
}

pusher.send = function (appId, appSecret, token, message, callback) {
  if (_.isString(token)) {
    token = [token]
  }

  const done = helper.later(callback)
  const payload = {
    message: {
      ...message,
      token
    }
  }

  console.log(appId, appSecret, payload)
  done()
}
