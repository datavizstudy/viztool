import { useState, useEffect } from "react";
import { sha256 } from "js-sha256";

import env from "../../../env.json";
import { pushRecording } from "../../../recording.js";


function FinishButton() {
  var saved = false;

  const stopUnload = event => { if(!saved) event.preventDefault(); };
  if(window.AB_TESTING && "auth" in window.AB_TESTING) useEffect(() => {
    window.addEventListener("beforeunload", stopUnload);
  }, [/* once at beginning*/]);

  async function save() {
    if(!("auth" in window.AB_TESTING)) {
      alert('There has no ID been transmitted for saving the interaction data.');
      return;
    }

    window.removeEventListener("beforeunload", stopUnload);
    // soscisurvey.de doesn't support hmac, thus just concat
    const code = 'DVIZ_' + sha256((env.secret ?? '') + window.AB_TESTING.auth.toString()).substring(0, 10);

    pushRecording(window.ANALYTICS.sessionRecorder, window.ANALYTICS.recordings);

    const file = new Blob([JSON.stringify(
      {...window.ANALYTICS, sessionRecorder:undefined}
    )]).stream().pipeThrough(new CompressionStream("gzip"));

    const data = new FormData();
    data.append('auth', window.AB_TESTING.auth);
    data.append(
      'file',
      await new Response(file, {headers:{
        'Content-Type':'application/json',
        'Content-Encoding':'gzip'
      }}).blob(),
      'file'
    );

    fetch(env.analysis_upload_url, {
      body: data,
      method: 'POST',
      priority: 'high'
    }).then(async res => {
      if(res.status != 413 && !res.ok)
        throw Error('Status ' + res.status + ': ' + await res.text());
    }).then(_ => {
      saved = true;
      alert('Please copy the following code and enter it into the survey to continue the research task:\n\n' + code);
    }).catch(error => alert('An error occured. Please try again.\n\n' + error.message));
  }

  return <button className="btn rounded-lg bg-primary-600 hover:bg-primary-400 text-white" onClick={save}>Finish Analysis</button>;
}

export default FinishButton;
