import link from 'jsonld-object-graph';
import regex_escape from 'escape-string-regexp';

/** defaultConfig is never exported, even though stated in the docs */
export const jsonld2obj = (graph, compact) =>
 link.jsonld2objWithConfig({addSelfRef: false, addTypeRef: false,
 	shouldResolveTypeObjects: false,
 	// default, because idFieldName:"@id" deleted the @id property, …
  	idFieldName: "$id", typeFieldName: "$type"})(graph)
 .then(graph => { // convert MultiVal to array
  // TODO: github.com/vsimko/jsonld-object-graph/blob/master/src/index.js#L54-L75
  // remove postinstall script from package.json if fixed
  for(let obj of Object.values(graph))
	for(let prop in obj)
		if(obj[prop] instanceof link.MultiVal)
			obj[prop] = obj[prop].values();
  return graph;
 })
 .then(graph => { // add @reverse references (counter-direction)
  // TODO: github.com/vsimko/jsonld-object-graph/issues/6, replace by library func
  // @src github.com/vsimko/jsonld-object-graph/blob/master/src/index.js#L25-L38
  function ensureSlot(obj, pname){
	if(!obj[pname]) obj[pname]={};
	return obj[pname];
  }
  // @src github.com/vsimko/jsonld-object-graph/blob/master/src/index.js#L206-L221
  Object.values(graph).forEach(obj => {
	Object.entries(obj).forEach(([prop,val]) => {
		if(prop == "@reverse") return;
		let children = array(val);
		for(let child of children) {
			if(typeof child != "object") continue;
			const inverseProperty = ensureSlot(child, "@reverse");
			if(prop in inverseProperty)
				// if some @reverse props in input aren't arrays
				inverseProperty[prop] = array(inverseProperty[prop]).toSpliced(Infinity,0,obj);
			else inverseProperty[prop] = [obj];
		}
	})
  });
  return graph;
 })
 .then(graph => link.mutateRenameProp('$id', '@id')(graph))
 .then(graph => link.mutateRenameProp('$type', '@type')(graph))
 .then(graph => !compact ? graph : (
	(typeof compact == 'string' ? [ ['',compact] ]
		: Object.entries(compact).map(([k,v])=>[k=='@vocab' ? '' : k+':', v])
	).map(([k,v]) => (graph => {
		graph = link.mutateRenameProp(new RegExp('^'+regex_escape(v)), k)(graph);
		for(let object of Object.values(graph))
		 for(let key in object) {
			if(key == '@reverse') // @reverse is no top-level node
				object[key] = link.mutateRenameProp(
					new RegExp('^'+regex_escape(v)),
					k
				)(object[key]);
			if(typeof object[key] == 'string')
				object[key] = object[key].replace(
					new RegExp('^'+regex_escape(v))
				, k);
			if(Array.isArray(object[key]))
				for(let i in object[key]) if(typeof object[key][i] == 'string')
					object[key][i] = object[key][i].replace(
						new RegExp('^'+regex_escape(v))
					, k);
		}
		return graph;
	})).reduce( (graph, mutation) => graph.then(g => mutation(g)),
	 Promise.resolve(graph))
 ));

/** ensure array */
export function array(object) {
	return Array.isArray(object) ? object : (object !== undefined ? [object] : []);
}

/** ensure object|array (i.e. Schema.org thing) */
export function thing(value) {
	return typeof value == "object" ? value : {"name":value};
}

/** expands (and thus normalizes) a property value structure, removes null/undefined */
export function expand(value) {
	return array(value)
		.filter(item => item !== null && item !== undefined)
		.map(item => thing(item));
}

/** ensure non-array value (taking first) */
export function first(value) {
	return value?.[0] ?? value?.next?.()?.value /*iterator*/ ?? value;
}

/** transposing 2D arrays */
export function transpose(matrix) {
	return matrix.length ? matrix[0].map((_,i) => matrix.map(row => row[i])) : [];
}

/** converts iterable to list with only unique elements (i.e. the last one of multiple)
 * @param {Iterable} iterable – the iterable
 * @param {function} [key=_=>_] – function returning a value which is checked
 	for uniqueness, to determine whether the corresponding elements (i.e. key function
 	input) should be treated as equal
 * @returns {[]} deduplicated array
 */
export function unique(iterable, key = _=>_) {
	const items = [];
        for(let item of iterable)
		if(!items.find(e => key(e) === key(item)))
			items.push(item);
	return items;
}

/** removes object properties with value undefined
 * @param {object} object - the object to remove undefined properties from
 * @param {[]} empty - also exclude all keys with any value occuring in `empty`
 *	(additionally to `undefined`)
 * @returns {object} the sanitized object *or* `undefined` if the sanitized object
 *	would be empty
 */
export function defined(object, empty = []) {
	const entries = Object.entries().filter(([_,v]) => v !== undefined
		|| empty.includes(v));
	return entries.length ? Object.fromEntries(entries) : undefined;
}

/** returns a random number. If only max is given, min is assumed to be 0
 * @param {number} min - the minimum value (included in range)
 * @param {number} [max] - the maximum value (excluded from range)
 * @returns {number} the random number
 */
export function random(min, max) {
  if(max == null) {
	max = min;
	min = 0;
  }
  return Math.floor(Math.random() * (max - min) + min);
}

/** count occurrences of values in arrays
 * @param {[]} array - the array in which to count values
 * @param {function} [key=_=>_] - returns the key to count for, e.g. if values are
 *	objects
 * @return {{string|number:number}} - a map of the value to its amount occurrences
 */
export function count(array, key = _=>_) {
	return array.reduce(
		(map,w) => ({ ...map, [key(w)]: (map[key(w)] ?? 0)+1 }),
		{}
	);
}

/** scales values between a min/max scale
 * @param {number} value - the value to scale
 * @param {number} all - the array of all values
 * @param {number} zero - whether to include 0 in the output interval
 * @returns {number} the scaled value between 0 and 1 (inclusive)
 */
export function scale(value, all, zero = true) {
	const min = Math.min(...all);
	const max = Math.max(...all);
	return (value + (zero?0:1) - min) / (max + (zero?0:1) - min);
}

/** defers execution e.g. for rate limits
 * @param {number} [delay=0] - delay in milliseconds
 * @param {} value - any value to pass-through to enable chaining
 * @returns {Promise} resolving after delay
 */
export function wait(delay = 0, value) {
	return new Promise(resolve =>
		setTimeout( ()=>resolve(value), delay)
	);
}

/** transforms strings in camelCase to Title Case
 * @description exampleTestABCDeg0radA1farB → example Test ABC Deg 0 rad A1 far B
 * @param {string} text in camel case
 * @returns {string} in title case
 */
export function camelCase2titleCase(text) {
	return text.replace(/(?<=[a-z])[A-Z]|(?<=[A-Z])[A-Z](?=[a-z])|(?<=\d)\D|(?<=[^A-Z\d])[\d]/gu, ' $&')
		.replace(/\b[a-z]/gu, c=>c.toUpperCase());
}

/** polyfill: Object.groupBy */
if(!Object.groupBy) Object.groupBy = (items, getGroup)=>{
	return items.reduce( (groups, item) => {
		if(groups[getGroup(item)])
			groups[getGroup(item)].push(item);
		else
			groups[getGroup(item)] = [item];
		return groups;
	 }, {});
}
