import React, { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-dist-min";
import jsonld from "jsonld";
import { merge } from "smob";
import uniqid from "uniqid";
import { sha256 } from "crypto-hash";
import { RotatingLines } from "react-loader-spinner";
import ProgressBar from "@ramonak/react-progress-bar";

import { default as transform, transformers } from "data-export-to-schema-org";
import extension from "schema2plotly/ext/data-export";
import schema2plotly from "schema2plotly";
import { first, array, unique } from "schema2plotly/helper";

import albumCoverPlaceholder from "../images/album-cover-placeholder.png";
import sample_dataset_signatures from "../../artefacts/sample-dataset-signatures.json";
import { pushRecording } from "../../recording.js";
import env from "../../env.json";

import Sidebar from "../partials/Sidebar";
import Header from "../partials/Header";
import WelcomeBanner from "../partials/dashboard/WelcomeBanner";
import FileUpload from "../partials/dashboard/FileUpload";
import AddUpload from "../partials/dashboard/AddUpload";
import ToggleSwitch from "../partials/dashboard/ToggleSwitch";
import Accordion from "../partials/dashboard/Accordion";
import Card from "../partials/dashboard/Card";

/** polyfill */
if(!Object.groupBy) Object.groupBy = (items, getGroup)=>{
  return items.reduce( (groups, item) => {
    if(groups[getGroup(item)]) groups[getGroup(item)].push(item);
    else groups[getGroup(item)] = [item];
  }, {});
}

/** localeCompare with letters at beginning (so e.g. `…` at end) */
function localeCompareSpecial(a, b) {
    if(a == "All Relations") return 1;
    if(b == "All Relations") return -1;
    return (b.localeCompare('a') >= 0) - (a.localeCompare('a') >= 0)
	|| a.localeCompare(b);
}

function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [progress, setProgress] = useState(null);
  const [extended, setExtended] = useState(true);
  const [charts, setCharts] = useState(null);
  const [files, setFiles] = useState({});

  const [graph_min_object_amount, setGraphMinObjectAmount] = useState(
    window.AB_TESTING?.graph_min_object_amount ?? 0
  );

  const plotly = {
    // TODO (not available yet): add option to bound the bin size from top of bin charts
    data: { // being merged with every plot, properties from plot have precedence
      header: {
        line: { color:"#ddd" }
      },
      cells: {
        line: { color:"#ddd" }
      }
    },

    layout: {
      autosize:true,
      margin: {
        autoexpand:true,
        b:0, l:0, r:0, t:0, pad:0
      },
      yaxis:{automargin:true}, xaxis:{automargin:true}, automargin:true, // TODO: doesn't solve other hidden items not being x/y-axes e.g. breadcrumbs in treemap
      legend:{ xanchor:"right", yanchor:"top", x:1, y:1, bgcolor:'#FFF8' },
      bargroupgap: 0.1,
      colorway: ['#3070b3', '#072140', '#9abce4', '#6a757e'],
      // treemapcolorway, sunburstcolorway inherit colorway
      extendsunburstcolorway: true,
      modebar: {
        add:[
          { name:'fullscreen', title:'Fullscreen', icon:Plotly.Icons.autoscale,
            click: div => document.fullscreen ? document.exitFullscreen()
              : div.requestFullscreen()
          },
          'togglespikelines',
          'toimage'
        ],
        remove:['editinchartstudio','hovercompare','senddatatocloud','tablerotation']
      },
      activeselection: {
        opacity: 0.2
      },
      geo:{
        // fitbounds: 'locations', // zooms inside of country if only one country, .projection.scale has then no effect

        // otherwise rect crop of map
        // remove if ratio non-fixed, s. github.com/plotly/plotly.js/issues/3467
        projection:{ type:'mercator' },

        showframe:false, showcoastlines:false, showland:false,
        showrivers:false, showlakes:false,
        showcountries:true, showsubunits:true,
        showocean:true, oceancolor:'#E3EEFA' // tum-blue-light-4 (web colors 2022)
      }
    },

    config: {
      responsive:true, // causes problems on every even React render if any dimension given
      autosizable:true, // force autosize once, may resolve some display issues (still bug in Firefox)
      displaylogo:false,
      showLink:false,
      fillFrame:false, // autosize to container, not screen
      topojsonURL:'./topojson/'
    }
  };

  /** @returns {boolean} whether load was successful */
  function loadFile(file) {
    let contents;
    try {
      contents = transform(file.stream());
    } catch(e) {
      console.error(e);
      return false;
    }
    setFiles({...files, [file.name]:{show:true, types:[], content:contents,
      sample: file.text() // important that text() not arrayBuffer(); else hash mismatch
        .then(text => sha256(text))
        .then(hash => sample_dataset_signatures[hash] ?? false)
    }});
    event.target.value = null;
    return true;
  }

  /** convert files to graphs then charts */
  function calcCharts(transformedFiles) {
    if (!Object.keys(transformedFiles).length) {
      alert('Please import at least one valid zip file! \n'
      	+ 'Check console for errors if you have already provided a zip file.');
      return false;
    }
    if(/AppleWebKit\/[0-9]+/.test(navigator.userAgent)
      && !confirm("Safari/WebKit randomly may not render a progress bar. The conversion is going on, even though you don't see any visual feedback for a few minutes.")) return;

    pushRecording(window.ANALYTICS.sessionRecorder, window.ANALYTICS.recordings);
    window.ANALYTICS.sessionRecorder.startRecording();

    // setProgress(true); 
    setProgress(0); // TODO: this is fake, remove if you want a spinner instead
    var startTime;
    // enforce render of spinner, flushSync doesn't work
    new Promise(resolve => setTimeout(resolve, window.AB_TESTING?.delay ?? 0))
    // transformedFiles: { filename:{content:Promise<container[]>, show:bool,
    //     types:[], sample:Promise<boolean>}, …}
    //   container = { result:schema_graph, schema }
    //   container array, because multiple transformers may match per file
    .then(_=> Promise.all(Object.entries(transformedFiles).map(async ([k,v]) =>
      [k, {...v, content:await v.content, sample:await v.sample}]
    )) )
    // Promise<entries=[filename, {content:container[],show,types}, …]>
    .then(entries => {
      // log uploaded datasets
      if(!window.ANALYTICS) window.ANALYTICS = {};
      if(!window.ANALYTICS.uploaded_datasets) window.ANALYTICS.uploaded_datasets = {};
      window.ANALYTICS.uploaded_datasets[new Date().toJSON()] = entries.map(([_,file]) => ({
        services:file.content.map(container => container.schema),
        sample:file.sample
      }));

      startTime = window.performance.now();
      let changed = false;
      for(const [file,data] of entries) if(!data.types.length) {
        let types = data.content.map(container => container.schema);
        if(types.length) {
          data.types = types;
          changed = true;
        }
      }
      if(changed) setFiles(Object.fromEntries(entries));
      return entries.filter(([_,data]) => data.show)
        .map(([_,data]) => data.content);
    })
    .catch(error => {
      console.error(error);
      let msg = error.message;
      if(env.error?.message) {
        if(env.error.append == "before") msg = env.error.message + msg;
        if(env.error.append == "after") msg += env.error.message;
      }
      alert(msg);
      return [];
    })
    // Promise<[ container[] /*of single file*/, …]>
    .then(containers => containers.flat())
    // Promise<container[]>
    .then(containers => containers.map(container => container.result))
    // graphs: Promise<graph[]>
    .then(async graphs => {
        // group graphs by contexts
        let grps = Object.groupBy(graphs,
            graph => JSON.stringify(graph['@context'] ?? []));
        // merge graphs with same context
	// TODO: jsonld.merge doesn't handle @reverse properties correctly (yet)
        for(let context in grps) grps[context] = await jsonld.merge(grps[context],
		grps[context][0]['@context']); // needs no JSON parsing
        return Object.values(grps) // Promise<graphs[]> grouped by context
          .map(graph => schema2plotly(graph, [extension], window.AB_TESTING?.override_data_confirm));
    })
    // containers: [ /*container*/ Promise<[ /*chart*/ object|object[], …]>, …]
    .then(containers => Promise.all(containers))
    .then(containers => containers.flat())
    // measure needed time
    .then(charts => {
      if(!window.ANALYTICS) window.ANALYTICS = {};
      window.ANALYTICS.processing_duration = window.performance.now() - startTime;
      return charts;
    }).then(charts => (
        window.AB_TESTING?.chart_types
        || window.AB_TESTING?.chart_selection
      ) ? charts.map(chart => array(chart).filter(partial =>
        (window.AB_TESTING.alwaysInclude ?? []).some(section => // alwaysInclude
          partial.meta?.section.length == section.length
          && section.every((item,i) => item == partial.meta?.section[i])
        ) || (
          (window.AB_TESTING.chart_types?.includes?.(partial.type) ?? true)
          && (!window.AB_TESTING.chart_selection
              || (window.AB_TESTING.chart_selection == 1 && partial.meta?.raw)
              || (window.AB_TESTING.chart_selection == 2 && !partial.meta?.raw) )
        )
      )).filter(chart => chart.length)
      .map(chart => chart.length == 1 ? chart[0] : chart)
     : charts
    )
    // charts: Promise<[ object|object[], …]>
    .then(charts => setCharts(charts))
    .catch(error => {
        console.error(error);
        let msg = 'There was an error with validation. Check the console for details.';
        if(env.error?.message) {
          if(env.error.append == "before") msg = env.error.message + msg;
          if(env.error.append == "after") msg += env.error.message;
        }
    	alert(msg);
    }).finally(_ => {
      pushRecording(window.ANALYTICS.sessionRecorder, window.ANALYTICS.recordings);
      window.ANALYTICS.sessionRecorder.startRecording();
      setProgress(null)
    });
  }

  function loadTableImgs(div, chart, ids) {
    array(chart).forEach((chart,chartIndex) => {
      if(chart.type!="table") return;
      const table = div.querySelector(':scope svg:first-of-type :nth-child('+(chartIndex+1)+' of .table-control-view)');

      // Plotly.js uses paging, and deletes items outside the viewport
      // So we can't rely on page indices, but uniqids in the cells
      const img_cell_map = ids[chartIndex];

      function reinit_imgs() { // uses global: table, chart
        for(let id in img_cell_map) {
          const rect = table.querySelector('g.column-cell:has(text[data-unformatted*="'+id+'"]) > rect'),
                [i,j] = img_cell_map[id],
                url = array(chart.meta?.images?.[i])[j];
          if(rect && url) {
            const observer = new IntersectionObserver((entries, observer) => {
              const parent = entries[0].target.parentNode;
              var img = parent.querySelector('image');
              if(!img) {
                img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                img.setAttribute('height', rect.height.baseVal.valueInSpecifiedUnits);
                img.setAttribute('width', rect.width.baseVal.valueInSpecifiedUnits);
                img.setAttribute('decoding', 'async');
                img.setAttribute('href', albumCoverPlaceholder);
                entries[0].target.after(img);
              }
              if(entries[0].isIntersecting && img.getAttribute('href') == albumCoverPlaceholder)
                url().then(href => {
                  array(chart.meta.images[i])[j] = ()=>Promise.resolve(href); // cache
                  if(href) img.setAttribute('href', href);
                });
            }, {threshold:[0], root:div, rootMargin:'50%' /*preload before view*/});
            observer.observe(rect); // don't stop, because plotly hides rows outside viewport
          }
        }
      }
      reinit_imgs();

      const mutationObserver = new MutationObserver((events,observer) =>
        // no matter which/how many elements changed, execute just once
        reinit_imgs()
      );
      table.querySelectorAll(':scope .column-cells').forEach(col =>
		mutationObserver.observe(col, {childList:true, subtree:false})
      );

    });
  }

  function createChart(chart, classes = 'w-full h-full' /* full width, not more / no scroll */) {
    let ids = [];
    for(let partial of array(chart)) {
      let table = {};
      ids.push(table);
      if(partial.type == 'table' && partial.meta?.images)
        for(let i in array(partial.meta.images))
          for(let j in array(array(partial.meta.images)[i])) {
            const id = uniqid('cell_');
            table[id] = [i,j];
            partial.cells.values[i][j] += '<b style="/*'+id+'*/"></b><br>';
          }
    }
    let title = array(chart)[0]?.meta?.section?.slice?.(-1)?.[0];
    let overrideTitle = Object.entries(env.override_title ?? {})
      .find(([regex,_]) => new RegExp(regex).test(title))?.[1];

    // description (incl. overrides)
    let description = array(chart)[0]?.meta?.description?.split('\n\n')[0] ?? '';
    let overrideDesc = Object.entries(env.override_desc ?? {})
      .find(([regex,_]) => new RegExp(regex).test(title))?.[1];
    if(overrideDesc?.append == "before")
        description = overrideDesc.text + description;
    else if(overrideDesc?.append == "after") description += overrideDesc.text;
    else if(overrideDesc) description = overrideDesc.text;

    return <Card title={overrideTitle ?? title}
        info={JSON.stringify(array(chart).slice(0,1).map(partial => ({
          type:partial.type, amountOfUsedObjects:partial.meta?.amountOfUsedObjects,
          raw:partial.meta?.raw ?? false
        }))[0])}
        scroll={array(chart)[0]?.meta?.raw}
        full={array(chart)[0]?.meta?.raw || array(chart)[0]?.meta?.wide}
        description={(window.AB_TESTING?.show_chart_description ?? true) ? description : null}
        descriptionMode={window.AB_TESTING?.show_chart_description ?? 1}>
      <Plot
        className={classes}
        data={ array(chart).map(chart => merge(chart, plotly.data)) }
        layout={ merge(
          ...array(chart).map(partial => partial.meta?.layout ?? {}),
          plotly.layout
        )}
        config={ merge(
          ...array(chart).map(partial => partial.meta?.config ?? {}),
          plotly.config
        )}
        useResizeHandler={true}
        onInitialized={ (_,div) => {

          // TODO: Plotly.js bug: table scrolls use pagination for displaying
          // however the y-coordinates are falsely overwritten
          function overrideYTextCoords(div) {
            div.querySelectorAll(':scope g.table > g.table-control-view > g.y-column > g:not(#header) g.cell-text-holder').forEach(g => {
              const lines = g.querySelectorAll(':scope > text > tspan').length;
              [...g.transform.baseVal].flat()
                .filter(t => t instanceof SVGTransform)
                .forEach(t => { t.matrix.f = 8 * (lines||1); });
            });
          }
          div.addEventListener('wheel',
            () => setTimeout(() => overrideYTextCoords(div), 1),
            {capture:true});
          overrideYTextCoords(div);
          // END OF BUG WORKAROUND

          loadTableImgs(div,chart,ids)
        }}
        />
      </Card>;
  }

  /** group charts according to `{chart}.meta.section` into accordions */
  function buildChartTree(charts, forceRawCollapsed, fromLevel = 0) {
    const level = chart => array(chart).slice(1).reduce((min,partial) =>
      min >= (partial.meta?.section?.length ?? 0) ? (partial.meta?.section?.length ?? 0) : min
      , array(chart)[0]?.meta?.section?.length ?? 0);
    const isCurrentLevel = chart => level(chart) - 1 == fromLevel;
    let standalone = charts.filter(chart => isCurrentLevel(chart)
            && array(chart).some(partial => !partial.meta?.raw)
          ).map(chart => !Array.isArray(chart) ? chart
            : chart.filter(partial => !partial.meta?.raw) ),
        extended = charts.filter(chart => isCurrentLevel(chart)
            && array(chart).some(partial => partial.meta?.raw)
          ).map(chart => !Array.isArray(chart) ? chart
            : chart.filter(partial => partial.meta?.raw) ),
        grouped = charts.filter(chart => level(chart) - 1 > fromLevel);
    grouped = Object.groupBy(grouped, chart => array(chart)[0]?.meta?.section?.[fromLevel] ?? '');

    if(!standalone.length && !forceRawCollapsed) [standalone, extended] = [extended, standalone];

    const chartName = chart => array(chart)[0]?.meta?.section?.slice?.(-1)?.[0];

    return <>
      { standalone.sort((a,b) => localeCompareSpecial(chartName(a),chartName(b)) )
		.map(chart => createChart(chart))}

      { Object.entries(grouped).sort(([a,_], [b,__]) => localeCompareSpecial(a,b))
        .map(([group, charts]) =>
          <Accordion id={fromLevel+'-'+encodeURIComponent(group)}
            className="col-span-full"
            bodyAttributes={{className:"grid grid-cols-12 gap-6"}}
            title={group}
            open
            onToggle={ // workaround for github.com/plotly/plotly.js/issues/6549
              e=>e.target.querySelectorAll(':scope .js-plotly-plot').forEach(
                div => Plotly.update(div, {}, {}) )
            }>
	      { buildChartTree(charts, forceRawCollapsed, fromLevel + 1) }
          </Accordion>
      )}

      { extended.length ? <Accordion className="col-span-full pl-4"
          bodyAttributes={{className:"grid grid-cols-12 gap-6"}}
          title={ <i>Details</i> }
          onToggle={ // workaround for github.com/plotly/plotly.js/issues/6549
            e=>e.target.querySelectorAll(':scope .js-plotly-plot').forEach(
              div => Plotly.update(div, {}, {}) )
          }>
        { extended.sort((a,b) => localeCompareSpecial(chartName(a), chartName(b))).map(chart => createChart(chart, "w-fit min-w-full" /* full width or more (with scroll) */))}
        </Accordion> : ''
      }
      </>;
  }

  function newSession(reset = false) {
    // new recording movie
    pushRecording(window.ANALYTICS.sessionRecorder, window.ANALYTICS.recordings);
    window.ANALYTICS.sessionRecorder.startRecording();

    // reset
    if(reset) setFiles({});
    setCharts(null);

    // add event
    if(!window.ANALYTICS) window.ANALYTICS = {};
    if(!window.ANALYTICS.triggered_new_session)
      window.ANALYTICS.triggered_new_session = []
    window.ANALYTICS.triggered_new_session.push({
      time: new Date().toJSON(),
      reset
    });
  }


  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} items={
	[{name:'New Session', onClick:_=>newSession(true)}].concat(
          charts == null || !charts.length ? [] : ['-'].concat(
            unique(
             charts.filter(chart => (chart.meta?.section?.length ?? 0) > 1)
             .map(chart => chart.meta.section[0])
            ).sort((a,b) => localeCompareSpecial(a,b))
            .map(section => ({ name:section, href:'#0-'+encodeURIComponent(section) }) )
          )
      )} />

      {/* Content area */}
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        {/*  Site header */}
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <main>
          <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
            {/* Welcome banner */}
            <WelcomeBanner>{charts != null ?
                <><p>Here are your data exports for</p>
                  <div className="flex items-center mt-3 gap-8 w-fit">{
                    Object.entries(files).map(([file,content],index) =>
                      <ToggleSwitch
                        className={index ? "ml-5" : ''}
                        color="blue"
                        checked={content.show}
                        label={<>
                          <span class="data-export-filename">{file}</span>
                          {content.types.length ? ' (' + content.types.join(', ') + ')' : ''}
                          </>}
                        onChange={value => {
                          content.show = value;
                          setFiles(files);
                          calcCharts(files);
                        }}
                        />
                    )}
                    <button className="py-1 px-2 -my-1 rounded-md text-sm font-medium text-gray-900 bg-gray-300 hover:bg-gray-400 transition-all"
                      onClick={_ => newSession(false)}>
                      Add Data Export
                    </button>
                  </div>
                </> : <>
            	  <p>Import the data exports below to get started. Analysis happens locally on your device, so your data won't be shared with anybody.</p>
            	  <div className="italic mt-4">
            	    <span className="font-medium">Supported Services:</span> {
                      !transformers.length ? 'none'
                      : transformers.map(transformer => transformer.name).join(', ')
                    }
            	  </div>
            	</>
              } </WelcomeBanner>

            {/* Cards */}
            { progress !== null ? <>
              <div className="m-auto w-min">
                { /* progress === true ? */ } <RotatingLines
                    strokeColor="grey"
                    strokeWidth="5"
                    animationDuration="0.75"
                    width="96"
              	    visible={true}
              	    />
                 { /* : <>
                    <style>{`
                    @keyframes grow {
                      from { width: 0%; }
                      to { width: 100%; }
                    }
                    .progress { animation: grow 10s ease-out forwards; }
                    `}</style>
                    <div className="bg-slate-300 w-96 rounded-full p-px">
                      <div className="progress bg-primary-600 rounded-full p-2"></div>
                    </div>
                  </>
                */}
              </div>
              <div className="py-4 w-full text-center">
                This may take several minutes,<br />depending on the dataset size.
              </div>
            </> : charts != null ? (
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-full flex flex-row justify-end items-center gap-8">
                  <label className="w-fit text-sm font-medium">Min. Data Points per Visualisation: 
                    {/*react doesn't support native change event with onChange*/}
                    <input type="number"
                      className="rounded-md text-sm p-1 -my-1 ml-2 w-16"
                      defaultValue={graph_min_object_amount}
                      onBlur={event => {
                        window.ANALYTICS.graph_min_object_amount_changes[new Date().toJSON()] = event.target.value
                        setGraphMinObjectAmount(event.target.value);
                      }}
                      onClick={event => {
                        if(event.target.value == graph_min_object_amount) return;
                        window.ANALYTICS.graph_min_object_amount_changes[new Date().toJSON()] = event.target.value
                        setGraphMinObjectAmount(event.target.value);
                      }}
                      />
                  </label>
                  <ToggleSwitch
                    color="blue"
                    checked={extended}
                    label="Extended View"
                    onChange={setExtended}
                    />
                </div>
                
                { charts.length ?
                    buildChartTree(
                      charts.map(chart => array(chart).filter(c => 
                        (extended || !c.meta?.raw)
                        && (c.meta?.amountOfUsedObjects ?? 0) >= graph_min_object_amount
                      )).filter(chart => chart.length),
                      charts.some(chart => array(chart).some(partial => !partial.meta?.raw))
                    )
                    : <div className="col-span-full">No data available or data exporter not supported</div>
                }
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-6">
		{ Object.keys(files).map( (name,i) =>
		    <FileUpload title={name} id={'data-export'+i}
		      delete={ _ => setFiles(Object.fromEntries(
		      	Object.entries(files).filter( ([fname,_]) => fname!=name )
		      )) }
		      />
		  ) }
                <AddUpload title="Add Data Export" prepare={loadFile} />
                <div className="flex justify-center col-span-12">
                  <button
                    onClick={() => calcCharts(files)}
                    className="btn w-1/6 rounded-lg bg-primary-600 hover:bg-primary-400 text-white"
                  >
                    <span className="block">Analyze</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
