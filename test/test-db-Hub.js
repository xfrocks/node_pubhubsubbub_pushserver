'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

let db = null
const originalProcessEnv = _.cloneDeep(process.env)
const oauthClientIdBase = 'oci' + _.now()
const hubUri = 'hu'
const extraData = { foo: 'bar' }

describe('db/Hub', function () {
  before(function (done) {
    // eslint-disable-next-line no-invalid-this
    this.timeout(20000)

    process.env = _.cloneDeep(originalProcessEnv)
    config._reload()
    db = require('../lib/db')(config)

    const waitForDb = function () {
      if (!db.isConnected()) {
        return setTimeout(waitForDb, 100)
      }

      done()
    }

    waitForDb()
  })

  after(function (done) {
    db.hubs._model.collection.drop()
      .then(() => db.closeConnection())
      .then(done)
  })

  it('should save hub', function (done) {
    const oauthClientId = oauthClientIdBase + '-save'

    const step1 = function () {
      db.hubs.save(oauthClientId, hubUri, extraData,
        function (isSaved) {
          isSaved.should.equal('inserted')
          step2()
        })
    }

    const step2 = function () {
      db.hubs._model.find({
        oauth_client_id: oauthClientId
      }, function (err, hubs) {
        expect(err).to.be.null
        hubs.should.be.a('array')
        hubs.length.should.equal(1)

        const hub = hubs[0]
        hub.oauth_client_id.should.equal(oauthClientId)
        hub.hub_uri.should.be.a('array')
        hub.hub_uri.length.should.equal(1)
        hub.hub_uri.should.include(hubUri)
        hub.extra_data.should.deep.equal(extraData)

        done()
      })
    }

    step1()
  })

  it('should update hub uri', function (done) {
    const oauthClientId = oauthClientIdBase + '-update-hub-uri'
    const hubUri2 = hubUri + '2'
    let theHub = null

    const init = function () {
      db.hubs._model.create({
        oauth_client_id: oauthClientId,
        hub_uri: [hubUri],
        extra_data: extraData
      }, function (err, hub) {
        expect(err).to.be.null
        hub.should.not.be.null
        theHub = hub
        step1()
      })
    }

    const step1 = function () {
      db.hubs.save(oauthClientId, hubUri2, extraData,
        function (isSaved) {
          isSaved.should.equal('updated')
          step2()
        })
    }

    const step2 = function () {
      db.hubs._model.findById(theHub._id, function (err, hub) {
        expect(err).to.be.null
        hub.hub_uri.should.have.members([hubUri, hubUri2])
        done()
      })
    }

    init()
  })

  it('should update hub extra data', function (done) {
    const oauthClientId = oauthClientIdBase + '-update-extra-data'
    const extraData2 = { bar: 'foo' }
    let theHub = null

    const init = function () {
      db.hubs._model.create({
        oauth_client_id: oauthClientId,
        hub_uri: [hubUri],
        extra_data: extraData
      }, function (err, hub) {
        expect(err).to.be.null
        hub.should.not.be.null
        theHub = hub
        step1()
      })
    }

    const step1 = function () {
      db.hubs.save(oauthClientId, hubUri, extraData2,
        function (isSaved) {
          isSaved.should.equal('updated')
          step2()
        })
    }

    const step2 = function () {
      db.hubs._model.findById(theHub._id, function (err, hub) {
        expect(err).to.be.null
        hub.extra_data.should.has.all.keys('foo', 'bar')
        hub.extra_data.foo.should.equal(extraData.foo)
        hub.extra_data.bar.should.equal(extraData2.bar)

        done()
      })
    }

    init()
  })

  it('should do no op', function (done) {
    const oauthClientId = oauthClientIdBase + '-nop'

    const init = function () {
      db.hubs._model.create({
        oauth_client_id: oauthClientId,
        hub_uri: [hubUri],
        extra_data: extraData
      }, function (err, hub) {
        expect(err).to.be.null
        hub.should.not.be.null
        test()
      })
    }

    const test = function () {
      db.hubs.save(oauthClientId, hubUri, extraData,
        function (isSaved) {
          isSaved.should.equal('nop')
          done()
        })
    }

    init()
  })

  it('should return hub', function (done) {
    const oauthClientId = oauthClientIdBase + '-return'

    const init = function () {
      db.hubs._model.create({
        oauth_client_id: oauthClientId,
        hub_uri: [hubUri]
      }, function () {
        step1()
      })
    }

    const step1 = function () {
      db.hubs.findHub(oauthClientId, function (hub) {
        hub.should.not.be.null
        step2()
      })
    }

    const step2 = function () {
      db.hubs.findHub(oauthClientId + '2', function (hub) {
        expect(hub).to.be.null
        done()
      })
    }

    init()
  })
})
