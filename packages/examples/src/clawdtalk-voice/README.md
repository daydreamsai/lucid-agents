# ClawdTalk Voice Integration Example

Connect your Daydreams agent to ClawdTalk for voice calls. Your agent gets a real phone number and can interact with customers by voice.

## What is ClawdTalk?

ClawdTalk gives any AI agent a real phone number for voice calls and SMS. It handles:

- Voice calls (inbound and outbound)
- Speech-to-text transcription
- Text-to-speech synthesis
- WebSocket connection (no server needed on your end)

Powered by [Telnyx](https://telnyx.com) telephony infrastructure.

## Prerequisites

- [ClawdTalk account](https://clawdtalk.com) with API key
- Daydreams agent running (this example)
- Bun runtime

## Quick Start

1. **Set your API key:**

```bash
export CLAWDTALK_API_KEY=cc_live_your_key_here
```

2. **Run the agent:**

```bash
bun run packages/examples/src/clawdtalk-voice/index.ts
```

3. **Connect ClawdTalk:**

The ClawdTalk client connects via WebSocket to the ClawdTalk server, which routes voice calls to your agent. See [ClawdTalk docs](https://github.com/team-telnyx/clawdtalk-client) for setup instructions.

## How It Works

```text
Phone -> Telnyx (STT) -> ClawdTalk Server -> WebSocket -> Your Agent -> TTS -> Phone
```

When someone calls your ClawdTalk number:

1. Telnyx handles the telephony
2. Speech is transcribed to text
3. ClawdTalk routes the text to your agent via WebSocket
4. Your agent processes the request (using tools, context, etc.)
5. The response is converted to speech and played back

## Example Commerce Agent

This example includes a simple commerce agent with these entrypoints:

| Entrypoint | Description | Input |
|------------|-------------|-------|
| `browse` | List available products | `{}` |
| `order` | Place an order | `{ orderId, items[] }` |
| `status` | Check order status | `{ orderId }` |
| `voice-context` | Get voice context for ClawdTalk | `{}` |

### Voice Context

The `voice-context` entrypoint returns instructions for the ClawdTalk client on how to format responses for phone calls. This ensures your agent speaks naturally without Markdown, bullet points, or other non-voice-friendly content.

## Integration with Payments

To monetize your voice agent, add payment configuration:

```bash
export PAYMENTS_RECEIVABLE_ADDRESS=0xYourWalletAddress
```

This enables x402 payments for paid entrypoints.

## Resources

- [ClawdTalk](https://clawdtalk.com) - Sign up and manage your account
- [ClawdTalk Client](https://github.com/team-telnyx/clawdtalk-client) - WebSocket client and setup docs
- [Telnyx](https://telnyx.com) - Voice and messaging infrastructure
- [Daydreams](https://github.com/daydreamsai/lucid-agents) - Agent framework

## License

MIT
