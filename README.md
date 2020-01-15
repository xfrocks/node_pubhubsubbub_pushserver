# WebSub Push Server
[![Build Status](https://travis-ci.org/xfrocks/node_pubhubsubbub_pushserver.svg?branch=master)](https://travis-ci.org/xfrocks/node_pubhubsubbub_pushserver)
[![Coverage Status](https://coveralls.io/repos/github/xfrocks/node_pubhubsubbub_pushserver/badge.svg?branch=master)](https://coveralls.io/github/xfrocks/node_pubhubsubbub_pushserver?branch=master)
[![](https://images.microbadger.com/badges/version/xfrocks/pushserver.svg)](https://microbadger.com/images/xfrocks/pushserver)

Node.js push notification server which is compatible with WebSub protocol.

 1. Mobile application (`App`) that wants to receive push notifications from WebSub Publisher (`Publisher`) may register itself with this Push Server (`Server`).
 2. `Server` will subscribe on behalf of `App` with `Publisher`.
 3. When `Publisher` publishes something, `Server` will forward the information to `App` via one of the supported push services.

## Deployment

Notes:

- By default, there'll be 1 worker to push notifications by `npm start`.
It is possible to have multiple separated instances of workers by using `npm run worker`.
In that case, it's recommended to disable the default one by setting env var `CONFIG_PUSH_QUEUE_WORKER=false`.

### Docker Compose

```yaml
  app:
    image: xfrocks/pushserver
    environment:
      - CONFIG_WEB_USERNAME=admin
      - CONFIG_WEB_PASSWORD=123456
      - MONGO_URI=mongodb://mongo/pushserver
      - REDIS_URL=http://redis:6379
    depends_on:
      - mongo
      - redis
    ports:
      - "80:18080"
```

See [docker-compose.yml](docker-compose.yml) file for full example. Please note that the yml is for development purposes, it is **not** secure.

### Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

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

### Firebase Cloud Messaging
via [firebase-admin](https://github.com/firebase/firebase-admin-node) (the official SDK)

Project configuration at `/admin/projects/fcm`, parameters:
 * `project_id` (__required__): The Google project ID
 * `client_email` (__required__)
 * `private_key` (__required__)

`App` that wants to receive via FCM must include these parameters during subscription:
 * `device_type` = `firebase`
 * `device_id` = FCM Registration Token
 * `extra_data[project]` = Project ID

By default, the server will push data messages...
 * `extra_data[notification]` if specified, [notification messages](https://firebase.google.com/docs/cloud-messaging/concept-options#notifications_and_data_messages) will be pushed instead
 * `extra_data[click_action]` the action associated with a user click on the notification. Corresponds to `category` in the APNs payload.

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

 
