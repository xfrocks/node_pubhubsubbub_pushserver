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
  });
