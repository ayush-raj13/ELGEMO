import {
  QueryCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "/opt/nodejs/node16/node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js";
import { RoomManager } from "./RoomManager.mjs";
import { sendToOne, dynamo, tableName } from "../index.mjs";

export class UserManager {
    constructor() {
        this.roomManager = new RoomManager();
    }

    async addUser(name, connectionId) {
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              "PK#": "ORG#User",
              "SK#": `USER#${connectionId}`,
              "Attr#": name,
            },
          })
        );
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              "PK#": "ORG#Queue",
              "SK#": `QUEUE#${connectionId}`,
            },
          })
        );
        await sendToOne(connectionId, {type: "lobby"});
        await this.clearQueue();
    }

    async removeUser(connectionId) {
        let user = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
                "PK#": "ORG#User",
                "SK#": `USER#${connectionId}`
            },
          })
        );
        user = user.Item;
        if (user) {
            const receivingUser = await this.roomManager.userLeft(user);
            if (receivingUser) {
                await dynamo.send(
                  new PutCommand({
                    TableName: tableName,
                    Item: {
                      "PK#": "ORG#Queue",
                      "SK#": receivingUser,
                    },
                  })
                );
            }
            await this.clearQueue();
        }
        
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
                "PK#": "ORG#User",
                "SK#": `USER#${connectionId}`
            },
          })
        );
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
                "PK#": "ORG#Queue",
                "SK#": `QUEUE#${connectionId}`
            },
          })
        );
    }

    async userLeft(connectionId) {
        let user = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
                "PK#": "ORG#User",
                "SK#": `USER#${connectionId}`
            },
          })
        );
        user = user.Item;
        if (user) {
            const receivingUser = await this.roomManager.userLeft(user);
            await dynamo.send(
              new PutCommand({
                TableName: tableName,
                Item: {
                  "PK#": "ORG#Queue",
                  "SK#": `QUEUE#${connectionId}`,
                },
              })
            );
            if (receivingUser) {
                await dynamo.send(
                  new PutCommand({
                    TableName: tableName,
                    Item: {
                      "PK#": "ORG#Queue",
                      "SK#": receivingUser,
                    },
                  })
                );
            }
            await this.clearQueue();
        }
    }

    async clearQueue() {
        let body = await dynamo.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: {
                "#pk": "PK#"
            },
            ExpressionAttributeValues: {
                ":pk": "ORG#Queue"
            }
        }));
        body = body.Items;
        
        if (body.length < 2) {
            return;
        }
        
        const randomIndex1 = Math.floor(Math.random() * body.length);
        let randomIndex2 = Math.floor(Math.random() * body.length);
        while (randomIndex2 == randomIndex1) {
            randomIndex2 = Math.floor(Math.random() * body.length);
        }
        
        const randomItem1 = body[randomIndex1];
        const randomItem2 = body[randomIndex2];
        
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              "PK#": randomItem1["PK#"],
              "SK#": randomItem1["SK#"]
            },
          })
        );
        
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              "PK#": randomItem2["PK#"],
              "SK#": randomItem2["SK#"]
            },
          })
        );

        const room = await this.roomManager.createRoom(randomItem1["SK#"], randomItem2["SK#"]);
        // this may be redundant if clearQueue is also called after a user exits the room 
        await this.clearQueue();
    }

}