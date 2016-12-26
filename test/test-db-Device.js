'use strict';

const db = require('../lib/db');
const chai = require('chai');

chai.should();
const expect = chai.expect;

const deviceType = 'dt';
const deviceId = 'di';
const oauthClientId = 'oci';
const hubTopic = 'ht';
const extraData = {foo: 'bar'};

describe('db/Device', function() {
    beforeEach(function(done) {
        const checkForDb = function() {
          if (!db.isConnected()) {
            return setTimeout(checkForDb, 100);
          }

          db.devices._model.collection.drop().then(function() {
              done();
            }).catch(function() {
              done();
            });
          };

        checkForDb();
      });

    it('should save device', function(done) {
        const step1 = function() {
            db.devices.save(deviceType, deviceId,
              oauthClientId, hubTopic, extraData,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.devices._model.find({
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: oauthClientId,
              }, function(err, devices) {
                devices.should.be.a('array');
                devices.length.should.equal(1);

                const device = devices[0];
                device.oauth_client_id.should.equal(oauthClientId);
                device.hub_topic.should.be.a('array');
                device.hub_topic.length.should.equal(1);
                device.hub_topic.should.include(hubTopic);
                device.extra_data.should.deep.equal(extraData);

                done();
              });
          };

        step1();
      });

    it('should update device hub topic', function(done) {
        let theDevice = null;

        const init = function() {
            db.devices._model.create({
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: oauthClientId,
                hub_topic: [hubTopic],
                extra_data: extraData,
              }, function(err, device) {
                device.should.not.be.null;
                theDevice = device;
                step1();
              });
          };

        const step1 = function() {
            db.devices.save(deviceType, deviceId,
              oauthClientId, 'ht2', extraData,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.devices._model.findById(theDevice._id, function(err, device) {
                device.hub_topic.should.have.members([hubTopic, 'ht2']);
                done();
              });
          };

        init();
      });

    it('should update device extra data', function(done) {
        const extraData2 = {bar: 'foo'};
        let theDevice = null;

        const init = function() {
            db.devices._model.create({
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: oauthClientId,
                hub_topic: [hubTopic],
                extra_data: extraData,
              }, function(err, device) {
                device.should.not.be.null;
                theDevice = device;
                step1();
              });
          };

        const step1 = function() {
            db.devices.save(deviceType, deviceId,
                oauthClientId, hubTopic, extraData2,
                function(isSaved) {
                    isSaved.should.not.be.false;
                    step2();
                  });
          };

        const step2 = function() {
            db.devices._model.findById(theDevice._id, function(err, device) {
                device.extra_data.should.has.all.keys('foo', 'bar');
                device.extra_data.foo.should.equal(extraData.foo);
                device.extra_data.bar.should.equal(extraData2.bar);

                done();
              });
          };

        init();
      });

    it('should return saved devices', function(done) {
        const init = function() {
            db.devices._model.create({
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: oauthClientId,
                hub_topic: [hubTopic],
              }, {
                device_type: deviceType,
                device_id: 'di2',
                oauth_client_id: oauthClientId,
              }, function() {
                step1();
              });
          };

        const step1 = function() {
            db.devices.findDevices(oauthClientId, null, function(devices) {
                devices.should.be.a('array');
                devices.length.should.equal(2);

                step2();
              });
          };

        const step2 = function() {
            db.devices.findDevices(oauthClientId, hubTopic, function(devices) {
                devices.should.be.a('array');
                devices.length.should.equal(1);

                done();
              });
          };

        init();
      });

    it('should delete device', function(done) {
        let theDevice = null;
        let theDevice2 = null;

        const init = function() {
            db.devices._model.create({
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: oauthClientId,
                hub_topic: [hubTopic],
              }, {
                device_type: deviceType,
                device_id: 'di2',
                oauth_client_id: oauthClientId,
              }, function(err, device, device2) {
                device.should.not.be.null;
                theDevice = device;

                device2.should.not.be.null;
                theDevice2 = device2;

                step1();
              });
          };

        const step1 = function() {
            db.devices.delete(deviceType, deviceId,
              oauthClientId, hubTopic,
              function(isDeleted) {
                isDeleted.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.devices._model.findById(theDevice._id, function(err, device) {
                device.device_id.should.equal(deviceId);
                device.hub_topic.length.should.equal(0);

                step3();
              });
          };

        const step3 = function() {
            db.devices.delete(deviceType, deviceId,
              oauthClientId, null,
              function(isDeleted) {
                isDeleted.should.not.be.false;
                step4();
              });
          };

        const step4 = function() {
            db.devices._model.findById(theDevice._id, function(err, device) {
                expect(device).to.be.null;
                step5();
              });
          };

        const step5 = function() {
            db.devices._model.findById(theDevice2._id, function(err, device) {
                device.should.not.be.null;
                device.device_id.should.equal('di2');

                done();
              });
          };

        init();
      });

    it('should delete devices', function(done) {
        let theDevice = null;
        let theDevice2 = null;

        const init = function() {
            db.devices._model.create({
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: oauthClientId,
              }, {
                device_type: deviceType,
                device_id: deviceId,
                oauth_client_id: 'oci2',
              }, function(err, device, device2) {
                device.should.not.be.null;
                theDevice = device;

                device2.should.not.be.null;
                theDevice2 = device2;

                step1();
              });
          };

        const step1 = function() {
            db.devices.delete(deviceType, deviceId,
              null, null, function(isDeleted) {
                isDeleted.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.devices._model.findById(theDevice._id, function(err, device) {
                expect(device).to.be.null;
                step3();
              });
          };

        const step3 = function() {
            db.devices._model.findById(theDevice2._id, function(err, device) {
                expect(device).to.be.null;
                done();
              });
          };

        init();
      });
  });
