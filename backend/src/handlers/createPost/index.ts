import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.POSTS_TABLE!;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims.sub as string;
    const userName = (claims.preferred_username || claims.email) as string;

    const body = JSON.parse(event.body || "{}");
    const { s3Key, caption } = body;

    if (!s3Key || typeof s3Key !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "s3Key is required" } }),
      };
    }

    if (!s3Key.startsWith(`uploads/${userId}/`)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "Invalid s3Key" } }),
      };
    }

    if (caption !== undefined && typeof caption === "string" && caption.length > 200) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Caption must be 200 characters or less" } }),
      };
    }

    const postId = crypto.randomUUID();
    const now = new Date().toISOString();

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        postId,
        userId,
        userName,
        s3Key,
        caption: caption || "",
        createdAt: now,
        gsiPk: "POST",
        likeCount: 0,
      },
    }));

    return {
      statusCode: 201,
      body: JSON.stringify({ postId, createdAt: now }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }),
    };
  }
};
