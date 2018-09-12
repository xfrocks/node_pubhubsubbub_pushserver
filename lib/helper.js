'use strict'

const helper = exports
const debug = require('debug')('pushserver:helper')
const _ = require('lodash')
const string = require('string')
const url = require('url')

helper.stripHtml = function (html) {
  return string(html).stripTags().trim().s
}

helper.prepareApnMessage = function (originalMessage) {
  let message = ''

  if (originalMessage.length > 230) {
    message = originalMessage.substr(0, 229) + '…'
    debug('prepareApnMessage', originalMessage, '->', message)
  } else {
    message = originalMessage
  }

  return message
}

helper.prepareApnPayload = function (dataPayload) {
  const apnPayload = {aps: {alert: ''}, data: {}}

  if (_.has(dataPayload, 'notification_id') &&
      dataPayload.notification_id > 0 &&
      _.has(dataPayload, 'notification_html') &&
      dataPayload.notification_html
  ) {
    const message = helper.stripHtml(dataPayload.notification_html)
    apnPayload.aps.alert = helper.prepareApnMessage(message)
    apnPayload.data.notification_id = dataPayload.notification_id
  } else if (_.has(dataPayload, 'message') && _.isObject(dataPayload.message)) {
    const convoMessage = dataPayload.message
    if (_.has(convoMessage, 'conversation_id')) {
      apnPayload.data.conversation_id = convoMessage.conversation_id
    }
    if (_.has(convoMessage, 'message_id')) {
      apnPayload.data.message_id = convoMessage.message_id
    }
    if (_.has(dataPayload, 'creator_username') && _.has(convoMessage, 'message')) {
      const message = dataPayload.creator_username + ': ' + convoMessage.message
      apnPayload.aps.alert = helper.prepareApnMessage(message)
    }
  }

  if (!apnPayload.aps.alert) {
    debug('prepareApnPayload', 'apnPayload.aps.alert is empty')
    return null
  }

  if (_.has(dataPayload, 'user_unread_notification_count')) {
    apnPayload.aps.badge = dataPayload.user_unread_notification_count
  }

  if (_.has(dataPayload, 'notification_type')) {
    apnPayload.data.notification_type = dataPayload.notification_type
  }

  return apnPayload
}

helper.prepareApnConnectionOptions = function (packageId, config) {
  const connectionOptions = {
    packageId
  }

  _.forEach(config, function (value, key) {
    if (_.isString(value) && value.length === 0) {
      return
    }

    switch (key) {
      case 'address':
      case 'gateway':
        connectionOptions.production = (value === 'gateway.push.apple.com')
        break
      case 'cert':
      case 'cert_data':
        connectionOptions.cert = value
        break
      case 'key':
      case 'key_data':
        connectionOptions.key = value
        break
      case 'token':
        if (_.isString(value.key) &&
            _.isString(value.keyId) &&
            _.isString(value.teamId) &&
            value.key.length > 0 &&
            value.keyId.length > 0 &&
            value.teamId.length > 0
        ) {
          connectionOptions[key] = _.clone(value)
        }
        break
      case 'production':
        connectionOptions[key] = !!value
        break
      default:
        connectionOptions[key] = value
    }
  })

  const hasCert = _.has(connectionOptions, 'cert')
  const hasKey = _.has(connectionOptions, 'key')
  const hasCertAndKey = hasCert && hasKey
  const hasToken = _.has(connectionOptions, 'token')

  if (hasCertAndKey && hasToken) {
    debug('prepareApnConnectionOptions', 'both cert/key and token exist')
    return null
  } else if (!hasCertAndKey && !hasToken) {
    debug('prepareApnConnectionOptions', 'both cert/key and token missing')
    return null
  }

  return connectionOptions
}

