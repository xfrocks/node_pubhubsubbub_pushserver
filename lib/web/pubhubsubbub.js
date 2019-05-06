'use strict'

const pubhubsubbub = exports
const config = require('../config')
const helper = require('../helper')
const debug = require('debug')('pushserver:web')
const _ = require('lodash')
const request = require('request')
const url = require('url')
const stats = {
  subscribe: 0,
  unsubscribe: 0,
  unregister: 0,
  callback: {
    get: 0,
    post: 0
  },
  auto_unsubscribe: 0
}

pubhubsubbub.setup = function (app, prefix, db, pushQueue) {
  app.get(prefix + '/', function (req, res) {
    res.send('Hi, I am ' + pubhubsubbub._getCallbackUri(req, prefix))
  })

  if (!db) {
    return pubhubsubbub
  }

  app.post(prefix + '/subscribe', function (req, res) {
    stats.subscribe++

    const requiredKeys = []
    requiredKeys.push('device_type')
    requiredKeys.push('device_id')
    requiredKeys.push('oauth_client_id')
    requiredKeys.push('hub_uri')
    const data = helper.prepareSubscribeData(req.body, req.query, requiredKeys)
    if (!data.has_all_required_keys) {
      debug('POST /subscribe', 'data missing', data.missing_keys)
      return res.sendStatus(400)
    }

    const saveDevice = function () {
      db.devices.save(
        data.device_type, data.device_id,
        data.oauth_client_id, data.hub_topic,
        data.extra_data, function (isSaved) {
          if (isSaved !== false) {
            saveHub()
          } else {
            return res.sendStatus(500)
          }
        }
      )
    }

    const saveHub = function () {
      db.hubs.save(
        data.oauth_client_id,
        data.hub_uri,
        {},
        function (isSaved) {
          if (isSaved !== false) {
            sendPostRequestToHub()
          } else {
            return res.sendStatus(500)
          }
        })
    }

    const sendPostRequestToHub = function () {
      if (data.hub_topic.length === 0) {
        const statusNoContent = 204
        debug('POST /subscribe', data.device_type, data.device_id,
          data.hub_uri, 'N/A')
        return res.sendStatus(statusNoContent)
      }

      request.post({
        url: data.hub_uri,
        form: {
          'hub.callback': pubhubsubbub._getCallbackUri(req, prefix),
          'hub.mode': 'subscribe',
          'hub.topic': data.hub_topic,

          'client_id': data.oauth_client_id,
          'oauth_token': data.oauth_token
        }
      }, function (err, httpResponse, body) {
        if (httpResponse) {
          const success = _.inRange(httpResponse.statusCode, 200, 300)
          const txt = success ? 'succeeded' : (body || 'failed')

          debug('POST /subscribe', data.device_type, data.device_id,
            data.hub_uri, data.hub_topic, txt)
          return res.status(httpResponse.statusCode).send(txt)
        } else {
          debug('POST /subscribe', data.device_type, data.device_id,
            data.hub_uri, data.hub_topic, err)
          return res.sendStatus(503)
        }
      })
    }

    saveDevice()
  })

  app.post(prefix + '/unsubscribe', function (req, res) {
    stats.unsubscribe++

    const requiredKeys = []
    requiredKeys.push('hub_uri')
    requiredKeys.push('hub_topic')
    requiredKeys.push('oauth_client_id')
    requiredKeys.push('device_type')
    requiredKeys.push('device_id')
    const data = helper.prepareSubscribeData(req.body, req.query, requiredKeys)
    if (!data.has_all_required_keys) {
      debug('POST /unsubscribe', 'data missing', data.missing_keys)
      return res.sendStatus(400)
    }

    const deleteDevice = function () {
      db.devices.delete(
        data.device_type, data.device_id,
        data.oauth_client_id, data.hub_topic,
        function (isDeleted) {
          if (isDeleted !== false) {
            sendPostRequestToHub()
          } else {
            return res.sendStatus(500)
          }
        }
      )
    }

    const sendPostRequestToHub = function () {
      request.post({
        url: data.hub_uri,
        form: {
          'hub.callback': pubhubsubbub._getCallbackUri(req, prefix),
          'hub.mode': 'unsubscribe',
          'hub.topic': data.hub_topic,

          'oauth_token': data.oauth_token,
          'client_id': data.oauth_client_id
        }
      }, function (err, httpResponse, body) {
        if (httpResponse) {
          const success = _.inRange(httpResponse.statusCode, 200, 300)
          const txt = success ? 'succeeded' : (body || 'failed')

          debug('POST /unsubscribe', data.device_type, data.device_id,
            data.hub_uri, data.hub_topic, txt)
          return res.status(httpResponse.statusCode).send(txt)
        } else {
          debug('POST /unsubscribe', data.device_type, data.device_id,
            data.hub_uri, data.hub_topic, err)
          return res.sendStatus(503)
        }
      })
    }

    deleteDevice()
  })

  app.post(prefix + '/unregister', function (req, res) {
    stats.unregister++

    const requiredKeys = []
    requiredKeys.push('oauth_client_id')
    requiredKeys.push('device_type')
    requiredKeys.push('device_id')
    const data = helper.prepareSubscribeData(req.body, req.query, requiredKeys)
    if (!data.has_all_required_keys) {
      debug('POST /unregister', 'data missing', data.missing_keys)
      return res.sendStatus(400)
    }

    db.devices.delete(
      data.device_type, data.device_id,
      data.oauth_client_id, null,
      function (isDeleted) {
        debug('POST /unregister', data.device_type, data.device_id,
          data.oauth_client_id, isDeleted)

        if (isDeleted !== false) {
          return res.send('succeeded')
        } else {
          return res.sendStatus(500)
        }
      }
    )
  })

  app.get(prefix + '/callback', function (req, res) {
    stats.callback.get++

    const parsed = url.parse(req.url, true)

    if (!parsed.query.client_id) {
      debug('GET /callback', '`client_id` is missing')
      return res.sendStatus(401)
    }
    const clientId = parsed.query.client_id

    if (!parsed.query['hub.challenge']) {
      debug('GET /callback', '`hub.challenge` is missing')
      return res.sendStatus(403)
    }

    if (!parsed.query['hub.mode']) {
      debug('GET /callback', '`hub.mode` is missing')
      return res.sendStatus(404)
    }
    const hubMode = parsed.query['hub.mode']

    const hubTopic = parsed.query['hub.topic'] || ''

    db.devices.findDevices(clientId, hubTopic, function (devices) {
      const isSubscribe = (hubMode === 'subscribe')
      const devicesFound = devices.length > 0

      if (isSubscribe !== devicesFound) {
        debug('GET /callback', 'Devices not found', clientId, hubTopic)
        return res.sendStatus(405)
      }

      return res.send(parsed.query['hub.challenge'])
    })
  })

  if (!pushQueue) {
    return
  }

  app.post(prefix + '/callback', function (req, res) {
    stats.callback.post++

    let error = false

    _.forEach(req.body, function (ping) {
      if (!_.isObject(ping)) {
        debug('POST /callback', 'Unexpected data in callback', ping)
        error = true
        return false
      }

      const requiredKeys = ['client_id', 'topic', 'object_data']
      if (!_.every(requiredKeys, _.partial(_.has, ping))) {
        debug('POST /callback', 'Insufficient data', _.keys(ping))
        error = true
        return false
      }

      db.devices.findDevices(
        ping.client_id,
        ping.topic,
        function (devices) {
          if (devices.length === 0) {
            pubhubsubbub._findHubToUnsubscribe(
              ping.client_id,
              ping.topic,
              db,
              pubhubsubbub._getCallbackUri(req, prefix),
              function (err) {
                debug('POST /callback', 'Devices not found',
                  ping.client_id, ping.topic, err)
              }
            )
            return
          }

          const deviceGroups = []
          _.forEach(devices, function (device) {
            let addedToGroup = false
            _.forEach(deviceGroups, function (deviceGroup) {
              if (deviceGroup.type !== device.device_type) {
                return
              }

              if (!_.isEqual(deviceGroup.data, device.extra_data)) {
                return
              }

              deviceGroup.ids.push(device.device_id)
              addedToGroup = true
              return false
            })

            if (addedToGroup) {
              return
            }
            const newDeviceGroup = {
              type: device.device_type,
              ids: [device.device_id],
              data: device.extra_data
            }
            deviceGroups.push(newDeviceGroup)
          })

          _.forEach(deviceGroups, function (deviceGroup) {
            pushQueue.enqueue(
              deviceGroup.type,
              deviceGroup.ids,
              ping.object_data,
              _.merge({
                _ping__client_id: ping.client_id,
                _ping__topic: ping.topic
              }, deviceGroup.data)
            )
          })
        })
    })

    return res.sendStatus(error ? 200 : 202)
  })

  return pubhubsubbub
}

