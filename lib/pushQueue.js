'use strict'

const pushQueue = exports
const config = require('./config')
const helper = require('./helper')
const debug = require('debug')('pushserver:pushQueue')
const _ = require('lodash')

pushQueue.MESSAGES = {
  QUEUE_ERROR: 'Error queuing',
  PUSH_SUCCESS: 'Pushed',
  PUSH_ERROR: 'Error pushing',
  JOB_ERROR_UNRECOGNIZED_DEVICE_TYPE: 'Unrecognized device type',
  JOB_ERROR_PUSHER: 'Pusher error',
  JOB_ERROR_PACKAGE_MISSING: 'extra_data.package missing',
  JOB_ERROR_PAYLOAD: 'Invalid payload',
  JOB_ERROR_PROJECT_EXTRA_DATA_MISSING: 'extra_data.project missing',
  JOB_ERROR_PROJECT_NOT_FOUND: 'Project not found',
  JOB_ERROR_PROJECT_CONFIG: 'Bad project config'
}

let bullQueue = null
let pusher = null
let db = null
const stats = {
  queued: 0,
  processed: 0
}
pushQueue.setup = function (_bullQueue, _pusher, _db) {
  bullQueue = _bullQueue
  pusher = _pusher
  db = _db
  stats.queued = 0
  stats.processed = 0

  if (bullQueue && pusher && db) {
    bullQueue.process(pushQueue._onJob)
    debug('Worker has been setup')
  }

  return pushQueue
}

pushQueue.startWorker = function () {
  const _db = require('./db')(config)
  const _bullQueue = pushQueue.createBullQueue()
  const _pusher = require('./pusher').setupDefault()

  pushQueue.setup(_bullQueue, _pusher, _db)
}

pushQueue.stats = function () {
  if (pusher === null) {
    return Promise.resolve({ pushQueue: _.cloneDeep(stats) })
  }

  return pusher.stats().then((merged) => {
    merged.pushQueue = _.cloneDeep(stats)
    return merged
  })
}

pushQueue.createBullQueue = function () {
  const Queue = require('bull')
  const prefix = helper.appendNodeEnv(config.pushQueue.prefix)
  const q = new Queue(config.pushQueue.name, {
    prefix,
    redis: config.redis
  })

  return q
}

pushQueue.enqueue = function (deviceType, deviceIds, payload, extraData) {
  if (_.isString(deviceIds)) {
    deviceIds = [deviceIds]
  }

  let title = deviceType
  if (_.has(extraData, '_ping__client_id') &&
      _.has(extraData, '_ping__topic')
  ) {
    title = extraData._ping__client_id +
        '/' + extraData._ping__topic +
        ' ' + deviceType
  }
  if (deviceIds.length === 1) {
    title += '-' + deviceIds[0]
  } else {
    title += ' x' + deviceIds.length
  }

  let delay = 0
  if (_.has(extraData, '_pushQueue__attempted')) {
    if (extraData._pushQueue__attempted >= config.pushQueue.attempts) {
      return false
    }

    const powOf2 = Math.pow(2, extraData._pushQueue__attempted - 1)
    delay = config.pushQueue.delayInMs * powOf2
  }

  bullQueue.add(
    {
      title,
      device_type: deviceType,
      device_ids: deviceIds,
      payload: payload,
      extra_data: extraData
    },
    {
      attempts: 1,
      delay,
      timeout: config.pushQueue.ttlInMs,
      removeOnComplete: config.pushQueue.history,
      removeOnFail: config.pushQueue.history
    }
  )

  stats.queued++

  return true
}

