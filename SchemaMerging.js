import {
  makeRemoteExecutableSchema,
  introspectSchema,
  mergeSchemas
} from 'graphql-tools';
import { HttpLink } from 'apollo-link-http';
import { ApolloServer } from 'apollo-server';
import fetch from 'node-fetch';

const graphqlApis = [
  {
    uri: 'http://localhost:4001',
  },
  {
    uri: 'http://localhost:4002',
  }
];

const createRemoteExecutableSchemas = async () => {
  let schemas = [];
  for (const api of graphqlApis) {
    const link = new HttpLink({
      uri: api.uri,
      fetch
    });
    const remoteSchema = await introspectSchema(link);
    const remoteExecutableSchema = makeRemoteExecutableSchema({
      schema: remoteSchema,
      link
    });
    schemas.push(remoteExecutableSchema);
  }
  return schemas;
};

const createNewSchema = async () => {
  const schemas = await createRemoteExecutableSchemas();
  return mergeSchemas({
    schemas
  });
};

const runServer = async () => {
  const schema = await createNewSchema();
  const server = new ApolloServer({
    schema
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