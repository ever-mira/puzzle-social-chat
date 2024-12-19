type ChatMessage = {
  type: string
  user: User
  content: string
}

interface User {
  id: string
  username: string
}

export class ChatRoom {
  state: DurableObjectState
  env: Env
  chatHistory: ChatMessage[] = []

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.loadChatHistory()
  }

  async loadChatHistory() {
    const history = (await this.state.storage.get(
      'chatHistory',
    )) as ChatMessage[]
    if (history) {
      this.chatHistory = history
    }
  }

  async fetch(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    const userHeader = request.headers.get('X-User')
    if (userHeader) {
      const user: User = JSON.parse(userHeader)
      if (user) {
        server.serializeAttachment({ user })
      } else {
        server.serializeAttachment({ user: null })
      }
    } else {
      server.serializeAttachment({ user: null })
    }

    this.state.acceptWebSocket(server)

    server.send(JSON.stringify(this.chatHistory))

    const webSocketResponse = new Response(null, {
      status: 101,
      webSocket: client,
    })
    webSocketResponse.headers.set(
      'Sec-WebSocket-Protocol',
      request.headers.get('Sec-WebSocket-Protocol') || '',
    )
    return webSocketResponse
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    const chatMessage = JSON.parse(message as string)
    let attachment = ws.deserializeAttachment()
    if (attachment.user) {
      chatMessage.user = attachment.user
      this.broadcastMessage(chatMessage)
      await this.addToChatHistory(chatMessage)
    } else {
      let response = {
        type: 'system',
        user: { username: 'System' },
        content: '[not_authenticated]',
      }
      ws.send(JSON.stringify(response))
    }
  }

  broadcastMessage(message: ChatMessage) {
    const payload = JSON.stringify(message)

    this.state.getWebSockets().forEach((webSocket) => {
      webSocket.send(payload)
    })
  }

  async addToChatHistory(message: ChatMessage) {
    this.chatHistory.push(message)
    this.state.storage.put('chatHistory', this.chatHistory)
  }
}

interface Env {}
