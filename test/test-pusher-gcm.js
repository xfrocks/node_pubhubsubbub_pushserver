/*jshint expr: true*/
'use strict';

var config = require('../lib/config');
var pusher = require('../lib/pusher/gcm');
var chai = require('chai');
var _ = require('lodash');

chai.should();
var expect = chai.expect;

var lib = require('./mock/_modules-gcm');
var senderOptions = {
  packageId: 'pi',
  gcmKey: 'gk'
};
var registrationToken = 'rt';
var data = {foo: 'bar'};

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

            var push = lib._getLatestPush();
            push.sender._getGcmKey().should.equal(senderOptions.gcmKey);
            push.message._getData().should.deep.equal(data);
            push.recipient.to.should.equal(registrationToken);

            done();
          });
      });

    it('should fail', function(done) {
        var dataWithError = _.merge({error: 'something'}, data);
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
        var test = function(status, callback) {
            var dataWithError = _.merge({error: status}, data);
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(status);
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

    it('should fail with status 3xx, 5xx, retry unset', function(done) {
        var test = function(status, callback) {
            var dataWithError = _.merge({error: status}, data);
            pusher.send(senderOptions, registrationToken, dataWithError,
                function(err, result) {
                  err.should.equal(status);
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

    it('should fail with response error, retry=false', function(done) {
        var test = function(error, callback) {
            var dataWithError = _.merge({}, data);
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
        var test = function(error, callback) {
            var dataWithError = _.merge({}, data);
            dataWithError.responseErrorResult = {error: error};
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(error);
                result.should.not.have.ownProperty('retry');
                callback();
              });
          };

        var test1 = function() { test('Unavailable', test2); };
        var test2 = function() { test('InternalServerError', test3); };
        var test3 = function() { test('DeviceMessageRate Exceeded', test4); };
        var test4 = function() { test('TopicsMessageRate Exceeded', done); };

        test1();
      });

    it('should fail with deleteDevice=true', function(done) {
        var test = function(error, callback) {
            var dataWithError = _.merge({}, data);
            dataWithError.responseErrorResult = {error: error};
            pusher.send(senderOptions, registrationToken, dataWithError,
              function(err, result) {
                err.should.equal(error);
                result.deleteDevice.should.be.true;
                callback();
              });
          };

        var test1 = function() { test('MissingRegistration', test2); };
        var test2 = function() { test('InvalidRegistration', test3); };
        var test3 = function() { test('NotRegistered', test4); };
        var test4 = function() { test('MismatchSenderId', test5); };
        var test5 = function() { test('InvalidPackageName', done); };

        test1();
      });

    it('should do stats', function(done) {
        pusher.send(senderOptions, registrationToken, data, function(err) {
            expect(err).to.be.null;

            var stats = pusher.stats();
            stats.should.have.ownProperty(senderOptions.packageId);
            var thisStats = stats[senderOptions.packageId];
            thisStats.sent.should.equal(1);
            thisStats.failed.should.equal(0);
            thisStats.invalid.should.equal(0);

            done();
          });
      });

    it('should do stats (failed)', function(done) {
        var dataWithError = _.merge({error: 'something'}, data);
        pusher.send(
          senderOptions,
          registrationToken,
          dataWithError,
          function(err) {
            err.should.equal(dataWithError.error);

            var stats = pusher.stats();
            stats[senderOptions.packageId].failed.should.equal(1);

            done();
          });
      });

    it('should do stats (invalid)', function(done) {
        var dataWithError = _.merge({}, data);
        dataWithError.responseErrorResult = {error: 'MissingRegistration'};

        pusher.send(
          senderOptions,
          registrationToken,
          dataWithError,
          function(err) {
            err.should.equal(dataWithError.responseErrorResult.error);

            var stats = pusher.stats();
            stats[senderOptions.packageId].invalid.should.equal(1);

            done();
          });
      });

  });
