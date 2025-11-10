{{ADAPTER_IMPORTS}}

{{ADAPTER_PRE_SETUP}}
// Payment feature configuration
const appOptions = {
  useConfigPayments: true,
  config: {
    payments: {
      facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL,
      payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS,
      network: process.env.PAYMENTS_NETWORK,
      defaultPrice: process.env.PAYMENTS_DEFAULT_PRICE,
    },
  },
};

{{ADAPTER_POST_SETUP}}

