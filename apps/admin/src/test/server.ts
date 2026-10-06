import { setupServer } from 'msw/node';

// One shared mock API for every component test. A test adds the handlers it
// needs with server.use(...); setup.ts resets them after each test and fails any
// request nobody handled, so a forgotten endpoint is a loud error, not a hang.
export const server = setupServer();
