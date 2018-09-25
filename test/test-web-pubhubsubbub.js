'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const web = require('../lib/web')
const pubhubsubbub = require('../lib/web/pubhubsubbub')
const chai = require('chai')
const express = require('express')
const bodyParser = require('body-parser')
const http = require('http')
const _ = require('lodash')

chai.should()
chai.use(require('chai-http'))
const db = require('./mock/db')
const pushQueue = require('./mock/pushQueue')
const expect = chai.expect

const testApp = express()
let testAppReqs = []
testApp.use(bodyParser.urlencoded({ extended: false }))
testApp.post('/status/:code', function (req, res) {
  testAppReqs.push({
    params: req.params,
    body: req.body
  })
  res.status(req.params.code).end()
})

let server = null
let webApp = null

let testServer = null
let testAppUri = null
let testAppUriStatus202 = null

const callbackUri = 'http://push.server/callback'
const hubTopic = 'ht'
const oauthClientId = 'oci'
const oauthToken = 'ot'
const deviceType = 'dt'
const deviceId = 'di'
const extraData = { foo: 'bar' }
const payload = 'p'

describe('web/pubhubsubbub', function () {
  before(function (done) {
    web._reset()

    const app = web.app()
    server = http.createServer(app).listen(0)
    webApp = chai.request(server).keepOpen()
    pubhubsubbub.setup(app, '', db, pushQueue)

    testServer = http.createServer(testApp).listen()
    const testAppPort = testServer.address().port
    testAppUri = 'http://localhost:' + testAppPort
    testAppUriStatus202 = testAppUri + '/status/202'

    done()
  })

  beforeEach(function (done) {
    db.devices._reset()
    db.hubs._reset()
    pushQueue._reset()
    testAppReqs = []
    done()
  })

  after(function (done) {
    server.close()
    testServer.close()
    done()
  })

  it('should say hi', function (done) {
    webApp
      .get('/')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        res.text.should.have.string('Hi, I am')

        done()
      })
  })

  it('should say hi with config.web.callback', function (done) {
    config.web.callback = callbackUri

    webApp
      .get('/')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        res.text.should.have.string('Hi, I am ' + callbackUri)
        config._reload()

        done()
      })
  })

  it('should subscribe', function (done) {
    const step1 = function () {
      webApp
        .post('/subscribe')
        .send({
          hub_uri: testAppUriStatus202,
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          oauth_token: oauthToken,
          device_type: deviceType,
          device_id: deviceId,
          extra_data: extraData
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          res.text.should.equal('succeeded')
          step2()
        })
    }

    const step2 = function () {
      db.devices.findDevices(oauthClientId, hubTopic, function (devices) {
        devices.length.should.equal(1)

        const device = devices[0]
        device.device_type.should.equal(deviceType)
        device.device_id.should.equal(deviceId)
        device.extra_data.foo.should.equal(extraData.foo)

        done()
      })
    }

    step1()
  })

  it('should subscribe without hub topic', function (done) {
    const step1 = function () {
      webApp
        .post('/subscribe')
        .send({
          hub_uri: testAppUriStatus202,
          oauth_client_id: oauthClientId,
          oauth_token: oauthToken,
          device_type: deviceType,
          device_id: deviceId,
          extra_data: extraData
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(204)
          step2()
        })
    }

    const step2 = function () {
      db.devices.findDevices(oauthClientId, '', function (devices) {
        devices.length.should.equal(1)

        const device = devices[0]
        device.device_type.should.equal(deviceType)
        device.device_id.should.equal(deviceId)
        device.extra_data.foo.should.equal(extraData.foo)

        done()
      })
    }

    step1()
  })

  it('should not subscribe with missing data', function (done) {
    const seed = {
      device_type: deviceType,
      device_id: deviceId,
      oauth_client_id: oauthClientId,
      hub_uri: testAppUriStatus202
    }

    const data = []
    _.forEach(seed, function (v, k) {
      const testDataWithoutKey = _.omit(seed, k)
      data.push(testDataWithoutKey)

      const testDataWithEmptyKey = _.merge({ k: '' }, testDataWithoutKey)
      data.push(testDataWithEmptyKey)
    })

    const test = function () {
      const testData = data.shift()

      webApp
        .post('/subscribe')
        .send(testData)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)

          if (data.length > 0) {
            test()
          } else {
            done()
          }
        })
    }

    test()
  })

  it('should not subscribe with db.devices error', function (done) {
    webApp
      .post('/subscribe')
      .send({
        hub_uri: testAppUriStatus202,
        hub_topic: hubTopic,
        oauth_client_id: oauthClientId,
        oauth_token: oauthToken,
        device_type: deviceType,
        device_id: 'error'
      })
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(500)
        done()
      })
  })

  it('should not subscribe with db.hubs error', function (done) {
    webApp
      .post('/subscribe')
      .send({
        hub_uri: 'http://err.or/hub',
        hub_topic: hubTopic,
        oauth_client_id: oauthClientId,
        oauth_token: oauthToken,
        device_type: deviceType,
        device_id: deviceId
      })
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(500)
        done()
      })
  })

  it('should not subscribe with hub error', function (done) {
    webApp
      .post('/subscribe')
      .send({
        hub_uri: testAppUri + '/status/403',
        hub_topic: hubTopic,
        oauth_client_id: oauthClientId,
        oauth_token: oauthToken,
        device_type: deviceType,
        device_id: deviceId
      })
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(403)
        res.text.should.equal('failed')
        done()
      })
  })

  it('should not subscribe with invalid hub', function (done) {
    webApp
      .post('/subscribe')
      .send({
        hub_uri: 'http://a.b.c/hub',
        hub_topic: hubTopic,
        oauth_client_id: oauthClientId,
        oauth_token: oauthToken,
        device_type: deviceType,
        device_id: deviceId
      })
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(503)
        done()
      })
  })

  it('should unsubscribe', function (done) {
    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          step1()
        })
    }

    const step1 = function () {
      webApp
        .post('/unsubscribe')
        .send({
          hub_uri: testAppUriStatus202,
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          device_type: deviceType,
          device_id: deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          res.text.should.equal('succeeded')
          step2()
        })
    }

    const step2 = function () {
      db.devices.findDevices(oauthClientId, null, function (devices) {
        devices.length.should.equal(1)

        const device = devices[0]
        device.device_type.should.equal(deviceType)
        device.device_id.should.equal(deviceId)
        device.hub_topic.length.should.equal(0)
      })

      done()
    }

    init()
  })

  it('should not unsubscribe with missing data', function (done) {
    const seed = [
      {},
      { hub_topic: hubTopic },
      { oauth_client_id: oauthClientId },
      { device_type: deviceType },
      { device_id: deviceId }
    ]

    const data = []
    _.forEach(seed, function (dataPiece) {
      let prevData = {}
      if (data.length > 0) {
        prevData = _.last(data)
      }
      data.push(_.assign({}, prevData, dataPiece))
    })

    const test = function () {
      const testData = data.shift()

      webApp
        .post('/unsubscribe')
        .send(testData)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)

          if (data.length > 0) {
            test()
          } else {
            done()
          }
        })
    }

    test()
  })

  it('should not unsubscribe with unknown device', function (done) {
    webApp
      .post('/unsubscribe')
      .send({
        hub_uri: testAppUriStatus202,
        hub_topic: hubTopic,
        oauth_client_id: oauthClientId,
        device_type: deviceType,
        device_id: deviceId
      })
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(500)
        done()
      })
  })

  it('should not unsubscribe with hub error', function (done) {
    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          step1()
        })
    }

    const step1 = function () {
      webApp
        .post('/unsubscribe')
        .send({
          hub_uri: testAppUri + '/status/403',
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          device_type: deviceType,
          device_id: deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(403)
          res.text.should.equal('failed')
          done()
        })
    }

    init()
  })

  it('should not unsubscribe with invalid hub', function (done) {
    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          step1()
        })
    }

    const step1 = function () {
      webApp
        .post('/unsubscribe')
        .send({
          hub_uri: 'http://a.b.c/hub',
          hub_topic: hubTopic,
          oauth_client_id: oauthClientId,
          device_type: deviceType,
          device_id: deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(503)
          done()
        })
    }

    init()
  })

  it('should unregister', function (done) {
    const init = function () {
      db.devices.save(deviceType, deviceId, oauthClientId,
        null, null, function (isSaved) {
          isSaved.should.equal('saved')
          step1()
        })
    }

    const step1 = function () {
      webApp
        .post('/unregister')
        .send({
          oauth_client_id: oauthClientId,
          device_type: deviceType,
          device_id: deviceId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.text.should.equal('succeeded')
          step2()
        })
    }

    const step2 = function () {
      db.devices.findDevices(oauthClientId, null, function (devices) {
        devices.length.should.equal(0)
      })

      done()
    }

    init()
  })

  it('should not unregister with missing data', function (done) {
    const seed = [
      {},
      { device_type: deviceType },
      { device_id: deviceId }
    ]

    const data = []
    _.forEach(seed, function (dataPiece) {
      let prevData = {}
      if (data.length > 0) {
        prevData = _.last(data)
      }
      data.push(_.assign({}, prevData, dataPiece))
    })

    const test = function () {
      const testData = data.shift()

      webApp
        .post('/unregister')
        .send(testData)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)

          if (data.length > 0) {
            test()
          } else {
            done()
          }
        })
    }

    test()
  })

  it('should not unregister with db error', function (done) {
    webApp
      .post('/unregister')
      .send({
        oauth_client_id: oauthClientId,
        device_type: deviceType,
        device_id: 'error'
      })
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(500)
        done()
      })
  })

  it('should answer subscribe challenge', function (done) {
    const challenge = Math.random().toString()

    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          test()
        })
    }

    const test = function () {
      webApp
        .get('/callback')
        .query({
          'client_id': oauthClientId,
          'hub.challenge': challenge,
          'hub.mode': 'subscribe',
          'hub.topic': hubTopic
        })
        .send()
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.text.should.equal(challenge)

          done()
        })
    }

    init()
  })

  it('should answer unsubscribe challenge', function (done) {
    const challenge = Math.random().toString()

    webApp
      .get('/callback')
      .query({
        'client_id': oauthClientId,
        'hub.challenge': challenge,
        'hub.mode': 'unsubscribe',
        'hub.topic': hubTopic
      })
      .send()
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        res.text.should.equal(challenge)

        done()
      })
  })

  it('should not answer challenge with missing data', function (done) {
    const seed = [
      {},
      { 'hub.topic': hubTopic },
      { 'client_id': oauthClientId },
      { 'hub.challenge': Math.random().toString() },
      { 'hub.mode': 'subscribe' }
    ]

    const data = []
    _.forEach(seed, function (dataPiece) {
      let prevData = {}
      if (data.length > 0) {
        prevData = _.last(data)
      }
      data.push(_.assign({}, prevData, dataPiece))
    })

    const test = function () {
      const testData = data.shift()

      webApp
        .get('/callback')
        .query(testData)
        .send()
        .end(function (err, res) {
          expect(err).to.be.null
          res.status.should.be.within(400, 499)

          if (data.length > 0) {
            test()
          } else {
            done()
          }
        })
    }

    test()
  })

  it('should not answer subscribe challenge without device', function (done) {
    const challenge = Math.random().toString()

    webApp
      .get('/callback')
      .query({
        'client_id': oauthClientId,
        'hub.challenge': challenge,
        'hub.mode': 'subscribe',
        'hub.topic': hubTopic
      })
      .send()
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(405)
        done()
      })
  })

  it('should enqueue push', function (done) {
    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, extraData,
        function (isSaved) {
          isSaved.should.equal('saved')
          test()
        })
    }

    const test = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: payload
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)

          const job = pushQueue._getLatestJob()
          job.should.not.be.null
          job.deviceType.should.equal(deviceType)
          job.deviceIds.should.have.all.members([deviceId])
          _.pick(job.extraData, _.keys(extraData))
            .should.deep.equal(extraData)
          job.payload.should.equal(payload)

          done()
        })
    }

    init()
  })

  it('should enqueue pushes for all devices at once', function (done) {
    const deviceId2 = 'di2'

    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')

          db.devices.save(deviceType, deviceId2,
            oauthClientId, hubTopic, null,
            function (isSaved) {
              isSaved.should.equal('saved')
              test()
            })
        })
    }

    const test = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: payload
          }
        ])
        .end(function () {
          const jobs = pushQueue._getJobs()
          jobs.length.should.equal(1)

          const job = pushQueue._getLatestJob()
          const deviceIds = job.deviceIds
          deviceIds.should.have.all.members([deviceId, deviceId2])

          done()
        })
    }

    init()
  })

  it('should enqueue pushes for all devices (diff types)', function (done) {
    const deviceType2 = 'dt2'
    const deviceId2 = 'di2'

    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')

          db.devices.save(deviceType2, deviceId2,
            oauthClientId, hubTopic, null,
            function (isSaved) {
              isSaved.should.equal('saved')
              test()
            })
        })
    }

    const test = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: payload
          }
        ])
        .end(function () {
          const jobs = pushQueue._getJobs()
          jobs.length.should.equal(2)
          jobs[0].deviceType.should.equal(deviceType)
          jobs[0].deviceIds.should.have.all.members([deviceId])
          jobs[1].deviceType.should.equal(deviceType2)
          jobs[1].deviceIds.should.have.all.members([deviceId2])

          done()
        })
    }

    init()
  })

  it('should enqueue pushes for all devices (diff data)', function (done) {
    const deviceId2 = 'di2'

    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, { data: 1 },
        function (isSaved) {
          isSaved.should.equal('saved')

          db.devices.save(deviceType, deviceId2,
            oauthClientId, hubTopic, { data: 2 },
            function (isSaved) {
              isSaved.should.equal('saved')
              test()
            })
        })
    }

    const test = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: payload
          }
        ])
        .end(function () {
          const jobs = pushQueue._getJobs()
          jobs.length.should.equal(2)

          done()
        })
    }

    init()
  })

  it('should enqueue pushes for all devices (no hub topic)', function (done) {
    const deviceId2 = 'di2'
    const deviceId3 = 'di3'
    const hubTopic2 = 'ht2'

    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, { data: 1 },
        function (isSaved) {
          isSaved.should.equal('saved')

          db.devices.save(deviceType, deviceId2,
            oauthClientId, hubTopic2, { data: 2 },
            function (isSaved) {
              isSaved.should.equal('saved')

              db.devices.save(deviceType, deviceId3,
                oauthClientId, '', { data: 3 },
                function (isSaved) {
                  isSaved.should.equal('saved')
                  test()
                })
            })
        })
    }

    const test = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: '',
            object_data: payload
          }
        ])
        .end(function () {
          const jobs = pushQueue._getJobs()
          jobs.length.should.equal(3)

          done()
        })
    }

    init()
  })

  it('should enqueue pushes for all pings', function (done) {
    const init = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          test()
        })
    }

    const test = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: payload
          },
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: 'p2'
          }
        ])
        .end(function () {
          const jobs = pushQueue._getJobs()
          jobs.length.should.equal(2)
          jobs[0].payload.should.equal(payload)
          jobs[1].payload.should.equal('p2')

          done()
        })
    }

    init()
  })

  it('should not enqueue invalid data', function (done) {
    const test1 = function () {
      webApp
        .post('/callback')
        .send('text')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          const job = pushQueue._getLatestJob()
          expect(job).to.be.null

          test2()
        })
    }

    const test2 = function () {
      webApp
        .post('/callback')
        .send([
          {
            topic: hubTopic,
            object_data: payload
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          const job = pushQueue._getLatestJob()
          expect(job).to.be.null

          test3()
        })
    }

    const test3 = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            object_data: payload
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          const job = pushQueue._getLatestJob()
          expect(job).to.be.null

          test4()
        })
    }

    const test4 = function () {
      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          const job = pushQueue._getLatestJob()
          expect(job).to.be.null

          done()
        })
    }

    test1()
  })

  it('should auto-unsubscribe', function (done) {
    const hubUri = testAppUriStatus202

    const init = function () {
      db.hubs.save(oauthClientId, hubUri, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          test()
        })
    }

    const test = function () {
      testAppReqs.length.should.equal(0)

      webApp
        .post('/callback')
        .send([
          {
            client_id: oauthClientId,
            topic: hubTopic,
            object_data: payload
          }
        ])
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)

          setTimeout(function () {
            testAppReqs.length.should.equal(1)

            const req = testAppReqs[0]
            req.body.client_id.should.equal(oauthClientId)
            req.body['hub.topic'].should.equal(hubTopic)
            req.body['hub.mode'].should.equal('unsubscribe')

            done()
          }, 10)
        })
    }

    init()
  })

  it('[auto-unsubscribe] should report hub not found', function (done) {
    pubhubsubbub._findHubToUnsubscribe(
      oauthClientId,
      hubTopic,
      db,
      callbackUri,
      function (err) {
        err.should.equal('Hub not found')
        done()
      })
  })

  it('[auto-unsubscribe] should report unsubscribe error', function (done) {
    const hubUri = testAppUri + '/status/403'

    const init = function () {
      db.hubs.save(oauthClientId, hubUri, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          test()
        })
    }

    const test = function () {
      pubhubsubbub._findHubToUnsubscribe(
        oauthClientId,
        hubTopic,
        db,
        callbackUri,
        function (err) {
          err.should.equal('failed')
          done()
        })
    }

    init()
  })

  it('[auto-unsubscribe] should report connection error', function (done) {
    const hubUri = 'http://a.b.c/hub'

    const init = function () {
      db.hubs.save(oauthClientId, hubUri, null,
        function (isSaved) {
          isSaved.should.equal('saved')
          test()
        })
    }

    const test = function () {
      pubhubsubbub._findHubToUnsubscribe(
        oauthClientId,
        hubTopic,
        db,
        callbackUri,
        function (err) {
          err.should.be.a('Error')
          done()
        })
    }

    init()
  })

  it('[auto-unsubscribe] should unsubscribe all uris', function (done) {
    const hubUri = testAppUriStatus202
    const hubUri2 = testAppUri + '/status/203'

    const init = function () {
      db.hubs.save(oauthClientId, hubUri, null,
        function (isSaved) {
          isSaved.should.equal('saved')

          db.hubs.save(oauthClientId, hubUri2, null,
            function (isUpdated) {
              isUpdated.should.equal('updated')
              test()
            })
        })
    }

    const test = function () {
      testAppReqs.length.should.equal(0)

      pubhubsubbub._findHubToUnsubscribe(
        oauthClientId,
        hubTopic,
        db,
        callbackUri,
        function (err) {
          expect(err).to.be.undefined
          testAppReqs.length.should.equal(2)
          done()
        })
    }

    init()
  })

  it('should not register some routes without db', function (done) {
    const pubhubsubbubPrefix = '/no-device-db'
    pubhubsubbub.setup(web.app(), pubhubsubbubPrefix)

    const test1 = function () {
      webApp
        .post(pubhubsubbubPrefix + '/subscribe')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(404)
          test2()
        })
    }

    const test2 = function () {
      webApp
        .post(pubhubsubbubPrefix + '/unsubscribe')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(404)
          test3()
        })
    }

    const test3 = function () {
      webApp
        .post(pubhubsubbubPrefix + '/unregister')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(404)
          test4()
        })
    }

    const test4 = function () {
      webApp
        .get(pubhubsubbubPrefix + '/callback')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(404)
          test5()
        })
    }

    const test5 = function () {
      webApp
        .post(pubhubsubbubPrefix + '/callback')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(404)
          done()
        })
    }

    test1()
  })

  it('should not register /callback without queue', function (done) {
    const pubhubsubbubPrefix = '/no-device-db'
    pubhubsubbub.setup(web.app(), pubhubsubbubPrefix, db.devices)

    webApp
      .post(pubhubsubbubPrefix + '/callback')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(404)
        done()
      })
  })
})
