'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const pusher = require('../lib/pusher/gcm')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

const lib = require('./mock/_modules-gcm')
const senderOptions = {
  packageId: 'pi',
  apiKey: 'ak'
}
const registrationToken = 'rt'
const data = { foo: 'bar' }

describe('pusher/gcm', function () {
  beforeEach(function (done) {
    config.gcm.messageOptions = {}
    pusher.setup(config, lib)
    done()
  })

  it('should guard against missing lib', function (done) {
    pusher.setup(config, null)
    pusher.send(senderOptions, registrationToken, data, function (err) {
      err.should.equal('lib missing')
      done()
    })
  })

  it('should guard against missing apiKey', function (done) {
    const soWithoutApiKey = _.merge({}, senderOptions)
    soWithoutApiKey.apiKey = ''

    pusher.send(soWithoutApiKey, registrationToken, data, function (err) {
      err.should.equal('apiKey missing')
      done()
    })
  })

  it('should push', function (done) {
    pusher.send(senderOptions, registrationToken, data, function (err) {
      expect(err).to.be.undefined

      const push = lib._getLatestPush()
      push.sender._getApiKey().should.equal(senderOptions.apiKey)
      push.message._getData().should.deep.equal(data)
      push.registrationToken.should.equal(registrationToken)

      done()
    })
  })

  it('should fail', function (done) {
    const dataWithError = _.merge({ error: 'something' }, data)
    pusher.send(
      senderOptions,
      registrationToken,
      dataWithError,
      function (err) {
        err.should.equal(dataWithError.error)
        done()
      })
  })

  it('should fail with status 4xx, no retries', function (done) {
    const test = function (status, callback) {
      const dataWithError = _.merge({ error: status }, data)
      pusher.send(senderOptions, registrationToken, dataWithError,
        function (err, result) {
          err.should.equal(status)
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

  it('should fail with status 3xx, 5xx, with retries', function (done) {
    const test = function (status, callback) {
      const dataWithError = _.merge({ error: status }, data)
      pusher.send(senderOptions, registrationToken, dataWithError,
        function (err, result) {
          err.should.equal(status)
          result.retries.should.have.all.members([registrationToken])
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

  it('should fail with response error, no retries', function (done) {
    const test = function (error, callback) {
      const rtWithError = 'error-' + error
      pusher.send(senderOptions, rtWithError, data,
        function (err, result) {
          err.should.not.be.undefined
          result.retries.should.be.empty
          callback()
        })
    }

    test('Some error', done)
  })

  it('should fail with response error, with retries', function (done) {
    const test = function (error, callback) {
      const rtWithError = 'error-' + error
      pusher.send(senderOptions, rtWithError, data,
        function (err, result) {
          err.should.not.be.undefined
          result.retries.should.have.all.members([rtWithError])
          callback()
        })
    }

    const test1 = function () {
      test('Unavailable', test2)
    }
    const test2 = function () {
      test('InternalServerError', done)
    }

    test1()
  })

  it('should fail with invalids', function (done) {
    const test = function (error, callback) {
      const rtWithError = 'error-' + error
      pusher.send(senderOptions, rtWithError, data,
        function (err, result) {
          err.should.not.be.undefined
          result.invalids.should.have.all.members([rtWithError])
          callback()
        })
    }

    const test1 = function () {
      test('MissingRegistration', test2)
    }
    const test2 = function () {
      test('InvalidRegistration', test3)
    }
    const test3 = function () {
      test('NotRegistered', test4)
    }
    const test4 = function () {
      test('MismatchSenderId', test5)
    }
    const test5 = function () {
      test('InvalidPackageName', done)
    }

    test1()
  })

  it('should do stats', function (done) {
    pusher.send(senderOptions, registrationToken, data, (err) => {
      expect(err).to.be.undefined

      pusher.stats().then((stats) => {
        stats.gcm.should.have.ownProperty(senderOptions.packageId)
        const thisStats = stats.gcm[senderOptions.packageId]
        thisStats.batch.should.equal(1)
        thisStats.sent.should.equal(1)
        thisStats.failed.should.equal(0)
        thisStats.invalid.should.equal(0)

        done()
      })
    })
  })

  it('should do stats (batch)', function (done) {
    pusher.send(senderOptions, ['ok', 'error-Some'], data, () => {
      pusher.stats().then((stats) => {
        stats.gcm[senderOptions.packageId].batch.should.equal(1)
        stats.gcm[senderOptions.packageId].sent.should.equal(1)
        stats.gcm[senderOptions.packageId].failed.should.equal(1)

        done()
      })
    })
  })

  it('should do stats (batch, module response no counter)', function (done) {
    const soWithNoCounter = _.merge({}, senderOptions)
    soWithNoCounter.apiKey = 'ak-no-counter'

    pusher.send(soWithNoCounter, ['ok', 'error-Some'], data, () => {
      pusher.stats().then((stats) => {
        stats.gcm[senderOptions.packageId].batch.should.equal(1)
        stats.gcm[senderOptions.packageId].sent.should.equal(1)
        stats.gcm[senderOptions.packageId].failed.should.equal(1)

        done()
      })
    })
  })

  it('should do stats (failed)', function (done) {
    pusher.send(senderOptions, 'error-Some', data, () => {
      pusher.stats().then((stats) => {
        stats.gcm[senderOptions.packageId].failed.should.equal(1)

        done()
      })
    })
  })

  it('should do stats (invalid)', function (done) {
    pusher.send(senderOptions, 'error-MissingRegistration', data, () => {
      pusher.stats().then((stats) => {
        stats.gcm[senderOptions.packageId].invalid.should.equal(1)

        done()
      })
    })
  })
})
