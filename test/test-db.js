'use strict';

const db = require('../lib/db');
const chai = require('chai');

chai.should();

describe('db', function() {
    it('should have middleware', function(done) {
      const middleware = db.expressMiddleware();
      middleware.should.not.be.null;
      done();
    }).timeout(5000);
  });
