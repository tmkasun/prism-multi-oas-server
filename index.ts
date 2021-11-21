import * as path from "path";
import * as fs from "fs";

import {
  createSingleProcessPrism,
  CreateMockServerOptions,
} from "./src/createServer";

// Iterate the OAS tools config file and generate OpenAPIBackend objects and set it to test context globals
const oasToolConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "openapitools.json"), "utf8")
);

const apis = {};
Object.entries(oasToolConfig["generator-cli"].generators).map(
  ([apiName, apiConfig]) => {
    const { inputSpec, context } = apiConfig as any;
    apis[apiName] = { publicURL: inputSpec, apiContext: context };
  }
);

const options: CreateMockServerOptions = {
  cors: true,
  dynamic: true,
  port: 4010,
  host: "127.0.0.1",
  apis,
  multiprocess: false,
  errors: true,
};
createSingleProcessPrism(options)
