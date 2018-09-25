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
  JOB_ERROR_PROJECT_NOT_FOUND: 'Project not found',
  JOB_ERROR_PROJECT_CONFIG: 'Bad project config'
}

let pushKue = null
let pusher = null
let db = null
let stats = {
  queued: 0,
  processed: 0
}
pushQueue.setup = function (_pushKue, _pusher, _db) {
  pushKue = _pushKue
  if (pushKue) {
    pushKue.process(config.pushQueue.queueId, 1, pushQueue._onJob)
  }

  pusher = _pusher
  db = _db
  stats.queued = 0
  stats.processed = 0

  return pushQueue
}

pushQueue.stats = function () {
  return pusher.stats().then((merged) => {
    merged.pushQueue = _.cloneDeep(stats)
    return merged
  })
}

pushQueue.createQueue = function (kue) {
  const prefix = helper.appendNodeEnv(config.pushQueue.prefix)
  const q = kue.createQueue({
    disableSearch: true,
    jobEvents: false,
    prefix: prefix,
    redis: config.redis
  })
  q.watchStuckJobs(1000)

  return q
}

pushQueue.enqueue = function (deviceType, deviceIds, payload, extraData) {
  if (_.isString(deviceIds)) {
    deviceIds = [deviceIds]
  }

  let jobTitle = deviceType
  if (_.has(extraData, '_ping__client_id') &&
      _.has(extraData, '_ping__topic')
  ) {
    jobTitle = extraData._ping__client_id +
        '/' + extraData._ping__topic +
        ' ' + deviceType
  }
  if (deviceIds.length === 1) {
    jobTitle += '-' + deviceIds[0]
  } else {
    jobTitle += 'x' + deviceIds.length
  }

  let delay = 0
  if (_.has(extraData, '_pushQueue__attempted')) {
    if (extraData._pushQueue__attempted >= config.pushQueue.attempts) {
      return false
    }

    const powOf2 = Math.pow(2, extraData._pushQueue__attempted - 1)
    delay = config.pushQueue.delayInMs * powOf2
  }

  const job = pushKue.create(config.pushQueue.queueId, {
    title: jobTitle,
    device_type: deviceType,
    device_ids: deviceIds,
    payload: payload,
    extra_data: extraData
  })
  job.delay(delay)
  job.ttl(config.pushQueue.ttlInMs)
  job.removeOnComplete(true)

  job.save(function (err) {
    if (err) {
      return debug(pushQueue.MESSAGES.QUEUE_ERROR,
        deviceType, deviceIds, err)
    }

    stats.queued++
  })

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

      let jobError = err
      if (!_.isString(jobError) && !_.isError(jobError)) {
        jobError = JSON.stringify(err)
      }
      jobDone(jobError, result)
    }

    deleteInvalid()
  }

  try {
    switch (job.data.device_type) {
      case 'android':
        return pushQueue._onAndroidJob(job, done)
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
  debug('Shutting down queue…')
  pushKue.shutdown(0, callback)
}
