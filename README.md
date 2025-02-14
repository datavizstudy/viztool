# Data Export Visualization Dashboard

## Run the Dashboard
The dashboard can be started in multiple ways, as declared below.

### Simple Server
Run a pre-build version in a console with
```sh
python3 -m http.server -d src/web/dist/
```

If this command fails e.g. because there is no pre-built version provided, you have to manually build the project from source.

### Build from Source
Run the project all at once, without building each sub-package separately:
```sh
git clone https://…/visualization.git --depth=1 && cd visualization
cd src/core
npm install && npm run prebuild
cd ../schema2plotly
npm install && npm run prebuild
cd ../web
npm install && npm run build && npm run preview
```


## `core` package
Due to the lack of documentation and maybe also completeness of the data exports (i.e. maybe a data category didn't contain any data), the schemata/transformers might be incomplete as well. Empty files being exported have been taken into account where possible.

It was deliberated to build the visualisation tool for generic [Schema.org](https://schema.org) JSON models with additional adapters to each data export service. However, as you can see exemplary for LinkedIn in `/analyses/intermediate-conversion.md`, not all data from an export can be transformed into [Schema.org](https://schema.org) JSON objects. Therefore an extension has been developed with relative IRI `/#` as in [Section 5.2 of W3C JSON+LD specification](https://w3.org/TR/2014/REC-json-ld-20140116/#dfn-relative-iri). Even though there is no absolute IRI as `@base` to have the relative IRI globally referenced, it is sufficient for the use as part of this research project.

Plain JSON schemata from transformation like used with [JSONata](https://jsonata.org), [JSON-e](https://json-e.js.org), [JSONiq](https://jsoniq.org) are hardly to achieve, because of external dependencies like country-code lookups, or have a very steep learning curve.

There is a custom strategy for handling zip file entries, because in some zip files entries include a top-level-directory named the same as the zip file, others don't. Therefore all zip entry paths are trimmed from the left, so that all directories are excluded whose path are shared among all entries.
When adding new transformer schemata, you have to keep in mind that the keys in each `properties` list of a schema must be truncated according to the same method – with the keys of `properties` being equivalent to the paths.

### Identifying Data Subject
Every transformer exports a data subject, which is the subject of the data export. The data export object is self-reflexive i.e. it references the whole graph (s. `subjectOf.$ref`). The service, from which the data has been exported from, can be read from `subjectOf.provider.name`. This is needed, so that you can distinguish data of the data subject (e.g. `ContactPoint`) from data of others e.g. organizations. You can select an arbitrary identifier, to be used in other graph objects.
```json+ld
{
	"@type": "Person",					// Data Subject
	"@id": "me",						// arbitrary ID
	"alternateType": "https://w3id.org/dpv#DataSubject",
	"subjectOf": {						// Data Export
		"@type": "DataDownload",
		"$ref": "#/",
		"alternateType": "https://w3id.org/dpv#PersonalData",
		"provider": {					// Data Controller
			"@type": "Organization",
			"alternateType": "https://w3id.org/dpv#DataController",
			"name": "LinkedIn"
		}
	}
}
```

### Extensions
To add your own transformer for a data export add the following two files to `/core/src/transformers/` (where `[name]` is the display name of the exporting service). After extending, you may run `npm run prebuild` in `/core`.
- `[name].schema.json`: containing a JSON schema definition to validate the data export file against. This is for checking whether the transformer is capable of transforming an uploaded zip file with a certain directory structure.
- `[name].transformer.js`: exports async default function converting the zip file hierarchy object into a [Schema.org](https://schema.org) graph object. Remember to also export an object determining the data subject of the data export (s. [above](#identifying-data-subject)). However this will not be checked by the library.

You may want to extend `/core/schema-extension/data-export.ttl` when adding custom schemata in your transformer. Reuse as many [Schema.org definitions](https://schema.org) as possible, before adding custom schemata. After extending, please run `npm run prepare` in `/core`.

To allow for multiple file types, you can either convert the file contents of unknown formats (e.g. binary formats) in your transformer, or add a new type conversion to `/core/src/converter.js`.


## `schema2plotly` package
That package provides transformations for [Schema.org objects](https://schema.org) (and extensions) to [Plotly chart objects](https://plotly.com/javascript), optionally enriching the data from public sources e.g. displaying album covers for music data.
The [Plotly chart objects'](https://plotly.com/javascript) `meta` property may contain internal (for rendering) and external (informational) properties:
- internal
	- section = string[]: list of categories, subcategories, …, chart title
	- images: images as overlay for tables
	- wide = boolean: whether to show the chart in full width
	- layout = object: *override of global `Plotly.layout`*
	- config = object: *override of global `Plotly.config`*
- external
	- raw = boolean: whether the chart contains only raw table data, no graphics
	- amountOfUsedObjects = number: number of used [Schema.org objects](https://schema.org) for this chart

If objects from multiple transformers (s. `core` package) are given and therefore the list of objects contain multiple data subjects, those data subject objects are merged.


## `web` package
Not all data exports can be transformed into a coherent directed acyclic graph of Schema.org objects. Thus determining the account information (which would be the node with only outgoing edges) for e.g. addressing the user in the visualisation application might be impossible in some cases.

There are some global variables, which help AB testing, analysis, ….
```ts
// write vars before charts get displayed
window.AB_TESTING = {
	graph_min_object_amount: number, // default 0
	alwaysInclude: string[][], // always incl. charts with that section
		// i.e. chart.section == string[]. You may need this, because
		// profile overview will be excluded for high
		// graph_min_object_number but maybe should still be displayed,
		// default:[]
	auth: string|number, // identifier for collected data, can also be
		// submitted via GET parameters ?auth={string|number}
	delay: number, // artifical delay in milliseconds for processing, default 0
	chart_types: null | string[], // if present, string of allowed chart types
		// @see plotly.com/javascript/reference
	chart_selection: number, // 0 = all (default), 1 = only raw, 2 = only charts
	show_chart_description: number, // shows chart description if available,
		// 0 = hide
		// 1 = (default) show as caption
		// 2 = show as question mark button
	override_data_confirm: boolean|undefined // preset for data access to
		// enricht visualisations with data from APIs
		// undefined (i.e. not set) = no override, false = always deny,
		// true = always allow
}

// read-only vars
window.ANALYTICS = {
	processing_duration: number, // milliseconds
		// duration for converting schema objects to plotly charts,
		// includes artificial delay by window.AB_TESTING.delay,
		// excludes delays by filtering charts for criteria given in
		//	window.AB_TESTING
	triggered_new_session: object[], // timestamps of "New Sessions" triggers
		// object.time: string = JSON timestamp
		// object.reset: boolean = whether the file uploads were reset
		//	(true) or not e.g. to just add new exports (false)
	uploaded_datasets: { // which datasets were uploaded, if any
		string /*timestamp*/ : [
		 {
			services:string[], // data services e.g. ["LinkedIn"]
			sample:false|string // sample dataset filename, else false
		 },
		 …
		],
		…
	},
	graph_min_object_amount_changes: { // events of user changing
		string /*timestamp*/: number // user value
	},
	recordings: object[], // Movie.toJSON()[] @see npmjs.com/package/cimice
		// recordings can be viewed by calling this web app with the
		// GET …/?replay parameter (no value needed)
	sessionRecorder: Recorder // @see npmjs.com/package/cimice
		// if you set this var before React renders, you can provide
		// your own SessionRecorder configuration
}
```

The following persistent configuration can be set from `env.json`.
```ts
// config for "Finish" procedure in src/partials/header/FinishButton.jsx
{
	analysis_upload_url: string, // where to POST analytics data, if falsy doesn't show button
	secret: string, // secret for HMAC of code, default: ''
        recordingExcludeSelector: string, // CSS selector which elements to
		// exclude from recordings
	treatments: { // pre-populate window.AB_TESTING with the object at the
			// key. The key is the ninth char in the auth GET
			// parameter e.g. …?auth=xxxxxxxx0 is treatment "0".
			// A separate ?treatment=… GET parameter would be too
			// obvious for curious users to change.
		number|string: object,
		…
	},
	error:{
		message: string		// error message to replace/append/prepend to errors
		append: undefined/falsy | "before" | "after"
				// whether to append or replace (falsy) `message` to
				// the original error message
	},
	override_title: {}, // dictionary of regexes to strings, which chart
		// titles to replace with which strings
	override_desc: { // dictionary of which chart descriptions to replace
		// with which strings. Key is a regex matching the chart title
		"^regex$": {
			text: string, // the description to override
			append: undefined/falsy | "before" | "after"
				// whether to append or replace (falsy) `text` to
				// the original description
		},
		…
	}
}
```


## Other elicited packages
*sorted by preference*

validation
- ajv (because fastest)
- npmjs.com/package/json-schema
	- json-schema.org/draft/2020-12/json-schema-core.html
- npmjs.com/package/jsonschema

transform
- docs.jsonata.org/overview.html
	- npmjs.com/package/jsonata
- npmjs.com/jsld: only works with a buggy version of jsonld
- github.com/ColinEberhardt/json-transforms

visualization
- canvasxpress.org: always tables as second view to graph
- unsuitable
	- json2html.com: templates only
	- D3.js, dc-js.github.io/dc.js: no json/dataset input
	- zoomcharts.com, flexmonster.com, amcharts.com, fusioncharts.com/highcharts.com: paid/watermarked
	- chartjs.org, apexcharts.com, recharts.org, vega.github.io/vega-lite, canvasis.com, jscharts.com, nvd3.org, sigmajs.org: no hierarchy net charts with images (for e.g. contact graphs)
	- datatables.net, uber.github.io/react-vis: only tables
	- dygraphs.com: only continuous data
	- flotcharts.org: uses jQuery
	- github.com/keen/keen-dataviz.js: library only for Keen.io
