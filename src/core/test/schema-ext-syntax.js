/**
 * @file contains tests for syntax errors of schema extension
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import ttl2jsonld from '@frogcat/ttl2jsonld';

test('schema extension syntax', async t => {
	await fs.readFile('schema-extension/data-export.ttl')
	 .then(buf => buf.toString())
	 .then(ttl => ttl2jsonld.parse(ttl))	// valid transformation
	 .then(json => JSON.stringify(json))	// valid JSON+LD
});
