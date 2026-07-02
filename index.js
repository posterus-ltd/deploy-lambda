const core = require("@actions/core");
const fs = require("fs");
const {
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
} = require("@aws-sdk/client-lambda");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

async function run() {
  // Get all parameters (mandatory ones fail fast via { required: true })
  const ZIP = core.getInput("ZIP");
  const FUNCTION_NAME = core.getInput("FUNCTION_NAME", { required: true });
  const AWS_REGION = core.getInput("AWS_REGION", { required: true });
  const AWS_SECRET_ID = core.getInput("AWS_SECRET_ID", { required: true });
  const AWS_SECRET_KEY = core.getInput("AWS_SECRET_KEY", { required: true });
  const RUNTIME = core.getInput("RUNTIME");
  const ROLE = core.getInput("ROLE");
  const HANDLER = core.getInput("HANDLER");
  const DESCRIPTION = core.getInput("DESCRIPTION");
  const TIMEOUT = core.getInput("TIMEOUT");
  const MEMORY_SIZE = core.getInput("MEMORY_SIZE");
  const ARCHITECTURES = core.getInput("ARCHITECTURES");
  const ENVIRONMENT = core.getInput("ENVIRONMENT");
  const S3_BUCKET = core.getInput("S3_BUCKET");
  const S3_KEY = core.getInput("S3_KEY");
  const IMAGE_URI = core.getInput("IMAGE_URI");

  const awsIdentityProvider = () =>
    Promise.resolve({
      accessKeyId: AWS_SECRET_ID,
      secretAccessKey: AWS_SECRET_KEY,
    });
  const awsConfig = {
    region: AWS_REGION,
    credentials: awsIdentityProvider,
    maxAttempts: 4,
  };
  console.log(`Update ${FUNCTION_NAME} in ${AWS_REGION}.`);

  const lambdaClient = new LambdaClient(awsConfig);

  // Build the configuration update (UpdateFunctionConfiguration only accepts
  // configuration fields — never code fields such as Architectures/ZipFile).
  const configParams = { FunctionName: FUNCTION_NAME };
  const setConfig = (name, value) => {
    if (value !== undefined && value !== "") {
      configParams[name] = value;
    }
  };
  setConfig("Role", ROLE);
  setConfig("Description", DESCRIPTION);
  setConfig("Timeout", convertOptionalToNumber(TIMEOUT));
  setConfig("MemorySize", convertOptionalToNumber(MEMORY_SIZE));
  if (!IMAGE_URI) {
    // Runtime/Handler/Environment are not valid for image-based functions.
    setConfig("Runtime", RUNTIME);
    setConfig("Handler", HANDLER);
    if (ENVIRONMENT) {
      configParams["Environment"] = { Variables: JSON.parse(ENVIRONMENT) };
    }
  }
  const hasConfigUpdate = Object.keys(configParams).length > 1;

  // Build the code update (UpdateFunctionCode only accepts code fields).
  let codeParams = null;
  if (ZIP || IMAGE_URI) {
    codeParams = { FunctionName: FUNCTION_NAME, Publish: true };
    // Default to x86_64 when not specified. Note: this is applied on every
    // code deploy, so an arm64 function must set ARCHITECTURES: arm64
    // explicitly or it will be switched to x86_64.
    codeParams["Architectures"] = splitOptional(ARCHITECTURES) || ["x86_64"];
    if (IMAGE_URI) {
      codeParams["ImageUri"] = IMAGE_URI;
    } else {
      const zipBuffer = readZip(`./${ZIP}`);
      if (S3_BUCKET && S3_KEY) {
        console.log(`Upload to ${S3_BUCKET} as ${S3_KEY}.`);
        const s3Client = new S3Client(awsConfig);
        const response = await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: S3_KEY,
            Body: zipBuffer,
          })
        );
        codeParams["S3Bucket"] = S3_BUCKET;
        codeParams["S3Key"] = S3_KEY;
        if (response.VersionId) {
          codeParams["S3ObjectVersion"] = response.VersionId;
        }
        console.log(
          `Uploaded to S3${
            response.VersionId ? ` (version ${response.VersionId})` : ""
          }.`
        );
      } else {
        console.log("Direct upload.");
        codeParams["ZipFile"] = zipBuffer;
      }
    }
  }

  if (!hasConfigUpdate && !codeParams) {
    throw new Error(
      "Nothing to update: provide ZIP, IMAGE_URI, or at least one configuration input."
    );
  }

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionConfigurationCommand/
  // Apply configuration first so a subsequently published code version
  // snapshots the new configuration. AWS rejects overlapping updates with
  // ResourceConflictException, so we wait for each change to settle.
  if (hasConfigUpdate) {
    console.log("Updating function configuration.");
    const response = await lambdaClient.send(
      new UpdateFunctionConfigurationCommand(configParams)
    );
    logLambdaResult(response);
    await waitUntilFunctionUpdated(lambdaClient, FUNCTION_NAME);
  }

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionCodeCommand/
  if (codeParams) {
    console.log("Updating function code.");
    const response = await lambdaClient.send(
      new UpdateFunctionCodeCommand(codeParams)
    );
    logLambdaResult(response);
    await waitUntilFunctionUpdated(lambdaClient, FUNCTION_NAME);
  }
}

(async function () {
  try {
    await run();
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
})();

// HELPER FUNCTIONS
function readZip(path) {
  const zipBuffer = fs.readFileSync(path);
  if (zipBuffer) {
    core.debug("ZIP read into memory.");
  }
  return zipBuffer;
}

async function waitUntilFunctionUpdated(client, functionName) {
  await waitUntilFunctionUpdatedV2(
    { client, maxWaitTime: 300 },
    { FunctionName: functionName }
  );
}

// Log a curated summary instead of the raw response — the raw
// UpdateFunctionConfiguration response echoes Environment.Variables in
// plaintext, which would leak secrets into the workflow log.
function logLambdaResult(response) {
  console.log(
    `Function ${response.FunctionName} — version ${response.Version}, ` +
      `state ${response.State ?? "n/a"}, ` +
      `lastUpdateStatus ${response.LastUpdateStatus ?? "n/a"}.`
  );
  if (response.FunctionArn) {
    console.log(`ARN: ${response.FunctionArn}`);
  }
}

function convertOptionalToNumber(it) {
  return it ? Number(it) : undefined;
}
function splitOptional(it, separator = ",") {
  return it ? it.split(separator) : undefined;
}
