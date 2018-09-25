'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

let db = null
const originalProcessEnv = _.cloneDeep(process.env)
const deviceType = 'dt'
const deviceIdBase = 'di' + _.now()
const oauthClientId = 'oci'
const hubTopic = 'ht'
const extraData = { foo: 'bar' }

describe('db/Device', function () {
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
    db.devices._model.collection.drop()
      .then(() => db.closeConnection())
      .then(done)
  })

  it('should save device', function (done) {
    const deviceId = deviceIdBase + '-save'

    const step1 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, extraData,
        function (isSaved) {
          isSaved.should.equal('inserted')
          step2()
        })
    }

    const step2 = function () {
      db.devices._model.find({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId
      }, function (err, devices) {
        expect(err).to.be.null
        devices.should.be.a('array')
        devices.length.should.equal(1)

        const device = devices[0]
        device.oauth_client_id.should.equal(oauthClientId)
        device.hub_topic.should.have.all.members([hubTopic])
        device.extra_data.should.deep.equal(extraData)

        done()
      })
    }

    step1()
  })

  it('should save device without hub topic', function (done) {
    const deviceId = deviceIdBase + '-save-no-hub-topic'

    const step1 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, '', extraData,
        function (isSaved) {
          isSaved.should.equal('inserted')
          step2()
        })
    }

    const step2 = function () {
      db.devices._model.find({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId
      }, function (err, devices) {
        expect(err).to.be.null
        devices.should.be.a('array')
        devices.length.should.equal(1)

        const device = devices[0]
        device.hub_topic.should.be.a('array')
        device.hub_topic.length.should.equal(0)

        done()
      })
    }

    step1()
  })

  it('should update device hub topic', function (done) {
    const deviceId = deviceIdBase + '-update-hub-topic'
    const hubTopic2 = 'ht2'
    let theDevice = null

    const init = function () {
      db.devices._model.create({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId,
        hub_topic: [hubTopic],
        extra_data: extraData
      }, function (err, device) {
        expect(err).to.be.null
        device.should.not.be.null
        theDevice = device
        step1()
      })
    }

    const step1 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic2, extraData,
        function (isSaved) {
          isSaved.should.equal('updated')
          step2()
        })
    }

    const step2 = function () {
      db.devices._model.findById(theDevice._id, function (err, device) {
        expect(err).to.be.null
        device.hub_topic.should.have.all.members([hubTopic, hubTopic2])
        done()
      })
    }

    init()
  })

  it('should update device extra data', function (done) {
    const deviceId = deviceIdBase + '-update-extra-data'
    const extraData2 = { bar: 'foo' }
    let theDevice = null

    const init = function () {
      db.devices._model.create({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId,
        hub_topic: [hubTopic],
        extra_data: extraData
      }, function (err, device) {
        expect(err).to.be.null
        device.should.not.be.null
        theDevice = device
        step1()
      })
    }

    const step1 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, extraData2,
        function (isSaved) {
          isSaved.should.equal('updated')
          step2()
        })
    }

    const step2 = function () {
      db.devices._model.findById(theDevice._id, function (err, device) {
        expect(err).to.be.null
        device.extra_data.should.has.all.keys('foo', 'bar')
        device.extra_data.foo.should.equal(extraData.foo)
        device.extra_data.bar.should.equal(extraData2.bar)

        done()
      })
    }

    init()
  })

  it('should do no op on save', function (done) {
    const deviceId = deviceIdBase + '-nop'

    const init = function () {
      db.devices._model.create({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId,
        hub_topic: [hubTopic],
        extra_data: extraData
      }, function (err, device) {
        expect(err).to.be.null
        device.should.not.be.null
        test1()
      })
    }

    const test1 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, hubTopic, extraData,
        function (isSaved) {
          isSaved.should.equal('nop')
          test2()
        })
    }

    const test2 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, '', extraData,
        function (isSaved) {
          isSaved.should.equal('nop')
          test3()
        })
    }

    const test3 = function () {
      db.devices.save(deviceType, deviceId,
        oauthClientId, null, extraData,
        function (isSaved) {
          isSaved.should.equal('nop')
          done()
        })
    }

    init()
  })

  it('should return saved devices', function (done) {
    const deviceId = deviceIdBase + '-return'
    const deviceId2 = deviceId + '2'
    const oauthClientIdNow = oauthClientId + _.now()

    const init = function () {
      db.devices._model.create({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientIdNow,
        hub_topic: [hubTopic]
      }, {
        device_type: deviceType,
        device_id: deviceId2,
        oauth_client_id: oauthClientIdNow
      }, function () {
        test1()
      })
    }

    const test1 = function () {
      db.devices.findDevices(oauthClientIdNow, hubTopic, (devices) => {
        devices.should.be.a('array')
        devices.length.should.equal(1)

        test2()
      })
    }

    const test2 = function () {
      db.devices.findDevices(oauthClientIdNow, '', (devices) => {
        devices.should.be.a('array')
        devices.length.should.equal(2)

        test3()
      })
    }

    const test3 = function () {
      db.devices.findDevices(oauthClientIdNow, null, (devices) => {
        devices.should.be.a('array')
        devices.length.should.equal(2)

        done()
      })
    }

    init()
  })

  it('should delete device', function (done) {
    const deviceId = deviceIdBase + '-delete'
    const deviceId2 = deviceId + '2'
    let theDevice = null
    let theDevice2 = null

    const init = function () {
      db.devices._model.create({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId,
        hub_topic: [hubTopic]
      }, {
        device_type: deviceType,
        device_id: deviceId2,
        oauth_client_id: oauthClientId
      }, function (err, device, device2) {
        expect(err).to.be.null
        device.should.not.be.null
        theDevice = device

        device2.should.not.be.null
        theDevice2 = device2

        step1()
      })
    }

    const step1 = function () {
      db.devices.delete(deviceType, deviceId,
        oauthClientId, hubTopic,
        function (isDeleted) {
          isDeleted.should.not.be.false
          step2()
        })
    }

    const step2 = function () {
      db.devices._model.findById(theDevice._id, function (err, device) {
        expect(err).to.be.null
        device.device_id.should.equal(deviceId)
        device.hub_topic.length.should.equal(0)

        step3()
      })
    }

    const step3 = function () {
      db.devices.delete(deviceType, deviceId,
        oauthClientId, null,
        function (isDeleted) {
          isDeleted.should.not.be.false
          step4()
        })
    }

    const step4 = function () {
      db.devices._model.findById(theDevice._id, function (err, device) {
        expect(err).to.be.null
        expect(device).to.be.null
        step5()
      })
    }

    const step5 = function () {
      db.devices._model.findById(theDevice2._id, function (err, device) {
        expect(err).to.be.null
        device.should.not.be.null
        device.device_id.should.equal(deviceId2)

        done()
      })
    }

    init()
  })

  it('should delete devices', function (done) {
    const deviceId = deviceIdBase + '-delete'
    let theDevice = null
    let theDevice2 = null

    const init = function () {
      db.devices._model.create({
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: oauthClientId
      }, {
        device_type: deviceType,
        device_id: deviceId,
        oauth_client_id: 'oci2'
      }, function (err, device, device2) {
        expect(err).to.be.null
        device.should.not.be.null
        theDevice = device

        device2.should.not.be.null
        theDevice2 = device2

        step1()
      })
    }

    const step1 = function () {
      db.devices.delete(deviceType, deviceId,
        null, null, function (isDeleted) {
          isDeleted.should.not.be.false
          step2()
        })
    }

    const step2 = function () {
      db.devices._model.findById(theDevice._id, function (err, device) {
        expect(err).to.be.null
        expect(device).to.be.null
        step3()
      })
    }

    const step3 = function () {
      db.devices._model.findById(theDevice2._id, function (err, device) {
        expect(err).to.be.null
        expect(device).to.be.null
        done()
      })
    }

    init()
  })
})
