'use strict'

const pusher = exports
const helper = require('../helper')
const debug = require('debug')('pushserver:pusher:apn')
const _ = require('lodash')

let config
let lib
let connections = {}
let connectionCount = 0
let stats = {}
pusher.setup = function (_config, _lib) {
  config = _config
  lib = _lib
  connections = {}
  connectionCount = 0
  stats = {}

  return pusher
}

pusher.stats = function () {
  return new Promise((resolve) => {
    resolve({ apn: _.cloneDeep(stats) })
  })
}

pusher.send = function (connectionOptions, tokens, payload, callback) {
  if (_.isString(tokens)) {
    tokens = [tokens]
  }

  const done = helper.later(callback)

  if (!lib) {
    return done('lib missing')
  }

  const connection = createConnection(connectionOptions)
  if (connection === null) {
    return done('Unable to create connection')
  }

  const notification = createNotification(connectionOptions, payload)
  if (notification === null) {
    return done('Unable to create notification')
  }

  return connection.provider.send(notification, tokens)
    .then(function (libResult) {
      let errors = {}
      let result = { sent: 0, failed: 0, retries: [], invalids: [] }

      if (_.has(libResult, 'sent')) {
        result.sent = libResult.sent.length
      }

      if (_.has(libResult, 'failed')) {
        result.failed = libResult.failed.length

        _.forEach(libResult.failed, function (failed, i) {
          const device = _.has(failed, 'device') ? failed.device : i
          errors[device] = failed

          if (_.has(failed, 'response.reason')) {
            errors[device].error = failed.response.reason

            // https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html#//apple_ref/doc/uid/TP40008194-CH11-SW2
            switch (failed.response.reason) {
              case 'BadDeviceToken':
              case 'DeviceTokenNotForTopic':
              case 'TopicDisallowed':
              case 'Unregistered':
                result.invalids.push(failed.device)
                break
                  // case 'TooManyRequests':
                    // TODO: slow down
                  // break;
            }
          }

          if (_.has(failed, 'status')) {
            if (!_.inRange(parseInt(failed.status), 400, 500)) {
              result.retries.push(failed.device)
            }
          }
        })
      }

      doStats(connection, result)

      if (libResult.failed.length === 0) {
        done()
      } else {
        return done(errors, result)
      }
    })
}

pusher._getActiveConnectionIds = function () {
  return _.keys(connections)
}

pusher._cleanUpConnections = function (ttlInMs) {
  const cutoff = _.now() - ttlInMs

  connections = _.pickBy(connections, function (c) {
    if (c.lastUsed < cutoff) {
      debug('Shutting down connection', c.id)
      c.provider.shutdown()
      return false
    }

    // keep this connection
    return true
  })
}

const createConnection = function (connectionOptions) {
  if (!_.has(connectionOptions, 'packageId')) {
    return null
  }

  const hasCert = _.has(connectionOptions, 'cert')
  const hasTokenKey = _.has(connectionOptions, 'token.key')
  if (!hasCert && !hasTokenKey) {
    return null
  } else if (hasCert && hasTokenKey) {
    return null
  }

  let connectionId = -1
  const now = _.now()
  // do not re-use connection that has been idle for too long
  // https://github.com/node-apn/node-apn/issues/449
  const idleCutOff = now - (config.apn.connectionTtlInMs || 2700000)
  _.forEach(connections, function (connection) {
    if (connection.lastUsed < idleCutOff) {
      return
    }

    if (connection.options.packageId !== connectionOptions.packageId) {
      return
    }

    const existingHasCert = _.has(connection.options, 'cert')
    const thisHasCert = _.has(connectionOptions, 'cert')
    if (existingHasCert !== thisHasCert ||
          (
            existingHasCert &&
            connection.options.cert !== connectionOptions.cert
          )
    ) {
      return
    }

    const existingHasTokenKey = _.has(connection.options, 'token.key')
    const thisHasTokenKey = _.has(connectionOptions, 'token.key')
    if (existingHasTokenKey !== thisHasTokenKey ||
          (
            existingHasTokenKey &&
            connection.options.token.key !== connectionOptions.token.key
          )
    ) {
      return
    }

    connectionId = connection.id
  })

  if (connectionId === -1) {
    if (config.apn.connectionTtlInMs > 0) {
      pusher._cleanUpConnections(config.apn.connectionTtlInMs)
    }

    const provider = new lib.Provider(connectionOptions)
    const ac = {
      id: connectionCount++,
      options: connectionOptions,

      provider: provider,
      lastUsed: now
    }

    connections[ac.id] = ac
    connectionId = ac.id
    debug('New connection', connectionId, connectionOptions.packageId)
  } else {
    connections[connectionId].lastUsed = now
  }

  return connections[connectionId]
}

const createNotification = function (connectionOptions, payload) {
  const notification = new lib.Notification()
  notification.payload = _.omit(payload, ['aps', 'expiry'])
  notification.topic = connectionOptions.packageId

  let setSomething = false
  if (_.has(payload, 'aps.alert')) {
    notification.alert = payload.aps.alert
    setSomething = true
  }

  if (_.has(payload, 'aps.badge')) {
    notification.badge = payload.aps.badge
    setSomething = true
  }

  if (_.has(payload, 'aps.sound')) {
    notification.sound = payload.aps.sound
  } else if (_.has(config, 'apn.notificationOptions.sound')) {
    notification.sound = config.apn.notificationOptions.sound
  } else if (_.has(payload, 'aps.alert')) {
    notification.sound = 'default'
  }

  if (_.has(payload, 'expiry')) {
    notification.expiry = payload.expiry
  } else if (_.has(config, 'apn.notificationOptions.expiry')) {
    notification.expiry = config.apn.notificationOptions.expiry
  } else {
    // attempt to push once unless specified otherwise
    notification.expiry = 0
  }

  if (!setSomething) {
    return null
  }

  return notification
}

const doStats = function (connection, result) {
  const bundleId = connection.options.packageId

  if (!_.has(stats, bundleId)) {
    stats[bundleId] = {
      batch: 0,
      sent: 0,
      failed: 0,
      invalid: 0
    }
  }

  stats[bundleId].batch++
  stats[bundleId].sent += result.sent
  stats[bundleId].failed += result.failed
  stats[bundleId].invalid += result.invalids.length
}