pubhubsubbub.stats = function () {
  return new Promise((resolve) => {
    resolve({ web: _.cloneDeep(stats) })
  })
}

pubhubsubbub._getCallbackUri = function (req, prefix) {
  if (config.web.callback) {
    return config.web.callback
  }

  return req.protocol + '://' + req.get('host') + prefix + '/callback'
}

pubhubsubbub._findHubToUnsubscribe = function (
  oauthClientId,
  hubTopic,
  db,
  callbackUri,
  callback
) {
  const findHub = function () {
    db.hubs.findHub(oauthClientId, function (hub) {
      if (hub === null) {
        return done('Hub not found')
      }

      unsubscribe(hub)
    })
  }

  const unsubscribe = function (hub) {
    let count = hub.hub_uri.length

    _.forEach(hub.hub_uri, function (hubUri) {
      request.post({
        url: hubUri,
        form: {
          'hub.callback': callbackUri,
          'hub.mode': 'unsubscribe',
          'hub.topic': hubTopic,
          'client_id': oauthClientId
        }
      }, function (err, httpResponse, body) {
        if (httpResponse) {
          const success = _.inRange(httpResponse.statusCode, 200, 300)
          const txt = success ? 'succeeded' : (body || 'failed')
          if (txt !== 'succeeded') {
            err = 'failed'
          }

          stats.auto_unsubscribe++
          debug('Auto-unsubscribe', hubUri, hubTopic, txt)
        } else {
          debug('Error auto-unsubscribe', hubUri, hubTopic, err)
        }

        count--
        if (count === 0) {
          if (hub.hub_uri.length === 1) {
            done(err)
          } else {
            done()
          }
        }
      })
    })
  }

  const done = helper.later(callback)

  findHub()
}
