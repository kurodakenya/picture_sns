import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const POSTS_TABLE = process.env.POSTS_TABLE!;
const LIKES_TABLE = process.env.LIKES_TABLE!;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub as string;
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "postId is required" } }),
      };
    }

    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: LIKES_TABLE,
            Key: { postId, userId },
            ConditionExpression: "attribute_exists(postId) AND attribute_exists(userId)",
          },
        },
        {
          Update: {
            TableName: POSTS_TABLE,
            Key: { postId },
            UpdateExpression: "ADD likeCount :neg",
            ExpressionAttributeValues: { ":neg": -1 },
          },
        },
      ],
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ liked: false }),
    };
  } catch (err: any) {
    if (err.name === "TransactionCanceledException") {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: { code: "NOT_LIKED", message: "Not liked yet" } }),
      };
    }
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }),
    };
  }
};
