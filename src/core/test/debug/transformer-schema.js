/**
 * @file tests for schemas of transformers
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';

import data from './show-json-export.js';
import { default as transformers } from '../../src/transformers/_export.js';

test('transformer schema syntax', async t => {
	// initialise validator (async)
	const validator = Promise.resolve().then(async _ =>
		new Ajv({schemas:transformers.map(t=>t.schema), strict:false}) );

	// auto detect matching transformers
	let matches = Promise.all([validator, data]).then( ([validator, data]) =>
		transformers.filter(transformer => 
			validator.getSchema(transformer.schema.$id)(data)
		)
	);
	assert.ok((await matches).length, 'No schema is matching');
	console.info('Matching schemas: '
		+ (await matches).map(transformer => transformer.name).join(', ')
	);
});
