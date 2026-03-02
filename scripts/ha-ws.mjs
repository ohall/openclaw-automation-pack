import WebSocket from 'ws';
import { httpToWs } from './_env.mjs';

export async function haConnect({ baseUrl, token }) {
  const wsUrl = `${httpToWs(baseUrl)}/api/websocket`;
  const ws = new WebSocket(wsUrl, { maxPayload: 10 * 1024 * 1024 });

  const recv = () => new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    ws.once('error', reject);
  });

  const send = (obj) => ws.send(JSON.stringify(obj));

  const hello = await recv();
  if (hello.type !== 'auth_required') throw new Error(`Unexpected hello: ${hello.type}`);

  send({ type: 'auth', access_token: token });
  const auth = await recv();
  if (auth.type !== 'auth_ok') throw new Error(`Auth failed: ${JSON.stringify(auth)}`);

  let id = 1;
  async function call(type, payload = {}) {
    const myId = id++;
    send({ id: myId, type, ...payload });

    // Consume messages until our id response arrives.
    while (true) {
      const msg = await recv();
      if (msg.id !== myId) continue;
      if (!msg.success) throw new Error(`HA call failed: ${JSON.stringify(msg)}`);
      return msg.result;
    }
  }

  return {
    ws,
    call,
    close: () => ws.close(),
  };
}
