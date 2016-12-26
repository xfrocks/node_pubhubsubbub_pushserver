'use strict';

const helper = exports;
const debug = require('debug')('pushserver:helper');
const _ = require('lodash');
const string = require('string');
const url = require('url');

helper.stripHtml = function(html) {
    return string(html).stripTags().trim().s;
  };

helper.prepareApnMessage = function(originalMessage) {
    let message = '';

    if (originalMessage.length > 230) {
      message = originalMessage.substr(0, 229) + '…';
      debug('prepareApnMessage', originalMessage, '->', message);
    } else {
      message = originalMessage;
    }

    return message;
  };

helper.prepareSubscribeData = function(reqBody, requiredKeys) {
    let hubUri = reqBody.hub_uri;
    if (!_.isString(hubUri)) {
      hubUri = '';
    }

    let hubTopic = reqBody.hub_topic;
    if (!_.isString(hubTopic) && hubUri.length > 0) {
      // try to get hub topic from hub uri
      const hubUriParsed = url.parse(hubUri, true);
      if (hubUriParsed.query && _.isString(hubUriParsed.query['hub.topic'])) {
        debug('prepareSubscribeData', 'extracted `hub_topic` from `hub_uri`');
        hubTopic = hubUriParsed.query['hub.topic'];
      }
    }
    if (!_.isString(hubTopic)) {
      hubTopic = '';
    }

    let oauthClientId = reqBody.oauth_client_id;
    if (!_.isString(oauthClientId)) {
      oauthClientId = '';
    }

    let oauthToken = reqBody.oauth_token;
    if (!_.isString(oauthToken)) {
      oauthToken = '';
    }

    let deviceType = reqBody.device_type;
    if (!_.isString(deviceType)) {
      deviceType = '';
    }

    let deviceId = reqBody.device_id;
    if (!_.isString(deviceId)) {
      deviceId = '';
    }

    let extraData = reqBody.extra_data;
    if (!_.isPlainObject(extraData) || _.isEmpty(extraData)) {
      extraData = null;
    }

    const data = {
        hub_uri: hubUri,
        hub_topic: hubTopic,
        oauth_client_id: oauthClientId,
        oauth_token: oauthToken,

        device_type: deviceType,
        device_id: deviceId,
        extra_data: extraData,
      };

    const missingKeys = [];
    _.forEach(requiredKeys, function(requiredKey) {
        const value = _.get(data, requiredKey, '');

        if (_.isString(value) && value.length === 0) {
          missingKeys.push(requiredKey);
        }
      });

    data.has_all_required_keys = true;
    if (missingKeys.length > 0) {
      data.has_all_required_keys = false;
      data.missing_keys = missingKeys;
    }

    return data;
  };
