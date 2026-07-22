# MPP

`@lucid-agents/mpp` integrates Machine Payments Protocol challenges into the same HTTP authorization transaction as other access policies. Check the installed package's `mppx` compatibility and method constructors before coding.

A current pattern composes a configured method such as Tempo or Stripe:

```ts
const runtime = await createAgent(meta)
  .use(http())
  .use(
    mpp({
      config: {
        methods: [
          tempo.server({
            /* installed-version options */
          }),
        ],
        currency: 'usd',
        defaultIntent: 'charge',
        secretKey: process.env.MPP_SECRET_KEY!,
      },
    })
  )
  .build();
```

Treat this as structure, not a substitute for installed declarations. Provider method options and supported intents can change.

Rules:

- Configure methods centrally, then select protocol or intent at the entrypoint when the API supports it.
- Never parse or accept a credential in adapter code.
- Keep challenge and verification state bounded and durable where replay protection requires it.
- Return protocol-standard challenges through the HTTP runtime.
- Do not describe unsupported native sessions as available. Use a custom credential verifier only when the package contract supports it and the security model is documented.
- Test missing, invalid, replayed, and valid credentials plus handler failure after authorization.
