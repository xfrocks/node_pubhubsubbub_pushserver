'use strict';

const config = require('../lib/config');
const pusher = require('../lib/pusher/gcm');
const chai = require('chai');
const _ = require('lodash');

chai.should();
const expect = chai.expect;

const lib = require('./mock/_modules-gcm');
const senderOptions = {
  packageId: 'pi',
  gcmKey: 'gk',
};
const registrationToken = 'rt';
const data = {foo: 'bar'};

describe('pusher/gcm', function() {
    beforeEach(function(done) {
        config.gcm.messageOptions = {};
        pusher.setup(config, lib);
        done();
      });

    it('should guard against missing lib', function(done) {
      pusher.setup(config, null);
      pusher.send(senderOptions, registrationToken, data, function(err) {
        err.should.equal('lib missing');
        done();
      });
    });

    it('should push', function(done) {
        pusher.send(senderOptions, registrationToken, data, function(err) {
            expect(err).to.be.null;

            const push = lib._getLatestPush();
            push.sender._getGcmKey().should.equal(senderOptions.gcmKey);
            push.message._getData().should.deep.equal(data);
            push.recipient.to.should.equal(registrationToken);

            done();
          });
      });

    it('should fail', function(done) {
        const dataWithError = _.merge({error: 'something'}, data);
        pusher.send(
          senderOptions,
          registrationToken,
          dataWithError,
          function(err) {
            err.should.equal(dataWithError.error);
            done();
          });
      });

    it('should fail with status 4xx, retry=false', function(done) {
        const test = function(status, callback) {
            const dataWithError = _.merge({error: status}, data);
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(status);
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

    it('should fail with status 3xx, 5xx, retry unset', function(done) {
        const test = function(status, callback) {
            const dataWithError = _.merge({error: status}, data);
            pusher.send(senderOptions, registrationToken, dataWithError,
                function(err, result) {
                  err.should.equal(status);
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

    it('should fail with response error, retry=false', function(done) {
        const test = function(error, callback) {
            const dataWithError = _.merge({}, data);
            dataWithError.responseErrorResult = {error: error};
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(error);
                result.retry.should.be.false;
                callback();
              });
          };

        test('Some error', done);
      });

    it('should fail with response error, retry unset', function(done) {
        const test = function(error, callback) {
            const dataWithError = _.merge({}, data);
            dataWithError.responseErrorResult = {error: error};
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(error);
                result.should.not.have.ownProperty('retry');
                callback();
              });
          };

        const test1 = function() {
          test('Unavailable', test2);
        };
        const test2 = function() {
          test('InternalServerError', test3);
        };
        const test3 = function() {
          test('DeviceMessageRate Exceeded', test4);
        };
        const test4 = function() {
          test('TopicsMessageRate Exceeded', done);
        };

        test1();
      });

    it('should fail with deleteDevice=true', function(done) {
        const test = function(error, callback) {
            const dataWithError = _.merge({}, data);
            dataWithError.responseErrorResult = {error: error};
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(error);
                result.deleteDevice.should.be.true;
                callback();
              });
          };

        const test1 = function() {
          test('MissingRegistration', test2);
        };
        const test2 = function() {
          test('InvalidRegistration', test3);
        };
        const test3 = function() {
          test('NotRegistered', test4);
        };
        const test4 = function() {
          test('MismatchSenderId', test5);
        };
        const test5 = function() {
          test('InvalidPackageName', done);
        };

        test1();
      });

    it('should do stats', function(done) {
        pusher.send(senderOptions, registrationToken, data, function(err) {
            expect(err).to.be.null;

            const stats = pusher.stats();
            stats.should.have.ownProperty(senderOptions.packageId);
            const thisStats = stats[senderOptions.packageId];
            thisStats.sent.should.equal(1);
            thisStats.failed.should.equal(0);
            thisStats.invalid.should.equal(0);

            done();
          });
      });

    it('should do stats (failed)', function(done) {
        const dataWithError = _.merge({error: 'something'}, data);
        pusher.send(
          senderOptions,
          registrationToken,
          dataWithError,
          function(err) {
            err.should.equal(dataWithError.error);

            const stats = pusher.stats();
            stats[senderOptions.packageId].failed.should.equal(1);

            done();
          });
      });

    it('should do stats (invalid)', function(done) {
        const dataWithError = _.merge({}, data);
        dataWithError.responseErrorResult = {error: 'MissingRegistration'};

        pusher.send(
          senderOptions,
          registrationToken,
          dataWithError,
          function(err) {
            err.should.equal(dataWithError.responseErrorResult.error);

            const stats = pusher.stats();
            stats[senderOptions.packageId].invalid.should.equal(1);

            done();
          });
      });
  });
