'use strict'

const config = exports
const debug = require('debug')('pushserver:config')
const _ = require('lodash')
const url = require('url')

config._defaultConfig = {
  db: {
    mongoUri: 'mongodb://localhost/pushserver',
    web: false
  },
  web: {
    port: 18080,
    callback: '',
    adminPrefix: '/admin',
    username: '',
    password: ''
  },
  redis: {
    port: 6379,
    host: '127.0.0.1',
    auth: null
  },
  pushQueue: {
    queueId: 'push',
    attempts: 3,
    delayInMs: 10,
    prefix: 'q',
    ttlInMs: 5000,
    web: false
  },
  apn: {
    // 45 minutes
    connectionTtlInMs: 2700000,

    connectionOptions: {
      packageId: 'default',
      cert: '',
      key: ''
    },
    notificationOptions: {}
  },
  gcm: {
    keys: {},
    defaultKeyId: '',
    messageOptions: {}
  },
  wns: {
    client_id: '',
    client_secret: ''
  }
}

config._reload = function () {
  _.forEach(config._defaultConfig, function (value, key) {
    config[key] = _.cloneDeep(value)
  })

  _.forEach([
    'MONGO_URI',
    'MONGOLAB_URI'
  ], function (mongoUriKey) {
    if (_.has(process.env, mongoUriKey)) {
      config.db.mongoUri = process.env[mongoUriKey]
    }
  })

  if (_.has(process.env, 'PORT')) {
    config.web.port = process.env.PORT
  }

  _.forEach([
    'REDIS_URL',
    'REDISCLOUD_URL',
    'REDISTOGO_URL'
  ], function (redisUrlKey) {
    if (_.has(process.env, redisUrlKey)) {
      const redisUrlParsed = url.parse(process.env[redisUrlKey])
      config.redis.port = redisUrlParsed.port
      config.redis.host = redisUrlParsed.hostname
      if (redisUrlParsed.auth) {
        config.redis.auth = redisUrlParsed.auth.split(':')[1]
      }
    }
  })

  if (_.has(process.env, 'CONFIG_WEB_CALLBACK')) {
    config.web.callback = process.env.CONFIG_WEB_CALLBACK
  }

  if (_.has(process.env, 'CONFIG_WEB_USERNAME') &&
      _.has(process.env, 'CONFIG_WEB_PASSWORD')
  ) {
    config.web.username = process.env.CONFIG_WEB_USERNAME
    config.web.password = process.env.CONFIG_WEB_PASSWORD

    config.pushQueue.web = true
    if (_.has(process.env, 'CONFIG_PUSH_QUEUE_WEB')) {
      config.pushQueue.web = process.env.CONFIG_PUSH_QUEUE_WEB === 'true'
      debug('config.pushQueue.web =', config.pushQueue.web)
    }
  }

  if (_.has(process.env, 'CONFIG_PUSH_QUEUE_ID')) {
    config.pushQueue.queueId = process.env.CONFIG_PUSH_QUEUE_ID
  }

  if (_.has(process.env, 'CONFIG_APN_CERT') &&
        _.has(process.env, 'CONFIG_APN_KEY')
  ) {
    config.apn.connectionOptions.cert = process.env.CONFIG_APN_CERT
    config.apn.connectionOptions.key = process.env.CONFIG_APN_KEY
  }

  if (_.has(process.env, 'CONFIG_APN_GATEWAY')) {
    config.apn.connectionOptions.gateway = process.env.CONFIG_APN_GATEWAY
  }

  if (_.has(process.env, 'CONFIG_GCM_KEY')) {
    // single gcm key
    const keyId = '_default_'
    config.gcm.keys[keyId] = process.env.CONFIG_GCM_KEY
    config.gcm.defaultKeyId = keyId
  }

  if (_.has(process.env, 'CONFIG_GCM_KEYS')) {
    // multiple gcm keys
    const n = parseInt(process.env.CONFIG_GCM_KEYS)
    for (let i = 0; i < n; i++) {
      if (!_.has(process.env, 'CONFIG_GCM_KEYS_' + i)) {
        continue
      }

      const keyPair = process.env['CONFIG_GCM_KEYS_' + i].split(',')
      if (keyPair.length !== 2) {
        continue
      }

      config.gcm.keys[keyPair[0]] = keyPair[1]
      if (!config.gcm.defaultKeyId) {
        config.gcm.defaultKeyId = keyPair[0]
      }
    }
  }

  if (_.has(process.env, 'CONFIG_WNS_CLIENT_ID') &&
        _.has(process.env, 'CONFIG_WNS_CLIENT_SECRET')
  ) {
    config.wns.client_id = process.env.CONFIG_WNS_CLIENT_ID
    config.wns.client_secret = process.env.CONFIG_WNS_CLIENT_SECRET
  }

  debug('Reload ok')
}

config._reload()
