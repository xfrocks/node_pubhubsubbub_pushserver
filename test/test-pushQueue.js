'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const pushQueue = require('../lib/pushQueue')
const chai = require('chai')
const _ = require('lodash')

chai.should()

// setup push queue
const pushKue = require('./mock/pushKue')
const pusher = require('./mock/pusher')
const db = require('./mock/db')

let notificationId = 0
const generatePayload = function () {
  notificationId++

  return {
    action: 'action',
    notification_id: notificationId,
    notification_html: 'Notification #' + notificationId
  }
}

describe('pushQueue', function () {
  beforeEach(function (done) {
    config.gcm.defaultKeyId = 'key1'
    config.gcm.keys = {
      key1: 'key1',
      key2: 'key2'
    }
    config.wns.client_id = 'wns_ci'
    config.wns.client_secret = 'wns_cs'
    config.pushQueue.attempts = 3

    pushKue._reset()
    pusher._reset()
    db.projects._reset()
    db.devices._reset()

    pushQueue.setup(pushKue, pusher, db)

    done()
  })

  it('should process android queue', function (done) {
    const deviceType = 'android'
    const deviceId = 'di'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const latestPush = pusher._getLatestPush()
    latestPush.type.should.equal('gcm')
    latestPush.registrationIds.should.have.all.members([deviceId])
    latestPush.data.notification_id.should.equal(payload.notification_id)
    latestPush.data.notification.should.not.be.null

    done()
  })

  it('[android] batch request', function (done) {
    const deviceType = 'android'
    const deviceIds = ['di1', 'di2']
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceIds, payload)

    const latestPush = pusher._getLatestPush()
    latestPush.registrationIds.should.have.all.members(deviceIds)

    done()
  })

  it('[android] default key', function (done) {
    const deviceType = 'android'
    const deviceId = 'di'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const latestPush = pusher._getLatestPush()
    latestPush.senderOptions.apiKey
      .should.equal(config.gcm.keys[config.gcm.defaultKeyId])

    done()
  })

  it('[android] specific keys', function (done) {
    const deviceType = 'android'
    const deviceId = 'di'
    const payload = generatePayload()
    const extraData = { package: 'key1' }
    const extraData2 = { package: 'key2' }

    const test1 = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData)

      const latestPush = pusher._getLatestPush()
      latestPush.senderOptions.apiKey
        .should.equal(config.gcm.keys[extraData.package])

      test2()
    }

    const test2 = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData2)

      const latestPush = pusher._getLatestPush()
      latestPush.senderOptions.apiKey
        .should.equal(config.gcm.keys[extraData2.package])

      done()
    }

    test1()
  })

  it('[android] db key', function (done) {
    const packageId = 'pi-db'
    const apiKey = 'ak-db'
    const deviceType = 'android'
    const deviceId = 'di-db'
    const payload = generatePayload()
    const extraData = { package: packageId }

    const init = function () {
      db.projects.saveGcm(packageId, apiKey, function () {
        test()
      })
    }

    const test = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData)

      const latestPush = pusher._getLatestPush()
      latestPush.senderOptions.apiKey.should.equal(apiKey)

      done()
    }

    init()
  })

  it('[android] package missing', function (done) {
    const deviceType = 'android'
    const deviceId = 'di-package-missing'
    const payload = generatePayload()

    config.gcm.defaultKeyId = ''
    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PACKAGE_MISSING)
    job.result.invalids.should.not.empty

    done()
  })

  it('[android] project not found', function (done) {
    const packageId = 'pi-project-not-found'
    const deviceType = 'android'
    const deviceId = 'di-project-not-found'
    const payload = generatePayload()
    const extraData = { package: packageId }

    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND)
    job.result.invalids.should.not.empty

    done()
  })

  it('[android] project config', function (done) {
    const packageId = 'pi-project-config'
    const deviceType = 'android'
    const deviceId = 'di-project-config'
    const payload = generatePayload()
    const extraData = { package: packageId }

    const init = function () {
      db.projects.saveGcm(packageId, '', function () {
        test()
      })
    }

    const test = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData)

      const job = pushKue._getLatestJob(config.pushQueue.queueId)
      job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG)

      done()
    }

    init()
  })

  it('should process ios queue', function (done) {
    const deviceType = 'ios'
    const deviceId = 'di'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const latestPush = pusher._getLatestPush()
    latestPush.type.should.equal('apn')
    latestPush.tokens.should.have.all.members([deviceId])
    latestPush.payload.aps.alert.should.not.be.null

    done()
  })

  it('[ios] batch request', function (done) {
    const deviceType = 'ios'
    const deviceIds = ['di1', 'di2']
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceIds, payload)

    const latestPush = pusher._getLatestPush()
    latestPush.tokens.should.have.all.members(deviceIds)

    done()
  })

  it('[ios] payload', function (done) {
    const deviceType = 'ios'
    const deviceId = 'di'
    const payload = generatePayload()
    payload.notification_html = ''

    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PAYLOAD)

    done()
  })

  it('[ios] default client', function (done) {
    const deviceType = 'ios'
    const deviceId = 'di'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const latestPush = pusher._getLatestPush()
    latestPush.connectionOptions.should.equal(config.apn.connectionOptions)

    done()
  })

  it('[ios] db client', function (done) {
    const bundleId = 'bi-db'
    const tokenKeyData = 'tk-db'
    const tokenKeyIdData = 'tki-db'
    const tokenTeamIdData = 'tti-db'
    const deviceType = 'ios'
    const deviceId = 'di'
    const payload = generatePayload()
    const extraData = { package: bundleId }

    const test = function (production, callback) {
      const step1 = function () {
        db.projects.saveApn(
          bundleId,
          tokenKeyData,
          tokenKeyIdData,
          tokenTeamIdData,
          production,
          function () {
            step2()
          }
        )
      }

      const step2 = function () {
        pushQueue.enqueue(deviceType, deviceId, payload, extraData)

        const latestPush = pusher._getLatestPush()
        latestPush.type.should.equal('apn')

        const lpco = latestPush.connectionOptions
        lpco.packageId.should.equal(bundleId)
        lpco.token.key.should.equal(tokenKeyData)
        lpco.token.keyId.should.equal(tokenKeyIdData)
        lpco.token.teamId.should.equal(tokenTeamIdData)
        lpco.production.should.equal(production)

        callback()
      }

      step1()
    }

    const test1 = function () {
      test(true, test2)
    }

    const test2 = function () {
      test(false, done)
    }

    test1()
  })

  it('[ios] package missing', function (done) {
    const deviceType = 'ios'
    const deviceId = 'di-package-missing'
    const payload = generatePayload()

    config.apn.connectionOptions = null
    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PACKAGE_MISSING)
    job.result.invalids.should.not.empty

    done()
  })

  it('[ios] project not found', function (done) {
    const packageId = 'pi-project-not-found'
    const deviceType = 'ios'
    const deviceId = 'di-project-not-found'
    const payload = generatePayload()
    const extraData = { package: packageId }

    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND)
    job.result.invalids.should.not.empty

    done()
  })

  it('[ios] project config', function (done) {
    const packageId = 'pi-project-config'
    const deviceType = 'ios'
    const deviceId = 'di-project-config'
    const payload = generatePayload()
    const extraData = { package: packageId }

    const init = function () {
      db.projects.saveApn(packageId, '', '', '', true, () => {
        test()
      })
    }

    const test = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData)

      const job = pushKue._getLatestJob(config.pushQueue.queueId)
      job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG)

      done()
    }

    init()
  })

  it('should process windows queue', function (done) {
    const deviceType = 'windows'
    const deviceId = 'di'
    const payload = generatePayload()
    const channelUri = 'https://microsoft.com/wns/channel/uri'
    const extraData = { foo: 'bar', channel_uri: channelUri }

    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const latestPush = pusher._getLatestPush()
    latestPush.channelUri.should.equal(channelUri)

    const data = JSON.parse(latestPush.dataRaw)
    _.omit(data, 'extra_data').should.deep.equal(payload)
    data.extra_data.should.deep.equal(_.omit(extraData, 'channel_uri'))

    done()
  })

  it('[windows] default client', function (done) {
    const deviceType = 'windows'
    const deviceId = 'di'
    const payload = generatePayload()
    const channelUri = 'https://microsoft.com/wns/channel/uri'
    const extraData = { channel_uri: channelUri }

    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const latestPush = pusher._getLatestPush()
    latestPush.clientId.should.equal(config.wns.client_id)
    latestPush.clientSecret.should.equal(config.wns.client_secret)

    done()
  })

  it('[windows] db client', function (done) {
    const packageId = 'pi-db'
    const clientId = 'ci-db'
    const clientSecret = 'cs-db'
    const deviceType = 'windows'
    const deviceId = 'di'
    const payload = generatePayload()
    const channelUri = 'https://microsoft.com/wns/channel/uri'
    const extraData = { channel_uri: channelUri, package: packageId }

    const init = function () {
      db.projects.saveWns(packageId, clientId, clientSecret, function () {
        test()
      })
    }

    const test = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData)

      const latestPush = pusher._getLatestPush()
      latestPush.clientId.should.equal(clientId)
      latestPush.clientSecret.should.equal(clientSecret)

      done()
    }

    init()
  })

  it('[windows] channel_uri missing', function (done) {
    const packageId = 'pi-channel_uri-missing'
    const deviceType = 'windows'
    const deviceId = 'di-channel_uri-missing'
    const payload = generatePayload()
    const extraData = { package: packageId }

    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal('channel_uri missing')
    job.result.invalids.should.not.empty

    done()
  })

  it('[windows] package missing', function (done) {
    const deviceType = 'windows'
    const deviceId = 'di-package-missing'
    const payload = generatePayload()
    const channelUri = 'https://microsoft.com/wns/channel/uri'
    const extraData = { channel_uri: channelUri }

    config.wns.client_id = ''
    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PACKAGE_MISSING)
    job.result.invalids.should.not.empty

    done()
  })

  it('[windows] project not found', function (done) {
    const packageId = 'pi-project-not-found'
    const deviceType = 'windows'
    const deviceId = 'di-project-not-found'
    const payload = generatePayload()
    const channelUri = 'https://microsoft.com/wns/channel/uri'
    const extraData = { channel_uri: channelUri, package: packageId }

    pushQueue.enqueue(deviceType, deviceId, payload, extraData)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PROJECT_NOT_FOUND)
    job.result.invalids.should.not.empty

    done()
  })

  it('[windows] project config', function (done) {
    const packageId = 'pi-project-config'
    const deviceType = 'windows'
    const deviceId = 'di'
    const payload = generatePayload()
    const channelUri = 'https://microsoft.com/wns/channel/uri'
    const extraData = { channel_uri: channelUri, package: packageId }

    const init = function () {
      db.projects.saveWns(packageId, '', '', function () {
        test()
      })
    }

    const test = function () {
      pushQueue.enqueue(deviceType, deviceId, payload, extraData)

      const job = pushKue._getLatestJob(config.pushQueue.queueId)
      job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PROJECT_CONFIG)

      done()
    }

    init()
  })

  it('should retry on text error', function (done) {
    const deviceType = 'android'
    const deviceId = 'error'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal('Error')

    const pushes = pusher._getPushes()
    config.pushQueue.attempts.should.be.above(2)
    pushes.length.should.equal(config.pushQueue.attempts)

    done()
  })

  it('should retry on Error', function (done) {
    const deviceType = 'android'
    const deviceId = 'Error'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.be.a('Error')
    job.error.message.should.equal('Message')

    const pushes = pusher._getPushes()
    config.pushQueue.attempts.should.be.above(2)
    pushes.length.should.equal(config.pushQueue.attempts)

    done()
  })

  it('should retry on array error', function (done) {
    const deviceType = 'android'
    const deviceId = 'Array'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal('["error"]')

    const pushes = pusher._getPushes()
    config.pushQueue.attempts.should.be.above(2)
    pushes.length.should.equal(config.pushQueue.attempts)

    done()
  })

  it('should retry only once', function (done) {
    const deviceType = 'android'
    const deviceId = 'retry1'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const pushes = pusher._getPushes()
    config.pushQueue.attempts.should.be.above(2)
    pushes.length.should.equal(2)

    done()
  })

  it('should retry with delay', function (done) {
    const deviceType = 'android'
    const deviceId = 'retry1'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.delay.should.equal(config.pushQueue.delayInMs)

    done()
  })

  it('should retry with exponential delays', function (done) {
    const deviceType = 'android'
    const deviceId = 'error'
    const payload = generatePayload()

    config.pushQueue.attempts = 10
    pushQueue.enqueue(deviceType, deviceId, payload)

    const jobs = pushKue._getJobs(config.pushQueue.queueId)
    jobs.length.should.equal(config.pushQueue.attempts)
    _.forEach(jobs, function (job, i) {
      let delay = config.pushQueue.delayInMs * Math.pow(2, i - 1)
      if (i === 0) {
        delay = 0
      }
      job.delay.should.equal(delay)
    })

    done()
  })

  it('should delete devices', function (done) {
    const deviceType = 'android'
    const deviceId = 'invalid'
    const deviceId2 = 'invalid2'
    const oauthClientId = 'oci'
    const hubTopic = 'ht'
    const payload = generatePayload()

    const init1 = function () {
      db.devices.save(deviceType, deviceId, oauthClientId, hubTopic, {},
        function () {
          db.devices._devicesLength().should.equal(1)
          init2()
        }
      )
    }

    const init2 = function () {
      db.devices.save(deviceType, deviceId2, oauthClientId, hubTopic, {},
        function () {
          db.devices._devicesLength().should.equal(2)
          step1()
        }
      )
    }

    const step1 = function () {
      pushQueue.enqueue(deviceType, [deviceId, deviceId2], payload)

      const pushes = pusher._getPushes()
      pushes.length.should.equal(1)

      step2()
    }

    const step2 = function () {
      db.devices._devicesLength().should.equal(0)
      done()
    }

    init1()
  })

  it('should encounter job.save error', function (done) {
    const deviceType = 'save'
    const deviceId = 'error'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const jobs = pushKue._getJobs(config.pushQueue.queueId)
    jobs.length.should.equal(0)

    done()
  })

  it('should handle unrecognized device type', function (done) {
    pushQueue.enqueue('unrecognized', 'di', generatePayload())

    const jobs = pushKue._getJobs(config.pushQueue.queueId)
    jobs.length.should.equal(1)

    const pushes = pusher._getPushes()
    pushes.length.should.equal(0)

    done()
  })

  it('should handle pusher exception', function (done) {
    const deviceType = 'android'
    const deviceId = 'Exception'
    const payload = generatePayload()

    pushQueue.enqueue(deviceType, deviceId, payload)

    const job = pushKue._getLatestJob(config.pushQueue.queueId)
    job.error.should.equal(pushQueue.MESSAGES.JOB_ERROR_PUSHER)

    done()
  })
})