helper.prepareGcmPayload = function (dataPayload) {
  const gcmPayload = {}

  if (_.has(dataPayload, 'notification_id') &&
      dataPayload.notification_id > 0 &&
      _.has(dataPayload, 'notification_html') &&
      dataPayload.notification_html
  ) {
    gcmPayload.notification_id = dataPayload.notification_id
    gcmPayload.notification = helper.stripHtml(dataPayload.notification_html)
  }

  _.forEach(dataPayload, function (value, key) {
    switch (key) {
      case 'notification_id':
      case 'notification_html':
        // ignore
        break
      default:
        gcmPayload[key] = _.cloneDeep(value)
    }
  })

  return gcmPayload
}

helper.prepareGcmSenderOptions = function (packageId, config) {
  const senderOptions = {
    packageId: packageId
  }

  if (!_.has(config, 'api_key') || !config.api_key) {
    debug('prepareGcmSenderOptions', 'api_key missing')
    return null
  }
  senderOptions.apiKey = config.api_key

  return senderOptions
}

helper.prepareWnsPayload = function (dataPayload, extraData) {
  const wnsPayload = _.cloneDeep(_.isObject(dataPayload) ? dataPayload : {})

  _.forEach(extraData, function (value, key) {
    switch (key) {
      case 'channel_uri':
      case 'package':
        break
      default:
        if (!_.has(wnsPayload, 'extra_data')) {
          wnsPayload.extra_data = {}
        }
        wnsPayload.extra_data[key] = value
    }
  })

  return JSON.stringify(wnsPayload)
}

helper.prepareSubscribeData = function (reqBody, requiredKeys) {
  let hubUri = reqBody.hub_uri
  if (!_.isString(hubUri)) {
    hubUri = ''
  }

  const hubUriParsed = url.parse(hubUri, true)
  hubUri = hubUri.replace(/(\?|&)hub\.topic=[^&]+(&|$)/, '$1')
  hubUri = hubUri.replace(/(\?|&)oauth_token=[^&]+(&|$)/, '$1')
  hubUri = hubUri.replace(/(\?|&)$/, '')

  let hubTopic = reqBody.hub_topic
  if (!_.isString(hubTopic)) {
    hubTopic = ''
  }
  if (hubTopic === '' && hubUriParsed.query && _.isString(hubUriParsed.query['hub.topic'])) {
    hubTopic = hubUriParsed.query['hub.topic']
  }

  let oauthClientId = reqBody.oauth_client_id
  if (!_.isString(oauthClientId)) {
    oauthClientId = ''
  }

  let oauthToken = reqBody.oauth_token
  if (!_.isString(oauthToken)) {
    oauthToken = ''
  }
  if (oauthToken === '' && hubUriParsed.query && _.isString(hubUriParsed.query['oauth_token'])) {
    oauthToken = hubUriParsed.query['oauth_token']
  }

  let deviceType = reqBody.device_type
  if (!_.isString(deviceType)) {
    deviceType = ''
  }

  let deviceId = reqBody.device_id
  if (!_.isString(deviceId)) {
    deviceId = ''
  }

  let extraData = reqBody.extra_data
  if (!_.isPlainObject(extraData) || _.isEmpty(extraData)) {
    extraData = null
  }

  const data = {
    hub_uri: hubUri,
    hub_topic: hubTopic,
    oauth_client_id: oauthClientId,
    oauth_token: oauthToken,

    device_type: deviceType,
    device_id: deviceId,
    extra_data: extraData
  }

  const missingKeys = []
  _.forEach(requiredKeys, function (requiredKey) {
    const value = _.get(data, requiredKey, '')

    if (_.isString(value) && value.length === 0) {
      missingKeys.push(requiredKey)
    }
  })

  data.has_all_required_keys = true
  if (missingKeys.length > 0) {
    data.has_all_required_keys = false
    data.missing_keys = missingKeys
  }

  return data
}

helper.later = function (callback) {
  if (_.isFunction(callback)) {
    return callback
  } else {
    return function () {}
  }
}

helper.appendNodeEnv = function (str) {
  if (_.has(process.env, 'NODE_ENV') &&
    process.env.NODE_ENV !== 'production'
  ) {
    str = str + '-' + process.env.NODE_ENV
  }

  return str
}
