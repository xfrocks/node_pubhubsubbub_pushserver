/*jshint expr: true*/
'use strict';

var config = require('../lib/config');
var pushQueue = require('../lib/pushQueue');
var chai = require('chai');

chai.should();

// setup push queue
var pushKue = require('./mock/pushKue');
var pusher = require('./mock/pusher');
var db = require('./mock/db');
pushQueue.setup(pushKue, pusher, db.projects, db.devices);

var notificationId = 0;
var generatePayload = function() {
    notificationId++;

    return {
        action: 'action',
        notification_id: notificationId,
        notification_html: 'Notification #' + notificationId
      };
  };

describe('pushQueue', function() {

    beforeEach(function(done) {
        config.gcm.defaultKeyId = 'key1';
        config.gcm.keys = {
            key1: 'key1',
            key2: 'key2'
          };
        config.wns.client_id = 'wns_ci';
        config.wns.client_secret = 'wns_cs';
        config.pushQueue.attempts = 3;

        pushKue._reset();
        pusher._reset();
        db.projects._reset();
        db.devices._reset();

        done();
      });

    it('should process android queue', function(done) {
        var deviceType = 'android';
        var deviceId = 'di';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var latestPush = pusher._getLatestPush();
        latestPush.should.not.be.null;
        latestPush.type.should.equal('gcm');
        latestPush.registrationId.should.equal(deviceId);
        latestPush.data.notification_id.should.equal(payload.notification_id);
        latestPush.data.notification.should.not.be.null;

        done();
      });

    it('[android] default key', function(done) {
        var deviceType = 'android';
        var deviceId = 'di';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var latestPush = pusher._getLatestPush();
        latestPush.type.should.equal('gcm');
        latestPush.senderOptions.gcmKey.
            should.equal(config.gcm.keys[config.gcm.defaultKeyId]);

        done();
      });

    it('[android] specific keys', function(done) {
        var deviceType = 'android';
        var deviceId = 'di';
        var payload = generatePayload();
        var extraData = {package: 'key1'};
        var extraData2 = {package: 'key2'};

        var test1 = function() {
            pushQueue.enqueue(deviceType, deviceId, payload, extraData);

            var latestPush = pusher._getLatestPush();
            latestPush.type.should.equal('gcm');
            latestPush.senderOptions.gcmKey.
                should.equal(config.gcm.keys[extraData.package]);

            test2();
          };

        var test2 = function() {
            pushQueue.enqueue(deviceType, deviceId, payload, extraData2);

            var latestPush = pusher._getLatestPush();
            latestPush.type.should.equal('gcm');
            latestPush.senderOptions.gcmKey.
                should.equal(config.gcm.keys[extraData2.package]);

            done();
          };

        test1();
      });

    it('[android] db key', function(done) {
        var packageId = 'pi-db';
        var apiKey = 'ak-db';
        var deviceType = 'android';
        var deviceId = 'di-db';
        var payload = generatePayload();
        var extraData = {package: packageId};

        var init = function() {
            db.projects.saveGcm(packageId, apiKey, function() {
                test();
              });
          };

        var test = function() {
            pushQueue.enqueue(deviceType, deviceId, payload, extraData);

            var latestPush = pusher._getLatestPush();
            latestPush.type.should.equal('gcm');
            latestPush.senderOptions.gcmKey.should.equal(apiKey);

            done();
          };

        init();
      });

    it('[android] no key', function(done) {
        var packageId = 'pi-db-no-client';
        var deviceType = 'android';
        var deviceId = 'di-no-client';
        var payload = generatePayload();
        var extraData = {package: packageId};

        pushQueue.enqueue(deviceType, deviceId, payload, extraData);

        var jobs = pushKue._getJobs(config.pushQueue.queueId);
        jobs.length.should.equal(1);

        var job = pushKue._getLatestJob(config.pushQueue.queueId);
        job.should.not.be.null;
        job.data.device_type.should.equal(deviceType);
        job.data.device_id.should.equal(deviceId);
        job.data.payload.should.deep.equal(payload);
        job.data.extra_data.should.deep.equal(extraData);
        job.attempts.should.equal(config.pushQueue.attempts);

        var pushes = pusher._getPushes();
        pushes.length.should.equal(0);

        done();
      });

    it('[android] non-notification payload', function(done) {
        var deviceType = 'android';
        var deviceId = 'di';
        var payload = {
            notification_id: 0,
            notification_html: '',
            foo: 'bar'
          };

        pushQueue.enqueue(deviceType, deviceId, payload);

        var latestPush = pusher._getLatestPush();
        latestPush.type.should.equal('gcm');
        latestPush.data.should.deep.equal({foo: payload.foo});

        done();
      });

    it('[android] no default package', function(done) {
        config.gcm.defaultKeyId = '';
        config.gcm.keys = {};

        var deviceType = 'android';
        var deviceId = 'di';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var pushes = pusher._getPushes();
        pushes.length.should.equal(0);

        done();
      });

    it('should process ios queue', function(done) {
        var deviceType = 'ios';
        var deviceId = 'di';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var latestPush = pusher._getLatestPush();
        latestPush.should.not.be.null;
        latestPush.type.should.equal('apn');
        latestPush.token.should.equal(deviceId);
        latestPush.payload.aps.alert.should.not.be.null;

        done();
      });

    it('[ios] default client', function(done) {
        var deviceType = 'ios';
        var deviceId = 'di';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var latestPush = pusher._getLatestPush();
        latestPush.type.should.equal('apn');
        latestPush.connectionOptions.should.equal(config.apn.connectionOptions);

        done();
      });

    it('[ios] db client', function(done) {
        var bundleId = 'bi-db';
        var tokenKeyData = 'tk-db';
        var tokenKeyIdData = 'tki-db';
        var tokenTeamIdData = 'tti-db';
        var deviceType = 'ios';
        var deviceId = 'di';
        var payload = generatePayload();
        var extraData = {package: bundleId};

        var test = function(production, callback) {
            var step1 = function() {
                db.projects.saveApn(
                    bundleId,
                    tokenKeyData,
                    tokenKeyIdData,
                    tokenTeamIdData,
                    production,
                    function() { step2(); }
                );
              };

            var step2 = function() {
                pushQueue.enqueue(deviceType, deviceId, payload, extraData);

                var latestPush = pusher._getLatestPush();
                latestPush.type.should.equal('apn');

                var lpco = latestPush.connectionOptions;
                lpco.packageId.should.equal(bundleId);
                lpco.token.key.should.equal(tokenKeyData);
                lpco.token.keyId.should.equal(tokenKeyIdData);
                lpco.token.teamId.should.equal(tokenTeamIdData);
                lpco.production.should.equal(production);

                callback();
              };

            step1();
          };

        var test1 = function() {
            test(true, test2);
          };

        var test2 = function() {
            test(false, done);
          };

        test1();
      });

    it('[ios] payload with user_unread_notification_count', function(done) {
        var deviceType = 'ios';
        var deviceId = 'di';
        var payload = generatePayload();
        payload.user_unread_notification_count = 1;

        pushQueue.enqueue(deviceType, deviceId, payload);

        var latestPush = pusher._getLatestPush();
        latestPush.type.should.equal('apn');
        latestPush.payload.aps.badge.
            should.equal(payload.user_unread_notification_count);

        done();
      });

    it('[ios] no notification_html', function(done) {
        var deviceType = 'ios';
        var deviceId = 'di';
        var payload = generatePayload();
        payload.notification_html = '';

        pushQueue.enqueue(deviceType, deviceId, payload);

        var jobs = pushKue._getJobs(config.pushQueue.queueId);
        jobs.length.should.equal(1);

        var job = pushKue._getLatestJob(config.pushQueue.queueId);
        job.should.not.be.null;
        job.error.should.be.a('Error');
        job.error.message.should.equal('payload.notification_html is missing');
        job.data.device_type.should.equal(deviceType);
        job.data.device_id.should.equal(deviceId);
        job.data.payload.should.deep.equal(payload);
        job.attempts.should.equal(config.pushQueue.attempts);

        var pushes = pusher._getPushes();
        pushes.length.should.equal(0);

        done();
      });

    it('[ios] no client', function(done) {
        var packageId = 'pi-db-no-client';
        var deviceType = 'ios';
        var deviceId = 'di-no-client';
        var payload = generatePayload();
        var extraData = {package: packageId};

        pushQueue.enqueue(deviceType, deviceId, payload, extraData);

        var jobs = pushKue._getJobs(config.pushQueue.queueId);
        jobs.length.should.equal(1);

        var job = pushKue._getLatestJob(config.pushQueue.queueId);
        job.should.not.be.null;
        job.data.device_type.should.equal(deviceType);
        job.data.device_id.should.equal(deviceId);
        job.data.payload.should.deep.equal(payload);
        job.data.extra_data.should.deep.equal(extraData);
        job.attempts.should.equal(config.pushQueue.attempts);

        var pushes = pusher._getPushes();
        pushes.length.should.equal(0);

        done();
      });

    it('should process windows queue', function(done) {
        var deviceType = 'windows';
        var deviceId = 'di';
        var payload = generatePayload();
        var channelUri = 'https://microsoft.com/wns/channel/uri';
        var extraData = {foo: 'bar', channel_uri: channelUri};

        pushQueue.enqueue(deviceType, deviceId, payload, extraData);

        var latestPush = pusher._getLatestPush();
        latestPush.should.not.be.null;
        latestPush.type.should.equal('wns');
        latestPush.channelUri.should.equal(channelUri);

        var data = JSON.parse(latestPush.dataRaw);
        data.should.be.a('object');
        data.action.should.equal(payload.action);
        data.notification_id.should.equal(payload.notification_id);
        data.notification_html.should.equal(payload.notification_html);
        data.extra_data.foo.should.equal(extraData.foo);

        done();
      });

    it('[windows] default client', function(done) {
        var deviceType = 'windows';
        var deviceId = 'di';
        var payload = generatePayload();
        var channelUri = 'https://microsoft.com/wns/channel/uri';
        var extraData = {channel_uri: channelUri};

        pushQueue.enqueue(deviceType, deviceId, payload, extraData);

        var latestPush = pusher._getLatestPush();
        latestPush.type.should.equal('wns');
        latestPush.clientId.should.equal(config.wns.client_id);
        latestPush.clientSecret.should.equal(config.wns.client_secret);

        done();
      });

    it('[windows] db client', function(done) {
        var packageId = 'pi-db';
        var clientId = 'ci-db';
        var clientSecret = 'cs-db';
        var deviceType = 'windows';
        var deviceId = 'di';
        var payload = generatePayload();
        var channelUri = 'https://microsoft.com/wns/channel/uri';
        var extraData = {channel_uri: channelUri, package: packageId};

        var init = function() {
            db.projects.saveWns(packageId, clientId, clientSecret, function() {
                test();
              });
          };

        var test = function() {
            pushQueue.enqueue(deviceType, deviceId, payload, extraData);

            var latestPush = pusher._getLatestPush();
            latestPush.type.should.equal('wns');
            latestPush.clientId.should.equal(clientId);
            latestPush.clientSecret.should.equal(clientSecret);

            done();
          };

        init();
      });

    it('[windows] no client', function(done) {
        var packageId = 'pi-db-no-client';
        var deviceType = 'windows';
        var deviceId = 'di-no-client';
        var payload = generatePayload();
        var channelUri = 'https://microsoft.com/wns/channel/uri';
        var extraData = {channel_uri: channelUri, package: packageId};

        pushQueue.enqueue(deviceType, deviceId, payload, extraData);

        var jobs = pushKue._getJobs(config.pushQueue.queueId);
        jobs.length.should.equal(1);

        var job = pushKue._getLatestJob(config.pushQueue.queueId);
        job.should.not.be.null;
        job.data.device_type.should.equal(deviceType);
        job.data.device_id.should.equal(deviceId);
        job.data.payload.should.deep.equal(payload);
        job.data.extra_data.should.deep.equal(extraData);
        job.attempts.should.equal(config.pushQueue.attempts);

        var pushes = pusher._getPushes();
        pushes.length.should.equal(0);

        done();
      });

    it('should retry on text error', function(done) {
        var deviceType = 'android';
        var deviceId = 'error';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var pushes = pusher._getPushes();
        config.pushQueue.attempts.should.be.above(2);
        pushes.length.should.equal(config.pushQueue.attempts);

        done();
      });

    it('should retry on Error', function(done) {
        var deviceType = 'android';
        var deviceId = 'Error';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var pushes = pusher._getPushes();
        config.pushQueue.attempts.should.be.above(2);
        pushes.length.should.equal(config.pushQueue.attempts);

        done();
      });

    it('should retry only once', function(done) {
        var deviceType = 'android';
        var deviceId = 'retry1';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var pushes = pusher._getPushes();
        config.pushQueue.attempts.should.be.above(2);
        pushes.length.should.equal(2);

        done();
      });

    it('should delete device', function(done) {
        var deviceType = 'android';
        var deviceId = 'invalid';
        var oauthClientId = 'oci';
        var hubTopic = 'ht';
        var payload = generatePayload();

        var step1 = function() {
          db.devices.save(
            deviceType,
            deviceId,
            oauthClientId,
            hubTopic,
            {},
            function() {
              db.devices._devicesLength().should.equal(1);
              step2();
            }
          );
        };

        var step2 = function() {
          pushQueue.enqueue(deviceType, deviceId, payload);

          var pushes = pusher._getPushes();
          config.pushQueue.attempts.should.be.above(1);
          pushes.length.should.equal(1);

          step3();
        };

        var step3 = function() {
          db.devices._devicesLength().should.equal(0);
          done();
        };

        step1();
      });

    it('should encounter job.save error', function(done) {
        var deviceType = 'save';
        var deviceId = 'error';
        var payload = generatePayload();

        pushQueue.enqueue(deviceType, deviceId, payload);

        var jobs = pushKue._getJobs(config.pushQueue.queueId);
        jobs.length.should.equal(0);

        done();
      });

    it('should handle unrecognized device type', function(done) {
        pushQueue.enqueue('unrecognized', 'di', generatePayload());

        var jobs = pushKue._getJobs(config.pushQueue.queueId);
        jobs.length.should.equal(1);

        var pushes = pusher._getPushes();
        pushes.length.should.equal(0);

        done();
      });
  });
