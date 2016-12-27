'use strict';

const config = require('../lib/config');
const chai = require('chai');
const _ = require('lodash');

chai.should();

const originalProcessEnv = _.cloneDeep(process.env);

describe('db', function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(20000);

    beforeEach(function(done) {
        process.env = _.cloneDeep(originalProcessEnv);
        config._reload();
        done();
      });

    it('should connect', function(done) {
        const db = require('../lib/db')(config);

        const waitForDb = function() {
            if (db.isConnecting()) {
              return setTimeout(waitForDb, 100);
            }

            db.isConnected().should.be.true;
            db.closeConnection().then(done);
          };

        waitForDb();
      });

    it('should fail with invalid uri', function(done) {
        config.db.mongoUri = 'mongodb://a.b.c/db';
        const db = require('../lib/db')(config);

        const waitForDb = function() {
            if (db.isConnecting()) {
              return setTimeout(waitForDb, 100);
            }

            db.isConnected().should.be.false;
            done();
          };

        waitForDb();
      });

    it('should have middleware', function(done) {
        const db = require('../lib/db')(config);
        const middleware = db.expressMiddleware();
        middleware.should.not.be.null;

        db.closeConnection().then(done);
      });
  });
