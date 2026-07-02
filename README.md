Github Action to update a Lambda function from a ZIP file.

## Required parameters

- `AWS_REGION`
- `AWS_SECRET_ID`
- `AWS_SECRET_KEY`
- `FUNCTION_NAME`

## Optional parameters

- `ZIP`: A ZIP file containing the source of the lambda.
- `IMAGE_URI`
- `RUNTIME`
- `ROLE`
- `HANDLER`
- `DESCRIPTION`
- `TIMEOUT`
- `MEMORY_SIZE`
- `ENVIRONMENT`
- `ARCHITECTURES`: A comma separated list if multiple architectures are to be supported
- `S3_BUCKET`: The S3 bucket where the ZIP should be uploaded
- `S3_KEY`: The key that should be used for the ZIP

## Required permisions for the access key

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "iam:ListRoles",
                "iam:PassRole",
                "lambda:GetFunction",
                "lambda:GetFunctionConfiguration",
                "lambda:UpdateFunctionCode",
                "lambda:UpdateFunctionConfiguration"
            ],
            "Resource": "*"
        }
    ]
}
```

## Example

```
name: Deploy AWS Lambda

on:
  pull_request:
    types: [merged]
    branches:
      - main

jobs:
  deploy-lambda:
    if: github.event.pull_request.merged
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - run: echo "TODO GENERATE/FETCH ZIP"
      - uses: mupixa/deploy-lambda
        with:
          ZIP: TEST-LAMBDA-ZIP.zip
          FUNCTION_NAME: TEST-FUNCTION-NAME
          AWS_REGION: ${{ secrets.AWS_REGION }}
          AWS_SECRET_ID: ${{ secrets.AWS_SECRET_ID }}
          AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
          RUNTIME: 'nodejs24.x'
          HANDLER: 'index.handler'
          DESCRIPTION: 'Example function description'
          MEMORY_SIZE: '128'
          TIMEOUT: '5'
          ARCHITECTURES: 'x86_64'
          ENVIRONMENT: '{"VAR_NAME":"VAR_VALUE","EXAMPLE_NAME":"EXAMPLE_VALUE"}'
```
