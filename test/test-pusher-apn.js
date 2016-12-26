'use strict';

const config = require('../lib/config');
const pusher = require('../lib/pusher/apn');
const chai = require('chai');
const _ = require('lodash');

chai.should();
const expect = chai.expect;

const lib = require('./mock/_modules-apn');
const connectionOptionsCert = {
  packageId: 'pi',
  cert: 'c',
  key: 'k',
};
const connectionOptions = {
  packageId: 'pi',
  token: {
    key: 'k',
    keyId: 'ki',
    teamId: 'ti',
  },
};
const token = 't';
const payload = {aps: {alert: 'foo'}};

describe('pusher/apn', function() {
    beforeEach(function(done) {
        lib._reset();
        config.apn.notificationOptions = {};
        pusher.setup(config, lib);
        done();
      });

    it('should guard against missing lib', function(done) {
      pusher.setup(config, null);
      pusher.send(connectionOptions, token, payload, function(err) {
        err.should.equal('lib missing');
        done();
      });
    });

    it('should push with cert', function(done) {
        pusher.send(connectionOptionsCert, token, payload, function(err) {
            expect(err).to.be.null;

            const push = lib._getLatestPush();
            push.provider.options.should.deep.equal(connectionOptionsCert);
            push.recipient.should.equal(token);
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.expiry.should.equal(0);

            lib._getProviderCount().should.equal(1);

            done();
          });
      });

    it('should push with token', function(done) {
        pusher.send(connectionOptions, token, payload, function(err) {
            expect(err).to.be.null;

            const push = lib._getLatestPush();
            push.provider.options.should.deep.equal(connectionOptions);
            push.recipient.should.equal(token);
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.expiry.should.equal(0);

            lib._getProviderCount().should.equal(1);

            done();
          });
      });

    it('should fail with string', function(done) {
        pusher.send(connectionOptions, 'fail-string', payload, function(err) {
            err.should.be.a('string');
            done();
          });
      });

    it('should fail with Error', function(done) {
        pusher.send(connectionOptions, 'fail-Error', payload, function(err) {
            err.should.be.a('Error');
            done();
          });
      });

    it('should fail with unknown error', function(done) {
        pusher.send(connectionOptions, 'fail-unknown', payload, function(err) {
            err.should.equal('Unknown error');
            done();
          });
      });

    it('should fail with retry=false', function(done) {
        const test = function(status, callback) {
            const payloadWithFailedStatus = _.merge(
              {failed_status: status},
              payload
            );

            pusher.send(connectionOptions,
              'fail-string',
              payloadWithFailedStatus,
              function(err, result) {
                err.should.be.a('string');
                result.retry.should.be.false;
                callback(status);
              });
          };

        const testRange = function(start, end, testRangeCallback) {
          const testCallback = function(i) {
            i++;
            if (i === end) {
              testRangeCallback();
              return;
            }

            test(i, testCallback);
          };

          test(start, testCallback);
        };

        testRange(400, 500, done);
      });

    it('should fail without retry', function(done) {
        const test = function(status, callback) {
            const payloadWithFailedStatus = _.merge(
              {failed_status: status},
              payload
            );

            pusher.send(connectionOptions,
              'fail-string',
              payloadWithFailedStatus,
              function(err, result) {
                err.should.be.a('string');
                result.should.not.have.ownProperty('retry');
                callback(status);
              });
          };

        const testRange = function(start, end, testRangeCallback) {
          const testCallback = function(i) {
            i++;
            if (i === end) {
              testRangeCallback();
              return;
            }

            test(i, testCallback);
          };

          test(start, testCallback);
        };

        testRange(300, 400, function() {
          testRange(500, 600, done);
        });
      });

    it('should fail with deleteDevice=true status 400', function(done) {
        const test = function(reason, callback) {
            const payloadWithFailedStatus = _.merge({
              failed_status: 400,
              failed_reason: reason,
            }, payload);
            pusher.send(connectionOptions,
              'fail-string',
              payloadWithFailedStatus,
              function(err, result) {
                err.should.be.a('string');
                result.deleteDevice.should.be.true;
                callback();
              });
          };

        const test1 = function() {
          test('BadDeviceToken', test2);
        };
        const test2 = function() {
          test('DeviceTokenNotForTopic', test3);
        };
        const test3 = function() {
          test('TopicDisallowed', done);
        };

        test1();
      });

    it('should fail with deleteDevice=true status 410', function(done) {
        const payloadWithFailedStatus = _.merge({
          failed_status: 410,
          failed_reason: 'Unregistered',
        }, payload);
        pusher.send(connectionOptions,
          'fail-string',
          payloadWithFailedStatus,
          function(err, result) {
            err.should.be.a('string');
            result.deleteDevice.should.be.true;
            done();
          });
      });

    it('should guard against missing data', function(done) {
        const payloadTest = function() {
          pusher.send({
              packageId: 'pi',
              cert: 'cd',
              key: 'kd',
            }, token, {}, function(err) {
              err.should.be.string;
              certTest1();
            });
        };

        const certTest1 = function() {
          pusher.send({
              cert: 'cd',
              key: 'kd',
            }, token, payload, function(err) {
              err.should.be.string;
              certTest2();
            });
        };

        const certTest2 = function() {
          pusher.send({
              packageId: 'pi',
              key: 'kd',
            }, token, payload, function(err) {
              err.should.be.string;
              certDone();
            });
        };

        const certDone = function() {
          tokenTest1();
        };

        const tokenTest1 = function() {
          pusher.send({
              token: {
                key: '',
                keyId: 'ki',
                teamId: 'ti',
              },
            }, token, payload, function(err) {
              err.should.be.string;
              tokenTest2();
            });
        };

        const tokenTest2 = function() {
          pusher.send({
              packageId: 'pi',
              token: {
                keyId: 'ki',
                teamId: 'ti',
              },
            }, token, payload, function(err) {
              err.should.be.string;
              tokenDone();
            });
        };

        const tokenDone = function() {
          bothTest();
        };

        const bothTest = function() {
          pusher.send({
              packageId: 'pi',
              cert: 'cd',
              key: 'kd',
              token: {
                key: 'k',
                keyId: 'ki',
                teamId: 'ti',
              },
            }, token, payload, function(err) {
              err.should.be.string;
              done();
            });
        };

        payloadTest();
      });

    it('should configure notification directly', function(done) {
        const payload = {
            'aps': {
                alert: 'foo',
                badge: 'b',
                sound: 's',
              },
            'expiry': 123,
            'content-available': 1,
          };

        pusher.send(connectionOptions, token, payload, function(err) {
            expect(err).to.be.null;

            const push = lib._getLatestPush();
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.badge.should.equal(payload.aps.badge);
            push.notification.sound.should.equal(payload.aps.sound);
            push.notification.expiry.should.equal(payload.expiry);
            push.notification.payload.should.deep.equal({
                'content-available': payload['content-available'],
              });

            done();
          });
      });

    it('should configure notification via config', function(done) {
        config.apn.notificationOptions = {
          badge: 'b',
          sound: 's',
          expiry: 123,
        };

        pusher.send({
            packageId: 'pi',
            cert: 'cd',
            key: 'kd',
          }, token, payload, function(err) {
            expect(err).to.be.null;

            const push = lib._getLatestPush();
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.badge.
              should.equal(config.apn.notificationOptions.badge);
            push.notification.sound.
              should.equal(config.apn.notificationOptions.sound);
            push.notification.expiry.
              should.equal(config.apn.notificationOptions.expiry);

            done();
          });
      });

    it('should reuse cert connection', function(done) {
        const test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                test2();
              });
          };

        const test2 = function() {
            pusher.send(connectionOptions, 't2', payload, function() {
                lib._getProviderCount().should.equal(1);

                done();
              });
          };

        test1();
      });

    it('should reuse token connection', function(done) {
        const test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                test2();
              });
          };

        const test2 = function() {
            pusher.send(connectionOptions, 't2', payload, function() {
                lib._getProviderCount().should.equal(1);

                done();
              });
          };

        test1();
      });

    it('should create connections (diff packageIds)', function(done) {
        const connectionOptions2 = _.merge({}, connectionOptions);
        connectionOptions2.packageId = 'pi2';

        const test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                lib._getProviderCount().should.equal(1);

                test2();
              });
          };

        const test2 = function() {
            pusher.send(connectionOptions2, 't2', payload, function() {
                lib._getProviderCount().should.equal(2);

                done();
              });
          };

        test1();
      });

    it('should create connections (diff certs)', function(done) {
        const connectionOptions2 = _.merge({}, connectionOptionsCert);
        connectionOptions2.cert = 'c2';

        const test1 = function() {
            pusher.send(connectionOptionsCert, token, payload, function() {
                lib._getProviderCount().should.equal(1);

                test2();
              });
          };

        const test2 = function() {
            pusher.send(connectionOptions2, 't2', payload, function() {
                lib._getProviderCount().should.equal(2);

                done();
              });
          };

        test1();
      });

    it('should create connections (diff tokens)', function(done) {
        const connectionOptions2 = _.merge({}, connectionOptions);
        connectionOptions2.token.key = 'k2';

        const test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                lib._getProviderCount().should.equal(1);

                test2();
              });
          };

        const test2 = function() {
            pusher.send(connectionOptions2, 't2', payload, function() {
                lib._getProviderCount().should.equal(2);

                done();
              });
          };

        test1();
      });

    it('should clean up connections', function(done) {
        let push1 = null;
        let push2 = null;

        const test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                push1 = lib._getLatestPush();

                setTimeout(test2, 20);
              });
          };

        const test2 = function() {
            pusher.send(connectionOptionsCert, 't2', payload, function() {
                push2 = lib._getLatestPush();
                setTimeout(test3, 20);
              });
          };

        const test3 = function() {
            pusher._cleanUpConnections(30);

            push1.provider._hasBeenShutdown.should.be.true;
            push2.provider._hasBeenShutdown.should.be.false;

            done();
          };

        test1();
      }).timeout(100);

    it('should do stats', function(done) {
        pusher.send(connectionOptions, token, payload, function(err) {
            expect(err).to.be.null;

            pusher.stats().then((stats) => {
                stats.apn.should.have.ownProperty(connectionOptions.packageId);
                const thisStats = stats.apn[connectionOptions.packageId];
                thisStats.sent.should.equal(1);
                thisStats.failed.should.equal(0);
                thisStats.invalid.should.equal(0);

                done();
              });
          });
      });

    it('should do stats (failed)', function(done) {
        const payloadWithFailedStatus = _.merge({failed_status: 500}, payload);
        pusher.send(connectionOptions, 'fail-string', payloadWithFailedStatus,
          function(err) {
            err.should.be.a('string');

            pusher.stats().then((stats) => {
                stats.apn[connectionOptions.packageId].failed.should.equal(1);

                done();
              });
          });
      });

    it('should do stats (invalid)', function(done) {
        const payloadWithFailedStatus = _.merge({
          failed_status: 410,
          failed_reason: 'Unregistered',
        }, payload);
        pusher.send(connectionOptions, 'fail-string', payloadWithFailedStatus,
          function(err) {
            err.should.be.a('string');

            pusher.stats().then((stats) => {
                stats.apn[connectionOptions.packageId].invalid.should.equal(1);

                done();
              });
          });
      });
  });
