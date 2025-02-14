import React, { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import cimice from 'cimice';

import env from "../env.json";
import "./css/style.css";

// Import pages
import Dashboard from "./pages/Dashboard";

function App() {
  const location = useLocation();

  useEffect(() => {
    document.querySelector("html").style.scrollBehavior = "auto";
    window.scroll({ top: 0 });
    document.querySelector("html").style.scrollBehavior = "";
  }, [location.pathname]); // triggered on route change


  const params = new URL(window.location.toString()).searchParams;
  if(params.has("auth")) {
    const treatment = params.get("auth").substring(8,9);
    if(env.treatments[treatment]) window.AB_TESTING = env.treatments[treatment];
  }
  if(!window.AB_TESTING) window.AB_TESTING = {};
  if(params.has("auth")) window.AB_TESTING.auth = params.get("auth");

  if(!window.ANALYTICS) window.ANALYTICS = {};
  if(!window.ANALYTICS.graph_min_object_amount_changes)
    window.ANALYTICS.graph_min_object_amount_changes = {};


  useEffect(() => {
    const params = new URL(window.location.toString()).searchParams;
    if(params.has('replay')) {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async event => {
        const player = new cimice.Player({ target:document.body });
        const data = JSON.parse(await event.target.files[0].text());

	// circumvent bug of cimice: init by play + stop
        player.setMovie(new cimice.Movie()).play().stop();
        await sleep(0);

        for(let [i,rec] of Object.entries(data.recordings)) {
          player.setMovie(new cimice.Movie(rec)).play();
          await sleep(
            rec.frames.reduce((max,item) => max >= item.ts ? max : item.ts)
            - rec.frames.reduce((min,item) => min <= item.ts ? min : item.ts)
          );
          player.stop();
        }
      };
      alert('Please click anywhere to activate the file picker for uploading the recording data.');
      window.addEventListener('click', event => {
        event.preventDefault(); input.click();
      }, {capture:true, once:true, passive:false}, true);
      return;
    }

    if(!(window.ANALYTICS.sessionRecorder instanceof cimice.Recorder))
      window.ANALYTICS.sessionRecorder = new cimice.Recorder({target:document.documentElement});
    window.ANALYTICS.recordings = [];
    window.ANALYTICS.sessionRecorder.startRecording();
  }, []);

  return (
    <>
      <Routes>
        <Route exact path="/" element={<Dashboard />} />
      </Routes>
    </>
  );
}

export default App;
