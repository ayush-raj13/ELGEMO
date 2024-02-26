import {
  QueryCommand,
  PutCommand,
  GetCommand,
  BatchWriteCommand,
} from "/opt/nodejs/node16/node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js";
import { sendToOne, dynamo, tableName } from "../index.mjs";

let GLOBAL_ROOM_ID = 1;
const indexName = "UsersRoomView";

async function deleteItemsWithPartitionKey(tableName, partitionKeyValue) {
    console.log(partitionKeyValue);
    try {
        // Query items with the specified partition key value
        const queryResult = await dynamo.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: {
                "#pk": "PK#" // Replace "PK#" with your actual partition key attribute name
            },
            ExpressionAttributeValues: {
                ":pk": partitionKeyValue
            }
        }));

        // Extract the items to delete from the query result
        const itemsToDelete = queryResult.Items;

        // If there are no items to delete, return early
        if (itemsToDelete.length === 0) {
            console.log("No items found with the specified partition key value.");
            return;
        }
        
        console.log(itemsToDelete);

        // Create delete requests for each item
        const deleteRequests = itemsToDelete.map(item => ({
            DeleteRequest: {
                Key: {
                    "PK#": item["PK#"],
                    "SK#": item["SK#"]
                }
            }
        }));

        // Batch delete the items
        const params = {
            RequestItems: {
                [tableName]: deleteRequests
            }
        };
        await dynamo.send(new BatchWriteCommand(params));

        console.log("Items deleted successfully.");
    } catch (error) {
        console.error("Error:", error);
    }
}


export class RoomManager {

    async createRoom(user1, user2) {
        const roomId = this.generate().toString();
        
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              "PK#": `Room#${roomId}`,
              "SK#": user1,
              "GS1#": user2,
            },
          })
        );
        
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              "PK#": `Room#${roomId}`,
              "SK#": user2,
              "GS1#": user1,
            },
          })
        );
        
        //server is sending event "send-offer" to user1, in return the user1 will send sdp
        await sendToOne(user1.split("#")[1], {type: "send-offer", roomId});
        //this may be redundant
        await sendToOne(user2.split("#")[1], {type: "send-offer", roomId});
    }

    async onOffer(roomId, sdp, senderConnectionId) {
        let room = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
              "PK#": `Room#${roomId}`,
              "SK#": `QUEUE#${senderConnectionId}`,
            },
          })
        );
        room = room.Item;
        
        if (!room) {
            console.log("no room found");
            return;
        }
        const receivingUser = room["GS1#"];
        
        let user = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
              "PK#": "ORG#User",
              "SK#": `USER#${senderConnectionId}`,
            },
          })
        );
        user = user.Item;
        // Server sends an event "offer" to user2 with sdp of user1 and roomId

        if (receivingUser) {
            console.log("offer sent");
            await sendToOne(receivingUser.split("#")[1], {type: "offer", sdp, roomId, partnerName: user["Attr#"]});
        }
    }
    
    async onAnswer(roomId, sdp, senderConnectionId) {
        let room = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
              "PK#": `Room#${roomId}`,
              "SK#": `QUEUE#${senderConnectionId}`,
            },
          })
        );
        room = room.Item;
        if (!room) {
            return;
        }
        const receivingUser = room["GS1#"];
        // Server sends an event "offer" to user1 with sdp of user2 and roomId
        if (receivingUser) {
            await sendToOne(receivingUser.split("#")[1], {type: "answer", sdp, roomId});
        }
    }

    async onIceCandidates(roomId, senderConnectionId, candidate, recipientType) {
        let room = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
              "PK#": `Room#${roomId}`,
              "SK#": `QUEUE#${senderConnectionId}`,
            },
          })
        );
        room = room.Item;
        if (!room) {
            return;
        }
        const receivingUser = room["GS1#"];
        await sendToOne(receivingUser.split("#")[1], {type: "add-ice-candidate", candidate, recipientType});
    }

    async userLeft(user) {
        let body = await dynamo.send(new QueryCommand({
            TableName: tableName,
            IndexName: indexName,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: {
                "#pk": "GS1#"
            },
            ExpressionAttributeValues: {
                ":pk": `QUEUE#${user["SK#"].split("#")[1]}`
            }
        }));
        
        var roomId = null;
        if (body.Items.length == 1) {
            body = body.Items[0];
            roomId = body["PK#"].split("#")[1];
        }
        

        if (roomId) {
            const receivingUser = body["SK#"];
            await sendToOne(receivingUser.split("#")[1], {type: "leave"});
            await deleteItemsWithPartitionKey(tableName, `Room#${roomId}`);
            return receivingUser;
        }
        return null;
    }

    generate() {
        return GLOBAL_ROOM_ID++;
    }

}