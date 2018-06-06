'use strict'

const config = require('../lib/config')
const chai = require('chai')
const _ = require('lodash')

chai.should()

const originalProcessEnv = _.cloneDeep(process.env)

describe('db', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(20000)

  const waitForConnection = function (db) {
    return new Promise(function (resolve) {
      const check = function () {
        if (db.isConnecting()) {
          return setTimeout(check, 100)
        }
        resolve()
      }

      check()
    })
  }

  beforeEach(function (done) {
    process.env = _.cloneDeep(originalProcessEnv)
    config._reload()
    done()
  })

  it('should connect', function () {
    const db = require('../lib/db')(config)
    return waitForConnection(db)
      .then(() => db.isConnected().should.be.true)
      .then(() => db.closeConnection())
  })

  it('should fail with invalid uri', function () {
    config.db.mongoUri = 'mongodb://a.b.c/db'
    const db = require('../lib/db')(config)
    return waitForConnection(db)
      .then(() => db.isConnected().should.be.false)
  })
})
