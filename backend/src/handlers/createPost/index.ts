import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  // TODO: implement
  return {
    statusCode: 501,
    body: JSON.stringify({ error: { code: "NOT_IMPLEMENTED", message: "Not implemented" } }),
  };
};
