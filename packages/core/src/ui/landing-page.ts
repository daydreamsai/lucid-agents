import { resolvePrice } from '@lucid-agents/payments';
import type { AgentMeta, EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { z } from 'zod';

type LandingPageOptions = {
  meta: AgentMeta;
  origin: string;
  entrypoints: EntrypointDef[];
  activePayments?: PaymentsConfig;
  manifestPath: string;
  faviconDataUrl: string;
  x402ClientExample: string;
};

const sampleFromJsonSchema = (
  schema: any,
  root: any,
  stack: Set<unknown>
): unknown => {
  if (!schema || typeof schema !== 'object') return undefined;
  if (stack.has(schema)) {
    return undefined;
  }
  stack.add(schema);

  const { type } = schema;
  let result: unknown;

  if (schema.const !== undefined) {
    result = schema.const;
  } else if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    result = schema.enum[0];
  } else if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const resolved = schema.anyOf.find((item: unknown) => item !== schema);
    result = resolved
      ? sampleFromJsonSchema(resolved, root, stack)
      : sampleFromJsonSchema(schema.anyOf[0], root, stack);
  } else if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const part = schema.oneOf.find((item: unknown) => item !== schema);
    result = part
      ? sampleFromJsonSchema(part, root, stack)
      : sampleFromJsonSchema(schema.oneOf[0], root, stack);
  } else if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const composite = schema.allOf.reduce(
      (acc: any, current: any) => {
        if (current && typeof current === 'object') {
          Object.assign(acc, current);
        }
        return acc;
      },
      {} as Record<string, unknown>
    );
    result = sampleFromJsonSchema(composite, root, stack);
  } else if (schema.$ref && typeof schema.$ref === 'string') {
    const refPath = schema.$ref.replace(/^#\//, '').split('/');
    let resolved: any = root;
    for (const segment of refPath) {
      if (!resolved || typeof resolved !== 'object') break;
      resolved = resolved[segment];
    }
    result = sampleFromJsonSchema(resolved, root, stack);
  } else if (Array.isArray(schema.type)) {
    result = sampleFromJsonSchema(
      { ...schema, type: schema.type[0] },
      root,
      stack
    );
  } else if (schema.properties && typeof schema.properties === 'object') {
    const obj: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (propSchema && typeof propSchema === 'object') {
        const optional = Array.isArray(schema.required)
          ? !schema.required.includes(key)
          : false;
        if (optional) continue;
        obj[key] = sampleFromJsonSchema(propSchema, root, stack);
      }
    }
    if (
      schema.additionalProperties === true &&
      schema.patternProperties === undefined
    ) {
      obj.example = 'value';
    } else if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      obj.example = sampleFromJsonSchema(
        schema.additionalProperties,
        root,
        stack
      );
    }
    result = obj;
  } else if (schema.items) {
    const itemsSchema = Array.isArray(schema.items)
      ? schema.items[0]
      : schema.items;
    result = [sampleFromJsonSchema(itemsSchema ?? {}, root, stack) ?? 'value'];
  } else {
    switch (type) {
      case 'array': {
        result = ['example'];
        break;
      }
      case 'object': {
        result = {};
        break;
      }
      case 'string': {
        if (Array.isArray(schema.examples) && schema.examples.length) {
          result = schema.examples[0];
          break;
        }
        if (schema.format === 'email') {
          result = 'agent@example.com';
        } else if (schema.format === 'uri' || schema.format === 'url') {
          result = 'https://example.com';
        } else {
          result = schema.description ? `<${schema.description}>` : 'string';
        }
        break;
      }
      case 'integer':
      case 'number': {
        if (typeof schema.minimum === 'number') {
          result = schema.minimum;
        } else if (typeof schema.maximum === 'number') {
          result = schema.maximum;
        } else if (Array.isArray(schema.examples) && schema.examples.length) {
          result = schema.examples[0];
        } else {
          result = 0;
        }
        break;
      }
      case 'boolean':
        result = true;
        break;
      case 'null':
        result = null;
        break;
      default:
        result = schema.description
          ? `<${schema.description}>`
          : schema.type === 'null'
            ? null
            : 'value';
    }
  }

  stack.delete(schema);
  return result;
};

const buildExampleFromJsonSchema = (schema: unknown): unknown => {
  if (!schema || typeof schema !== 'object') return undefined;
  return sampleFromJsonSchema(schema, schema, new Set());
};

