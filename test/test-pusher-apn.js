/*jshint expr: true*/
'use strict';

var config = require('../lib/config');
var pusher = require('../lib/pusher/apn');
var chai = require('chai');

chai.should();
var expect = chai.expect;

var apn = require('./mock/_modules-apn');

describe('apn-pusher', function() {

    beforeEach(function(done) {
        apn._reset();
        config.apn.notificationOptions = {};
        pusher.setup(config, apn);
        pusher._resetConnections();
        done();
      });

    it('should guard against missing lib', function(done) {
      pusher.setup(config, null);
      pusher.send({}, '', {}, function(err) {
        err.should.equal('lib missing');
        done();
      });
    });

    it('should push with cert', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          };
        var token = 't';
        var payload = {aps: {alert: 'foo'}};

        pusher.send(connectionOptions, token, payload, function(err) {
            expect(err).to.be.null;

            var push = apn._getLatestPush();
            push.provider.options.should.deep.equal(connectionOptions);
            push.recipient.should.equal(token);
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.expiry.should.equal(0);

            apn._getProviderCount().should.equal(1);

            done();
          });
      });

    it('should push with token', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 't';
        var payload = {aps: {alert: 'foo'}};

        pusher.send(connectionOptions, token, payload, function(err) {
            expect(err).to.be.null;

            var push = apn._getLatestPush();
            push.provider.options.should.deep.equal(connectionOptions);
            push.recipient.should.equal(token);
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.expiry.should.equal(0);

            apn._getProviderCount().should.equal(1);

            done();
          });
      });

    it('should fail with string', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 'fail-string';
        var payload = {aps: {alert: 'foo'}};

        pusher.send(connectionOptions, token, payload, function(err) {
            err.should.be.a('string');
            done();
          });
      });

    it('should fail with Error', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 'fail-Error';
        var payload = {aps: {alert: 'foo'}};

        pusher.send(connectionOptions, token, payload, function(err) {
            err.should.be.a('Error');
            done();
          });
      });

    it('should fail with unknown error', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 'fail-unknown';
        var payload = {aps: {alert: 'foo'}};

        pusher.send(connectionOptions, token, payload, function(err) {
            err.should.equal('Unknown error');
            done();
          });
      });

    it('should fail with retry=false', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 'fail-string';
        var payload = {aps: {alert: 'foo'}};

        var test = function(status, callback) {
            payload.failed_status = status;
            pusher.send(connectionOptions, token, payload,
              function(err, result) {
                err.should.be.a('string');
                result.retry.should.be.false;
                callback(status);
              });
          };

        var testRange = function(start, end, testRangeCallback) {
          var testCallback = function(i) {
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
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 'fail-string';
        var payload = {aps: {alert: 'foo'}};

        var test = function(status, callback) {
            payload.failed_status = status;
            pusher.send(connectionOptions, token, payload,
              function(err, result) {
                err.should.be.a('string');
                result.should.not.have.ownProperty('retry');
                callback(status);
              });
          };

        var testRange = function(start, end, testRangeCallback) {
          var testCallback = function(i) {
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

    it('should fail with deleteDevice=true', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 'fail-string';
        var payload = {aps: {alert: 'foo'}, failed_status: 410};

        pusher.send(connectionOptions, token, payload,
          function(err, result) {
            err.should.be.a('string');
            result.deleteDevice.should.be.true;
            done();
          });
      });

    it('should guard against missing data', function(done) {
        var payloadTest = function() {
          pusher.send({
              packageId: 'pi',
              cert: 'cd',
              key: 'kd'
            }, 't', {}, function(err) {
              err.should.be.string;
              certTest1();
            });
        };

        var payload = {aps: {alert: 'foo'}};

        var certTest1 = function() {
          pusher.send({
              cert: 'cd',
              key: 'kd'
            }, 't', payload, function(err) {
              err.should.be.string;
              certTest2();
            });
        };

        var certTest2 = function() {
          pusher.send({
              packageId: 'pi',
              key: 'kd'
            }, 't', payload, function(err) {
              err.should.be.string;
              certDone();
            });
        };

        var certDone = function() {
          tokenTest1();
        };

        var tokenTest1 = function() {
          pusher.send({
              token: {
                key: '',
                keyId: 'ki',
                teamId: 'ti'
              }
            }, 't', payload, function(err) {
              err.should.be.string;
              tokenTest2();
            });
        };

        var tokenTest2 = function() {
          pusher.send({
              packageId: 'pi',
              token: {
                keyId: 'ki',
                teamId: 'ti'
              }
            }, 't', payload, function(err) {
              err.should.be.string;
              tokenDone();
            });
        };

        var tokenDone = function() {
          bothTest();
        };

        var bothTest = function() {
          pusher.send({
              packageId: 'pi',
              cert: 'cd',
              key: 'kd',
              token: {
                key: 'k',
                keyId: 'ki',
                teamId: 'ti'
              }
            }, 't', payload, function(err) {
              err.should.be.string;
              done();
            });
        };

        payloadTest();
      });

    it('should configure notification directly', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          };
        var token = 't';
        var payload = {
            aps: {
                alert: 'foo',
                badge: 'b',
                sound: 's'
              },
            expiry: 123,
            'content-available': 1
          };

        pusher.send(connectionOptions, token, payload, function(err) {
            expect(err).to.be.null;

            var push = apn._getLatestPush();
            push.notification.alert.should.equal(payload.aps.alert);
            push.notification.badge.should.equal(payload.aps.badge);
            push.notification.sound.should.equal(payload.aps.sound);
            push.notification.expiry.should.equal(payload.expiry);
            push.notification.payload.should.deep.equal({
                'content-available': payload['content-available']
              });

            done();
          });
      });

    it('should configure notification via config', function(done) {
        config.apn.notificationOptions = {
          badge: 'b',
          sound: 's',
          expiry: 123
        };

        var payload = {aps: {alert: 'foo'}};

        pusher.send({
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          }, 't', payload, function(err) {
            expect(err).to.be.null;

            var push = apn._getLatestPush();
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
        var connectionOptions = {
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          };
        var token = 't';
        var token2 = 't2';
        var payload = {aps: {alert: 'foo'}};

        var test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                test2();
              });
          };

        var test2 = function() {
            pusher.send(connectionOptions, token2, payload, function() {
                apn._getProviderCount().should.equal(1);

                done();
              });
          };

        test1();
      });

    it('should reuse token connection', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 't';
        var token2 = 't2';
        var payload = {aps: {alert: 'foo'}};

        var test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                test2();
              });
          };

        var test2 = function() {
            pusher.send(connectionOptions, token2, payload, function() {
                apn._getProviderCount().should.equal(1);

                done();
              });
          };

        test1();
      });

    it('should create connections (diff packageIds)', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          };
        var token = 't';
        var connectionOptions2 = {
            packageId: 'pi2',
            cert: 'cd',
            key: 'kd'
          };
        var token2 = 't2';
        var payload = {aps: {alert: 'foo'}};

        var test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                apn._getProviderCount().should.equal(1);

                test2();
              });
          };

        var test2 = function() {
            pusher.send(connectionOptions2, token2, payload, function() {
                apn._getProviderCount().should.equal(2);

                done();
              });
          };

        test1();
      });

    it('should create connections (diff certs)', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          };
        var token = 't';
        var connectionOptions2 = {
            packageId: 'pi',
            cert: 'cd2',
            key: 'kd2'
          };
        var token2 = 't2';
        var payload = {aps: {alert: 'foo'}};

        var test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                apn._getProviderCount().should.equal(1);

                test2();
              });
          };

        var test2 = function() {
            pusher.send(connectionOptions2, token2, payload, function() {
                apn._getProviderCount().should.equal(2);

                done();
              });
          };

        test1();
      });

    it('should create connections (diff tokens)', function(done) {
        var connectionOptions = {
            packageId: 'pi',
            token: {
              key: 'k',
              keyId: 'ki',
              teamId: 'ti'
            }
          };
        var token = 't';
        var connectionOptions2 = {
            packageId: 'pi',
            token: {
              key: 'k2',
              keyId: 'ki2',
              teamId: 'ti2'
            }
          };
        var token2 = 't2';
        var payload = {aps: {alert: 'foo'}};

        var test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                apn._getProviderCount().should.equal(1);

                test2();
              });
          };

        var test2 = function() {
            pusher.send(connectionOptions2, token2, payload, function() {
                apn._getProviderCount().should.equal(2);

                done();
              });
          };

        test1();
      });

    it('should clean up connections', function(done) {
        this.timeout(100);

        var connectionOptions = {
            packageId: 'pi',
            cert: 'cd',
            key: 'kd'
          };
        var token = 't';
        var connectionOptions2 = {
            packageId: 'pi2',
            cert: 'cd2',
            key: 'kd2'
          };
        var token2 = 't2';
        var payload = {aps: {alert: 'foo'}};
        var push1 = null;
        var push2 = null;

        var test1 = function() {
            pusher.send(connectionOptions, token, payload, function() {
                push1 = apn._getLatestPush();

                setTimeout(test2, 20);
              });
          };

        var test2 = function() {
            pusher.send(connectionOptions2, token2, payload, function() {
                push2 = apn._getLatestPush();
                setTimeout(test3, 20);
              });
          };

        var test3 = function() {
            pusher._cleanUpConnections(30);

            push1.provider._hasBeenShutdown.should.be.true;
            push2.provider._hasBeenShutdown.should.be.false;

            done();
          };

        test1();
      });

  });
