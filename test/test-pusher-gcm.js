/*jshint expr: true*/
'use strict';

var config = require('../lib/config');
var pusher = require('../lib/pusher/gcm');
var chai = require('chai');

chai.should();
var expect = chai.expect;

var lib = require('./mock/_modules-gcm');

describe('gcm-pusher', function() {

    beforeEach(function(done) {
        config.gcm.messageOptions = {};
        pusher.setup(config, lib);
        done();
      });

    it('should guard against missing lib', function(done) {
      pusher.setup(config, null);
      pusher.send('', '', {}, function(err) {
        err.should.equal('lib missing');
        done();
      });
    });

    it('should push', function(done) {
        var gcmKey = 'gk';
        var registrationToken = 'rt';
        var data = {foo: 'bar'};

        pusher.send(gcmKey, registrationToken, data, function(err) {
            expect(err).to.be.null;

            var push = lib._getLatestPush();
            push.sender._getGcmKey().should.equal(gcmKey);
            push.message._getData().should.deep.equal(data);
            push.recipient.to.should.equal(registrationToken);

            done();
          });
      });

    it('should fail', function(done) {
        var gcmKey = 'gk';
        var registrationToken = 'gt';
        var data = {foo: 'bar', error: 'something'};

        pusher.send(gcmKey, registrationToken, data, function(err) {
            err.should.equal(data.error);
            done();
          });
      });

    it('should fail with status 4xx, retry=false', function(done) {
        var gcmKey = 'gk';
        var registrationToken = 'gt';
        var data = {foo: 'bar'};

        var test = function(status, callback) {
            data.error = status;
            pusher.send(gcmKey, registrationToken, data,
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
        var gcmKey = 'gk';
        var registrationToken = 'gt';
        var data = {foo: 'bar'};

        var test = function(status, callback) {
            data.error = status;
            pusher.send(gcmKey, registrationToken, data,
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
        var gcmKey = 'gk';
        var registrationToken = 'gt';
        var data = {foo: 'bar'};

        var test = function(error, callback) {
            data.responseErrorResult = {error: error};
            pusher.send(gcmKey, registrationToken, data,
              function(err, result) {
                err.should.equal(error);
                result.retry.should.be.false;
                callback();
              });
          };

        test('Some error', done);
      });

    it('should fail with response error, retry unset', function(done) {
        var gcmKey = 'gk';
        var registrationToken = 'gt';
        var data = {foo: 'bar'};

        var test = function(error, callback) {
            data.responseErrorResult = {error: error};
            pusher.send(gcmKey, registrationToken, data,
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

  });
