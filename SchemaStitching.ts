import { introspectSchema, RenameRootFields, RenameTypes, wrapSchema } from "@graphql-tools/wrap"
import { stitchSchemas } from "@graphql-tools/stitch";
import { fetch } from "cross-fetch"
import { print, buildSchema, ExecutionResult, DocumentNode, GraphQLResolveInfo } from "graphql"
import { ApolloServer } from "apollo-server";
import { AsyncExecutor } from "@graphql-tools/utils";

interface ServiceIdentifier {
    uri: string;
    name: string;
}

type Request = {
  document: DocumentNode,
  variables?: Object,
  context?: Object,
  info?: GraphQLResolveInfo
}

interface ExecutableService extends ServiceIdentifier {
    // define Executor type
    executor: AsyncExecutor
}

const serviceIdentifiers: ServiceIdentifier[] = [
    {
      uri: 'http://localhost:4001',
      name: 'Countries'
    },
    {
      uri: 'http://localhost:4002',
      name: 'Weather'
    }
  ];

async function fetchRemoteSDL(executor: any, context: any) {
  const result = await executor({ document: '{ _sdl }', context });
  return result.data._sdl;
}

async function makeRemoteExecutor(service: ServiceIdentifier ): Promise<AsyncExecutor> {
  return async ({ document, variables }: Request) => {
    const query = print(document)
    const fetchResult = await fetch(service.uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    })
    return fetchResult.json()
  }
}

export class SchemaFactory {
    private adminContext: any

    constructor(){
        this.adminContext = { authHeader: 'Bearer my-app-to-app-token' }

    }

    async getExecutableServices(serviceIdentifiers: ServiceIdentifier[]): Promise<ExecutableService[]> {
        const executableServices: ExecutableService[] = []

        for (const service of serviceIdentifiers) {
            const serviceExecutor = await makeRemoteExecutor(service)
            executableServices.push({
                uri: service.uri,
                name: service.name,
                executor: serviceExecutor
            })
        }
        return executableServices
    }

    async prepareSubschemas(services: ExecutableService[]) {
        const subschemas: any[] = []
        for (const service of services) {
            try {
            subschemas.push(wrapSchema({
                schema: await introspectSchema(service.executor, this.adminContext),
                executor: service.executor,
                transforms: [
                  new RenameTypes((name) => `${service.name}${name}`),
                  new RenameRootFields((op, name) => `${service.name.toLowerCase()}${name.charAt(0).toUpperCase()}${name.slice(1)}`)
                ]
            }))
            } catch(err) {
              console.log(err)
              console.log(`${service.name} service will not be included!`)
            }
        }
        return subschemas
    }

    async stitchGatewaySchema(serviceIdentifiers: ServiceIdentifier[]) {
        const executableServices = await this.getExecutableServices(serviceIdentifiers);
        const subschemas = await this.prepareSubschemas(executableServices);

        return stitchSchemas({
            subschemas: subschemas,
            typeDefs: 'type Query { test: String! }',
            resolvers: {
              Query: {
                heartbeat: () => 'OK'
              }
            }
          });
    }
}

const runServer = async () => {
    const schemaFactory = new SchemaFactory()
    const gatewaySchema = await schemaFactory.stitchGatewaySchema(serviceIdentifiers)

    const server = new ApolloServer({
      schema: gatewaySchema
    });
    server.listen().then(({url}) => {
      console.log(`Running at ${url}`);
    });
  };
  
  try {
    runServer();
  } catch (err) {
    console.error(err);
  }

