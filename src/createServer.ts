import { createLogger } from '@stoplight/prism-core';
import { IHttpConfig, IHttpRequest } from '@stoplight/prism-http';
import { createServer as createHttpServer } from '@stoplight/prism-http-server';
import * as chalk from 'chalk';
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import { LogDescriptor, Logger, LoggerOptions } from 'pino';
import * as signale from 'signale';
import * as split from 'split2';
import { PassThrough, Readable } from 'stream';
import { LOG_COLOR_MAP } from './const/options';
import { createExamplePath } from './paths';
import {
  attachTagsToParamsValues,
  transformPathParamsValues,
} from './colorizer';
import { getHttpOperationsFromSpec } from './operations';
import { IHttpOperation } from '@stoplight/types';

type PrismLogDescriptor = LogDescriptor & {
  name: keyof typeof LOG_COLOR_MAP;
  offset?: number;
  input: IHttpRequest;
};

signale.config({ displayTimestamp: true });

const cliSpecificLoggerOptions: LoggerOptions = {
  customLevels: { start: 11 },
  level: 'start',
  formatters: {
    level: (level) => ({ level }),
  },
};

const createSingleProcessPrism: any = (options) => {
  signale.await({
    prefix: chalk.bgWhiteBright.black('[CLI]'),
    message: 'Starting Prism…',
  });

  const logStream = new PassThrough();
  const logInstance = createLogger('CLI', cliSpecificLoggerOptions, logStream);
  pipeOutputToSignale(logStream);

  return createPrismServerWithLogger(options, logInstance).catch((e: Error) => {
    logInstance.fatal(e.message);
    throw e;
  });
};

async function createPrismServerWithLogger(
  options: CreateBaseServerOptions,
  logInstance: Logger,
) {
  const { apis } = options;
  let allOperations: IHttpOperation[] = [];
  for (const [apiName, apiDef] of Object.entries(apis)) {
    const apiOperations = await getHttpOperationsFromSpec(apiDef.publicURL);
    for (const operation of apiOperations) {
      operation.path = `${apiDef.apiContext}${operation.path}`;
    }
    allOperations = allOperations.concat(apiOperations);
  }
  // await configureExtensionsFromSpec(options.document);

  if (allOperations.length === 0) {
    throw new Error('No operations found in the current file.');
  }

  const shared: Omit<IHttpConfig, 'mock'> = {
    validateRequest: true,
    validateResponse: true,
    checkSecurity: false,
    errors: false,
  };

  const config: IHttpConfig = isProxyServerOptions(options)
    ? {
        ...shared,
        mock: false,
        upstream: options.upstream,
        errors: options.errors,
      }
    : { ...shared, mock: { dynamic: options.dynamic }, errors: options.errors };

  const server = createHttpServer(allOperations, {
    cors: options.cors,
    config,
    components: { logger: logInstance.child({ name: 'HTTP SERVER' }) },
  });

  const address = await server.listen(options.port, options.host);

  allOperations.forEach((resource) => {
    const path = pipe(
      createExamplePath(resource, attachTagsToParamsValues),
      E.getOrElse(() => resource.path),
    );

    logInstance.info(
      `${resource.method
        .toUpperCase()
        .padEnd(10)} ${address}${transformPathParamsValues(
        path,
        chalk.bold.cyan,
      )}`,
    );
  });
  logInstance.start(`Prism is listening on ${address}`);

  return server;
}

function pipeOutputToSignale(stream: Readable) {
  function constructPrefix(logLine: PrismLogDescriptor): string {
    const logOptions = LOG_COLOR_MAP[logLine.name];
    const prefix = '    '
      .repeat(logOptions.index + (logLine.offset || 0))
      .concat(logOptions.color.black(`[${logLine.name}]`));

    return logLine.input
      ? prefix.concat(
          ' ' +
            chalk.bold.white(
              `${logLine.input.method} ${logLine.input.url.path}`,
            ),
        )
      : prefix;
  }

  stream.pipe(split(JSON.parse)).on('data', (logLine: PrismLogDescriptor) => {
    signale[logLine.level]({
      prefix: constructPrefix(logLine),
      message: logLine.msg,
    });
  });
}

function isProxyServerOptions(
  options: CreateBaseServerOptions,
): options is CreateProxyServerOptions {
  return 'upstream' in options;
}

type CreateBaseServerOptions = {
  dynamic: boolean;
  cors: boolean;
  host: string;
  port: number;
  apis: { [key: string]: { publicURL: string; apiContext: string } };
  multiprocess: boolean;
  errors: boolean;
};

export interface CreateProxyServerOptions extends CreateBaseServerOptions {
  dynamic: false;
  upstream: URL;
}

export type CreateMockServerOptions = CreateBaseServerOptions;

export { createSingleProcessPrism };
