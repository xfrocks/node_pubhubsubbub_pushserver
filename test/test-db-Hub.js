'use strict';

const db = require('../lib/db');
const chai = require('chai');

chai.should();
const expect = chai.expect;

const oauthClientId = 'oci';
const hubUri = 'hu';
const extraData = {foo: 'bar'};

describe('db/Hub', function() {
    beforeEach(function(done) {
        const checkForDb = function() {
          if (!db.isConnected()) {
            return setTimeout(checkForDb, 100);
          }

          db.hubs._model.collection.drop().then(function() {
              done();
            }).catch(function() {
              done();
            });
          };

        checkForDb();
      });

    it('should save hub', function(done) {
        const step1 = function() {
            db.hubs.save(oauthClientId, hubUri, extraData,
              function(isSaved) {
                isSaved.should.equal('inserted');
                step2();
              });
          };

        const step2 = function() {
            db.hubs._model.find({
                oauth_client_id: oauthClientId,
              }, function(err, hubs) {
                hubs.should.be.a('array');
                hubs.length.should.equal(1);

                const hub = hubs[0];
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
        let theHub = null;
        const init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri],
                extra_data: extraData,
              }, function(err, hub) {
                hub.should.not.be.null;
                theHub = hub;
                step1();
              });
          };

        const step1 = function() {
            db.hubs.save(oauthClientId, 'hu2', extraData,
              function(isSaved) {
                isSaved.should.equal('updated');
                step2();
              });
          };

        const step2 = function() {
            db.hubs._model.findById(theHub._id, function(err, hub) {
                hub.hub_uri.should.have.members([hubUri, 'hu2']);
                done();
              });
          };

        init();
      });

    it('should update hub extra data', function(done) {
        const extraData2 = {bar: 'foo'};
        let theHub = null;

        const init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri],
                extra_data: extraData,
              }, function(err, hub) {
                hub.should.not.be.null;
                theHub = hub;
                step1();
              });
          };

        const step1 = function() {
            db.hubs.save(oauthClientId, hubUri, extraData2,
                function(isSaved) {
                    isSaved.should.equal('updated');
                    step2();
                  });
          };

        const step2 = function() {
            db.hubs._model.findById(theHub._id, function(err, hub) {
                hub.extra_data.should.has.all.keys('foo', 'bar');
                hub.extra_data.foo.should.equal(extraData.foo);
                hub.extra_data.bar.should.equal(extraData2.bar);

                done();
              });
          };

        init();
      });

    it('should do no op', function(done) {
        const init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri],
                extra_data: extraData,
              }, function(err, hub) {
                hub.should.not.be.null;
                test();
              });
          };

        const test = function() {
            db.hubs.save(oauthClientId, hubUri, extraData,
                function(isSaved) {
                    isSaved.should.equal('nop');
                    done();
                  });
          };

        init();
      });

    it('should return hub', function(done) {
        const init = function() {
            db.hubs._model.create({
                oauth_client_id: oauthClientId,
                hub_uri: [hubUri],
              }, function() {
                step1();
              });
          };

        const step1 = function() {
            db.hubs.findHub(oauthClientId, function(hub) {
                hub.should.not.be.null;
                step2();
              });
          };

        const step2 = function() {
            db.hubs.findHub(oauthClientId + '2', function(hub) {
                expect(hub).to.be.null;
                done();
              });
          };

        init();
      });
  });
