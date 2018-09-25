# WebSub Push Server
[![Build Status](https://travis-ci.org/xfrocks/node_pubhubsubbub_pushserver.svg?branch=master)](https://travis-ci.org/xfrocks/node_pubhubsubbub_pushserver)
[![Coverage Status](https://coveralls.io/repos/github/xfrocks/node_pubhubsubbub_pushserver/badge.svg?branch=master)](https://coveralls.io/github/xfrocks/node_pubhubsubbub_pushserver?branch=master)

Node.js push notification server which is compatible with WebSub protocol.

 1. Mobile application (`App`) that wants to receive push notifications from WebSub Publisher (`Publisher`) may register itself with this Push Server (`Server`).
 2. `Server` will subscribe on behalf of `App` with `Publisher`.
 3. When `Publisher` publishes something, `Server` will forward the information to `App` via one of the supported push services.

## Usage

### Subscription
Send a `POST` request to `/subscribe`:
 * `hub_uri` (__required__)
 * `oauth_client_id` (__required__)
 * `oauth_token` (__required__)
 * `device_type` (__required__): see _Supported Services_ for explanation
 * `device_id` (__required__): see _Supported Services_ for explanation
 * `extra_data` (_optional_)

## Supported Services

### Apple Push Notification
via [argon/node-apn](https://github.com/argon/node-apn)

Project configuration at `/admin/projects/apn`:
 * `bundle_id` (__required__): The iOS application Bundle ID
 * `token`, an array of...
  * `key` (__required__): The provider token key in plaintext
  * `keyId` (__required__): The ID of the key issued by Apple
  * `teamId` (__required__): The team ID associated with the provider token
  * Please note that if you don't configure provider token, the RSA cert/key pair is required
 * `production` (_optional_): 1 for production, 0 for sandbox

`App` that wants to receive via APN must include these parameters during subscription:
 * `device_type` = `ios`
 * `device_id` = APN Device Token
 * `extra_data[package]` = Bundle ID

### Google Cloud Messaging
via [ToothlessGear/node-gcm](https://github.com/ToothlessGear/node-gcm)

Project configuration at `/admin/projects/gcm`, parameters:
 * `package_id` (__required__): The Android application package ID
 * `api_key` (__required__): The API key for GCM (obtain via Google Developer Console)

`App` that wants to receive via GCM must include theses parameters during subscription:
 * `device_type` = `android`
 * `device_id` = GCM Registration Token
 * `extra_data[package]` = Package ID

### Windows Push Notification
via [tjanczuk/wns](https://github.com/tjanczuk/wns)

Project configuration at `/admin/projects/wns`, parameters:
 * `package_id` (__required__): The Windows application package ID
 * `client_id` (__required__): The Windows client ID
 * `client_secret` (__required__): The Windows client secret

`App` that wants to receive via WNS must include theses parameters during subscription:
 * `device_type` = `windows`
 * `device_id` = Device ID
 * `extra_data[package]` = Package ID
 * `extra_data[channel_uri]` = Channel URI

 
