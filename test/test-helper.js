'use strict';

const helper = require('../lib/helper.js');
const chai = require('chai');
const _ = require('lodash');

const expect = chai.expect;

describe('helper', function() {
    it('should strip html', function(done) {
        const html = '\t<b>Hello</b> <em>World</em>!\r\n';
        const result = helper.stripHtml(html);
        result.should.equal('Hello World!');
        done();
      });

    it('should prepare apn message', function(done) {
        const string229 = _.repeat('a', 229);
        helper.prepareApnMessage(string229).should.equal(string229);

        const string230 = _.repeat('a', 230);
        helper.prepareApnMessage(string230).should.equal(string230);

        const string231 = _.repeat('a', 231);
        helper.prepareApnMessage(string231).should.equal(string229 + '…');

        done();
      });

    it('should prepare subscribe data', function(done) {
        const hubTopic = 'ht';
        const hubUri = 'http://domain.com/hub';
        const hubUriWithTopic = hubUri + '?hub.topic=' + hubTopic;
        const oauthClientId = 'oci';
        const oauthToken = 'ot';
        const deviceType = 'dt';
        const deviceId = 'di';
        const extraData = {foo: 'bar'};

        expect(helper.prepareSubscribeData({
            hub_uri: hubUri,
            hub_topic: hubTopic,
            oauth_client_id: oauthClientId,
            oauth_token: oauthToken,

            device_type: deviceType,
            device_id: deviceId,
            extra_data: extraData,
          })).to.deep.equal({
            hub_uri: hubUri,
            hub_topic: hubTopic,
            oauth_client_id: oauthClientId,
            oauth_token: oauthToken,

            device_type: deviceType,
            device_id: deviceId,
            extra_data: extraData,

            has_all_required_keys: true,
          });

        expect(helper.prepareSubscribeData({})).to.deep.equal({
            hub_uri: '',
            hub_topic: '',
            oauth_client_id: '',
            oauth_token: '',

            device_type: '',
            device_id: '',
            extra_data: null,

            has_all_required_keys: true,
          });

        expect(helper.prepareSubscribeData({
            hub_uri: hubUriWithTopic,
          })).to.deep.equal({
            hub_uri: hubUriWithTopic,
            hub_topic: hubTopic,
            oauth_client_id: '',
            oauth_token: '',

            device_type: '',
            device_id: '',
            extra_data: null,

            has_all_required_keys: true,
          });

        expect(helper.prepareSubscribeData({}, ['hub_uri']))
            .to.have.property('has_all_required_keys')
            .that.is.false;

        expect(helper.prepareSubscribeData({}, ['extra_data']))
            .to.have.property('has_all_required_keys')
            .that.is.true;

        done();
      });
  });
