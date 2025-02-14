import test from 'node:test';
import assert from 'node:assert';

import Ajv from 'ajv/dist/2020.js';

/** tests whether the validator supports Proxy objects */
test('Proxy object support', t => {
 const schema = {
 	$id:"test",
 	$schema:"https://json-schema.org/draft/2020-12/schema#",
 	properties: {
 		"test": {
 			properties: {
 				"key": { type: "number" }
 			},
 			required: ["key"]
 		}
 	},
 	required: ["test"]
 };
 const validator = new Ajv({schemas:[schema], strict:false});
 const validate = validator.getSchema(schema.$id);

 assert.equal(validate({
 	"test": {
 		"key": 1234
 	}
 }), true, "Validator logic failure");

 assert.equal(validate({
 	"test": new Proxy({}, {
 		get(target, prop, receiver){
 			return prop == "key" ? 1234 : undefined;
 		}
 	})
 }), true, "Schema should match");

 assert.equal(validate({
 	"test": new Proxy({}, {
 		get(target, prop, receiver){
 			return prop == "key" ? "value" : undefined;
 		}
 	})
 }), false, "Schema should not match");

});
