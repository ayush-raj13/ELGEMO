import AWS from '/var/runtime/node_modules/aws-sdk/lib/aws.js';
import { DynamoDBClient } from "/opt/nodejs/node16/node_modules/@aws-sdk/client-dynamodb/dist-cjs/index.js";
import {
  DynamoDBDocumentClient,
} from "/opt/nodejs/node16/node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js";
import { UserManager } from "./managers/UserManager.mjs";
const ENDPOINT = 'ccme03ln92.execute-api.eu-north-1.amazonaws.com/production';
const client = new AWS.ApiGatewayManagementApi({ endpoint: ENDPOINT });

export const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const tableName = "ElgemoUsers";

const userManager = new UserManager();

export const sendToOne = async (id, body) => {
  try {
    await client.postToConnection({
      'ConnectionId': id,
      'Data': Buffer.from(JSON.stringify(body)),
    }).promise();
  } catch (err) {
    console.error(err);
  }
};


export const handler = async (event) => {
  
  if (event.requestContext) {
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    let body={};
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch (err) {
      
    }
    console.log(routeKey, body);
    
    switch (routeKey) {
    case '$connect':
      break;
    case '$disconnect':
      await userManager.removeUser(connectionId);
      break;
    case '$default':
      // Code for handling default route
      break;
    case 'initiate':
      await userManager.addUser(body.name, connectionId);
      break;
    case 'offer': {
      const {sdp, roomId} = body;
      await userManager.roomManager.onOffer(roomId, sdp, connectionId);
      break;
    }
    case 'answer': {
      const {sdp, roomId} = body;
      await userManager.roomManager.onAnswer(roomId, sdp, connectionId);
      break;
    }
    case 'add-ice-candidate': {
      const {candidate, roomId, recipientType} = body;
      await userManager.roomManager.onIceCandidates(roomId, connectionId, candidate, recipientType);
      break;
    }
    case 'leave':
      await userManager.userLeft(connectionId);
      // leave
      break;
    case 'close':
      await userManager.removeUser(connectionId);
      // close
      break;
    default:
      // Code for handling other routes
      break;
  }

  }
  // TODO implement
  const response = {
    statusCode: 200,
    body: JSON.stringify('Hello from Lambda!'),
  };
  return response;
};