export const renderLandingPage = ({
  meta,
  origin,
  entrypoints,
  activePayments,
  manifestPath,
  faviconDataUrl,
  x402ClientExample,
}: LandingPageOptions): HtmlEscapedString | Promise<HtmlEscapedString> => {
  const entrypointCount = entrypoints.length;
  const entrypointLabel = entrypointCount === 1 ? 'Entrypoint' : 'Entrypoints';
  const hasPayments = Boolean(activePayments);
  const defaultNetwork = activePayments?.network;

  return html`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#0c2713" />
        <link rel="icon" type="image/svg+xml" href="${faviconDataUrl}" />
        <title>${meta.name}</title>

        <!-- Open Graph tags for social sharing and x402scan discovery -->
        <meta property="og:title" content="${meta.name}" />
        ${meta.description
          ? html`<meta
              property="og:description"
              content="${meta.description}"
            />`
          : ''}
        ${meta.image
          ? html`<meta property="og:image" content="${meta.image}" />`
          : ''}
        <meta property="og:url" content="${meta.url || origin}" />
        <meta property="og:type" content="${meta.type || 'website'}" />

        <style>
          :root {
            color-scheme: light dark;
            font-family:
              'JetBrains Mono', 'Fira Code', 'Roboto Mono', 'SFMono-Regular',
              Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
              monospace;
            background-color: #0c2713;
            color: #e6f4ea;
            --surface: rgba(10, 31, 17, 0.95);
            --surface-subtle: rgba(10, 31, 17, 0.85);
            --border: rgba(118, 173, 139, 0.3);
            --border-soft: rgba(118, 173, 139, 0.18);
            --accent: #6de8a5;
            --accent-soft: rgba(109, 232, 165, 0.18);
            --muted: rgba(211, 237, 221, 0.72);
            --muted-strong: rgba(211, 237, 221, 0.87);
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 3rem 1.5rem 4rem;
            background: radial-gradient(circle at top, #154725 0%, #0c2713 60%);
          }
          main {
            width: 100%;
            max-width: 1000px;
            display: flex;
            flex-direction: column;
            gap: 2.75rem;
          }
          section {
            border-radius: 0;
            border: 1px solid var(--border);
            background: var(--surface);
            box-shadow: 0 34px 60px rgba(6, 18, 11, 0.35);
            padding: clamp(1.75rem, 4vw, 2.75rem);
          }
          .hero {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            background:
              linear-gradient(135deg, rgba(17, 51, 29, 0.92), #0c2713),
              radial-gradient(
                circle at top right,
                rgba(109, 232, 165, 0.22),
                transparent 45%
              );
            border: 1px solid var(--border);
          }
          .hero-header {
            display: flex;
            align-items: flex-start;
            gap: 1.5rem;
            flex-wrap: wrap;
            justify-content: space-between;
          }
          .hero-logo {
            flex: 0 0 auto;
            width: 84px;
            height: 84px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-size: 0.65rem;
            color: var(--accent);
          }
          .hero-logo span {
            pointer-events: none;
          }
          .hero-meta {
            display: grid;
            gap: 0.85rem;
          }
          h1 {
            margin: 0;
            font-size: clamp(2rem, 5vw, 2.85rem);
            letter-spacing: -0.03em;
            font-weight: 600;
          }
          .hero p {
            margin: 0;
            color: var(--muted-strong);
            line-height: 1.7;
            max-width: 60ch;
          }
          .hero-links {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
          }
          .hero-domain {
            display: inline-flex;
            align-items: center;
            padding: 0.45rem 0.75rem;
            border: 1px solid rgba(109, 232, 165, 0.4);
            background: rgba(12, 39, 19, 0.55);
            color: var(--accent);
            font-size: 0.85rem;
            text-decoration: none;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .hero-domain:hover,
          .hero-domain:focus-visible {
            border-color: rgba(109, 232, 165, 0.7);
          }
          .hero-stats {
            margin: 0;
            padding: 0;
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            list-style: none;
          }
          .hero-stats li {
            min-width: 160px;
            padding: 0.9rem 1rem;
            border-radius: 0;
            border: 1px solid var(--border-soft);
            background: rgba(23, 63, 36, 0.6);
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }
          .hero-stats .stat-value {
            font-size: 1.35rem;
            font-weight: 600;
          }
          .hero-stats .stat-label {
            font-size: 0.82rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }
          .hero-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.8rem;
          }
          .button {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            padding: 0.75rem 1.15rem;
            border-radius: 0;
            font-weight: 500;
            text-decoration: none;
            font-size: 0.95rem;
            transition:
              transform 150ms ease,
              box-shadow 150ms ease;
            border: 1px solid rgba(109, 232, 165, 0.4);
            background: rgba(12, 39, 19, 0.75);
            color: #cff9dd;
          }
          .button:hover,
          .button:focus-visible {
            transform: translateY(-1px);
            box-shadow: 0 16px 32px rgba(6, 18, 11, 0.35);
            border-color: rgba(109, 232, 165, 0.7);
          }
          .button--outline {
            background: transparent;
            border-color: rgba(109, 232, 165, 0.32);
            color: var(--muted-strong);
          }
          .button--outline:hover,
          .button--outline:focus-visible {
            background: rgba(12, 39, 19, 0.65);
          }
          .button--small {
            padding: 0.55rem 0.9rem;
            font-size: 0.85rem;
          }
          .entrypoints header {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            margin-bottom: 1.5rem;
          }
          .entrypoints h2 {
            margin: 0;
            font-size: clamp(1.5rem, 3vw, 1.9rem);
            letter-spacing: -0.02em;
          }
          .entrypoints p {
            margin: 0;
            color: var(--muted);
            line-height: 1.6;
          }
          .entrypoint-grid {
            display: grid;
            gap: 1.5rem;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          }
          .entrypoint-card {
            border-radius: 0;
            border: 1px solid var(--border);
            background: var(--surface-subtle);
            display: flex;
            flex-direction: column;
            gap: 1rem;
            padding: 1.4rem 1.5rem 1.6rem;
            position: relative;
            overflow: hidden;
          }
          .entrypoint-card::after {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: inherit;
            border: 1px solid transparent;
            background: linear-gradient(
                120deg,
                rgba(109, 232, 165, 0.3),
                rgba(109, 232, 165, 0)
              )
              border-box;
            mask:
              linear-gradient(#fff, #fff) padding-box,
              linear-gradient(#fff, #fff);
            mask-composite: exclude;
            opacity: 0;
            transition: opacity 200ms ease;
          }
          .entrypoint-card:hover::after,
          .entrypoint-card:focus-within::after {
            opacity: 1;
          }
          .entrypoint-card header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
          }
          .entrypoint-card h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            letter-spacing: -0.01em;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #f8fafc;
          }
          .entrypoint-card p {
            margin: 0;
            color: var(--muted);
            line-height: 1.6;
          }
          .badge {
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 0.35rem 0.7rem;
            border-radius: 0;
            border: 1px solid rgba(148, 163, 184, 0.3);
            background: rgba(148, 163, 184, 0.12);
            color: var(--muted-strong);
            white-space: nowrap;
          }
          .badge--streaming {
            border-color: rgba(109, 232, 165, 0.4);
            background: var(--accent-soft);
            color: var(--accent);
          }
          .card-meta {
            margin-top: auto;
            display: grid;
            gap: 0.75rem;
          }
          .card-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.6rem;
            margin-top: 1rem;
          }
          .schema-section {
            margin-top: 1rem;
            display: grid;
            gap: 0.75rem;
          }
          .schema-block {
            border: 1px solid var(--border);
            background: rgba(12, 39, 19, 0.7);
            padding: 0.9rem 1rem 1rem;
          }
          .schema-block summary {
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem;
            font-size: 0.85rem;
            color: var(--muted-strong);
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .schema-block summary::-webkit-details-marker {
            display: none;
          }
          .schema-block summary::after {
            content: '⌄';
            font-size: 0.75rem;
            transform: rotate(-90deg);
            transition: transform 200ms ease;
            opacity: 0.6;
          }
          .schema-block[open] summary::after {
            transform: rotate(0deg);
          }
          .schema-block pre {
            margin: 0.9rem 0 0;
            padding: 0.85rem 0.75rem;
            background: rgba(7, 21, 12, 0.9);
            border: 1px solid rgba(118, 173, 139, 0.28);
            max-height: 220px;
            overflow: auto;
            font-size: 0.75rem;
            line-height: 1.55;
          }
          .schema-note {
            margin: 0;
            font-size: 0.8rem;
            color: var(--muted);
          }
          .example-section {
            display: grid;
            gap: 1.25rem;
          }
          .example-section h2 {
            margin: 0;
            font-size: clamp(1.4rem, 3vw, 1.8rem);
            letter-spacing: -0.02em;
            color: var(--muted-strong);
          }
          .example-section p {
            margin: 0;
            color: var(--muted);
            line-height: 1.6;
          }
          .example-section pre {
            margin: 0;
            padding: 1.35rem;
            border: 1px solid rgba(118, 173, 139, 0.35);
            background: rgba(7, 21, 12, 0.88);
            font-size: 0.78rem;
            line-height: 1.6;
            overflow-x: auto;
          }
          .meta-item {
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
          }
          .meta-label {
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }
          .meta-value {
            font-size: 0.9rem;
            color: var(--muted-strong);
          }
          .meta-value code {
            font-family:
              'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular,
              Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
              monospace;
            font-size: 0.82rem;
            padding: 0.25rem 0.45rem;
            border-radius: 0;
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.2);
            color: #e2e8f0;
          }
          .empty-state {
            margin: 0;
            padding: 1.5rem;
            border-radius: 0;
            border: 1px dashed rgba(118, 173, 139, 0.4);
            background: rgba(12, 39, 19, 0.55);
            color: var(--muted);
            text-align: center;
          }
          .manifest {
            display: grid;
            gap: 0.75rem;
          }
          .manifest header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .manifest h2 {
            margin: 0;
            font-size: clamp(1.4rem, 3vw, 1.8rem);
            letter-spacing: -0.02em;
          }
          .manifest-status {
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }
          .manifest pre {
            margin: 1.2rem 0 0;
            padding: 1.25rem;
            border-radius: 0;
            border: 1px solid rgba(118, 173, 139, 0.3);
            background: rgba(7, 21, 12, 0.86);
            overflow-x: auto;
            max-height: 420px;
            color: #e2e8f0;
            font-size: 0.8rem;
            line-height: 1.6;
          }
          a {
            color: var(--accent);
          }
          .footer {
            margin-top: 2rem;
            padding: 1.5rem 2rem;
            border: 1px solid var(--border);
            background: rgba(10, 31, 17, 0.65);
            display: flex;
            flex-wrap: wrap;
            gap: 1.25rem;
            justify-content: space-between;
            align-items: center;
          }
          .footer span {
            font-size: 0.85rem;
            color: var(--muted);
          }
          .footer-links {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
          }
          .footer-links a {
            font-size: 0.85rem;
            text-decoration: none;
            border-bottom: 1px solid transparent;
          }
          .footer-links a:hover,
          .footer-links a:focus-visible {
            border-color: var(--accent);
          }
          @media (max-width: 640px) {
            body {
              padding: 2.5rem 1rem 3rem;
            }
            .hero-stats li {
              min-width: 45%;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
              transition-duration: 0.01ms !important;
              animation-duration: 0.01ms !important;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <section class="hero">
            <div class="hero-header">
              <div class="hero-logo" aria-hidden="true">
                <svg
                  width="80"
                  height="80"
                  viewBox="0 0 294 302"
                  stroke="currentColor"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M167.63 6.6469C147.542 15.7516 142.769 24.9276 140.353 59.1117L138.285 88.3614H153.507C165.408 88.3614 170.501 90.2428 176.847 96.9839C197.359 118.779 173.723 163.073 141.581 163.073C124.498 163.073 123.705 157.684 131.01 90.9899L137.716 29.7533L129.932 24.6627C122.943 20.0917 120.497 20.1901 106.054 25.6305C84.6874 33.6791 38.6401 82.5509 27.984 108.496C25.2451 115.166 18.4064 127.857 12.7858 136.697C0.176684 156.529 -3.85169 186.866 4.07236 202.345C6.87929 207.829 8.51582 216.9 7.70946 222.503C5.82117 235.595 29.8961 286.002 41.7329 293.741C55.9887 303.067 71.4319 303.427 86.2049 294.784C104.792 283.906 110.494 270.801 115.496 227.458C119.044 196.711 119.027 187.392 115.411 176.454C109.838 159.599 100.001 157.687 103.346 174.11C109.596 204.79 109.531 205.683 100.165 216.791C89.0696 229.958 78.6653 230.606 67.5873 218.825C60.3131 211.086 59.34 206.923 59.34 183.541V157.032L77.3486 138.028C93.2511 121.245 94.9046 118.182 91.4921 111.818C87.246 103.895 91.6928 96.0669 98.1709 100.064C106.394 105.138 101.965 122.369 88.7158 136.829C64.7667 162.972 59.8673 179.53 69.3735 202.236C73.4869 212.064 76.0387 214.013 84.7929 214.013C99.0385 214.013 102.451 204.199 95.6226 182.879C90.7708 167.743 90.8423 166.211 96.6739 159.776C105.333 150.226 114.281 151.167 119.572 162.184C130.833 185.64 168.661 171.068 195.002 133.131L204.086 120.049L196.4 104.357C188.874 88.9897 176.605 80.3774 158.008 77.4059C151.996 76.4449 151.203 73.6907 151.203 53.746C151.203 34.5994 152.442 29.8586 159.359 22.5096C169.409 11.8326 187.7 5.4617 199.683 8.46376C204.627 9.7033 213.786 15.198 220.033 20.6724C226.283 26.1501 233.526 30.6294 236.132 30.6294C243.189 30.6294 253.896 45.8979 256.478 59.6449C257.73 66.2976 261.021 72.6074 263.793 73.6703C271.313 76.5501 278.791 93.1871 278.791 107.039C278.791 122.267 272.609 134.299 257.179 149.099C245.958 159.864 245.319 161.62 247.112 176.725C252.362 220.982 198.622 278.87 156.671 274.153C134.27 271.633 127.768 262.389 130.122 236.417C131.214 224.368 134.552 212.852 138.489 207.551C147.797 195.016 169.729 183.225 181.797 184.268C197.261 185.602 196.761 195.21 180.419 210.726C172.771 217.987 166.514 224.755 166.514 225.764C166.514 230.233 180.011 226.966 188.238 220.507C205.906 206.634 210.523 187.548 201.742 164.703C200.738 162.095 206.648 152.797 215.075 143.72C236.65 120.477 239.974 113.19 232.682 105.144C229.477 101.613 223.983 97.8125 220.465 96.6986C216.95 95.5847 211.857 90.3956 209.148 85.1692C206.151 79.3858 196.519 71.7584 184.519 65.6728C163.217 54.8667 158.423 45.9895 168.916 36.7864C180.164 26.921 188.874 26.4524 199.299 35.1529C204.657 39.6254 212.35 44.3153 216.392 45.5786C225.99 48.5739 229.852 53.6679 232.737 67.1364C235.717 81.0431 231.097 81.3419 223.064 67.7647C219.675 62.0424 212.84 55.6342 207.869 53.5253C202.902 51.4164 196.271 47.5619 193.134 44.9572C186.138 39.1432 175.02 40.7937 175.02 47.64C175.02 50.5334 180.804 54.4965 188.629 56.9586C196.301 59.3766 207.434 66.9191 214.146 74.2578C220.696 81.4166 231.049 89.2376 237.157 91.642C257.931 99.8229 253.91 122.128 227.889 143L214.429 153.796L216.467 180.172L218.505 206.546L202.385 222.184C184.447 239.585 173.454 243.881 161.158 238.288C149.897 233.167 150.727 222.615 163.111 213.477C173.761 205.618 176.663 197.033 168.674 197.033C160.845 197.033 145.531 211.144 140.618 222.884C132.803 241.555 143.136 258.161 162.564 258.161C189.258 258.161 218.335 235.065 229.988 204.606C234.68 192.344 234.911 187.82 231.434 176.243L227.3 162.466L246.241 142.646C262.875 125.242 265.182 121.14 265.182 108.999C265.182 97.9687 262.776 92.5147 253.273 82.0177C245.288 73.1949 241.365 65.5335 241.365 58.7619C241.365 48.2683 232.536 37.4214 223.993 37.4214C221.281 37.4214 215.035 32.8368 210.108 27.2334C199.084 14.6954 185.822 13.8974 169.569 24.7985C159.542 31.5226 157.872 34.6741 156.974 48.5331L155.936 64.5113L174.55 72.7296C185.71 77.6538 195.542 84.8126 199.095 90.596C202.357 95.9039 208.873 103.572 213.578 107.637L222.135 115.027L202.385 139.121C177.687 169.254 166.384 178.8 149.403 183.881C129.483 189.837 125.798 195.984 121.429 230.542C116.727 267.724 119.344 277.804 135.93 286.362C168.405 303.124 228.457 271.603 251.28 225.814C256.172 216.003 260.337 200.165 261.579 186.669C263.327 167.617 265.393 162.034 274.538 151.639C289.593 134.52 297.654 106.082 292.24 89.1731C290.005 82.1909 284.714 72.6549 280.479 67.9854C276.246 63.3159 269.608 52.1906 265.726 43.2626C260.303 30.7857 255.679 25.6815 245.724 21.1886C238.603 17.976 229.348 11.9107 225.163 7.70645C215.365 -2.12496 188.095 -2.62757 167.63 6.6469ZM125.077 40.0058C126.091 47.1442 125.539 47.3989 117.193 43.6022C109.681 40.1858 106.296 40.5526 96.4561 45.8401C89.9883 49.3176 81.7716 56.8669 78.1958 62.6198C74.6233 68.3726 66.2093 78.3738 59.4999 84.8466C52.7905 91.3193 45.768 102.288 43.9002 109.223C42.0289 116.158 35.1664 129.738 28.6543 139.396C15.79 158.479 13.4322 174.297 21.8054 185.348C24.5545 188.971 26.9327 198.816 27.0926 207.221C27.3069 218.32 30.8692 228.538 40.1134 244.55C55.6723 271.497 65.0015 276.174 83.9763 266.536C91.009 262.96 97.9123 259.486 99.3175 258.817C105.738 255.743 100.828 265.164 91.0158 274.737C82.9216 282.636 77.0866 285.309 68.05 285.255C51.7494 285.153 43.6994 277.838 28.8992 249.671C19.0835 230.99 16.8516 223.526 18.4745 214.818C19.8456 207.459 18.7705 201.221 15.2729 196.235C5.45031 182.237 9.66241 149.588 23.2752 134.207C26.5822 130.472 31.8219 120.528 34.9214 112.11C38.0209 103.691 47.0813 89.6213 55.053 80.8427C63.0247 72.0606 74.0993 59.2475 79.6588 52.3672C96.6296 31.3698 122.834 24.2382 125.077 40.0058ZM114.72 56.293C119.32 59.5056 122.283 65.126 122.283 70.6309V79.6847L116.986 72.1387C107.054 57.9808 94.0915 61.9745 74.773 85.142C65.3485 96.4439 57.598 109.053 57.5504 113.159C57.5027 117.265 52.144 128.957 45.6422 139.145C39.1403 149.33 33.7986 160.791 33.7714 164.615C33.7408 168.436 32.2335 173.856 30.4201 176.657C27.9738 180.437 27.1096 178.41 27.0688 168.792C27.0143 155.018 30.8828 145.234 40.7496 134.207C44.0907 130.472 48.4559 121.303 50.4497 113.831C55.8628 93.5573 92.2542 52.0039 105.363 51.1243C106.354 51.0598 110.562 53.386 114.72 56.293ZM109.582 80.7204C124.546 97.2963 120.824 122.878 100.049 146.226C82.0608 166.442 78.6176 176.926 86.1844 188.448C92.9891 198.82 93.1524 203.825 86.6778 203.825C74.6709 203.825 70.435 174.185 80.3562 159.586C83.4932 154.967 90.9886 145.628 97.0141 138.833C110.338 123.805 114.206 108.948 108.068 96.3726C101.669 83.2708 96.5616 82.9482 84.6058 94.8817C75.9604 103.511 74.5008 107.118 76.3143 115.363C78.1889 123.88 76.4129 127.646 64.3618 140.694C50.8341 155.341 50.1264 157.192 48.3913 182.492C46.5982 208.576 46.7445 209.191 58.2104 224.225C71.7687 241.996 81.7342 244.764 95.5273 234.583C102.948 229.109 105.272 228.562 105.272 232.287C105.272 240.631 85.2828 254.765 73.4835 254.765C64.1679 254.765 60.9561 252.246 50.7797 236.936C39.1811 219.488 38.9464 218.452 39.8684 188.543C40.7224 160.734 41.7329 156.686 51.0893 143.614C56.7406 135.712 63.6065 121.72 66.3454 112.521C69.6185 101.521 75.4263 92.1955 83.3129 85.2847C97.0515 73.2458 102.05 72.3765 109.582 80.7204ZM147.171 98.6038C139.618 101.609 132.49 111.655 132.49 119.296C132.49 121.731 135.808 120.396 140.363 116.12C151.271 105.895 162.407 106.452 165.149 117.363C167.545 126.879 159.049 139.301 150.148 139.301C145.933 139.301 146.096 138.143 151.088 132.635C154.711 128.641 156.228 123.625 154.881 120.114C152.87 114.884 151.724 115.163 144.14 122.732C139.472 127.395 135.324 135.702 134.923 141.193C134.328 149.303 135.668 151.391 142.044 152.294C156.953 154.41 176.721 132.917 176.721 114.589C176.721 102.278 160.284 93.3875 147.171 98.6038Z"
                  />
                </svg>
              </div>
              <div class="hero-meta">
                <h1>${meta.name}</h1>
                ${meta.description
                  ? html`<p>${meta.description}</p>`
                  : html`<p>No description provided yet.</p>`}
                <ul class="hero-stats">
                  <li>
                    <span class="stat-value">${entrypointCount}</span>
                    <span class="stat-label">${entrypointLabel}</span>
                  </li>
                  <li>
                    <span class="stat-value">v${meta.version ?? '0.0.0'}</span>
                    <span class="stat-label">Version</span>
                  </li>
                  <li>
                    <span class="stat-value"
                      >${hasPayments ? 'Enabled' : 'None'}</span
                    >
                    <span class="stat-label">Payments</span>
                  </li>
                </ul>
              </div>
              <a class="hero-domain" href="${origin}" target="_blank"
                >${origin.replace(/^https?:\/\//, '')}</a
              >
            </div>
            <div class="hero-actions">
              <a class="button" href="/.well-known/agent.json">
                <span>View Manifest</span>
              </a>
              <a class="button button--outline" href="/entrypoints">
                <span>List Entrypoints</span>
              </a>
            </div>
          </section>

          <section class="entrypoints">
            <header>
              <h2>Entrypoints</h2>
              <p>
                Explore the capabilities exposed by this agent. Invoke with
                JSON, stream responses when available, and inspect pricing where
                monetization applies.
              </p>
            </header>
            <div class="entrypoint-grid">
              ${entrypoints.length
                ? entrypoints.map(entrypoint => {
                    const streaming = Boolean(
                      entrypoint.stream ?? entrypoint.streaming
                    );
                    const description =
                      entrypoint.description ?? 'No description provided yet.';
                    const invokePrice = resolvePrice(
                      entrypoint,
                      activePayments,
                      'invoke'
                    );
                    const streamPrice = streaming
                      ? resolvePrice(entrypoint, activePayments, 'stream')
                      : undefined;
                    const hasPricing = Boolean(invokePrice || streamPrice);
                    const network = entrypoint.network ?? defaultNetwork;
                    const priceLabel = hasPricing
                      ? `Invoke: ${invokePrice ?? '—'}${
                          streamPrice && streamPrice !== invokePrice
                            ? ` · Stream: ${streamPrice}`
                            : streamPrice && !invokePrice
                              ? ` · Stream: ${streamPrice}`
                              : ''
                        }`
                      : 'Free';
                    const invokePath = `/entrypoints/${entrypoint.key}/invoke`;
                    const streamPath = `/entrypoints/${entrypoint.key}/stream`;
                    const inputSchema = entrypoint.input
                      ? z.toJSONSchema(entrypoint.input)
                      : undefined;
                    const outputSchema = entrypoint.output
                      ? z.toJSONSchema(entrypoint.output)
                      : undefined;
                    const exampleInputValue = inputSchema
                      ? buildExampleFromJsonSchema(inputSchema)
                      : undefined;
                    const exampleInputPayload = JSON.stringify(
                      { input: exampleInputValue ?? {} },
                      null,
                      2
                    );
                    const payloadIndented = exampleInputPayload
                      .split('\n')
                      .map(line => `    ${line}`)
                      .join('\n');
                    const inputSchemaJson = inputSchema
                      ? JSON.stringify(inputSchema, null, 2)
                      : undefined;
                    const outputSchemaJson = outputSchema
                      ? JSON.stringify(outputSchema, null, 2)
                      : undefined;
                    const invokeCurl = [
                      'curl -s -X POST \\',
                      `  '${origin}${invokePath}' \\`,
                      "  -H 'Content-Type: application/json' \\",
                      "  -d '",
                      payloadIndented,
                      "  '",
                    ].join('\n');
                    const streamCurl = streaming
                      ? [
                          'curl -sN -X POST \\',
                          `  '${origin}${streamPath}' \\`,
                          "  -H 'Content-Type: application/json' \\",
                          "  -H 'X-Payment: {{paymentHeader}}' \\",
                          "  -H 'Accept: text/event-stream' \\",
                          "  -d '",
                          payloadIndented,
                          "  '",
                        ].join('\n')
                      : undefined;
                    return html`<article class="entrypoint-card">
                      <header>
                        <h3>${entrypoint.key}</h3>
                        <span
                          class="badge ${streaming ? 'badge--streaming' : ''}"
                          >${streaming ? 'Streaming' : 'Invoke'}</span
                        >
                      </header>
                      <p>${description}</p>
                      <div class="card-meta">
                        <div class="meta-item">
                          <span class="meta-label">Pricing</span>
                          <span class="meta-value">${priceLabel}</span>
                        </div>
                        ${network
                          ? html`<div class="meta-item">
                              <span class="meta-label">Network</span>
                              <span class="meta-value">${network}</span>
                            </div>`
                          : ''}
                        <div class="meta-item">
                          <span class="meta-label">Invoke Endpoint</span>
                          <span class="meta-value"
                            ><code>POST ${invokePath}</code></span
                          >
                        </div>
                        ${streaming
                          ? html`<div class="meta-item">
                              <span class="meta-label">Stream Endpoint</span>
                              <span class="meta-value"
                                ><code>POST ${streamPath}</code></span
                              >
                            </div>`
                          : ''}
                      </div>
                      <div class="card-actions">
                        <a class="button button--small" href="${invokePath}">
                          Invoke
                        </a>
                        ${streaming
                          ? html`<a
                              class="button button--small button--outline"
                              href="${streamPath}"
                            >
                              Stream
                            </a>`
                          : ''}
                      </div>
                      <div class="schema-section">
                        ${inputSchemaJson
                          ? html`<details class="schema-block" open>
                              <summary>Input Schema</summary>
                              <pre>${inputSchemaJson}</pre>
                            </details>`
                          : html`<p class="schema-note">
                              No input schema provided. Expect bare JSON
                              payload.
                            </p>`}
                        ${outputSchemaJson
                          ? html`<details class="schema-block">
                              <summary>Output Schema</summary>
                              <pre>${outputSchemaJson}</pre>
                            </details>`
                          : ''}
                        <details class="schema-block" open>
                          <summary>Invoke with curl</summary>
                          <pre>${invokeCurl}</pre>
                        </details>
                        ${streamCurl
                          ? html`<details class="schema-block">
                              <summary>Stream with curl</summary>
                              <pre>${streamCurl}</pre>
                            </details>`
                          : ''}
                      </div>
                    </article>`;
                  })
                : html`<p class="empty-state">
                    No entrypoints registered yet. Call
                    <code>addEntrypoint()</code> to get started.
                  </p>`}
            </div>
          </section>

          <section class="example-section">
            <h2>Client Example: x402-fetch</h2>
            <p>
              Use the <code>x402-fetch</code> helpers to wrap a standard
              <code>fetch</code> call and automatically attach payments. This
              script loads configuration from <code>.env</code>, pays the
              facilitator, and logs both the response body and the decoded
              payment receipt.
            </p>
            <pre>${x402ClientExample}</pre>
          </section>

          <section class="manifest">
            <header>
              <h2>Manifest</h2>
              <span class="manifest-status" id="manifest-status">Loading…</span>
            </header>
            <pre id="agent-manifest">Fetching agent card…</pre>
          </section>

          <footer class="footer">
            <span>Powered by @lucid/agent-kit</span>
            <div class="footer-links">
              <a
                href="https://github.com/daydreamsai/lucid-fullstack"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://router.daydreams.systems"
                target="_blank"
                rel="noopener noreferrer"
              >
                router.daydreams.systems
              </a>
            </div>
          </footer>
        </main>
        <script>
          const manifestUrl = ${JSON.stringify(manifestPath)};
          document.addEventListener('DOMContentLoaded', () => {
            const pre = document.getElementById('agent-manifest');
            const status = document.getElementById('manifest-status');
            if (!pre || !status) return;
            fetch(manifestUrl)
              .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
              })
              .then(card => {
                pre.textContent = JSON.stringify(card, null, 2);
                status.textContent = 'Loaded';
              })
              .catch(error => {
                console.error('[agent-kit] failed to load agent card', error);
                pre.textContent =
                  'Unable to load the agent card manifest. Check the console for details.';
                status.textContent = 'Unavailable';
              });
          });
        </script>
      </body>
    </html>`;
};
