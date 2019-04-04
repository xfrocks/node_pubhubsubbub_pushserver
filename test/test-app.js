'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const pusher = require('../lib/pusher')
const pushQueue = require('../lib/pushQueue')
const web = require('../lib/web')
const chai = require('chai')
const _ = require('lodash')
const nock = require('nock')

chai.should()
chai.use(require('chai-http'))
const expect = chai.expect
const db = require('./mock/db')
const pushKue = require('./mock/pushKue')

let server = null
let webApp = null
const originalProcessEnv = _.merge({}, process.env)
const adminUsername = 'username'
const adminPassword = 'password'
const hubUri = 'https://xfrocks.com/api/index.php?subscriptions'
const hubTopic = 'user_notification_2'
const oauthClientId = 'gljf4391k3'
const oauthToken = '83ae5ed7f9b0b5bb392af3f2f57dabf1ba3fe2e5'
const notificationId = 1
const notificationHtml = 'Hello.'
const apn = {
  bundleId: 'com.xfrocks.api.ios',
  token: {
    key: 'key',
    keyId: 'keyId',
    teamId: 'teamId'
  },
  deviceType: 'ios',
  deviceId: 'deviceId'
}
const gcm = {
  packageId: 'com.xfrocks.api.android',
  apiKey: 'apiKey',
  deviceType: 'android',
  deviceId: 'xyz:deviceId'
}
const wns = {
  packageId: 'com.xfrocks.api.windows',
  clientId: 'ms-app://clientId',
  clientSecret: 'clientSecret',
  deviceType: 'windows',
  deviceId: 'deviceId',
  channelUri: 'https://hk2.notify.windows.com/?token=someToken'
}

