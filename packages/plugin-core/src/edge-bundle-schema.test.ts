/**
 * The published JSON Schema accepts what the control API answers, rejects
 * what would break an adapter, and stays in step with the `EdgeBundle` type.
 */
import { describe, it, expect } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { EDGE_BUNDLE_SCHEMA } from './edge-bundle-schema.js';
import { EDGE_BUNDLE_CONTRACT_VERSION } from './contract.js';
import type { EdgeBundle } from './types.js';

const ACTIVE: EdgeBundle = {
  host: 'example.com',
  active: true,
  generation: 4,
  mode: 'first-party',
  origin: 'https://www.example.com',
  servingHost: 'www.example.com',
  routePrefixes: ['abc', 'def'],
  ownPaths: ['/sdk.js', '/s/', '/report'],
  tagId: 'Abc1234',
  markerPrefix: 'as',
  tags: '<script id="Abc1234"></script>\n<script>x</script>\n',
  ttlSeconds: 300,
};

const INACTIVE: EdgeBundle = { ...ACTIVE, active: false, mode: 'hosted', tagId: null, markerPrefix: null, tags: '' };

function validator() {
  const ajv = new Ajv2020({ strict: true, strictSchema: false, allErrors: true });
  return ajv.compile(EDGE_BUNDLE_SCHEMA);
}

describe('EDGE_BUNDLE_SCHEMA', () => {
  it('carries the contract version in its id and its version keyword', () => {
    expect(EDGE_BUNDLE_SCHEMA.$id).toContain(`:v${EDGE_BUNDLE_CONTRACT_VERSION}:`);
    expect(EDGE_BUNDLE_SCHEMA['x-contract-version']).toBe(EDGE_BUNDLE_CONTRACT_VERSION);
  });

  it('accepts an active and an inactive bundle', () => {
    const validate = validator();
    expect(validate(ACTIVE), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(INACTIVE), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts an added field (adding a field is not a contract change)', () => {
    expect(validator()({ ...ACTIVE, somethingNew: 1 })).toBe(true);
  });

  it('rejects a missing field, a wrong type and an unknown mode', () => {
    const validate = validator();
    const { tags: _tags, ...withoutTags } = ACTIVE;
    expect(validate(withoutTags)).toBe(false);
    expect(validate({ ...ACTIVE, routePrefixes: 'abc' })).toBe(false);
    expect(validate({ ...ACTIVE, mode: 'proxy' })).toBe(false);
    expect(validate({ ...ACTIVE, ownPaths: ['sdk.js'] })).toBe(false);
  });

  it('requires exactly the fields of the EdgeBundle type', () => {
    // A field added to the type but not to the schema (or the reverse) fails here.
    expect([...EDGE_BUNDLE_SCHEMA.required].sort()).toEqual(Object.keys(ACTIVE).sort());
    expect(Object.keys(EDGE_BUNDLE_SCHEMA.properties).sort()).toEqual(Object.keys(ACTIVE).sort());
  });
});
