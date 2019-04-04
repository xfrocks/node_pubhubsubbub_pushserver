'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const pusher = require('../lib/pusher/fcm')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

const lib = require('./mock/_modules-firebase-admin')
const projectId = 'pi'
const projectConfig = {
  client_email: 'ce',
  private_key: 'pk'
}
const registrationToken = 'rt'
const payload = { foo: 'bar' }

describe('pusher/fcm', () => {
  beforeEach(done => {
    pusher.setup(config, lib)
    done()
  })

  it('should guard against missing lib', done => {
    pusher.setup(config, null)
    pusher.send(projectId, projectConfig, registrationToken, payload, err => {
      err.should.equal('lib missing')
      done()
    })
  })

  it('should guard against missing client_email', done => {
    const pcWithoutClientEmail = _.merge({}, projectConfig)
    delete pcWithoutClientEmail.client_email

    pusher.send(projectId, pcWithoutClientEmail, registrationToken, payload, err => {
      err.should.equal('client_email missing')
      done()
    })
  })

  it('should guard against missing private_key', done => {
    const pcWithoutPrivateKey = _.merge({}, projectConfig)
    delete pcWithoutPrivateKey.private_key

    pusher.send(projectId, pcWithoutPrivateKey, registrationToken, payload, err => {
      err.should.equal('private_key missing')
      done()
    })
  })

  it('should push', done => {
    pusher.send(projectId, projectConfig, registrationToken, payload, (err, result) => {
      expect(err).to.be.undefined
      result.sent.should.equal(1)

      const push = lib._getLatestPush()
      const credential = push.app._getCredential()
      credential._getClientEmail().should.equal(projectConfig.client_email)
      credential._getPrivateKey().should.equal(projectConfig.private_key)
      credential._getProjectId().should.equal(projectId)
      push.payload.should.deep.equal(payload)
      push.registrationToken.should.equal(registrationToken)

      done()
    })
  })

  it('should fail', done => {
    const payloadWithError = _.merge({ error: 'something' }, payload)
    pusher.send(
      projectId,
      projectConfig,
      registrationToken,
      payloadWithError,
      (err, result) => {
        err.should.equal(payloadWithError.error)
        result.failed.should.equal(1)
        done()
      })
  })

  it('should fail with response error, no retries', () => {
    const test = rt => new Promise(resolve =>
      pusher.send(projectId, projectConfig, rt, payload,
        (err, result) => {
          err.should.not.be.undefined
          err[rt].code.should.equal(rt)

          result.failed.should.equal(1)
          result.retries.should.be.empty

          resolve()
        })
    )

    let promises = []
    Object.keys(lib._errorCodes).forEach(error => {
      if (lib._errorCodes[error] !== 'noop') return
      promises.push(test(error))
    })

    return Promise.all(promises)
  })

  it('should fail with retries', () => {
    const test = rt => new Promise(resolve =>
      pusher.send(projectId, projectConfig, rt, payload,
        (err, result) => {
          err.should.not.be.undefined
          err[rt].code.should.equal(rt)

          result.failed.should.equal(1)
          result.retries.should.have.all.members([rt])

          resolve()
        })
    )

    let promises = []
    Object.keys(lib._errorCodes).forEach(error => {
      if (lib._errorCodes[error] !== 'retry') return
      promises.push(test(error))
    })

    return Promise.all(promises)
  })

  it('should fail with invalids', () => {
    const test = rt => new Promise(resolve =>
      pusher.send(projectId, projectConfig, rt, payload,
        (err, result) => {
          err.should.not.be.undefined
          err[rt].code.should.equal(rt)

          result.failed.should.equal(1)
          result.invalids.should.have.all.members([rt])

          resolve()
        })
    )

    let promises = []
    Object.keys(lib._errorCodes).forEach(error => {
      if (lib._errorCodes[error] !== 'invalid') return
      promises.push(test(error))
    })

    return Promise.all(promises)
  })

  it('should do stats', done => {
    pusher.send(projectId, projectConfig, registrationToken, payload, err => {
      expect(err).to.be.undefined

      pusher.stats().then(stats => {
        stats.fcm.should.have.ownProperty(projectId)
        const thisStats = stats.fcm[projectId]

        thisStats.batch.should.equal(1)
        thisStats.sent.should.equal(1)
        thisStats.failed.should.equal(0)
        thisStats.invalid.should.equal(0)

        done()
      })
    })
  })

  it('should do stats (batch)', done => {
    pusher.send(projectId, projectConfig, ['ok', 'messaging/internal-error'], payload, () => {
      pusher.stats().then((stats) => {
        stats.fcm[projectId].batch.should.equal(1)
        stats.fcm[projectId].sent.should.equal(1)
        stats.fcm[projectId].failed.should.equal(1)

        done()
      })
    })
  })

  it('should do stats (failed)', done => {
    pusher.send(projectId, projectConfig, 'messaging/message-rate-exceeded', payload, () => {
      pusher.stats().then((stats) => {
        stats.fcm[projectId].failed.should.equal(1)

        done()
      })
    })
  })

  it('should do stats (invalid)', done => {
    pusher.send(projectId, projectConfig, 'messaging/invalid-recipient', payload, () => {
      pusher.stats().then((stats) => {
        stats.fcm[projectId].invalid.should.equal(1)

        done()
      })
    })
  })
})