describe('app', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(20000)

  before(function (done) {
    nock.disableNetConnect()
    nock.enableNetConnect('127.0.0.1')

    process.env = _.merge({}, originalProcessEnv)
    process.env.CONFIG_WEB_CALLBACK = 'https://api-pushserver-xfrocks-com.herokuapp.com/callback'
    process.env.CONFIG_WEB_USERNAME = adminUsername
    process.env.CONFIG_WEB_PASSWORD = adminPassword
    process.env.PORT = 0
    config._reload()
    config.pushQueue.attempts = 0

    db.hubs._reset()
    db.projects._reset()
    web._reset()

    pushQueue.setup(pushKue, pusher.setupDefault(), db)
    server = web.start(db, pushQueue)
    webApp = chai.request(server).keepOpen()

    done()
  })

  beforeEach(function (done) {
    db.devices._reset()

    nock('https://xfrocks.com')
      .post('/api/index.php?subscriptions')
      .reply(202)

    done()
  })

  after(function (done) {
    nock.cleanAll()
    nock.enableNetConnect()
    server.close()
    done()
  })

  it('should works with apn', function (done) {
    const setup = function () {
      webApp
        .post('/admin/projects/apn')
        .auth(adminUsername, adminPassword)
        .send({
          bundle_id: apn.bundleId,
          token: {
            key: apn.token.key,
            key_id: apn.token.keyId,
            team_id: apn.token.teamId
          }
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          subscribe()
        })
    }

    const subscribe = function () {
      webApp
        .post('/subscribe')
        .send({
          hub_uri: hubUri,
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          oauth_token: oauthToken,
          extra_data: {
            package: apn.bundleId
          },
          device_type: apn.deviceType,
          device_id: apn.deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          res.text.should.equal('succeeded')
          callback()
        })
    }

    const callback = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: {
              notification_id: notificationId,
              notification_html: notificationHtml
            }
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          setTimeout(verifyPushQueueStats, 100)
        })
    }

    let queuedBefore = 0
    let processedBefore = 0
    const verifyPushQueueStats = function () {
      pushQueue.stats().then(function (stats) {
        stats.pushQueue.queued.should.equal(queuedBefore + 1)
        stats.pushQueue.processed.should.equal(processedBefore + 1)
        done()
      })
    }
    pushQueue.stats().then(function (statsBefore) {
      queuedBefore = statsBefore.pushQueue.queued
      processedBefore = statsBefore.pushQueue.processed
      setup()
    })
  })

  it('should works with gcm', function (done) {
    nock('https://fcm.googleapis.com')
      .post('/fcm/send')
      .reply(401)

    const setup = function () {
      webApp
        .post('/admin/projects/gcm')
        .auth(adminUsername, adminPassword)
        .send({
          package_id: gcm.packageId,
          api_key: gcm.apiKey
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          subscribe()
        })
    }

    const subscribe = function () {
      webApp
        .post('/subscribe')
        .send({
          hub_uri: hubUri,
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          oauth_token: oauthToken,
          extra_data: {
            package: gcm.packageId
          },
          device_type: gcm.deviceType,
          device_id: gcm.deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          res.text.should.equal('succeeded')
          callback()
        })
    }

    const callback = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: {
              notification_id: notificationId,
              notification_html: notificationHtml
            }
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          setTimeout(verifyPushQueueStats, 100)
        })
    }

    let queuedBefore = 0
    let processedBefore = 0
    const verifyPushQueueStats = function () {
      pushQueue.stats().then(function (stats) {
        stats.pushQueue.queued.should.equal(queuedBefore + 1)
        stats.pushQueue.processed.should.equal(processedBefore + 1)
        done()
      })
    }
    pushQueue.stats().then(function (statsBefore) {
      queuedBefore = statsBefore.pushQueue.queued
      processedBefore = statsBefore.pushQueue.processed
      setup()
    })
  })

  it('should works with fcm', done => {
    const deviceId = 'firebase-di'
    const projectId = 'firebase-pi'

    const setup = () =>
      webApp
        .post('/admin/projects/fcm')
        .auth(adminUsername, adminPassword)
        .send({
          project_id: projectId,
          client_email: 'user@domain.com',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\nMGUCAQACEQDZ9yHDjBHwQKkk+I3pfVeVAgMBAAECEQCw9uXR1zJlRQoGH0SKmPiB\nAgkA+w3y/vic1aECCQDeQlECbNmVdQIJAJPvYlLweKpBAgkAqBpAazUo3IECCQDj\nX4gCHu8E+w==\n-----END RSA PRIVATE KEY-----'
        })
        .end((err, res) => {
          expect(err).to.be.null
          res.should.have.status(202)
          subscribe()
        })

    const subscribe = () =>
      webApp
        .post('/subscribe')
        .send({
          hub_uri: hubUri,
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          oauth_token: oauthToken,
          extra_data: {
            project: projectId
          },
          device_type: 'firebase',
          device_id: deviceId
        })
        .end((err, res) => {
          expect(err).to.be.null
          res.should.have.status(202)
          res.text.should.equal('succeeded')
          callback()
        })

    const callback = () =>
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: {
              notification_id: notificationId,
              notification_html: notificationHtml
            }
          }
        ])
        .end((err, res) => {
          expect(err).to.be.null
          res.should.have.status(202)
          setTimeout(verifyPushQueueStats, 100)
        })

    let queuedBefore = 0
    let processedBefore = 0
    const verifyPushQueueStats = () =>
      pushQueue.stats().then(stats => {
        stats.pushQueue.queued.should.equal(queuedBefore + 1)
        stats.pushQueue.processed.should.equal(processedBefore + 1)
        done()
      })

    pushQueue.stats().then(statsBefore => {
      queuedBefore = statsBefore.pushQueue.queued
      processedBefore = statsBefore.pushQueue.processed
      setup()
    })
  })

  it('should works with wns', function (done) {
    nock('https://login.live.com')
      .post('/accesstoken.srf')
      .reply(200, {
        token_type: 'bearer',
        access_token: 'accessToken',
        expires_in: 86400
      })

    nock('https://hk2.notify.windows.com')
      .post('/')
      .query(true)
      .reply(404)

    const setup = function () {
      webApp
        .post('/admin/projects/wns')
        .auth(adminUsername, adminPassword)
        .send({
          package_id: wns.packageId,
          client_id: wns.clientId,
          client_secret: wns.clientSecret
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          subscribe()
        })
    }

    const subscribe = function () {
      webApp
        .post('/subscribe')
        .send({
          hub_uri: hubUri,
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          oauth_token: oauthToken,
          extra_data: {
            package: wns.packageId,
            channel_uri: wns.channelUri
          },
          device_type: wns.deviceType,
          device_id: wns.deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          res.text.should.equal('succeeded')
          callback()
        })
    }

    const callback = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: {
              notification_id: notificationId,
              notification_html: notificationHtml
            }
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          setTimeout(verifyPushQueueStats, 100)
        })
    }

    let queuedBefore = 0
    let processedBefore = 0
    const verifyPushQueueStats = function () {
      pushQueue.stats().then(function (stats) {
        stats.pushQueue.queued.should.equal(queuedBefore + 1)
        stats.pushQueue.processed.should.equal(processedBefore + 1)
        done()
      })
    }
    pushQueue.stats().then(function (statsBefore) {
      queuedBefore = statsBefore.pushQueue.queued
      processedBefore = statsBefore.pushQueue.processed
      setup()
    })
  })
})
