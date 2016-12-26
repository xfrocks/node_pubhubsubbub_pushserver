'use strict';

const config = require('../lib/config');
const web = require('../lib/web');
const chai = require('chai');
const _ = require('lodash');

chai.should();
chai.use(require('chai-http'));

let webApp = null;
const originalProcessEnv = _.merge({}, process.env);
const adminUsername = 'username';
const adminPassword = 'password';

describe('full app', function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(20000);

    before(function(done) {
        process.env = _.merge({}, originalProcessEnv);
        process.env.CONFIG_WEB_USERNAME = adminUsername;
        process.env.CONFIG_WEB_PASSWORD = adminPassword;
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

    it('should do stats', function(done) {
        webApp
            .get('/admin/stats')
            .auth(adminUsername, adminPassword)
            .end(function(err, res) {
              res.should.have.status(200);

              const stats = res.body;
              stats.should.have.all.keys(
                ['uptime', 'db', 'pusher', 'pushQueue', 'web']);
              stats.uptime.should.at.least(1);

              stats.db.should.have.all.keys(
                ['devices', 'hubs', 'projects']);
              stats.db.devices.should.have.all.keys(
                ['count', 'inserted', 'updated', 'deleted']);
              stats.db.hubs.should.have.all.keys(
                ['count', 'inserted', 'updated']);
              stats.db.projects.should.have.all.keys(
                ['count', 'inserted', 'updated', 'apn', 'gcm', 'wns']);

              stats.pusher.should.have.all.keys(
                ['apn', 'gcm']);
              stats.pushQueue.should.have.all.keys(
                ['queued', 'processed']);

              stats.web.should.have.all.keys(
                ['subscribe', 'unsubscribe', 'unregister', 'callback']);
              stats.web.callback.should.have.all.keys(['get', 'post']);

              done();
            });
      });
  });
