import * as readline from "readline/promises";
import * as process from "process";
import * as os from "os";
import * as packageJson from "./node_modules/vscode-json-languageservice/package.json";

const jsonls_version = packageJson.version;

import {
  getLanguageService,
  JSONSchema,
  SchemaDraft,
  TextDocument,
} from "vscode-json-languageservice";

const stdio = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const schemaIds: { [id: string]: SchemaDraft } = {
  "https://json-schema.org/draft/2020-12/schema": SchemaDraft.v2020_12,
  "https://json-schema.org/draft/2019-09/schema": SchemaDraft.v2019_09,
  "http://json-schema.org/draft-07/schema#": SchemaDraft.v7,
  "http://json-schema.org/draft-06/schema#": SchemaDraft.v6,
  "http://json-schema.org/draft-04/schema#": SchemaDraft.v4,
};

function send(data: unknown): void {
  console.log(JSON.stringify(data));
}

interface TestCase {
  schema: JSONSchema;
  registry: Record<string, unknown>;
  tests: Array<{ instance: unknown }>;
}

interface BowtieRequest {
  cmd: string;
  version?: number;
  dialect?: string;
  seq?: unknown;
  case?: TestCase;
}

let started = false;
let dialect: SchemaDraft | undefined;
const ls = getLanguageService({});

const cmds: Record<string, (args: BowtieRequest) => Promise<unknown>> = {
  start: async (args: BowtieRequest) => {
    console.assert(args.version === 1, { args });
    started = true;
    return {
      version: 1,
      implementation: {
        language: "typescript",
        name: "vscode-json-language-service",
        version: jsonls_version,
        homepage: "https://github.com/microsoft/vscode-json-languageservice",
        issues:
          "https://github.com/microsoft/vscode-json-languageservice/issues",
        source: "https://github.com/microsoft/vscode-json-languageservice",

        dialects: [
          "https://json-schema.org/draft/2020-12/schema",
          "https://json-schema.org/draft/2019-09/schema",
          "http://json-schema.org/draft-07/schema#",
          "http://json-schema.org/draft-06/schema#",
          "http://json-schema.org/draft-04/schema#",
        ],
        os: os.platform(),
        os_version: os.release(),
        language_version: process.version,
      },
    };
  },

  dialect: async (args: BowtieRequest) => {
    console.assert(started, "Not started!");
    dialect = schemaIds[args.dialect!];
    return { ok: true };
  },

  run: async (args: BowtieRequest) => {
    console.assert(started, "Not started!");

    const testCase = args.case!;

    for (const _id in testCase.registry) {
    }

    const results = await Promise.all(
      testCase.tests.map(async (test: { instance: unknown }) => {
        try {
          const textDoc = TextDocument.create(
            "example://bowtie-test.json",
            "json",
            0,
            JSON.stringify(test.instance),
          );
          const jsonDoc = ls.parseJSONDocument(textDoc);
          const semanticErrors = await ls.doValidation(
            textDoc,
            jsonDoc,
            { schemaDraft: dialect },
            testCase.schema,
          );
          return { valid: semanticErrors.length === 0 ? true : false };
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          return {
            errored: true,
            context: {
              traceback: err.stack,
              message: err.message,
            },
          };
        }
      }),
    );
    return { seq: args.seq, results: results };
  },

  stop: async (_: BowtieRequest) => {
    console.assert(started, "Not started!");
    process.exit(0);
  },
};

async function main(): Promise<void> {
  for await (const line of stdio) {
    const request: BowtieRequest = JSON.parse(line);
    const handler = cmds[request.cmd];
    const response = await handler(request);
    send(response);
  }
}

main();
