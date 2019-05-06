'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const pusher = require('../lib/pusher/apn')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

const lib = require('./mock/_modules-apn')
const originalApnOptions = _.cloneDeep(config.apn)
const connectionOptionsCert = {
  packageId: 'pi',
  cert: 'c',
  key: 'k'
}
const connectionOptions = {
  packageId: 'pi',
  token: {
    key: 'k',
    keyId: 'ki',
    teamId: 'ti'
  }
}
const token = 't'
const payload = { aps: { alert: 'foo' } }

describe('pusher/apn', function () {
  beforeEach(function (done) {
    lib._reset()
    config.apn = _.cloneDeep(originalApnOptions)
    pusher.setup(config, lib)
    done()
  })

  it('should guard against missing lib', function (done) {
    pusher.setup(config, null)
    pusher.send(connectionOptions, token, payload, function (err) {
      err.should.equal('lib missing')
      done()
    })
  })

  it('should push with cert', function (done) {
    pusher.send(connectionOptionsCert, token, payload, function (err) {
      expect(err).to.be.undefined

      const push = lib._getLatestPush()
      push.provider.options.should.deep.equal(connectionOptionsCert)
      push.recipient.should.equal(token)
      push.notification.alert.should.equal(payload.aps.alert)
      push.notification.expiry.should.equal(0)

      lib._getProviderCount().should.equal(1)

      done()
    })
  })

  it('should push with token', function (done) {
    pusher.send(connectionOptions, token, payload, function (err) {
      expect(err).to.be.undefined

      const push = lib._getLatestPush()
      push.provider.options.should.deep.equal(connectionOptions)
      push.recipient.should.equal(token)
      push.notification.alert.should.equal(payload.aps.alert)
      push.notification.expiry.should.equal(0)

      lib._getProviderCount().should.equal(1)

      done()
    })
  })

  it('should fail with string', function (done) {
    const deviceId = 'fail-string'
    pusher.send(connectionOptions, deviceId, payload, function (err) {
      err[deviceId].error.should.be.a('string')
      done()
    })
  })

  it('should fail with Error', function (done) {
    const deviceId = 'fail-Error'
    pusher.send(connectionOptions, deviceId, payload, function (err) {
      err[deviceId].error.should.be.a('Error')
      done()
    })
  })

  it('should fail with unknown error', function (done) {
    const deviceId = 'fail-unknown'
    pusher.send(connectionOptions, deviceId, payload, function (err) {
      err.should.have.all.keys([deviceId])
      done()
    })
  })

  it('should fail with no retries', function (done) {
    const test = function (status, callback) {
      const deviceId = 'fail-string'
      const payloadWithFailedStatus = _.merge(
        { failed_status: status },
        payload
      )

      pusher.send(connectionOptions,
        deviceId,
        payloadWithFailedStatus,
        function (err, result) {
          err.should.not.be.undefined
          result.retries.should.be.empty
          callback(status)
        })
    }

    const testRange = function (start, end, testRangeCallback) {
      const testCallback = function (i) {
        i++
        if (i === end) {
          testRangeCallback()
          return
        }

        test(i, testCallback)
      }

      test(start, testCallback)
    }

    testRange(400, 500, done)
  })

  it('should fail with retries', function (done) {
    const test = function (status, callback) {
      const deviceId = 'fail-string'
      const payloadWithFailedStatus = _.merge(
        { failed_status: status },
        payload
      )

      pusher.send(connectionOptions,
        deviceId,
        payloadWithFailedStatus,
        function (err, result) {
          err.should.not.be.undefined
          result.retries.should.have.all.members([deviceId])
          callback(status)
        })
    }

    const testRange = function (start, end, testRangeCallback) {
      const testCallback = function (i) {
        i++
        if (i === end) {
          testRangeCallback()
          return
        }

        test(i, testCallback)
      }

      test(start, testCallback)
    }

    testRange(300, 400, function () {
      testRange(500, 600, done)
    })
  })

  it('should fail with invalids status 400', function (done) {
    const test = function (reason, callback) {
      const deviceId = 'fail-string'
      const payloadWithFailedStatus = _.merge({
        failed_status: 400,
        failed_reason: reason
      }, payload)
      pusher.send(connectionOptions,
        deviceId,
        payloadWithFailedStatus,
        function (err, result) {
          err.should.not.be.undefined
          result.invalids.should.have.all.members([deviceId])
          callback()
        })
    }

    const test1 = function () {
      test('BadDeviceToken', test2)
    }
    const test2 = function () {
      test('DeviceTokenNotForTopic', test3)
    }
    const test3 = function () {
      test('TopicDisallowed', done)
    }

    test1()
  })

  it('should fail with deleteDevice=true status 410', function (done) {
    const deviceId = 'fail-string'
    const payloadWithFailedStatus = _.merge({
      failed_status: 410,
      failed_reason: 'Unregistered'
    }, payload)
    pusher.send(connectionOptions,
      deviceId,
      payloadWithFailedStatus,
      function (err, result) {
        err.should.not.be.undefined
        result.invalids.should.have.all.members([deviceId])
        done()
      })
  })

  it('should guard against missing data', function (done) {
    const payloadTest = function () {
      pusher.send({
        packageId: 'pi',
        cert: 'cd',
        key: 'kd'
      }, token, {}, function (err) {
        err.should.be.string
        certTest1()
      })
    }

    const certTest1 = function () {
      pusher.send({
        cert: 'cd',
        key: 'kd'
      }, token, payload, function (err) {
        err.should.be.string
        certTest2()
      })
    }

    const certTest2 = function () {
      pusher.send({
        packageId: 'pi',
        key: 'kd'
      }, token, payload, function (err) {
        err.should.be.string
        certDone()
      })
    }

    const certDone = function () {
      tokenTest1()
    }

    const tokenTest1 = function () {
      pusher.send({
        token: {
          key: '',
          keyId: 'ki',
          teamId: 'ti'
        }
      }, token, payload, function (err) {
        err.should.be.string
        tokenTest2()
      })
    }

    const tokenTest2 = function () {
      pusher.send({
        packageId: 'pi',
        token: {
          keyId: 'ki',
          teamId: 'ti'
        }
      }, token, payload, function (err) {
        err.should.be.string
        tokenDone()
      })
    }

    const tokenDone = function () {
      bothTest()
    }

    const bothTest = function () {
      pusher.send({
        packageId: 'pi',
        cert: 'cd',
        key: 'kd',
        token: {
          key: 'k',
          keyId: 'ki',
          teamId: 'ti'
        }
      }, token, payload, function (err) {
        err.should.be.string
        done()
      })
    }

    payloadTest()
  })

  it('should configure notification directly', function (done) {
    const payload = {
      'aps': {
        alert: 'foo',
        badge: 99,
        sound: 's'
      },
      'expiry': 123,
      'data': {
        foo: 'bar'
      }
    }

    pusher.send(connectionOptions, token, payload, function () {
      const push = lib._getLatestPush()
      push.notification.alert.should.equal(payload.aps.alert)
      push.notification.badge.should.equal(payload.aps.badge)
      push.notification.sound.should.equal(payload.aps.sound)
      push.notification.expiry.should.equal(payload.expiry)

      const filtered = _.omit(payload, ['aps', 'expiry'])
      push.notification.payload.should.deep.equal(filtered)

      done()
    })
  })

  it('should configure notification via config', function (done) {
    config.apn.notificationOptions = {
      sound: 's',
      expiry: 123
    }

    pusher.send({
      packageId: 'pi',
      cert: 'cd',
      key: 'kd'
    }, token, payload, function () {
      const push = lib._getLatestPush()
      push.notification.alert.should.equal(payload.aps.alert)
      push.notification.sound
        .should.equal(config.apn.notificationOptions.sound)
      push.notification.expiry
        .should.equal(config.apn.notificationOptions.expiry)

      done()
    })
  })

  it('should reuse cert connection', function (done) {
    const test1 = function () {
      pusher.send(connectionOptions, token, payload, function () {
        test2()
      })
    }

    const test2 = function () {
      pusher.send(connectionOptions, 't2', payload, function () {
        lib._getProviderCount().should.equal(1)

        done()
      })
    }

    test1()
  })

  it('should reuse token connection', function (done) {
    const test1 = function () {
      pusher.send(connectionOptions, token, payload, function () {
        test2()
      })
    }

    const test2 = function () {
      pusher.send(connectionOptions, 't2', payload, function () {
        lib._getProviderCount().should.equal(1)

        done()
      })
    }

    test1()
  })

  it('should not reuse old connection', function (done) {
    config.apn.connectionTtlInMs = 10

    const test1 = function () {
      pusher.send(connectionOptions, token, payload, function () {
        setTimeout(test2, 20)
      })
    }

    const test2 = function () {
      pusher.send(connectionOptions, 't2', payload, function () {
        lib._getProviderCount().should.equal(2)

        done()
      })
    }

    test1()
  })

  it('should create connections (diff packageIds)', function (done) {
    const connectionOptions2 = _.merge({}, connectionOptions)
    connectionOptions2.packageId = 'pi2'

    const test1 = function () {
      pusher.send(connectionOptions, token, payload, function () {
        lib._getProviderCount().should.equal(1)

        test2()
      })
    }

    const test2 = function () {
      pusher.send(connectionOptions2, 't2', payload, function () {
        lib._getProviderCount().should.equal(2)

        done()
      })
    }

    test1()
  })

  it('should create connections (diff certs)', function (done) {
    const connectionOptions2 = _.merge({}, connectionOptionsCert)
    connectionOptions2.cert = 'c2'

    const test1 = function () {
      pusher.send(connectionOptionsCert, token, payload, function () {
        lib._getProviderCount().should.equal(1)

        test2()
      })
    }

    const test2 = function () {
      pusher.send(connectionOptions2, 't2', payload, function () {
        lib._getProviderCount().should.equal(2)

        done()
      })
    }

    test1()
  })

  it('should create connections (diff tokens)', function (done) {
    const connectionOptions2 = _.merge({}, connectionOptions)
    connectionOptions2.token.key = 'k2'

    const test1 = function () {
      pusher.send(connectionOptions, token, payload, function () {
        lib._getProviderCount().should.equal(1)

        test2()
      })
    }

    const test2 = function () {
      pusher.send(connectionOptions2, 't2', payload, function () {
        lib._getProviderCount().should.equal(2)

        done()
      })
    }

    test1()
  })

  it('should clean up connections', function (done) {
    let push1 = null
    let push2 = null

    const test1 = function () {
      pusher.send(connectionOptions, token, payload, function () {
        push1 = lib._getLatestPush()
        lib._getProviderCount().should.equal(1)
        pusher._getActiveConnectionIds().length.should.equal(1)

        setTimeout(test2, 20)
      })
    }

    const test2 = function () {
      pusher.send(connectionOptionsCert, 't2', payload, function () {
        push2 = lib._getLatestPush()
        lib._getProviderCount().should.equal(2)
        pusher._getActiveConnectionIds().length.should.equal(2)

        setTimeout(test3, 20)
      })
    }

    const test3 = function () {
      pusher._cleanUpConnections(30)

      push1.provider._hasBeenShutdown.should.be.true
      push2.provider._hasBeenShutdown.should.be.false
      lib._getProviderCount().should.equal(2)
      pusher._getActiveConnectionIds().length.should.equal(1)

      done()
    }

    test1()
  }).timeout(100)

  it('should do stats', function (done) {
    pusher.send(connectionOptions, token, payload, function () {
      pusher.stats().then((stats) => {
        stats.apn.should.have.ownProperty(connectionOptions.packageId)
        const thisStats = stats.apn[connectionOptions.packageId]
        thisStats.batch.should.equal(1)
        thisStats.sent.should.equal(1)
        thisStats.failed.should.equal(0)
        thisStats.invalid.should.equal(0)

        done()
      })
    })
  })

  it('should do stats (batch)', function (done) {
    pusher.send(connectionOptions, ['ok', 'fail-string'], payload,
      function () {
        pusher.stats().then((stats) => {
          stats.apn[connectionOptions.packageId].batch.should.equal(1)
          stats.apn[connectionOptions.packageId].sent.should.equal(1)
          stats.apn[connectionOptions.packageId].failed.should.equal(1)

          done()
        })
      })
  })

  it('should do stats (failed)', function (done) {
    pusher.send(connectionOptions, 'fail-string', payload,
      function () {
        pusher.stats().then((stats) => {
          stats.apn[connectionOptions.packageId].failed.should.equal(1)

          done()
        })
      })
  })

  it('should do stats (invalid)', function (done) {
    const payloadWithFailedStatus = _.merge({
      failed_status: 410,
      failed_reason: 'Unregistered'
    }, payload)
    pusher.send(connectionOptions, 'fail-string', payloadWithFailedStatus,
      function () {
        pusher.stats().then((stats) => {
          stats.apn[connectionOptions.packageId].invalid.should.equal(1)

          done()
        })
      })
  })
})
