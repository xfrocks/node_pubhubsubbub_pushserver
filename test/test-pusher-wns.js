'use strict'

/* eslint-disable no-unused-expressions */

const pusher = require('../lib/pusher/wns')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

const lib = require('./mock/_modules-wns')
const clientId = 'ci'
const clientSecret = 'sc'
const channelUri = 'cu'
const dataRaw = { foo: 'bar' }

describe('pusher/wns', function () {
  beforeEach(function (done) {
    pusher.setup(lib)
    done()
  })

  it('should guard against missing lib', function (done) {
    pusher.setup()
    pusher.send(clientId, clientSecret, channelUri, dataRaw, function (err) {
      err.should.equal('lib missing')
      done()
    })
  })

  it('should guard against missing clientId', function (done) {
    pusher.send('', clientSecret, channelUri, dataRaw, function (err) {
      err.should.equal('clientId missing')
      done()
    })
  })

  it('should guard against missing clientSecret', function (done) {
    pusher.send(clientId, '', channelUri, dataRaw, function (err) {
      err.should.equal('clientSecret missing')
      done()
    })
  })

  it('should push', function (done) {
    pusher.send(clientId, clientSecret, channelUri, dataRaw, function (err) {
      expect(err).to.be.null

      const push = lib._getLatestPush()
      push.options.should.deep.equal({
        client_id: clientId,
        client_secret: clientSecret
      })
      push.channelUri.should.equal(channelUri)
      push.dataRaw.should.deep.equal(dataRaw)

      done()
    })
  })

  it('should fail', function (done) {
    const dataWithError = _.merge({ error: { message: 'something' } }, dataRaw)
    pusher.send(
      clientId,
      clientSecret,
      channelUri,
      dataWithError,
      function (err) {
        err.message.should.equal(dataWithError.error.message)
        done()
      })
  })

  it('should fail with status 4xx, retry=false', function (done) {
    const test = function (statusCode, callback) {
      const dataWithError = _.merge({}, dataRaw)
      dataWithError.error = { message: 'something', statusCode }
      pusher.send(
        clientId,
        clientSecret,
        channelUri,
        dataWithError,
        function (err, result) {
          err.statusCode.should.equal(statusCode)
          result.retry.should.be.false
          callback(statusCode)
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

  it('should fail with status 3xx, 5xx, retry unset', function (done) {
    const test = function (statusCode, callback) {
      const dataWithError = _.merge({}, dataRaw)
      dataWithError.error = { message: 'something', statusCode }
      pusher.send(
        clientId,
        clientSecret,
        channelUri,
        dataWithError,
        function (err, result) {
          err.statusCode.should.equal(statusCode)
          result.should.not.have.ownProperty('retry')
          callback(statusCode)
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

  it('should fail with deleteDevice=true', function (done) {
    const test = function (statusCode, callback) {
      const dataWithError = _.merge({}, dataRaw)
      dataWithError.error = { message: 'something', statusCode }
      pusher.send(
        clientId,
        clientSecret,
        channelUri,
        dataWithError,
        function (err, result) {
          err.statusCode.should.equal(statusCode)
          result.retry.should.be.false
          callback()
        })
    }

    const test1 = function () {
      test(404, test2)
    }
    const test2 = function () {
      test(410, done)
    }

    test1()
  })

  it('should do stats', function (done) {
    pusher.send(
      clientId,
      clientSecret,
      channelUri,
      dataRaw,
      function (err) {
        expect(err).to.be.null

        pusher.stats().then((stats) => {
          stats.wns.should.have.ownProperty(clientId)
          const thisStats = stats.wns[clientId]
          thisStats.sent.should.equal(1)
          thisStats.failed.should.equal(0)
          thisStats.invalid.should.equal(0)

          done()
        })
      })
  })

  it('should do stats (failed)', function (done) {
    const dataWithError = _.merge({ error: { message: 'something' } }, dataRaw)
    pusher.send(
      clientId,
      clientSecret,
      channelUri,
      dataWithError,
      function (err) {
        err.message.should.equal(dataWithError.error.message)

        pusher.stats().then((stats) => {
          stats.wns[clientId].failed.should.equal(1)

          done()
        })
      })
  })

  it('should do stats (invalid)', function (done) {
    const dataWithError = _.merge({}, dataRaw)
    dataWithError.error = { message: 'something', statusCode: 410 }

    pusher.send(
      clientId,
      clientSecret,
      channelUri,
      dataWithError,
      function (err) {
        err.statusCode.should.equal(dataWithError.error.statusCode)

        pusher.stats().then((stats) => {
          stats.wns[clientId].invalid.should.equal(1)

          done()
        })
      })
  })
})
