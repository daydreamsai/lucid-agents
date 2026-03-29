import * as core from "@lucid-agents/core";
import * as http from "@lucid-agents/http";
import * as payments from "@lucid-agents/payments";
import * as wallet from "@lucid-agents/wallet";
import * as identity from "@lucid-agents/identity";
import * as a2a from "@lucid-agents/a2a";
import * as ap2 from "@lucid-agents/ap2";

export const lucidPackages = Object.freeze({
  core,
  http,
  payments,
  wallet,
  identity,
  a2a,
  ap2,
});

export type LucidPackages = typeof lucidPackages;