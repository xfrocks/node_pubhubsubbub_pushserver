'use strict';

const config = require('../lib/config');
const web = require('../lib/web');
const chai = require('chai');
const _ = require('lodash');

chai.should();
chai.use(require('chai-http'));

let webApp = null;
const originalProcessEnv = _.merge({}, process.env);

describe('full app', function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(20000);

    before(function(done) {
        process.env = _.merge({}, originalProcessEnv);
        process.env.PORT = 0;
        config._reload();

        web._reset();
        webApp = chai.request(web.start());

        done();
      });

    it('should say hi', function(done) {
        webApp
            .get('/')
            .end(function(err, res) {
                res.should.have.status(200);
                res.text.should.have.string('Hi, I am');

                done();
              });
      });
  });
