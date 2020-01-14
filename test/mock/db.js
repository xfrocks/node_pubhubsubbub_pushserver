'use strict'

const db = exports
const _ = require('lodash')

let devices = {}
let hubs = {}
let projects = {}

db.devices = {

  _reset: function () {
    devices = {}
  },

  _devicesLength: function () {
    return _.keys(devices).length
  },

  save: function (deviceType, deviceId, oauthClientId,
    hubTopic, extraData, callback) {
    const mock = function () {
      if (deviceId === 'error') {
        return done(false)
      }

      const key = deviceType + deviceId + oauthClientId
      if (_.has(devices, key)) {
        const device = devices[key]
        if (device.hub_topic.indexOf(hubTopic) === -1) {
          device.hub_topic.push(hubTopic)
        }
        device.extra_data = _.assign({}, device.extra_data, extraData)

        return done('updated')
      } else {
        devices[key] = {
          device_type: deviceType,
          device_id: deviceId,
          oauth_client_id: oauthClientId,
          hub_topic: [hubTopic],
          extra_data: extraData
        }

        return done('saved')
      }
    }

    const done = function (result) {
      callback(result)
    }

    mock()
  },

  findDevices: function (oauthClientId, hubTopic, callback) {
    const results = _.filter(devices, function (device) {
      if (device.oauth_client_id !== oauthClientId) {
        return false
      }

      if (_.isString(hubTopic) && hubTopic.length > 0) {
        return _.includes(device.hub_topic, hubTopic)
      } else {
        return true
      }
    })

    callback(results)
  },

  delete: function (deviceType, deviceId, oauthClientId, hubTopic, callback) {
    const mock = function () {
      if (deviceId === 'error') {
        return done(false)
      }

      let result = false
      let updatedDevices = {}

      if (!oauthClientId || !hubTopic) {
        // delete device
        updatedDevices = _.pickBy(devices, function (device) {
          if (device.device_type !== deviceType) {
            // keep this device
            return true
          }

          if (device.device_id !== deviceId) {
            // keep this device
            return true
          }

          if (oauthClientId &&
            device.oauth_client_id !== oauthClientId) {
            // keep this device
            return true
          }

          result = 'deleted'
          return false
        })
      } else {
        // update device
        _.forEach(devices, function (device, key) {
          if (device.device_type === deviceType &&
            device.device_id === deviceId &&
            device.oauth_client_id === oauthClientId) {
            device.hub_topic = _.without(device.hub_topic, hubTopic)
            result = 'updated'
          }

          updatedDevices[key] = device
        })
      }

      devices = updatedDevices

      return done(result)
    }

    const done = function (result) {
      callback(result)
    }

    mock()
  }
}

db.hubs = {

  _reset: function () {
    hubs = {}
  },

  save: function (oauthClientId, hubUri, extraData, callback) {
    const mock = function () {
      if (hubUri === 'http://err.or/hub') {
        return done(false)
      }

      const key = oauthClientId
      if (_.has(hubs, key)) {
        const hub = hubs[key]
        if (hub.hub_uri.indexOf(hubUri) === -1) {
          hub.hub_uri.push(hubUri)
        }
        hub.extra_data = _.assign({}, hub.extra_data, extraData)

        return done('updated')
      } else {
        hubs[key] = {
          oauth_client_id: oauthClientId,
          hub_uri: [hubUri],
          extra_data: extraData
        }

        return done('saved')
      }
    }

    const done = function (result) {
      callback(result)
    }

    mock()
  },

  findHub: function (oauthClientId, callback) {
    const hub = _.has(hubs, oauthClientId) ? hubs[oauthClientId] : null
    callback(hub)
  }
}

db.projects = {

  _reset: function () {
    projects = {}
  },

  saveApn: function (
    bundleId,
    tokenKey,
    tokenKeyId,
    tokenTeamId,
    production,
    callback
  ) {
    const configuration = {
      token: {
        key: tokenKey,
        keyId: tokenKeyId,
        teamId: tokenTeamId
      },
      production: production
    }

    return this.save('apn', bundleId, configuration, callback)
  },

  saveFcm: function (projectId, clientEmail, privateKey, callback) {
    return this.save(
      'fcm',
      projectId,
      {
        client_email: clientEmail,
        private_key: privateKey
      },
      callback
    )
  },

  saveGcm: function (packageId, apiKey, callback) {
    return this.save('gcm', packageId, { api_key: apiKey }, callback)
  },

  saveWns: function (packageId, clientId, clientSecret, callback) {
    return this.save('wns', packageId, {
      client_id: clientId,
      client_secret: clientSecret
    }, callback)
  },

  save: function (projectType, projectId, configuration, callback) {
    const mock = function () {
      if (projectId === 'error') {
        return done(false)
      }

      const key = projectType + projectId
      if (_.has(projects, key)) {
        const project = projects[key]
        project.configuration = _.assign({},
          project.configuration, configuration)
        project.last_updated = Date.now()

        return done('updated')
      } else {
        projects[key] = {
          _id: _.keys(projects).length + 1,
          project_type: projectType,
          project_id: projectId,
          configuration: configuration,
          created: new Date(),
          last_updated: new Date()
        }

        return done('saved')
      }
    }

    const done = function (result) {
      callback(result)
    }

    mock()
  },

  findProject: function (projectType, projectId, callback) {
    let found = null

    _.forEach(projects, function (project) {
      if (project.project_type === projectType &&
        project.project_id === projectId) {
        found = project
        return false
      }
    })

    callback(found)
  },

  findConfig: function (projectType, projectId, callback) {
    this.findProject(projectType, projectId, function (project) {
      if (project) {
        callback(project.configuration)
      } else {
        callback(null)
      }
    })
  }
}
