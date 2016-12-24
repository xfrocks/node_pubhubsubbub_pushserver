/*jshint expr: true*/
'use strict';

var db = require('../lib/db');
var chai = require('chai');

chai.should();
var expect = chai.expect;

describe('db/Hub', function() {

    beforeEach(function(done) {
        db.hubs._model.collection.drop().then(function() {
            done();
          }).catch(function() {
            // ignore errors
          });
      });

    it('should save hub', function(done) {
        var oauthClientId = 'oci';
        var hubUri = 'hu';
        var extraData = {foo: 'bar'};

        var step1 = function() {
            db.hubs.save(oauthClientId, hubUri, extraData,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        var step2 = function() {
            db.hubs._model.find({
                oauth_client_id: oauthClientId
              }, function(err, hubs) {
                hubs.should.be.a('array');
                hubs.length.should.equal(1);

                var hub = hubs[0];
                hub.oauth_client_id.should.equal(oauthClientId);
                hub.hub_uri.should.be.a('array');
                hub.hub_uri.length.should.equal(1);
                hub.hub_uri.should.include(hubUri);
                hub.extra_data.should.deep.equal(extraData);

                done();
              });
          };

        step1();
      });

    it('should update hub uri', function(done) {
        var oauthClientId = 'oci';
        var hubUri = 'hu';
        var hubUri2 = 'hu2';
        var extraData = {foo: 'bar'};
        var theHub = null;

        var init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri],
                extra_data: extraData
              }, function(err, hub) {
                theHub = hub;
                step1();
              });
          };

        var step1 = function() {
            db.hubs.save(oauthClientId, hubUri2, extraData,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        var step2 = function() {
            db.hubs._model.findById(theHub._id, function(err, hub) {
                hub.hub_uri.should.have.members([hubUri, hubUri2]);
                done();
              });
          };

        init();
      });

    it('should update hub extra data', function(done) {
        var oauthClientId = 'oci';
        var hubUri = 'hu';
        var extraData = {foo: 'bar'};
        var extraData2 = {bar: 'foo'};
        var theHub = null;

        var init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri],
                extra_data: extraData
              }, function(err, hub) {
                theHub = hub;
                step1();
              });
          };

        var step1 = function() {
            db.hubs.save(oauthClientId, hubUri, extraData2,
                function(isSaved) {
                    isSaved.should.not.be.false;
                    step2();
                  });
          };

        var step2 = function() {
            db.hubs._model.findById(theHub._id, function(err, hub) {
                hub.extra_data.should.has.all.keys('foo', 'bar');
                hub.extra_data.foo.should.equal(extraData.foo);
                hub.extra_data.bar.should.equal(extraData2.bar);

                done();
              });
          };

        init();
      });

    it('should return hub', function(done) {
        var oauthClientId = 'oci';
        var hubUri = 'hu';

        var init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri]
              }, function() {
                step1();
              });
          };

        var step1 = function() {
            db.hubs.findHub(oauthClientId, function(hub) {
                hub.should.not.be.null;
                step2();
              });
          };

        var step2 = function() {
            db.hubs.findHub(oauthClientId + '2', function(hub) {
                expect(hub).to.be.null;
                done();
              });
          };

        init();
      });
  });