pushQueue._onJob = function (job, jobCallback) {
  stats.processed++

  const jobDone = helper.later(jobCallback)
  const done = function (err, pusherResult) {
    if (!err) {
      debug(pushQueue.MESSAGES.PUSH_SUCCESS, job.data.title)
      return jobDone()
    }

    debug(pushQueue.MESSAGES.PUSH_ERROR, job.data.title, err, pusherResult)

    const result = {
      retries: [],
      invalids: []
    }
    _.merge(result, _.pick(pusherResult, _.keys(result)))

    if (_.has(result, 'retries') && result.retries.length > 0) {
      const retryExtraData = _.merge({}, job.data.extra_data)
      if (_.has(retryExtraData, '_pushQueue__attempted')) {
        retryExtraData._pushQueue__attempted++
      } else {
        retryExtraData._pushQueue__attempted = 1
      }

      pushQueue.enqueue(
        job.data.device_type,
        result.retries,
        job.data.payload,
        retryExtraData
      )
    }

    let invalids = []
    if (_.has(result, 'invalids')) {
      invalids = _.clone(result.invalids)
    }

    const deleteInvalid = () => {
      if (invalids.length > 0) {
        const deviceId = invalids.shift()
        return db.devices.delete(job.data.device_type, deviceId,
          null, null, deleteInvalid)
      }

      const jobError = _.isError(err) ? err : new Error(_.isString(err) ? err : JSON.stringify(err))
      jobDone(jobError, result)
    }

    deleteInvalid()
  }

  try {
    switch (job.data.device_type) {
      case 'android':
        return pushQueue._onAndroidJob(job, done)
      case 'firebase':
        return pushQueue._onFirebaseJob(job, done)
      case 'huawei':
        return pushQueue._onHuaweiJob(job, done)
      case 'ios':
        return pushQueue._oniOSJob(job, done)
      case 'windows':
        return pushQueue._onWindowsJob(job, done)
    }

    return done(pushQueue.MESSAGES.JOB_ERROR_UNRECOGNIZED_DEVICE_TYPE)
  } catch (e) {
    debug(e)
    return done(pushQueue.MESSAGES.JOB_ERROR_PUSHER)
  }
}

pushQueue._onAndroidJob = function (job, callback) {
  const done = helper.later(callback)
  const data = job.data
  const payload = helper.prepareGcmPayload(data.payload)

  // TODO: remove default connection options support
  const senderOptions = {
    packageId: config.gcm.defaultKeyId,
    apiKey: ''
  }
  if (_.has(data, 'extra_data.package')) {
    senderOptions.packageId = data.extra_data.package
  }
  if (senderOptions.packageId &&
      _.has(config.gcm.keys, senderOptions.packageId)
  ) {
    senderOptions.apiKey = config.gcm.keys[senderOptions.packageId]
  }

  if (senderOptions.apiKey) {
    return pusher.gcm(senderOptions, data.device_ids, payload, done)
  } else {
    if (!senderOptions.packageId) {
      return done(pushQueue.MESSAGES.JOB_ERROR_PACKAGE_MISSING,
        { invalids: data.device_ids })
    }
  }

  const packageId = senderOptions.packageId
  db.projects.findConfig('gcm', packageId, (config) => {
    if (!config) {
      debug('Project not found', packageId)
      return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND,
        { invalids: data.device_ids })
    }

    const so = helper.prepareGcmSenderOptions(packageId, config)
    if (!so) {
      debug('Cannot prepare gcm sender options', packageId, config)
      return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG)
    }

    return pusher.gcm(so, data.device_ids, payload, done)
  })
}

pushQueue._onFirebaseJob = function (job, callback) {
  const done = helper.later(callback)

  const { data } = job
  const { extra_data: extraData } = data
  if (typeof extraData !== 'object') {
    return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_EXTRA_DATA_MISSING,
      { invalids: data.device_ids })
  }
  const {
    badge_with_convo: badgeWithConvo,
    click_action: clickAction,
    notification,
    project: projectId
  } = extraData
  if (typeof projectId !== 'string') {
    return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_EXTRA_DATA_MISSING,
      { invalids: data.device_ids })
  }

  const payload = helper.prepareFcmPayload(
    data.payload,
    {
      badgeWithConvo: helper.isPositive(badgeWithConvo),
      clickAction,
      notification: helper.isPositive(notification)
    }
  )
  db.projects.findConfig('fcm', projectId, (config) => {
    if (!config) {
      debug('Project not found', projectId)
      return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND,
        { invalids: data.device_ids })
    }

    return pusher.fcm(projectId, config, data.device_ids, payload, done)
  })
}

