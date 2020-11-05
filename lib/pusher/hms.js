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

pusher.send = function (appId, appSecret, registrationTokens, payloadWithOptions, callback) {
  if (_.isString(registrationTokens)) {
    registrationTokens = [registrationTokens]
  }

  const done = helper.later(callback)

  console.log(appId, appSecret, registrationTokens, payloadWithOptions)
  done()
}
