import { createClient } from '@hey-api/openapi-ts';

createClient({
  input: 'http://localhost:8787/doc',
  output: './sdk',
  plugins: ['@tanstack/react-query'],
});