pushQueue._onHuaweiJob = function (job, callback) {
  const done = helper.later(callback)

  const { data } = job
  const { extra_data: extraData } = data
  if (typeof extraData !== 'object') {
    return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_EXTRA_DATA_MISSING,
      { invalids: data.device_ids })
  }
  const {
    badge_with_convo: badgeWithConvo,
    click_action: clickAction,
    notification,
    project: appId
  } = extraData
  if (typeof appId !== 'string') {
    return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_EXTRA_DATA_MISSING,
      { invalids: data.device_ids })
  }

  const payload = helper.prepareFcmPayload(
    data.payload,
    {
      badgeWithConvo: helper.isPositive(badgeWithConvo),
      clickAction,
      notification: helper.isPositive(notification)
    }
  )
  db.projects.findConfig('hms', appId, (config) => {
    if (!config) {
      debug('App not found', appId)
      return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND,
        { invalids: data.device_ids })
    }

    const { app_secret: appSecret } = config
    if (!appSecret) {
      return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG,
        { invalids: data.device_ids })
    }

    return pusher.hms(appId, appSecret, data.device_ids, payload, done)
  })
}

pushQueue._oniOSJob = function (job, callback) {
  const done = helper.later(callback)
  const data = job.data
  const payload = helper.prepareApnPayload(data.payload)
  if (!payload) {
    debug('Cannot prepare apn payload', data.payload)
    return done(pushQueue.MESSAGES.JOB_ERROR_PAYLOAD)
  }

  // TODO: remove default connection options support
  let packageId = ''
  let connectionOptions = config.apn.connectionOptions
  if (_.has(data, 'extra_data.package')) {
    packageId = data.extra_data.package
    connectionOptions = null
  }

  if (connectionOptions) {
    return pusher.apn(connectionOptions, data.device_ids, payload, done)
  } else {
    if (!packageId) {
      return done(pushQueue.MESSAGES.JOB_ERROR_PACKAGE_MISSING,
        { invalids: data.device_ids })
    }

    db.projects.findConfig('apn', packageId, function (config) {
      if (!config) {
        return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND,
          { invalids: data.device_ids })
      }

      const co = helper.prepareApnConnectionOptions(packageId, config)
      if (!co) {
        debug('Cannot prepare apn connection options', packageId, config)
        return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG)
      }

      return pusher.apn(co, data.device_ids, payload, done)
    })
  }
}

pushQueue._onWindowsJob = function (job, callback) {
  const done = function (err, pusherResult) {
    const result = { retries: [], invalids: [] }

    if (_.has(pusherResult, 'retries')) {
      result.retries = pusherResult.retries
    }

    if (_.has(pusherResult, 'invalids')) {
      result.invalids = pusherResult.invalids
    }

    if (_.has(pusherResult, 'deleteDevice') &&
        pusherResult.deleteDevice
    ) {
      result.invalids = job.data.device_ids
    } else if (!_.has(pusherResult, 'retry') ||
        pusherResult.retry
    ) {
      result.retries = job.data.device_ids
    }

    helper.later(callback)(err, result)
  }
  const data = job.data
  const payload = helper.prepareWnsPayload(data.payload, data.extra_data)
  let packageId = ''
  let clientId = config.wns.client_id
  let clientSecret = config.wns.client_secret
  let channelUri = ''

  _.forEach(data.extra_data, function (value, key) {
    switch (key) {
      case 'channel_uri':
        channelUri = value
        break
      case 'package':
        packageId = value
        clientId = ''
        clientSecret = ''
        break
    }
  })

  if (!channelUri) {
    return done('channel_uri missing', { invalids: data.device_ids })
  }

  if (clientId && clientSecret) {
    return pusher.wns(clientId, clientSecret, channelUri, payload, done)
  } else {
    if (!packageId) {
      return done(pushQueue.MESSAGES.JOB_ERROR_PACKAGE_MISSING,
        { invalids: data.device_ids })
    }

    db.projects.findConfig('wns', packageId, function (config) {
      if (!config) {
        return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND,
          { invalids: data.device_ids })
      }

      if (!config.client_id || !config.client_secret) {
        return done(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG)
      }

      return pusher.wns(config.client_id, config.client_secret,
        channelUri, payload, done)
    })
  }
}

pushQueue._reset = function (callback) {
  debug('Closing queue…')
  bullQueue.close().then(callback)
}
