#!/bin/sh

_callbackUri="$PUSH_SERVER_ROOT/callback"
_clientId="$PUSH_SERVER_CLIENT_ID"
_userId="$PUSH_SERVER_USER_ID"
_objectData=${PUSH_SERVER_OBJECT_DATA:-"{\"notification_id\":0,\"notification_html\":\"`date`\"}"}

_postData="[{\"client_id\":\"$_clientId\",\"topic\":\"user_notification_$_userId\",\"object_data\":$_objectData}]"

echo "Doing POST via curl to URI($_callbackUri) with data: $_postData..."
curl -XPOST "$_callbackUri" -H 'Content-Type: application/json' -d "$_postData"
