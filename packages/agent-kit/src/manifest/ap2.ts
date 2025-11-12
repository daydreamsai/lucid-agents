// AP2 (Agent Payments Protocol) typings and constants.
// These mirror the published PYDantic models so TypeScript agents can share
// the same shapes when constructing mandates or AgentCard extensions.

export const CONTACT_ADDRESS_DATA_KEY =
  'contact_picker.ContactAddress' as const;

export type ContactAddress = {
  city?: string | null;
  country?: string | null;
  dependent_locality?: string | null;
  organization?: string | null;
  phone_number?: string | null;
  postal_code?: string | null;
  recipient?: string | null;
  region?: string | null;
  sorting_code?: string | null;
  address_line?: string[] | null;
};

export const PAYMENT_METHOD_DATA_KEY =
  'payment_request.PaymentMethodData' as const;

export type PaymentCurrencyAmount = {
  currency: string;
  value: number;
};

export type PaymentItem = {
  label: string;
  amount: PaymentCurrencyAmount;
  pending?: boolean | null;
  refund_period?: number;
};

export type PaymentShippingOption = {
  id: string;
  label: string;
  amount: PaymentCurrencyAmount;
  selected?: boolean | null;
};

export type PaymentOptions = {
  request_payer_name?: boolean | null;
  request_payer_email?: boolean | null;
  request_payer_phone?: boolean | null;
  request_shipping?: boolean | null;
  shipping_type?: 'shipping' | 'delivery' | 'pickup' | null;
};

export type PaymentMethodData = {
  supported_methods: string;
  data?: Record<string, unknown>;
};

export type PaymentDetailsModifier = {
  supported_methods: string;
  total?: PaymentItem;
  additional_display_items?: PaymentItem[];
  data?: unknown;
};

export type PaymentDetailsInit = {
  id: string;
  display_items: PaymentItem[];
  shipping_options?: PaymentShippingOption[];
  modifiers?: PaymentDetailsModifier[];
  total: PaymentItem;
};

export type PaymentRequest = {
  method_data: PaymentMethodData[];
  details: PaymentDetailsInit;
  options?: PaymentOptions;
  shipping_address?: ContactAddress;
};

export type PaymentResponse = {
  request_id: string;
  method_name: string;
  details?: Record<string, unknown>;
  shipping_address?: ContactAddress;
  shipping_option?: PaymentShippingOption;
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
};

export const INTENT_MANDATE_DATA_KEY = 'ap2.mandates.IntentMandate' as const;
export const CART_MANDATE_DATA_KEY = 'ap2.mandates.CartMandate' as const;
export const PAYMENT_MANDATE_DATA_KEY = 'ap2.mandates.PaymentMandate' as const;

export type IntentMandate = {
  user_cart_confirmation_required: boolean;
  natural_language_description: string;
  merchants?: string[] | null;
  skus?: string[] | null;
  requires_refundability?: boolean | null;
  intent_expiry: string;
};

export type CartContents = {
  id: string;
  user_cart_confirmation_required: boolean;
  payment_request: PaymentRequest;
  cart_expiry: string;
  merchant_name: string;
};

export type CartMandate = {
  contents: CartContents;
  merchant_authorization?: string | null;
};

export type PaymentMandateContents = {
  payment_mandate_id: string;
  payment_details_id: string;
  payment_details_total: PaymentItem;
  payment_response: PaymentResponse;
  merchant_agent: string;
  timestamp: string;
};

export type PaymentMandate = {
  payment_mandate_contents: PaymentMandateContents;
  user_authorization?: string | null;
};

export const AP2_EXTENSION_URI =
  'https://github.com/google-agentic-commerce/ap2/tree/v0.1' as const;

export type AP2Role =
  | 'merchant'
  | 'shopper'
  | 'credentials-provider'
  | 'payment-processor';

export type AP2ExtensionParams = {
  roles: [AP2Role, ...AP2Role[]];
  [key: string]: unknown;
};

export type AP2ExtensionDescriptor = {
  uri: typeof AP2_EXTENSION_URI;
  description?: string;
  required?: boolean;
  params: AP2ExtensionParams;
};
