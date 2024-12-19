import { jwtVerify } from 'jose'
export { ChatRoom } from './chatroom'

export default {
  async fetch(request: Request, env: Env) {
    try {
      let result = await handleRequest(request, env)
      return result
    } catch (e) {
      return new Response(`Error: ${e}`, { status: 500 })
    }
  },
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url)

    // get chat room name from URL
    const name = url.pathname.split('/').pop()

    if (!name) {
      return new Response('Missing Chatroom name in URL', { status: 400 })
    }

    // check websocket upgrade header
    const upgradeHeader = request.headers.get('upgrade')

    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    // check if chatroom exists
    const room: any = await checkRoom(env, name)

    if (room.length === 0) {
      return new Response('Chatroom not found', { status: 404 })
    }

    // check authentication
    let user: User | null = null
    const subprotocol = request.headers.get('Sec-WebSocket-Protocol')
    if (subprotocol) {
      const token = atob(subprotocol)
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(env.JWT_SECRET),
      )
      if (payload) {
        let userId = payload.sub
        let username = (payload as { user_metadata: { username: string } })
          .user_metadata.username

        if (userId && username) {
          user = { id: userId, username }
        }
      }
    }

    const headers = new Headers(request.headers)
    if (user) {
      headers.set('X-User', JSON.stringify(user))
    }

    const init: RequestInit = {
      headers: headers,
    }

    // forward request to durable object
    const id = env.CHATROOM.idFromName(name)
    const obj = env.CHATROOM.get(id)
    let result = await obj.fetch(request, init)
    return result
  } catch (error) {
    console.log('error', error)
    return new Response(`Error: ${error}`, { status: 500 })
  }
}

async function checkRoom(env: any, name: string) {
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/chatrooms?slug=eq.${name}`,
      {
        method: 'GET',
        headers: {
          apikey: env.SUPABASE_KEY,
        },
      },
    )

    const data = await response.json()
    return data
  } catch (error) {
    console.log('error', error)
    return error
  }
}

interface Env {
  CHATROOM: DurableObjectNamespace
  JWT_SECRET: string
}

interface User {
  id: string
  username: string
}
